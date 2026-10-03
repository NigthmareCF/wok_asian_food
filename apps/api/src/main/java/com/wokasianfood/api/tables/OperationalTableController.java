package com.wokasianfood.api.tables;

import com.wokasianfood.api.identity.AuthException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/operational/tables")
@PreAuthorize("hasAuthority('tables:manage')")
public class OperationalTableController {
    private final TableService tables;

    public OperationalTableController(TableService tables) { this.tables = tables; }

    @GetMapping
    public List<TableService.TableView> list(@RequestParam(required = false) String status,
                                             @RequestParam(required = false) String zone,
                                             @RequestParam(required = false) Boolean active) {
        return tables.list(normalize(status), normalize(zone), active);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TableService.TableView create(@AuthenticationPrincipal Jwt jwt,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody CreateTableRequest request) {
        return tables.create(UUID.fromString(jwt.getSubject()), requestId == null ? UUID.randomUUID() : requestId,
                request.name().trim(), request.capacity(), request.zone().trim().toUpperCase());
    }

    @PostMapping("/{tableId}/open")
    @PreAuthorize("hasAuthority('accounts:manage')")
    public TableService.TableView open(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID tableId,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId) {
        return tables.open(UUID.fromString(jwt.getSubject()), requestId == null ? UUID.randomUUID() : requestId, tableId);
    }

    @PostMapping("/{tableId}/close")
    @PreAuthorize("hasAuthority('accounts:manage')")
    public TableService.TableView close(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID tableId,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId) {
        return tables.close(UUID.fromString(jwt.getSubject()), requestId == null ? UUID.randomUUID() : requestId, tableId);
    }

    public record CreateTableRequest(@NotBlank @Size(min = 1, max = 40) String name,
                                     @Positive int capacity,
                                     @NotBlank @Size(min = 2, max = 40) String zone) {}

    private String normalize(String value) {
        if (value == null || value.isBlank()) return null;
        return value.trim().toUpperCase();
    }
}

@Service
class TableService {
    private final JdbcTemplate jdbc;

    TableService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    List<TableView> list(String status, String zone, Boolean active) {
        String sql = """
            SELECT t.id, t.name, t.capacity, t.zone, t.active, t.current_status, t.row_version, t.updated_at,
                   account.id AS account_id, account.name AS account_name, account.status AS account_status
            FROM wok.dining_tables t
            LEFT JOIN LATERAL (
                SELECT a.id, a.name, a.status FROM wok.order_accounts a
                WHERE a.dining_table_id = t.id AND a.status IN ('OPEN', 'IN_COBRO')
                ORDER BY a.opened_at DESC LIMIT 1
            ) account ON true
            WHERE (CAST(? AS text) IS NULL OR t.current_status = CAST(? AS text))
              AND (CAST(? AS text) IS NULL OR t.zone = CAST(? AS text))
              AND (CAST(? AS boolean) IS NULL OR t.active = CAST(? AS boolean))
            ORDER BY t.zone, t.name
            """;
        return jdbc.query(sql, (rs, row) -> new TableView(
                rs.getObject("id", UUID.class), rs.getString("name"), rs.getInt("capacity"), rs.getString("zone"),
                rs.getBoolean("active"), rs.getString("current_status"), rs.getInt("row_version"),
                rs.getTimestamp("updated_at").toInstant(), rs.getObject("account_id", UUID.class),
                rs.getString("account_name"), rs.getString("account_status")),
                status, status, zone, zone, active, active);
    }

    @Transactional
    TableView create(UUID actor, UUID requestId, String name, int capacity, String zone) {
        List<UUID> inserted = jdbc.query("""
            INSERT INTO wok.dining_tables (name, capacity, zone, current_status, created_by, updated_by)
            VALUES (?, ?, ?, 'FREE', ?, ?)
            ON CONFLICT (name) DO NOTHING RETURNING id
            """, (rs, row) -> rs.getObject(1, UUID.class), name, capacity, zone, actor, actor);
        if (inserted.isEmpty()) throw new AuthException(409, "Ya existe una mesa con ese nombre.");
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, after_data, result, request_id)
            VALUES (?, 'TABLE_CREATED', 'DINING_TABLE', ?,
                    jsonb_build_object('name', ?, 'capacity', ?, 'zone', ?), 'SUCCESS', ?)
            """, actor, inserted.getFirst(), name, capacity, zone, requestId);
        return find(inserted.getFirst());
    }

    @Transactional
    TableView open(UUID actor, UUID requestId, UUID tableId) {
        TableView current = locked(tableId);
        if (!current.active()) throw new AuthException(409, "La mesa está inactiva.");
        if (!"FREE".equals(current.status()) && !"CLEANING".equals(current.status()))
            throw new AuthException(409, "La mesa ya está ocupada o no disponible.");

        UUID accountId = UUID.randomUUID();
        Integer nextNumber = jdbc.queryForObject("""
            SELECT count(*) + 1 FROM wok.order_accounts WHERE dining_table_id = ?
            """, Integer.class, tableId);
        jdbc.update("""
            INSERT INTO wok.order_accounts (id, dining_table_id, name, status, opened_by, created_by, updated_by)
            VALUES (?, ?, ?, 'OPEN', ?, ?, ?)
            """, accountId, tableId, "Cuenta " + (nextNumber == null ? 1 : nextNumber), actor, actor, actor);
        changeStatus(actor, requestId, tableId, current.status(), "OCCUPIED");
        auditStatus(actor, requestId, tableId, current.status(), "OCCUPIED", "TABLE_OPENED");
        return find(tableId);
    }

    @Transactional
    TableView close(UUID actor, UUID requestId, UUID tableId) {
        TableView current = locked(tableId);
        if (!"OCCUPIED".equals(current.status()))
            throw new AuthException(409, "La mesa no está ocupada.");

        Integer blocking = jdbc.queryForObject("""
            SELECT count(*) FROM wok.orders
            WHERE dining_table_id = ? AND status IN ('SENT', 'PREPARING', 'READY', 'SERVED')
            """, Integer.class, tableId);
        if (blocking != null && blocking > 0)
            throw new AuthException(409, "La mesa tiene pedidos que todavía no se han cerrado.");

        List<UUID> openAccounts = jdbc.query("""
            SELECT id FROM wok.order_accounts
            WHERE dining_table_id = ? AND status IN ('OPEN', 'IN_COBRO')
            FOR UPDATE
            """, (rs, row) -> rs.getObject(1, UUID.class), tableId);
        for (UUID accountId : openAccounts) {
            jdbc.update("""
                UPDATE wok.order_accounts
                SET status = 'CLOSED', closed_at = now(), updated_at = now(), updated_by = ?, row_version = row_version + 1
                WHERE id = ? AND status IN ('OPEN', 'IN_COBRO')
                """, actor, accountId);
        }
        changeStatus(actor, requestId, tableId, current.status(), "CLEANING");
        auditStatus(actor, requestId, tableId, current.status(), "CLEANING", "TABLE_CLOSED");
        return find(tableId);
    }

    private TableView locked(UUID tableId) {
        List<TableView> rows = jdbc.query("""
            SELECT t.id, t.name, t.capacity, t.zone, t.active, t.current_status, t.row_version, t.updated_at,
                   NULL::UUID AS account_id, NULL::TEXT AS account_name, NULL::TEXT AS account_status
            FROM wok.dining_tables t WHERE t.id = ? FOR UPDATE
            """, (rs, row) -> new TableView(rs.getObject("id", UUID.class), rs.getString("name"),
                rs.getInt("capacity"), rs.getString("zone"), rs.getBoolean("active"),
                rs.getString("current_status"), rs.getInt("row_version"),
                rs.getTimestamp("updated_at").toInstant(), null, null, null), tableId);
        if (rows.isEmpty()) throw new AuthException(404, "No encontramos la mesa.");
        return rows.getFirst();
    }

    private void changeStatus(UUID actor, UUID requestId, UUID tableId, String fromStatus, String toStatus) {
        int changed = jdbc.update("""
            UPDATE wok.dining_tables
            SET current_status = ?, updated_at = now(), updated_by = ?, row_version = row_version + 1
            WHERE id = ? AND current_status = ?
            """, toStatus, actor, tableId, fromStatus);
        if (changed != 1) throw new AuthException(409, "La mesa cambió de estado. Actualiza la vista y vuelve a intentarlo.");
        jdbc.update("""
            INSERT INTO wok.dining_table_status_history (dining_table_id, from_status, to_status, actor_user_id, request_id)
            VALUES (?, ?, ?, ?, ?)
            """, tableId, fromStatus, toStatus, actor, requestId);
    }

    private TableView find(UUID tableId) {
        List<TableView> rows = jdbc.query("""
            SELECT t.id, t.name, t.capacity, t.zone, t.active, t.current_status, t.row_version, t.updated_at,
                   account.id AS account_id, account.name AS account_name, account.status AS account_status
            FROM wok.dining_tables t
            LEFT JOIN LATERAL (
                SELECT a.id, a.name, a.status FROM wok.order_accounts a
                WHERE a.dining_table_id = t.id AND a.status IN ('OPEN', 'IN_COBRO')
                ORDER BY a.opened_at DESC LIMIT 1
            ) account ON true
            WHERE t.id = ?
            """, (rs, row) -> new TableView(rs.getObject("id", UUID.class), rs.getString("name"),
                rs.getInt("capacity"), rs.getString("zone"), rs.getBoolean("active"),
                rs.getString("current_status"), rs.getInt("row_version"),
                rs.getTimestamp("updated_at").toInstant(), rs.getObject("account_id", UUID.class),
                rs.getString("account_name"), rs.getString("account_status")), tableId);
        if (rows.isEmpty()) throw new AuthException(404, "No encontramos la mesa.");
        return rows.getFirst();
    }

    private void auditStatus(UUID actor, UUID requestId, UUID entityId, String fromStatus, String toStatus, String action) {
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, before_data, after_data, result, request_id)
            VALUES (?, ?, 'DINING_TABLE', ?,
                    jsonb_build_object('status', ?), jsonb_build_object('status', ?), 'SUCCESS', ?)
            """, actor, action, entityId, fromStatus, toStatus, requestId);
    }

    public record TableView(UUID id, String name, int capacity, String zone, boolean active, String status,
                            int rowVersion, Instant updatedAt, UUID accountId, String accountName, String accountStatus) {}
}

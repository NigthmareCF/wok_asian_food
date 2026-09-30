package com.wokasianfood.api.tables;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Maintains the physical-table projection and its active dining-session assignments. */
@Service
public class OperationalTableService {
    private final JdbcTemplate jdbc;

    public OperationalTableService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<TableSummary> list() {
        return jdbc.query("""
            SELECT t.id, t.name, t.capacity, t.zone, t.current_status,
                   session_assignment.dining_session_id, session_assignment.party_size,
                   coalesce(open_bills.count, 0) AS open_bill_count
            FROM wok.dining_tables t
            LEFT JOIN LATERAL (
                SELECT dst.dining_session_id, ds.party_size
                FROM wok.dining_session_tables dst JOIN wok.dining_sessions ds ON ds.id = dst.dining_session_id
                WHERE dst.table_id = t.id AND dst.released_at IS NULL AND ds.status IN ('OPEN', 'CLOSING')
                ORDER BY dst.assigned_at DESC LIMIT 1
            ) session_assignment ON true
            LEFT JOIN LATERAL (
                SELECT count(*) FROM wok.bills b
                WHERE b.dining_session_id = session_assignment.dining_session_id AND b.status IN ('OPEN', 'ISSUED')
            ) open_bills ON true
            WHERE t.active = true
            ORDER BY t.zone, t.name
            """, (rs, row) -> new TableSummary(rs.getObject("id", UUID.class), rs.getString("name"),
                rs.getInt("capacity"), rs.getString("zone"), rs.getString("current_status"),
                rs.getObject("dining_session_id", UUID.class), (Integer) rs.getObject("party_size"),
                rs.getInt("open_bill_count")));
    }

    @Transactional
    public SessionReceipt open(UUID actorId, OpenSession command) {
        List<UUID> tableIds = uniqueTableIds(command.tableIds(), 1, "Debes seleccionar al menos una mesa.");
        if (command.partySize() < 1) throw badRequest("Indica una cantidad válida de personas.");
        List<TableState> tables = lockTables(tableIds);
        verifyFreeAndCapacity(tables, command.partySize());
        UUID sessionId = jdbc.queryForObject("""
            INSERT INTO wok.dining_sessions(party_size, estimated_end_at, created_by, updated_by)
            VALUES (?, ?, ?, ?) RETURNING id
            """, UUID.class, command.partySize(), timestamp(command.estimatedEndAt()), actorId, actorId);
        assignTables(sessionId, tables, actorId);
        return sessionReceipt(sessionId);
    }

    @Transactional
    public SessionReceipt joinTables(UUID actorId, UUID sessionId, List<UUID> tableIds) {
        SessionState session = lockOpenSession(sessionId);
        List<TableState> tables = lockTables(uniqueTableIds(tableIds, 1, "Selecciona al menos una mesa para unir."));
        verifyFreeAndCapacity(tables, 0);
        assignTables(session.id(), tables, actorId);
        return sessionReceipt(sessionId);
    }

    @Transactional
    public SessionReceipt releaseTables(UUID actorId, UUID sessionId, List<UUID> tableIds) {
        SessionState session = lockOpenSession(sessionId);
        List<UUID> requested = uniqueTableIds(tableIds, 1, "Selecciona al menos una mesa para separar.");
        Integer activeCount = jdbc.queryForObject("""
            SELECT count(*) FROM wok.dining_session_tables WHERE dining_session_id = ? AND released_at IS NULL
            """, Integer.class, session.id());
        if (activeCount == null || activeCount <= requested.size()) {
            throw conflict("La sesión debe conservar al menos una mesa asignada.");
        }
        int released = jdbc.update("""
            UPDATE wok.dining_session_tables SET released_at = now()
            WHERE dining_session_id = ? AND table_id = ANY(?::uuid[]) AND released_at IS NULL
            """, prepared -> {
                prepared.setObject(1, sessionId);
                prepared.setArray(2, prepared.getConnection().createArrayOf("uuid", requested.toArray()));
            });
        if (released != requested.size()) throw conflict("Una de las mesas ya no pertenece a esta sesión.");
        updateTableStatus(requested, "FREE", "TABLE_RELEASED", actorId);
        return sessionReceipt(sessionId);
    }

    @Transactional
    public SessionReceipt close(UUID actorId, UUID sessionId) {
        SessionState session = lockOpenSession(sessionId);
        Integer unpaidBills = jdbc.queryForObject("""
            SELECT count(*) FROM wok.bills WHERE dining_session_id = ? AND status IN ('OPEN', 'ISSUED')
            """, Integer.class, session.id());
        if (unpaidBills != null && unpaidBills > 0) throw conflict("No se puede cerrar la mesa mientras existan cuentas pendientes.");
        Integer activeOrders = jdbc.queryForObject("""
            SELECT count(*) FROM wok.orders WHERE dining_session_id = ?
              AND status NOT IN ('COMPLETED', 'CANCELLED')
            """, Integer.class, session.id());
        if (activeOrders != null && activeOrders > 0) throw conflict("No se puede cerrar la mesa mientras existan pedidos activos.");
        List<UUID> assigned = jdbc.query("""
            SELECT table_id FROM wok.dining_session_tables
            WHERE dining_session_id = ? AND released_at IS NULL FOR UPDATE
            """, (rs, row) -> rs.getObject(1, UUID.class), session.id());
        jdbc.update("""
            UPDATE wok.dining_sessions SET status = 'CLOSED', closed_at = now(), updated_at = now(),
                updated_by = ?, row_version = row_version + 1 WHERE id = ?
            """, actorId, session.id());
        jdbc.update("""
            UPDATE wok.dining_session_tables SET released_at = now()
            WHERE dining_session_id = ? AND released_at IS NULL
            """, session.id());
        updateTableStatus(assigned, "CLEANING", "SESSION_CLOSED", actorId);
        return sessionReceipt(sessionId);
    }

    @Transactional
    public TableSummary changeStatus(UUID actorId, UUID tableId, ChangeTableStatus command) {
        List<TableState> locked = jdbc.query("""
            SELECT id, name, capacity, zone, current_status FROM wok.dining_tables WHERE id = ? AND active FOR UPDATE
            """, (rs, row) -> new TableState(rs.getObject("id", UUID.class), rs.getString("name"), rs.getInt("capacity"),
                rs.getString("zone"), rs.getString("current_status")), tableId);
        if (locked.isEmpty()) throw notFound("No encontramos esa mesa.");
        if ("OCCUPIED".equals(command.status()) || "RESERVED".equals(command.status())) {
            throw badRequest("Las mesas se ocupan mediante una sesión y se reservan mediante el flujo de reservas.");
        }
        Integer activeSession = jdbc.queryForObject("""
            SELECT count(*) FROM wok.dining_session_tables WHERE table_id = ? AND released_at IS NULL
            """, Integer.class, tableId);
        if (activeSession != null && activeSession > 0) throw conflict("No puedes cambiar manualmente el estado de una mesa asignada.");
        updateTableStatus(List.of(tableId), command.status(), clean(command.reason()), actorId);
        TableState table = locked.getFirst();
        return new TableSummary(table.id(), table.name(), table.capacity(), table.zone(), command.status(), null, null, 0);
    }

    private List<TableState> lockTables(List<UUID> ids) {
        List<TableState> found = jdbc.query("""
            SELECT id, name, capacity, zone, current_status FROM wok.dining_tables
            WHERE id = ANY(?::uuid[]) AND active ORDER BY id FOR UPDATE
            """, prepared -> prepared.setArray(1, prepared.getConnection().createArrayOf("uuid", ids.toArray())),
            (rs, row) -> new TableState(rs.getObject("id", UUID.class), rs.getString("name"), rs.getInt("capacity"),
                rs.getString("zone"), rs.getString("current_status")));
        if (found.size() != ids.size()) throw notFound("Una de las mesas no existe o está inactiva.");
        return found;
    }

    private void verifyFreeAndCapacity(List<TableState> tables, int partySize) {
        if (tables.stream().anyMatch(table -> !"FREE".equals(table.status()))) {
            throw conflict("Solo se pueden asignar mesas libres.");
        }
        int capacity = tables.stream().mapToInt(TableState::capacity).sum();
        if (capacity < partySize) throw conflict("La capacidad de las mesas no alcanza para el grupo.");
    }

    private void assignTables(UUID sessionId, List<TableState> tables, UUID actorId) {
        for (TableState table : tables) {
            jdbc.update("""
                INSERT INTO wok.dining_session_tables(dining_session_id, table_id, assigned_by)
                VALUES (?, ?, ?)
                """, sessionId, table.id(), actorId);
        }
        updateTableStatus(tables.stream().map(TableState::id).toList(), "OCCUPIED", "SESSION_OPENED", actorId);
    }

    private void updateTableStatus(List<UUID> tableIds, String status, String reason, UUID actorId) {
        if (tableIds.isEmpty()) return;
        for (UUID tableId : tableIds) {
            List<String> current = jdbc.query("SELECT current_status FROM wok.dining_tables WHERE id = ? FOR UPDATE",
                (rs, row) -> rs.getString(1), tableId);
            if (current.isEmpty() || status.equals(current.getFirst())) continue;
            jdbc.update("""
                UPDATE wok.dining_tables SET current_status = ?, updated_at = now(), updated_by = ?, row_version = row_version + 1
                WHERE id = ?
                """, status, actorId, tableId);
            jdbc.update("""
                INSERT INTO wok.dining_table_status_history(dining_table_id, from_status, to_status, reason, actor_user_id)
                VALUES (?, ?, ?, ?, ?)
                """, tableId, current.getFirst(), status, reason, actorId);
        }
    }

    private SessionState lockOpenSession(UUID sessionId) {
        List<SessionState> found = jdbc.query("""
            SELECT id, status FROM wok.dining_sessions WHERE id = ? FOR UPDATE
            """, (rs, row) -> new SessionState(rs.getObject("id", UUID.class), rs.getString("status")), sessionId);
        if (found.isEmpty()) throw notFound("No encontramos esa sesión de mesa.");
        if (!"OPEN".equals(found.getFirst().status())) throw conflict("La sesión ya no está abierta.");
        return found.getFirst();
    }

    private SessionReceipt sessionReceipt(UUID sessionId) {
        List<UUID> tableIds = jdbc.query("""
            SELECT table_id FROM wok.dining_session_tables
            WHERE dining_session_id = ? AND released_at IS NULL ORDER BY assigned_at, table_id
            """, (rs, row) -> rs.getObject(1, UUID.class), sessionId);
        return jdbc.queryForObject("""
            SELECT id, status, party_size, opened_at, closed_at FROM wok.dining_sessions WHERE id = ?
            """, (rs, row) -> new SessionReceipt(rs.getObject("id", UUID.class), rs.getString("status"),
                rs.getInt("party_size"), rs.getTimestamp("opened_at").toInstant(),
                rs.getTimestamp("closed_at") == null ? null : rs.getTimestamp("closed_at").toInstant(), List.copyOf(tableIds)), sessionId);
    }

    private List<UUID> uniqueTableIds(List<UUID> values, int minimum, String message) {
        if (values == null || values.size() < minimum) throw badRequest(message);
        LinkedHashSet<UUID> unique = new LinkedHashSet<>(values);
        if (unique.contains(null) || unique.size() != values.size()) throw badRequest("No repitas mesas en la misma operación.");
        return unique.stream().sorted(Comparator.comparing(UUID::toString)).toList();
    }
    private Timestamp timestamp(java.time.Instant value) { return value == null ? null : Timestamp.from(value); }
    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private ResponseStatusException badRequest(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
    private ResponseStatusException notFound(String message) { return new ResponseStatusException(HttpStatus.NOT_FOUND, message); }

    public record OpenSession(List<UUID> tableIds, int partySize, java.time.Instant estimatedEndAt) {}
    public record ChangeTableStatus(String status, String reason) {}
    public record TableSummary(UUID tableId, String name, int capacity, String zone, String status,
                               UUID diningSessionId, Integer partySize, int openBillCount) {}
    public record SessionReceipt(UUID sessionId, String status, int partySize, java.time.Instant openedAt,
                                 java.time.Instant closedAt, List<UUID> tableIds) {}
    private record TableState(UUID id, String name, int capacity, String zone, String status) {}
    private record SessionState(UUID id, String status) {}
}

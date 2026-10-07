package com.wokasianfood.api.inventory;

import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.inventory.InventoryController.MovementType;
import com.wokasianfood.api.platform.IdempotencyStore;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/operational/inventory")
@PreAuthorize("hasAuthority('inventory:manage')")
public class InventoryController {
    private final InventoryService inventory;

    public InventoryController(InventoryService inventory) { this.inventory = inventory; }

    @GetMapping("/items")
    public List<InventoryService.InventoryItem> list(@RequestParam(required = false) String search,
                                                     @RequestParam(required = false) String status) {
        return inventory.list(normalize(search), normalizeStatus(status));
    }

    @GetMapping("/items/{itemId}")
    public InventoryService.InventoryItemDetails details(@PathVariable UUID itemId) {
        return inventory.details(itemId);
    }

    @PostMapping("/items/{itemId}/movements")
    @ResponseStatus(HttpStatus.CREATED)
    public InventoryService.MovementReceipt record(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID itemId,
            @RequestHeader("Idempotency-Key") UUID idempotencyKey,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody MovementRequest request) {
        return inventory.record(UUID.fromString(jwt.getSubject()),
                requestId == null ? UUID.randomUUID() : requestId, itemId, idempotencyKey, request);
    }

    @GetMapping("/items/{itemId}/recipe")
    public InventoryService.RecipeDetails recipe(@PathVariable UUID itemId) {
        return inventory.recipe(itemId);
    }

    @PutMapping("/items/{itemId}/recipe")
    public InventoryService.RecipeDetails updateRecipe(@AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID itemId,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody RecipeRequest request) {
        return inventory.updateRecipe(UUID.fromString(jwt.getSubject()),
                requestId == null ? UUID.randomUUID() : requestId, itemId, request);
    }

    public record MovementRequest(@NotNull MovementType type,
                                  @NotNull @DecimalMin("0.0") BigDecimal quantity,
                                  @Size(max = 300) String reason) {}

    public record RecipeRequest(@NotEmpty @Size(max = 100) List<@Valid RecipeComponentRequest> components,
                                RecipeStatus recipeStatus) {}

    public enum RecipeStatus { DRAFT, PENDING_DATA, ACTIVE, ARCHIVED }

    public record RecipeComponentRequest(@NotNull UUID componentItemId,
                                         @NotNull @DecimalMin(value = "0.0", inclusive = false) BigDecimal quantity) {}

    public enum MovementType { ENTRY, ADJUSTMENT, WASTE }

    private String normalize(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String normalizeStatus(String value) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        if (normalized.equals("ALL")) return null;
        if (!List.of("OK", "LOW", "OUT", "UNTRACKED").contains(normalized))
            throw new AuthException(400, "Revisa el filtro de inventario.");
        return normalized;
    }
}

@Service
class InventoryService {
    private final JdbcTemplate jdbc;
    private final IdempotencyStore idempotency;

    InventoryService(JdbcTemplate jdbc, IdempotencyStore idempotency) {
        this.jdbc = jdbc;
        this.idempotency = idempotency;
    }

    List<InventoryItem> list(String search, String status) {
        List<InventoryItem> rows = jdbc.query("""
            SELECT i.id, i.sku, i.name, i.active, i.track_inventory, i.minimum_stock,
                   u.code AS unit_code, COALESCE(b.quantity_on_hand, 0) AS on_hand,
                   COALESCE(res.reserved, 0) AS reserved
            FROM wok.items i
            JOIN wok.units u ON u.id = i.base_unit_id
            LEFT JOIN wok.inventory_balances b ON b.item_id = i.id
            LEFT JOIN LATERAL (
                SELECT COALESCE(SUM(r.quantity), 0) AS reserved
                FROM wok.inventory_reservations r
                WHERE r.item_id = i.id AND r.status = 'ACTIVE'
            ) res ON true
            WHERE (CAST(? AS text) IS NULL OR i.sku ILIKE '%' || ? || '%' OR i.name ILIKE '%' || ? || '%')
            ORDER BY i.name, i.id
            LIMIT 200
            """, (rs, row) -> item(rs, rs.getBigDecimal("on_hand"), rs.getBigDecimal("reserved")),
            search, search, search);
        if (status == null) return rows;
        return rows.stream().filter(row -> status.equals(row.status())).toList();
    }

    InventoryItemDetails details(UUID itemId) {
        List<InventoryItem> found = jdbc.query("""
            SELECT i.id, i.sku, i.name, i.active, i.track_inventory, i.minimum_stock,
                   u.code AS unit_code, COALESCE(b.quantity_on_hand, 0) AS on_hand,
                   COALESCE(res.reserved, 0) AS reserved
            FROM wok.items i
            JOIN wok.units u ON u.id = i.base_unit_id
            LEFT JOIN wok.inventory_balances b ON b.item_id = i.id
            LEFT JOIN LATERAL (
                SELECT COALESCE(SUM(r.quantity), 0) AS reserved
                FROM wok.inventory_reservations r
                WHERE r.item_id = i.id AND r.status = 'ACTIVE'
            ) res ON true
            WHERE i.id = ?
            """, (rs, row) -> item(rs, rs.getBigDecimal("on_hand"), rs.getBigDecimal("reserved")), itemId);
        if (found.isEmpty()) throw new AuthException(404, "No encontramos el item de inventario.");
        List<Movement> movements = jdbc.query("""
            SELECT id, movement_type, quantity_delta, reason, order_id, responsible_user_id, occurred_at
            FROM wok.inventory_movements
            WHERE item_id = ?
            ORDER BY occurred_at DESC, id DESC
            LIMIT 50
            """, (rs, row) -> new Movement(rs.getObject("id", UUID.class), rs.getString("movement_type"),
                rs.getBigDecimal("quantity_delta"), rs.getString("reason"),
                rs.getObject("order_id", UUID.class), rs.getObject("responsible_user_id", UUID.class),
                rs.getTimestamp("occurred_at").toInstant()), itemId);
        return new InventoryItemDetails(found.getFirst(), movements);
    }

    @Transactional
    public MovementReceipt record(UUID actor, UUID requestId, UUID itemId, UUID idempotencyKey,
                                  InventoryController.MovementRequest request) {
        String reason = request.reason() == null || request.reason().isBlank() ? null : request.reason().trim();
        MovementType type = request.type();
        if (type == MovementType.ADJUSTMENT && reason == null)
            throw new AuthException(422, "El ajuste requiere un motivo.");
        if (type == MovementType.WASTE && reason == null)
            throw new AuthException(422, "La merma requiere un motivo.");
        if (type != MovementType.ADJUSTMENT && request.quantity().signum() <= 0)
            throw new AuthException(422, "La cantidad debe ser mayor que cero.");
        String hash = fingerprint(itemId.toString(), type.name(), request.quantity().stripTrailingZeros().toPlainString(),
                reason);

        IdempotencyStore.Result claim = idempotency.claim(actor.toString(), "INVENTORY_MOVEMENT_RECORDED",
                idempotencyKey, hash);
        if (claim.replay()) return receipt(claim.resourceId(), true);

        ItemRow item = item(itemId);
        if (!item.trackInventory())
            throw new AuthException(422, "El item no controla inventario.");
        if (!item.active())
            throw new AuthException(409, "El item está inactivo.");

        jdbc.update("""
            INSERT INTO wok.inventory_balances (item_id) VALUES (?)
            ON CONFLICT (item_id) DO NOTHING
            """, itemId);
        BigDecimal current = jdbc.queryForObject("""
            SELECT quantity_on_hand FROM wok.inventory_balances WHERE item_id = ? FOR UPDATE
            """, BigDecimal.class, itemId);
        BigDecimal delta = switch (type) {
            case ENTRY -> request.quantity();
            case WASTE -> request.quantity().negate();
            case ADJUSTMENT -> request.quantity().subtract(current);
        };
        if (delta.signum() == 0)
            throw new AuthException(409, "El conteo coincide con el saldo actual.");
        BigDecimal updated = current.add(delta);
        if (updated.signum() < 0)
            throw new AuthException(409, "El movimiento dejaría el saldo en negativo.");

        jdbc.update("""
            UPDATE wok.inventory_balances
            SET quantity_on_hand = ?, updated_at = now(), row_version = row_version + 1
            WHERE item_id = ?
            """, updated, itemId);
        UUID movementId = jdbc.queryForObject("""
            INSERT INTO wok.inventory_movements
                (item_id, movement_type, quantity_delta, reason, responsible_user_id, request_id)
            VALUES (?, ?, ?, ?, ?, ?) RETURNING id
            """, UUID.class, itemId, type.name(), delta, reason, actor, requestId);
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, after_data, reason, result, request_id)
            VALUES (?, 'INVENTORY_MOVEMENT_RECORDED', 'ITEM', ?,
                    jsonb_build_object('delta', ?, 'onHand', ?), ?, 'SUCCESS', ?)
            """, actor, itemId, delta, updated, reason, requestId);
        idempotency.complete(actor.toString(), "INVENTORY_MOVEMENT_RECORDED", idempotencyKey, movementId);
        return receipt(movementId, false);
    }

    RecipeDetails recipe(UUID itemId) {
        requireItem(itemId);
        String recipeStatus = recipeStatus(itemId);
        List<RecipeComponent> components = jdbc.query("""
            SELECT rc.component_item_id, i.sku, i.name, u.code AS unit_code, rc.quantity
            FROM wok.item_recipe_components rc
            JOIN wok.items i ON i.id = rc.component_item_id
            JOIN wok.units u ON u.id = i.base_unit_id
            WHERE rc.parent_item_id = ?
            ORDER BY i.name, i.id
            """, (rs, row) -> new RecipeComponent(rs.getObject("component_item_id", UUID.class),
                rs.getString("sku"), rs.getString("name"), rs.getString("unit_code"),
                rs.getBigDecimal("quantity")), itemId);
        return new RecipeDetails(itemId, recipeStatus, components);
    }

    @Transactional
    public RecipeDetails updateRecipe(UUID actor, UUID requestId, UUID itemId,
                                      InventoryController.RecipeRequest request) {
        requireItem(itemId);
        List<InventoryController.RecipeComponentRequest> components = request.components();
        String beforeStatus = lockRecipeStatus(itemId);
        if (request.recipeStatus() != null && beforeStatus == null)
            throw new AuthException(422, "Sólo un producto del menú tiene estado de receta administrable.");
        java.util.Set<UUID> seen = new java.util.HashSet<>();
        for (InventoryController.RecipeComponentRequest component : components) {
            if (component.componentItemId().equals(itemId))
                throw new AuthException(422, "Un item no puede ser componente de sí mismo.");
            if (!seen.add(component.componentItemId()))
                throw new AuthException(422, "No repitas componentes en la receta.");
            Boolean tracked = componentTracked(component.componentItemId());
            if (tracked == null)
                throw new AuthException(422, "Uno de los componentes no existe.");
            if (!tracked)
                throw new AuthException(422, "El componente no controla inventario.");
        }
        jdbc.update("DELETE FROM wok.item_recipe_components WHERE parent_item_id = ?", itemId);
        for (InventoryController.RecipeComponentRequest component : components) {
            jdbc.update("""
                INSERT INTO wok.item_recipe_components (parent_item_id, component_item_id, quantity)
                VALUES (?, ?, ?)
                """, itemId, component.componentItemId(), component.quantity());
        }
        String afterStatus = request.recipeStatus() == null ? beforeStatus : request.recipeStatus().name();
        if (request.recipeStatus() != null) {
            jdbc.update("""
                UPDATE wok.menu_items
                SET recipe_status = ?, updated_at = now(), row_version = row_version + 1
                WHERE item_id = ?
                """, afterStatus, itemId);
        }
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, after_data, result, request_id)
            VALUES (?, 'ITEM_RECIPE_UPDATED', 'ITEM', ?, jsonb_build_object('components', ?, 'recipeStatus', ?::text), 'SUCCESS', ?)
            """, actor, itemId, components.size(), afterStatus, requestId);
        return recipe(itemId);
    }

    private String recipeStatus(UUID itemId) {
        List<String> statuses = jdbc.query("""
            SELECT recipe_status FROM wok.menu_items WHERE item_id = ? ORDER BY id LIMIT 1
            """, (rs, row) -> rs.getString("recipe_status"), itemId);
        return statuses.isEmpty() ? null : statuses.getFirst();
    }

    private String lockRecipeStatus(UUID itemId) {
        List<String> statuses = jdbc.query("""
            SELECT recipe_status FROM wok.menu_items WHERE item_id = ? ORDER BY id FOR UPDATE
            """, (rs, row) -> rs.getString("recipe_status"), itemId);
        return statuses.isEmpty() ? null : statuses.getFirst();
    }

    private void requireItem(UUID itemId) {
        Integer found = jdbc.queryForObject("SELECT count(*) FROM wok.items WHERE id = ?", Integer.class, itemId);
        if (found == null || found == 0) throw new AuthException(404, "No encontramos el item de inventario.");
    }

    private Boolean componentTracked(UUID itemId) {
        List<Boolean> found = jdbc.query("""
            SELECT track_inventory FROM wok.items WHERE id = ? AND active = true
            """, (rs, row) -> rs.getBoolean("track_inventory"), itemId);
        return found.isEmpty() ? null : found.getFirst();
    }

    private ItemRow item(UUID itemId) {
        List<ItemRow> rows = jdbc.query("""
            SELECT i.id, i.track_inventory, i.active FROM wok.items i WHERE i.id = ?
            """, (rs, row) -> new ItemRow(rs.getObject("id", UUID.class), rs.getBoolean("track_inventory"),
                rs.getBoolean("active")), itemId);
        if (rows.isEmpty()) throw new AuthException(404, "No encontramos el item de inventario.");
        return rows.getFirst();
    }

    private MovementReceipt receipt(UUID movementId, boolean replay) {
        List<MovementReceipt> rows = jdbc.query("""
            SELECT m.id, m.item_id, m.movement_type, m.quantity_delta, u.code AS unit_code,
                   COALESCE(b.quantity_on_hand, 0) AS on_hand
            FROM wok.inventory_movements m
            JOIN wok.items i ON i.id = m.item_id
            JOIN wok.units u ON u.id = i.base_unit_id
            LEFT JOIN wok.inventory_balances b ON b.item_id = m.item_id
            WHERE m.id = ?
            """, (rs, row) -> new MovementReceipt(rs.getObject("id", UUID.class), rs.getObject("item_id", UUID.class),
                rs.getString("movement_type"), rs.getBigDecimal("quantity_delta"),
                rs.getBigDecimal("on_hand"), rs.getString("unit_code"), replay), movementId);
        if (rows.isEmpty()) throw new AuthException(404, "No encontramos el movimiento de inventario.");
        return rows.getFirst();
    }

    private InventoryItem item(java.sql.ResultSet rs, BigDecimal onHand, BigDecimal reserved)
            throws java.sql.SQLException {
        boolean trackInventory = rs.getBoolean("track_inventory");
        BigDecimal minimum = rs.getBigDecimal("minimum_stock");
        BigDecimal available = onHand.subtract(reserved);
        String status;
        if (!trackInventory) status = "UNTRACKED";
        else if (available.signum() <= 0) status = "OUT";
        else if (available.compareTo(minimum) <= 0) status = "LOW";
        else status = "OK";
        return new InventoryItem(rs.getObject("id", UUID.class), rs.getString("sku"), rs.getString("name"),
            rs.getString("unit_code"), trackInventory, rs.getBoolean("active"), minimum,
            onHand, reserved, available, status);
    }

    private String fingerprint(String... parts) {
        String canonical = String.join("\n", parts);
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private record ItemRow(UUID id, boolean trackInventory, boolean active) {}

    public record InventoryItem(UUID itemId, String sku, String name, String unit, boolean trackInventory,
                                boolean active, BigDecimal minimumStock, BigDecimal quantityOnHand,
                                BigDecimal quantityReserved, BigDecimal quantityAvailable, String status) {}
    public record Movement(UUID id, String type, BigDecimal quantityDelta, String reason, UUID orderId,
                           UUID responsibleUserId, java.time.Instant occurredAt) {}
    public record InventoryItemDetails(InventoryItem item, List<Movement> movements) {}
    public record RecipeComponent(UUID itemId, String sku, String name, String unit, BigDecimal quantity) {}
    public record RecipeDetails(UUID parentItemId, String recipeStatus, List<RecipeComponent> components) {}
    public record MovementReceipt(UUID movementId, UUID itemId, String type, BigDecimal quantityDelta,
                                  BigDecimal quantityOnHand, String unit, boolean idempotentReplay) {}
}

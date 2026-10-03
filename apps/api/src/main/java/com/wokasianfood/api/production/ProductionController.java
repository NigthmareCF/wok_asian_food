package com.wokasianfood.api.production;

import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.platform.IdempotencyStore;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
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
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/operational/production")
@PreAuthorize("hasAuthority('production:manage')")
public class ProductionController {
    private final ProductionService production;

    public ProductionController(ProductionService production) { this.production = production; }

    @GetMapping("/batches")
    public List<ProductionService.ProductionBatchSummary> list() {
        return production.list();
    }

    @GetMapping("/batches/{batchId}")
    public ProductionService.ProductionBatchDetails details(@PathVariable UUID batchId) {
        return production.details(batchId);
    }

    @PostMapping("/batches")
    @ResponseStatus(HttpStatus.CREATED)
    public ProductionService.ProductionReceipt register(@AuthenticationPrincipal Jwt jwt,
            @RequestHeader("Idempotency-Key") UUID idempotencyKey,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody RegisterBatchRequest request) {
        return production.register(UUID.fromString(jwt.getSubject()),
                requestId == null ? UUID.randomUUID() : requestId, idempotencyKey, request);
    }

    public record RegisterBatchRequest(@NotNull UUID producedItemId,
                                       @NotNull @DecimalMin(value = "0.0", inclusive = false) BigDecimal quantity,
                                       @DecimalMin("0.0") BigDecimal actualQuantity,
                                       UUID areaId,
                                       @Size(max = 500) String notes) {}
}

@Service
class ProductionService {
    private final JdbcTemplate jdbc;
    private final IdempotencyStore idempotency;

    ProductionService(JdbcTemplate jdbc, IdempotencyStore idempotency) {
        this.jdbc = jdbc;
        this.idempotency = idempotency;
    }

    List<ProductionBatchSummary> list() {
        return jdbc.query("""
            SELECT b.id, b.produced_item_id, i.name AS produced_name, b.quantity, b.yield_quantity, b.status,
                   b.produced_at, b.area_id, pa.code AS area_code
            FROM wok.production_batches b
            JOIN wok.items i ON i.id = b.produced_item_id
            LEFT JOIN wok.preparation_areas pa ON pa.id = b.area_id
            ORDER BY b.produced_at DESC, b.id DESC
            LIMIT 100
            """, (rs, row) -> new ProductionBatchSummary(rs.getObject("id", UUID.class),
                rs.getObject("produced_item_id", UUID.class), rs.getString("produced_name"),
                rs.getBigDecimal("quantity"), rs.getBigDecimal("yield_quantity"), rs.getString("status"),
                rs.getTimestamp("produced_at").toInstant(), rs.getObject("area_id", UUID.class),
                rs.getString("area_code")));
    }

    ProductionBatchDetails details(UUID batchId) {
        List<ProductionBatchSummary> found = jdbc.query("""
            SELECT b.id, b.produced_item_id, i.name AS produced_name, b.quantity, b.yield_quantity, b.status,
                   b.produced_at, b.area_id, pa.code AS area_code
            FROM wok.production_batches b
            JOIN wok.items i ON i.id = b.produced_item_id
            LEFT JOIN wok.preparation_areas pa ON pa.id = b.area_id
            WHERE b.id = ?
            """, (rs, row) -> new ProductionBatchSummary(rs.getObject("id", UUID.class),
                rs.getObject("produced_item_id", UUID.class), rs.getString("produced_name"),
                rs.getBigDecimal("quantity"), rs.getBigDecimal("yield_quantity"), rs.getString("status"),
                rs.getTimestamp("produced_at").toInstant(), rs.getObject("area_id", UUID.class),
                rs.getString("area_code")), batchId);
        if (found.isEmpty()) throw new AuthException(404, "No encontramos el lote de producción.");
        return new ProductionBatchDetails(found.getFirst(), consumedItems(batchId));
    }

    @Transactional
    public ProductionReceipt register(UUID actor, UUID requestId, UUID idempotencyKey,
                                      ProductionController.RegisterBatchRequest request) {
        BigDecimal quantity = request.quantity();
        BigDecimal produced = request.actualQuantity() == null ? quantity : request.actualQuantity();
        String notes = request.notes() == null || request.notes().isBlank() ? null : request.notes().trim();
        String areaId = request.areaId() == null ? "" : request.areaId().toString();
        String hash = fingerprint(request.producedItemId().toString(), quantity.stripTrailingZeros().toPlainString(),
                produced.stripTrailingZeros().toPlainString(), areaId, notes);
        IdempotencyStore.Result claim = idempotency.claim(actor.toString(), "PRODUCTION_BATCH_REGISTERED",
                idempotencyKey, hash);
        if (claim.replay()) return receipt(claim.resourceId(), true);

        ItemRow item = item(request.producedItemId());
        if (!item.trackInventory())
            throw new AuthException(422, "El item producido no controla inventario.");
        if (!item.active())
            throw new AuthException(409, "El item producido está inactivo.");
        if (request.areaId() != null && !activeAreaExists(request.areaId()))
            throw new AuthException(422, "El área de producción no existe.");

        Map<UUID, BigDecimal> required = requirements(request.producedItemId(), quantity);
        if (required.isEmpty())
            throw new AuthException(422, "El item no tiene receta de producción.");

        TreeSet<UUID> involved = new TreeSet<>(required.keySet());
        involved.add(request.producedItemId());
        for (UUID itemId : involved) {
            jdbc.update("""
                INSERT INTO wok.inventory_balances (item_id) VALUES (?)
                ON CONFLICT (item_id) DO NOTHING
                """, itemId);
        }
        Map<UUID, BigDecimal> onHand = new HashMap<>();
        for (UUID itemId : involved) onHand.put(itemId, lockBalance(itemId));
        for (Map.Entry<UUID, BigDecimal> entry : required.entrySet()) {
            BigDecimal reserved = jdbc.queryForObject("""
                SELECT COALESCE(SUM(quantity), 0) FROM wok.inventory_reservations
                WHERE item_id = ? AND status = 'ACTIVE'
                """, BigDecimal.class, entry.getKey());
            BigDecimal available = onHand.get(entry.getKey())
                    .subtract(reserved == null ? BigDecimal.ZERO : reserved);
            if (available.compareTo(entry.getValue()) < 0)
                throw new AuthException(409, "No hay insumos suficientes para " + itemName(entry.getKey()) + ".");
        }

        UUID batchId = jdbc.queryForObject("""
            INSERT INTO wok.production_batches
                (produced_item_id, area_id, quantity, yield_quantity, status, notes, responsible_user_id, request_id)
            VALUES (?, ?, ?, ?, 'COMPLETED', ?, ?, ?) RETURNING id
            """, UUID.class, request.producedItemId(), request.areaId(), quantity, produced, notes, actor, requestId);

        for (Map.Entry<UUID, BigDecimal> entry : required.entrySet()) {
            jdbc.update("""
                INSERT INTO wok.production_batch_items (batch_id, item_id, quantity)
                VALUES (?, ?, ?)
                """, batchId, entry.getKey(), entry.getValue());
            jdbc.update("""
                INSERT INTO wok.inventory_movements
                    (item_id, movement_type, quantity_delta, reason, production_batch_id, responsible_user_id, request_id)
                VALUES (?, 'CONSUMPTION', ?, 'Consumo por producción', ?, ?, ?)
                ON CONFLICT (production_batch_id, item_id)
                    WHERE movement_type = 'CONSUMPTION' AND production_batch_id IS NOT NULL DO NOTHING
                """, entry.getKey(), entry.getValue().negate(), batchId, actor, requestId);
            jdbc.update("""
                UPDATE wok.inventory_balances
                SET quantity_on_hand = quantity_on_hand - ?, updated_at = now(), row_version = row_version + 1
                WHERE item_id = ? AND quantity_on_hand >= ?
                """, entry.getValue(), entry.getKey(), entry.getValue());
        }
        if (produced.signum() > 0) {
            jdbc.update("""
                INSERT INTO wok.inventory_movements
                    (item_id, movement_type, quantity_delta, reason, production_batch_id, responsible_user_id, request_id)
                VALUES (?, 'ENTRY', ?, 'Entrada por producción', ?, ?, ?)
                """, request.producedItemId(), produced, batchId, actor, requestId);
            jdbc.update("""
                UPDATE wok.inventory_balances
                SET quantity_on_hand = quantity_on_hand + ?, updated_at = now(), row_version = row_version + 1
                WHERE item_id = ?
                """, produced, request.producedItemId());
        }
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, after_data, result, request_id)
            VALUES (?, 'PRODUCTION_BATCH_REGISTERED', 'PRODUCTION_BATCH', ?,
                    jsonb_build_object('quantity', ?, 'yield', ?, 'inputs', ?), 'SUCCESS', ?)
            """, actor, batchId, quantity, produced, required.size(), requestId);
        idempotency.complete(actor.toString(), "PRODUCTION_BATCH_REGISTERED", idempotencyKey, batchId);
        return receipt(batchId, false);
    }

    private Map<UUID, BigDecimal> requirements(UUID producedItemId, BigDecimal quantity) {
        Map<UUID, BigDecimal> required = new LinkedHashMap<>();
        List<Component> components = jdbc.query("""
            SELECT rc.component_item_id, i.track_inventory, rc.quantity
            FROM wok.item_recipe_components rc
            JOIN wok.items i ON i.id = rc.component_item_id
            WHERE rc.parent_item_id = ?
            """, (rs, row) -> new Component(rs.getObject("component_item_id", UUID.class),
                rs.getBoolean("track_inventory"), rs.getBigDecimal("quantity")), producedItemId);
        for (Component component : components) {
            if (!component.trackInventory())
                throw new AuthException(422, "Un insumo de la receta no controla inventario.");
            required.merge(component.itemId(), component.quantity().multiply(quantity), BigDecimal::add);
        }
        return required;
    }

    private ProductionReceipt receipt(UUID batchId, boolean replay) {
        List<ProductionBatchSummary> found = jdbc.query("""
            SELECT b.id, b.produced_item_id, i.name AS produced_name, b.quantity, b.yield_quantity, b.status,
                   b.produced_at, b.area_id, pa.code AS area_code
            FROM wok.production_batches b
            JOIN wok.items i ON i.id = b.produced_item_id
            LEFT JOIN wok.preparation_areas pa ON pa.id = b.area_id
            WHERE b.id = ?
            """, (rs, row) -> new ProductionBatchSummary(rs.getObject("id", UUID.class),
                rs.getObject("produced_item_id", UUID.class), rs.getString("produced_name"),
                rs.getBigDecimal("quantity"), rs.getBigDecimal("yield_quantity"), rs.getString("status"),
                rs.getTimestamp("produced_at").toInstant(), rs.getObject("area_id", UUID.class),
                rs.getString("area_code")), batchId);
        if (found.isEmpty()) throw new AuthException(404, "No encontramos el lote de producción.");
        ProductionBatchSummary batch = found.getFirst();
        BigDecimal onHand = jdbc.queryForObject("""
            SELECT COALESCE(quantity_on_hand, 0) FROM wok.inventory_balances WHERE item_id = ?
            """, BigDecimal.class, batch.producedItemId());
        return new ProductionReceipt(batch.batchId(), batch.producedItemId(), batch.quantity(), batch.yieldQuantity(),
                onHand, consumedItems(batchId), replay);
    }

    private List<ConsumedItem> consumedItems(UUID batchId) {
        return jdbc.query("""
            SELECT bi.item_id, i.sku, i.name, u.code AS unit_code, bi.quantity
            FROM wok.production_batch_items bi
            JOIN wok.items i ON i.id = bi.item_id
            JOIN wok.units u ON u.id = i.base_unit_id
            WHERE bi.batch_id = ?
            ORDER BY i.name, i.id
            """, (rs, row) -> new ConsumedItem(rs.getObject("item_id", UUID.class), rs.getString("sku"),
                rs.getString("name"), rs.getString("unit_code"), rs.getBigDecimal("quantity")), batchId);
    }

    private ItemRow item(UUID itemId) {
        List<ItemRow> rows = jdbc.query("""
            SELECT id, track_inventory, active FROM wok.items WHERE id = ?
            """, (rs, row) -> new ItemRow(rs.getObject("id", UUID.class), rs.getBoolean("track_inventory"),
                rs.getBoolean("active")), itemId);
        if (rows.isEmpty()) throw new AuthException(404, "No encontramos el item de producción.");
        return rows.getFirst();
    }

    private boolean activeAreaExists(UUID areaId) {
        Integer found = jdbc.queryForObject("""
            SELECT count(*) FROM wok.preparation_areas WHERE id = ? AND active = true
            """, Integer.class, areaId);
        return found != null && found > 0;
    }

    private BigDecimal lockBalance(UUID itemId) {
        return jdbc.queryForObject("""
            SELECT quantity_on_hand FROM wok.inventory_balances WHERE item_id = ? FOR UPDATE
            """, BigDecimal.class, itemId);
    }

    private String itemName(UUID itemId) {
        List<String> names = jdbc.query("SELECT name FROM wok.items WHERE id = ?",
                (rs, row) -> rs.getString(1), itemId);
        return names.isEmpty() ? itemId.toString() : names.getFirst();
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
    private record Component(UUID itemId, boolean trackInventory, BigDecimal quantity) {}

    public record ProductionBatchSummary(UUID batchId, UUID producedItemId, String producedItem, BigDecimal quantity,
                                         BigDecimal yieldQuantity, String status, Instant producedAt, UUID areaId,
                                         String areaCode) {}
    public record ConsumedItem(UUID itemId, String sku, String name, String unit, BigDecimal quantity) {}
    public record ProductionBatchDetails(ProductionBatchSummary batch, List<ConsumedItem> items) {}
    public record ProductionReceipt(UUID batchId, UUID producedItemId, BigDecimal quantity, BigDecimal yieldQuantity,
                                    BigDecimal producedOnHand, List<ConsumedItem> items, boolean idempotentReplay) {}
}

package com.wokasianfood.api.inventory;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.net.http.HttpResponse;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class InventoryOrderIntegrationTest extends PostgresIntegrationTest {

    private final ObjectMapper json = new ObjectMapper();

    @Test
    void reservesConsumesAndReleasesStockAcrossOrderLifecycle() {
        UUID actor = createUserWithRole("inventario-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        UUID componentId = createItem("CARNE", "Carne de res", "0");
        jdbc.update("""
                INSERT INTO wok.inventory_balances (item_id, quantity_on_hand) VALUES (?, 10)
                """, componentId);
        UUID parentItemId = createItem("PLATO", "Pad Thai", "0");
        UUID menuItemId = createMenuItem(parentItemId, "25.00", token);

        JsonNode recipe = body(send("PUT", "/api/v1/operational/inventory/items/" + parentItemId + "/recipe", token, """
                {"components":[{"componentItemId":"%s","quantity":2}]}
                """.formatted(componentId), Map.of()));
        assertThat(recipe.path("components")).hasSize(1);
        assertThat(recipe.path("components").get(0).path("quantity").decimalValue()).isEqualByComparingTo("2");

        UUID accountId = createAccount(actor, "Cuenta inventario");
        UUID orderId = openOrder(token, accountId, menuItemId, 1);
        assertThat(available(token, componentId)).isEqualByComparingTo("8");
        assertThat(reserved(componentId)).isEqualByComparingTo("2");
        assertThat(reservationStatus(orderId, componentId)).isEqualTo("ACTIVE");

        UUID insufficientAccount = createAccount(actor, "Cuenta sin stock");
        var insufficient = post("/api/v1/operational/orders", token, """
                {"accountId":"%s","channel":"PICKUP","guestCount":1,"items":[{"menuItemId":"%s","quantity":5,"fulfillment":"TAKEAWAY"}]}
                """.formatted(insufficientAccount, menuItemId), Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(insufficient.statusCode()).isEqualTo(409);
        assertThat(count("SELECT count(*) FROM wok.orders WHERE account_id = ?", insufficientAccount)).isZero();
        assertThat(available(token, componentId)).isEqualByComparingTo("8");

        JsonNode opened = body(get("/api/v1/operational/orders/" + orderId, token));
        int version = opened.path("order").path("rowVersion").asInt();
        version = transition(token, orderId, "PREPARING", version);
        version = transition(token, orderId, "READY", version);
        transition(token, orderId, "SERVED", version);

        assertThat(available(token, componentId)).isEqualByComparingTo("8");
        assertThat(onHand(token, componentId)).isEqualByComparingTo("8");
        assertThat(reserved(componentId)).isEqualByComparingTo("0");
        assertThat(reservationStatus(orderId, componentId)).isEqualTo("CONSUMED");
        assertThat(count("""
                SELECT count(*) FROM wok.inventory_movements
                WHERE order_id = ? AND item_id = ? AND movement_type = 'CONSUMPTION'
                """, orderId, componentId)).isEqualTo(1);

        UUID cancelAccount = createAccount(actor, "Cuenta cancelada");
        UUID cancelOrderId = openOrder(token, cancelAccount, menuItemId, 2);
        assertThat(reserved(componentId)).isEqualByComparingTo("4");
        JsonNode cancelOpened = body(get("/api/v1/operational/orders/" + cancelOrderId, token));
        transition(token, cancelOrderId, "CANCELLED", cancelOpened.path("order").path("rowVersion").asInt());
        assertThat(reserved(componentId)).isEqualByComparingTo("0");
        assertThat(reservationStatus(cancelOrderId, componentId)).isEqualTo("RELEASED");
        assertThat(onHand(token, componentId)).isEqualByComparingTo("8");
    }

    @Test
    void rejectsInvalidRecipesAndRequiresInventoryPermission() {
        String token = tokenForRole("OPERATIONAL");
        UUID parentItemId = createItem("SALSA", "Salsa madre", "0");
        UUID componentId = createItem("AJO", "Ajo", "0");

        var selfReference = send("PUT", "/api/v1/operational/inventory/items/" + parentItemId + "/recipe", token, """
                {"components":[{"componentItemId":"%s","quantity":1}]}
                """.formatted(parentItemId), Map.of());
        assertThat(selfReference.statusCode()).isEqualTo(422);

        var duplicated = send("PUT", "/api/v1/operational/inventory/items/" + parentItemId + "/recipe", token, """
                {"components":[{"componentItemId":"%s","quantity":1},{"componentItemId":"%s","quantity":2}]}
                """.formatted(componentId, componentId), Map.of());
        assertThat(duplicated.statusCode()).isEqualTo(422);

        var forbidden = send("PUT", "/api/v1/operational/inventory/items/" + parentItemId + "/recipe",
                tokenForRole("CLIENT"), """
                {"components":[{"componentItemId":"%s","quantity":1}]}
                """.formatted(componentId), Map.of());
        assertThat(forbidden.statusCode()).isEqualTo(403);

        UUID untracked = createItem("EMPAQUE", "Empaque", "0", false);
        var untrackedComponent = send("PUT", "/api/v1/operational/inventory/items/" + parentItemId + "/recipe",
                token, """
                {"components":[{"componentItemId":"%s","quantity":1}]}
                """.formatted(untracked), Map.of());
        assertThat(untrackedComponent.statusCode()).isEqualTo(422);
    }

    @Test
    void marksAvailabilityZeroAsOutEvenWhenStockRemains() {
        UUID actor = createUserWithRole("inventario-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        UUID componentId = createItem("CAMARON", "Camaron", "0");
        jdbc.update("""
                INSERT INTO wok.inventory_balances (item_id, quantity_on_hand) VALUES (?, 2)
                """, componentId);
        UUID parentItemId = createItem("PLATO", "Pizza Wok", "0");
        UUID menuItemId = createMenuItem(parentItemId, "30.00", token);
        body(send("PUT", "/api/v1/operational/inventory/items/" + parentItemId + "/recipe", token, """
                {"components":[{"componentItemId":"%s","quantity":2}]}
                """.formatted(componentId), Map.of()));

        UUID accountId = createAccount(actor, "Cuenta sin disponible");
        openOrder(token, accountId, menuItemId, 1);

        assertThat(available(token, componentId)).isEqualByComparingTo("0");
        assertThat(onHand(token, componentId)).isEqualByComparingTo("2");
        JsonNode detail = body(get("/api/v1/operational/inventory/items/" + componentId, token));
        assertThat(detail.path("item").path("status").asText()).isEqualTo("OUT");
    }

    private int transition(String token, UUID orderId, String status, int expectedVersion) {
        JsonNode body = body(patch("/api/v1/operational/orders/" + orderId + "/status", token, """
                {"status":"%s","expectedVersion":%d}
                """.formatted(status, expectedVersion)));
        return body.path("rowVersion").asInt();
    }

    private UUID openOrder(String token, UUID accountId, UUID menuItemId, int quantity) {
        JsonNode body = body(post("/api/v1/operational/orders", token, """
                {"accountId":"%s","channel":"PICKUP","guestCount":1,"items":[{"menuItemId":"%s","quantity":%d,"fulfillment":"TAKEAWAY"}]}
                """.formatted(accountId, menuItemId, quantity), Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        return UUID.fromString(body.path("orderId").asText());
    }

    private java.math.BigDecimal available(String token, UUID itemId) {
        return body(get("/api/v1/operational/inventory/items/" + itemId, token))
                .path("item").path("quantityAvailable").decimalValue();
    }

    private java.math.BigDecimal onHand(String token, UUID itemId) {
        return body(get("/api/v1/operational/inventory/items/" + itemId, token))
                .path("item").path("quantityOnHand").decimalValue();
    }

    private java.math.BigDecimal reserved(UUID itemId) {
        return jdbc.queryForObject("""
                SELECT COALESCE(SUM(quantity), 0) FROM wok.inventory_reservations
                WHERE item_id = ? AND status = 'ACTIVE'
                """, java.math.BigDecimal.class, itemId);
    }

    private String reservationStatus(UUID orderId, UUID itemId) {
        return jdbc.queryForObject("""
                SELECT status FROM wok.inventory_reservations WHERE order_id = ? AND item_id = ?
                """, String.class, orderId, itemId);
    }

    private UUID createItem(String skuPrefix, String name, String minimumStock) {
        return createItem(skuPrefix, name, minimumStock, true);
    }

    private UUID createItem(String skuPrefix, String name, String minimumStock, boolean trackInventory) {
        UUID typeId = UUID.randomUUID();
        UUID unitId = UUID.randomUUID();
        jdbc.update("INSERT INTO wok.item_types (id, code, name) VALUES (?, ?, ?)",
                typeId, uniqueCode("TYPE"), "Tipo " + typeId);
        jdbc.update("""
                INSERT INTO wok.units (id, code, name, dimension, factor_to_base)
                VALUES (?, ?, ?, 'MASS', 1)
                """, unitId, uniqueCode("UNIT"), "Unidad " + unitId);
        UUID itemId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO wok.items (id, sku, name, item_type_id, base_unit_id, track_inventory, minimum_stock)
                VALUES (?, ?, ?, ?, ?, ?, ?::numeric)
                """, itemId, uniqueCode(skuPrefix), name, typeId, unitId, trackInventory, minimumStock);
        return itemId;
    }

    private UUID createMenuItem(UUID parentItemId, String price, String token) {
        UUID categoryId = UUID.randomUUID();
        UUID areaId = UUID.randomUUID();
        jdbc.update("INSERT INTO wok.menu_categories (id, name) VALUES (?, ?)",
                categoryId, "Categoria " + categoryId);
        jdbc.update("INSERT INTO wok.preparation_areas (id, code, name) VALUES (?, ?, ?)",
                areaId, uniqueCode("AREA"), "Area " + areaId);
        UUID menuItemId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO wok.menu_items
                    (id, item_id, category_id, preparation_area_id, name, price, currency_id)
                SELECT ?, ?, ?, ?, ?, ?::numeric, id FROM wok.currencies WHERE code = 'GTQ'
                """, menuItemId, parentItemId, categoryId, areaId, "Plato " + menuItemId, price);
        return menuItemId;
    }

    private UUID createAccount(UUID actor, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO wok.order_accounts
                    (id, dining_table_id, name, status, opened_by, created_by, updated_by)
                VALUES (?, NULL, ?, 'OPEN', ?, ?, ?)
                """, id, name, actor, actor, actor);
        return id;
    }

    private String uniqueCode(String prefix) {
        return (prefix + "_" + UUID.randomUUID().toString().substring(0, 8)).toUpperCase();
    }

    private int count(String sql, Object... arguments) {
        return jdbc.queryForObject(sql, Integer.class, arguments);
    }

    private JsonNode body(HttpResponse<String> response) {
        assertThat(response.statusCode()).as("body %s", response.body()).isBetween(200, 299);
        try {
            return json.readTree(response.body());
        } catch (Exception failure) {
            throw new IllegalStateException(failure);
        }
    }
}

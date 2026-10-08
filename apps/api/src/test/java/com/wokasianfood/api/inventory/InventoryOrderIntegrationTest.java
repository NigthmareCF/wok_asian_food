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
                {"components":[{"componentItemId":"%s","quantity":2}],"recipeStatus":"ACTIVE"}
                """.formatted(componentId), Map.of()));
        assertThat(recipe.path("recipeStatus").asText()).isEqualTo("ACTIVE");
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
                {"components":[{"componentItemId":"%s","quantity":2}],"recipeStatus":"ACTIVE"}
                """.formatted(componentId), Map.of()));

        UUID accountId = createAccount(actor, "Cuenta sin disponible");
        openOrder(token, accountId, menuItemId, 1);

        assertThat(available(token, componentId)).isEqualByComparingTo("0");
        assertThat(onHand(token, componentId)).isEqualByComparingTo("2");
        JsonNode detail = body(get("/api/v1/operational/inventory/items/" + componentId, token));
        assertThat(detail.path("item").path("status").asText()).isEqualTo("OUT");
    }

    @Test
    void pendingMenuRecipeIsSavedWithoutAffectingAvailabilityOrOrdersUntilActivated() {
        UUID actor = createUserWithRole("receta-pendiente-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        UUID componentId = createItem("INGREDIENTE", "Ingrediente aún por confirmar", "0");
        jdbc.update("INSERT INTO wok.inventory_balances (item_id, quantity_on_hand) VALUES (?, 2)", componentId);
        UUID parentItemId = createItem("BEBIDA", "Bebida con receta pendiente", "0");
        UUID menuItemId = createMenuItem(parentItemId, "30.00", token);

        JsonNode pending = body(send("PUT", "/api/v1/operational/inventory/items/" + parentItemId + "/recipe", token, """
                {"components":[{"componentItemId":"%s","quantity":1}]}
                """.formatted(componentId), Map.of()));
        assertThat(pending.path("recipeStatus").asText()).isEqualTo("PENDING_DATA");
        JsonNode estimate = body(post("/api/v1/public/menu/availability", null, """
                {"items":[{"menuItemId":"%s","quantity":5,"modifierIds":[]}]}
                """.formatted(menuItemId), Map.of()));
        assertThat(estimate.path("items").get(0).path("status").asText()).isEqualTo("NOT_TRACKED");

        UUID account = createAccount(actor, "Cuenta receta pendiente");
        UUID orderId = openOrder(token, account, menuItemId, 5);
        assertThat(reserved(componentId)).isZero();
        assertThat(count("SELECT count(*) FROM wok.inventory_reservations WHERE order_id = ?", orderId)).isZero();
        assertThat(onHand(token, componentId)).isEqualByComparingTo("2");

        JsonNode active = body(send("PUT", "/api/v1/operational/inventory/items/" + parentItemId + "/recipe", token, """
                {"components":[{"componentItemId":"%s","quantity":1}],"recipeStatus":"ACTIVE"}
                """.formatted(componentId), Map.of()));
        assertThat(active.path("recipeStatus").asText()).isEqualTo("ACTIVE");
        UUID activeAccount = createAccount(actor, "Cuenta receta activa");
        var unavailable = post("/api/v1/operational/orders", token, """
                {"accountId":"%s","channel":"PICKUP","guestCount":1,"items":[{"menuItemId":"%s","quantity":5,"fulfillment":"TAKEAWAY"}]}
                """.formatted(activeAccount, menuItemId), Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(unavailable.statusCode()).isEqualTo(409);
        assertThat(onHand(token, componentId)).isEqualByComparingTo("2");
    }

    @Test
    void cancellingQueuedLinePreservesHistoryReleasesOnlyItsResourcesAndReplaysIdempotently() {
        UUID actor = createUserWithRole("line-cancel-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        UUID componentId = createItem("CANCEL_COMPONENT", "Componente cancelación", "0");
        jdbc.update("INSERT INTO wok.inventory_balances (item_id, quantity_on_hand) VALUES (?, 20)", componentId);
        UUID parentItemId = createItem("CANCEL_PLATE", "Plato cancelación", "0");
        UUID menuItemId = createMenuItem(parentItemId, "25.00", token);
        UUID siblingParentId = createItem("CANCEL_SIBLING", "Plato hermano cancelación", "0");
        UUID siblingMenuItemId = createMenuItem(siblingParentId, "25.00", token);
        jdbc.update("""
                UPDATE wok.menu_items sibling SET preparation_area_id = primary_item.preparation_area_id
                FROM wok.menu_items primary_item WHERE sibling.id = ? AND primary_item.id = ?
                """, siblingMenuItemId, menuItemId);
        body(send("PUT", "/api/v1/operational/inventory/items/" + parentItemId + "/recipe", token, """
                {"components":[{"componentItemId":"%s","quantity":2}],"recipeStatus":"ACTIVE"}
                """.formatted(componentId), Map.of()));
        body(send("PUT", "/api/v1/operational/inventory/items/" + siblingParentId + "/recipe", token, """
                {"components":[{"componentItemId":"%s","quantity":2}],"recipeStatus":"ACTIVE"}
                """.formatted(componentId), Map.of()));
        UUID account = createAccount(actor, "Cuenta ajuste por línea");
        JsonNode opened = body(post("/api/v1/operational/orders", token, """
                {"accountId":"%s","channel":"PICKUP","guestCount":2,"items":[
                  {"menuItemId":"%s","quantity":2,"fulfillment":"TAKEAWAY"},
                  {"menuItemId":"%s","quantity":1,"fulfillment":"TAKEAWAY"}]}
                """.formatted(account, menuItemId, siblingMenuItemId),
                Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        UUID orderId = UUID.fromString(opened.path("orderId").asText());
        JsonNode details = body(get("/api/v1/operational/orders/" + orderId, token));
        JsonNode cancelledLine = null;
        JsonNode siblingLine = null;
        for (JsonNode line : details.path("items")) {
            if (line.path("quantity").asInt() == 2) cancelledLine = line;
            else siblingLine = line;
        }
        assertThat(cancelledLine).isNotNull();
        assertThat(siblingLine).isNotNull();
        UUID orderItemId = UUID.fromString(cancelledLine.path("id").asText());
        UUID siblingOrderItemId = UUID.fromString(siblingLine.path("id").asText());
        int orderVersion = details.path("order").path("rowVersion").asInt();
        int itemVersion = cancelledLine.path("version").asInt();
        UUID idempotencyKey = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();

        String path = "/api/v1/operational/orders/" + orderId + "/items/" + orderItemId + "/cancellations";
        var response = send("POST", path, token, """
                {"expectedOrderVersion":%d,"expectedItemVersion":%d,"reason":"Cliente solicitó retirar un plato"}
                """.formatted(orderVersion, itemVersion), Map.of(
                        "Idempotency-Key", idempotencyKey.toString(), "X-Request-Id", requestId.toString()));
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        JsonNode adjusted = body(response);
        assertThat(adjusted.path("order").path("subtotal").decimalValue()).isEqualByComparingTo("25.00");
        assertThat(orderLine(adjusted, orderItemId).path("status").asText()).isEqualTo("CANCELLED");
        assertThat(orderLine(adjusted, siblingOrderItemId).path("status").asText()).isEqualTo("ACTIVE");
        assertThat(reserved(componentId)).isEqualByComparingTo("2");
        assertThat(count("SELECT count(*) FROM wok.order_item_change_events WHERE order_id = ?", orderId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.kitchen_ticket_items WHERE order_item_id = ? AND action = 'CANCELLED'", orderItemId)).isEqualTo(1);

        var replay = send("POST", path, token, """
                {"expectedOrderVersion":%d,"expectedItemVersion":%d,"reason":"Cliente solicitó retirar un plato"}
                """.formatted(orderVersion, itemVersion), Map.of(
                        "Idempotency-Key", idempotencyKey.toString(), "X-Request-Id", UUID.randomUUID().toString()));
        assertThat(replay.statusCode()).isEqualTo(200);
        assertThat(count("SELECT count(*) FROM wok.order_item_change_events WHERE order_id = ?", orderId)).isEqualTo(1);
    }

    @Test
    void cancellingAfterKitchenStartsRecordsReservedMaterialsAsWaste() {
        UUID actor = createUserWithRole("line-waste-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        UUID componentId = createItem("WASTE_COMPONENT", "Componente preparado", "0");
        jdbc.update("INSERT INTO wok.inventory_balances (item_id, quantity_on_hand) VALUES (?, 10)", componentId);
        UUID parentItemId = createItem("WASTE_PLATE", "Plato iniciado", "0");
        UUID menuItemId = createMenuItem(parentItemId, "25.00", token);
        body(send("PUT", "/api/v1/operational/inventory/items/" + parentItemId + "/recipe", token, """
                {"components":[{"componentItemId":"%s","quantity":2}],"recipeStatus":"ACTIVE"}
                """.formatted(componentId), Map.of()));
        UUID account = createAccount(actor, "Cuenta merma cocina");
        UUID orderId = openOrder(token, account, menuItemId, 2);
        JsonNode opened = body(get("/api/v1/operational/orders/" + orderId, token));
        int version = transition(token, orderId, "PREPARING", opened.path("order").path("rowVersion").asInt());
        transition(token, orderId, "CANCELLED", version);
        assertThat(reserved(componentId)).isZero();
        assertThat(reservationStatus(orderId, componentId)).isEqualTo("CONSUMED");
        assertThat(onHand(token, componentId)).isEqualByComparingTo("6");
        assertThat(count("SELECT count(*) FROM wok.inventory_movements WHERE order_id = ? AND movement_type = 'WASTE'", orderId)).isEqualTo(1);
    }

    private int transition(String token, UUID orderId, String status, int expectedVersion) {
        JsonNode body = body(patch("/api/v1/operational/orders/" + orderId + "/status", token, """
                {"status":"%s","expectedVersion":%d}
                """.formatted(status, expectedVersion)));
        return body.path("rowVersion").asInt();
    }

    private JsonNode orderLine(JsonNode orderDetails, UUID orderItemId) {
        for (JsonNode line : orderDetails.path("items"))
            if (orderItemId.toString().equals(line.path("id").asText())) return line;
        throw new AssertionError("Order line missing from response: " + orderItemId);
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

package com.wokasianfood.api.operational;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.math.BigDecimal;
import java.net.http.HttpResponse;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class OperationalFlowIntegrationTest extends PostgresIntegrationTest {

    private final ObjectMapper json = new ObjectMapper();

    @Test
    void movesTableThroughOrderKitchenServiceAndClosingAgainstPostgres() {
        String token = tokenForRole("OPERATIONAL");
        String stationCode = "WOK_E2E";
        UUID tableId = createDiningTable("Mesa E2E");
        UUID menuItemId = seedMenuItem("Wok E2E", "45.00", stationCode, 300);

        JsonNode opened = body(post("/api/v1/operational/tables/" + tableId + "/open", token, null));
        assertThat(opened.path("status").asText()).isEqualTo("OCCUPIED");
        assertThat(opened.path("accountStatus").asText()).isEqualTo("OPEN");
        UUID accountId = UUID.fromString(opened.path("accountId").asText());

        JsonNode receipt = body(post("/api/v1/operational/orders", token, """
                {"accountId":"%s","channel":"DINE_IN","guestCount":2,"items":[
                  {"menuItemId":"%s","quantity":2,"fulfillment":"DINE_IN"}]}
                """.formatted(accountId, menuItemId),
                Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        UUID orderId = UUID.fromString(receipt.path("orderId").asText());
        assertThat(receipt.path("status").asText()).isEqualTo("SENT");
        assertThat(receipt.path("idempotentReplay").asBoolean()).isFalse();
        assertThat(receipt.path("itemCount").asInt()).isEqualTo(1);

        var persisted = jdbc.queryForMap("""
                SELECT o.status, o.channel, o.subtotal, o.total, o.dining_table_id, a.status AS account_status,
                       (SELECT count(*) FROM wok.order_items i WHERE i.order_id = o.id) AS items
                FROM wok.orders o JOIN wok.order_accounts a ON a.id = o.account_id WHERE o.id = ?
                """, orderId);
        assertThat(persisted.get("status")).isEqualTo("SENT");
        assertThat(persisted.get("channel")).isEqualTo("DINE_IN");
        assertThat((BigDecimal) persisted.get("subtotal")).isEqualByComparingTo("90.00");
        assertThat((BigDecimal) persisted.get("total")).isEqualByComparingTo("90.00");
        assertThat(persisted.get("dining_table_id")).isEqualTo(tableId);
        assertThat(persisted.get("account_status")).isEqualTo("OPEN");
        assertThat(((Number) persisted.get("items")).intValue()).isEqualTo(1);

        JsonNode queue = body(get("/api/v1/operational/kitchen/tickets?stationId=" + stationId(stationCode), token));
        assertThat(queue).hasSize(1);
        UUID ticketId = UUID.fromString(queue.get(0).path("id").asText());
        assertThat(queue.get(0).path("status").asText()).isEqualTo("QUEUED");
        assertThat(queue.get(0).path("stationCode").asText()).isEqualTo(stationCode);
        assertThat(queue.get(0).path("estimatedReadyAt").isNull()).isFalse();
        assertThat(queue.get(0).path("diningTableName").asText()).isNotBlank();
        assertThat(queue.get(0).path("orderId").asText()).isEqualTo(orderId.toString());

        JsonNode claimed = body(post("/api/v1/operational/kitchen/tickets/" + ticketId + "/claim", token, null));
        assertThat(claimed.path("status").asText()).isEqualTo("PREPARING");
        assertThat(claimed.path("claimedAt").isNull()).isFalse();
        assertThat(orderStatus(orderId)).isEqualTo("PREPARING");

        JsonNode ready = body(patch("/api/v1/operational/kitchen/tickets/" + ticketId + "/status", token, """
                {"status":"READY","expectedVersion":%d,"reason":"plato listo"}
                """.formatted(claimed.path("rowVersion").asInt())));
        assertThat(ready.path("status").asText()).isEqualTo("READY");
        assertThat(ready.path("readyAt").isNull()).isFalse();
        assertThat(orderStatus(orderId)).isEqualTo("READY");

        JsonNode served = changeOrderStatus(token, orderId, "SERVED");
        assertThat(served.path("status").asText()).isEqualTo("SERVED");
        JsonNode closedOrder = changeOrderStatus(token, orderId, "CLOSED");
        assertThat(closedOrder.path("status").asText()).isEqualTo("CLOSED");
        assertThat(closedOrder.path("closedAt").isNull()).isFalse();

        assertThat(count("SELECT count(*) FROM wok.order_status_history WHERE order_id = ?", orderId)).isEqualTo(5);
        assertThat(count("""
                SELECT count(*) FROM wok.kitchen_ticket_status_history
                WHERE ticket_id = (SELECT id FROM wok.kitchen_tickets WHERE order_id = ?)
                """, orderId)).isEqualTo(3);
        assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE entity_id = ?", orderId)).isEqualTo(3);

        var staleVersion = patch("/api/v1/operational/orders/" + orderId + "/status", token, """
                {"status":"SERVED","expectedVersion":1}
                """);
        assertThat(staleVersion.statusCode()).isEqualTo(409);

        JsonNode closedTable = body(post("/api/v1/operational/tables/" + tableId + "/close", token, null));
        assertThat(closedTable.path("status").asText()).isEqualTo("CLEANING");
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_accounts WHERE id = ?", String.class, accountId))
                .isEqualTo("CLOSED");

        assertThat(body(get("/api/v1/operational/orders?tableId=" + tableId, token))).hasSize(1);
    }

    @Test
    void rejectsUnknownProductWithoutPersistingOrderOrTicket() {
        String token = tokenForRole("OPERATIONAL");
        UUID tableId = createDiningTable("Mesa Rollback");
        UUID accountId = UUID.fromString(
                body(post("/api/v1/operational/tables/" + tableId + "/open", token, null)).path("accountId").asText());
        int ordersBefore = count("SELECT count(*) FROM wok.orders");
        int ticketsBefore = count("SELECT count(*) FROM wok.kitchen_tickets");

        var rejected = post("/api/v1/operational/orders", token, """
                {"accountId":"%s","channel":"DINE_IN","guestCount":2,"items":[
                  {"menuItemId":"%s","quantity":1,"fulfillment":"DINE_IN"}]}
                """.formatted(accountId, UUID.randomUUID()),
                Map.of("Idempotency-Key", UUID.randomUUID().toString()));

        assertThat(rejected.statusCode()).isEqualTo(422);
        assertThat(count("SELECT count(*) FROM wok.orders")).isEqualTo(ordersBefore);
        assertThat(count("SELECT count(*) FROM wok.kitchen_tickets")).isEqualTo(ticketsBefore);
        assertThat(count("SELECT count(*) FROM wok.orders WHERE account_id = ?", accountId)).isZero();
    }

    @Test
    void replaysSameIdempotencyKeyAndRejectsDifferentPayload() {
        String token = tokenForRole("OPERATIONAL");
        UUID tableId = createDiningTable("Mesa Idempotencia");
        UUID menuItemId = seedMenuItem("Wok Idempotencia", "30.00", "WOK_IDEM", 120);
        UUID accountId = UUID.fromString(
                body(post("/api/v1/operational/tables/" + tableId + "/open", token, null)).path("accountId").asText());
        String idempotencyKey = UUID.randomUUID().toString();
        String payload = """
                {"accountId":"%s","channel":"DINE_IN","guestCount":2,"items":[
                  {"menuItemId":"%s","quantity":1,"fulfillment":"DINE_IN"}]}
                """.formatted(accountId, menuItemId);

        var first = post("/api/v1/operational/orders", token, payload, Map.of("Idempotency-Key", idempotencyKey));
        assertThat(first.statusCode()).isEqualTo(201);

        var replay = post("/api/v1/operational/orders", token, payload, Map.of("Idempotency-Key", idempotencyKey));
        assertThat(replay.statusCode()).isEqualTo(201);
        assertThat(body(replay).path("idempotentReplay").asBoolean()).isTrue();
        assertThat(body(replay).path("orderId").asText()).isEqualTo(body(first).path("orderId").asText());

        var conflicting = post("/api/v1/operational/orders", token,
                payload.replace("\"guestCount\":2", "\"guestCount\":3"), Map.of("Idempotency-Key", idempotencyKey));
        assertThat(conflicting.statusCode()).isEqualTo(409);
        assertThat(count("SELECT count(*) FROM wok.orders WHERE account_id = ?", accountId)).isEqualTo(1);
    }

    @Test
    void keepsBlockingCloseWhileOrderIsOpen() {
        String token = tokenForRole("OPERATIONAL");
        UUID tableId = createDiningTable("Mesa Bloqueada");
        UUID menuItemId = seedMenuItem("Wok Bloqueo", "20.00", "WOK_LOCK", 60);
        UUID accountId = UUID.fromString(
                body(post("/api/v1/operational/tables/" + tableId + "/open", token, null)).path("accountId").asText());
        body(post("/api/v1/operational/orders", token, """
                {"accountId":"%s","channel":"DINE_IN","guestCount":1,"items":[
                  {"menuItemId":"%s","quantity":1,"fulfillment":"DINE_IN"}]}
                """.formatted(accountId, menuItemId), Map.of("Idempotency-Key", UUID.randomUUID().toString())));

        assertThat(post("/api/v1/operational/tables/" + tableId + "/close", token, null).statusCode())
                .isEqualTo(409);
        assertThat(jdbc.queryForObject("SELECT current_status FROM wok.dining_tables WHERE id = ?", String.class, tableId))
                .isEqualTo("OCCUPIED");
    }

    @Test
    void addsItemsToOpenOrderAndEnqueuesFollowUpTicket() {
        String token = tokenForRole("OPERATIONAL");
        String stationCode = "WOK_ADD";
        UUID tableId = createDiningTable("Mesa Agregar");
        UUID baseItem = seedMenuItem("Wok Base", "40.00", stationCode, 120);
        UUID extraItem = seedMenuItem("Wok Extra", "15.00", stationCode, 90);
        UUID accountId = UUID.fromString(
                body(post("/api/v1/operational/tables/" + tableId + "/open", token, null)).path("accountId").asText());
        UUID orderId = UUID.fromString(body(post("/api/v1/operational/orders", token, """
                {"accountId":"%s","channel":"DINE_IN","guestCount":2,"items":[
                  {"menuItemId":"%s","quantity":1,"fulfillment":"DINE_IN"}]}
                """.formatted(accountId, baseItem),
                Map.of("Idempotency-Key", UUID.randomUUID().toString()))).path("orderId").asText());

        JsonNode added = body(post("/api/v1/operational/orders/" + orderId + "/items", token, """
                {"items":[{"menuItemId":"%s","quantity":2,"fulfillment":"DINE_IN"}]}
                """.formatted(extraItem), Map.of("Idempotency-Key", UUID.randomUUID().toString())));

        assertThat(added.path("order").path("total").decimalValue()).isEqualByComparingTo("70.00");
        assertThat(added.path("order").path("status").asText()).isEqualTo("SENT");
        assertThat(added.path("items")).hasSize(2);
        assertThat(added.path("tickets")).hasSize(2);
        assertThat(added.path("tickets").get(0).path("sequence").asInt()).isEqualTo(1);
        assertThat(added.path("tickets").get(1).path("sequence").asInt()).isEqualTo(2);
        assertThat(count("""
                SELECT count(*) FROM wok.kitchen_ticket_items kti
                JOIN wok.order_items i ON i.id = kti.order_item_id WHERE i.order_id = ?
                """, orderId)).isEqualTo(2);
        assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE entity_id = ? AND action = 'ORDER_ITEMS_ADDED'",
                orderId)).isEqualTo(1);
        assertThat(orderStatus(orderId)).isEqualTo("SENT");
    }

    @Test
    void replaysAddedItemsKeyAndRejectsWhenOrderIsCancelled() {
        String token = tokenForRole("OPERATIONAL");
        UUID tableId = createDiningTable("Mesa Replay Items");
        UUID baseItem = seedMenuItem("Wok Replay Base", "10.00", "WOK_REPLAY_ITEMS", 60);
        UUID extraItem = seedMenuItem("Wok Replay Extra", "5.00", "WOK_REPLAY_ITEMS", 60);
        UUID accountId = UUID.fromString(
                body(post("/api/v1/operational/tables/" + tableId + "/open", token, null)).path("accountId").asText());
        UUID orderId = UUID.fromString(body(post("/api/v1/operational/orders", token, """
                {"accountId":"%s","channel":"DINE_IN","guestCount":1,"items":[
                  {"menuItemId":"%s","quantity":1,"fulfillment":"DINE_IN"}]}
                """.formatted(accountId, baseItem),
                Map.of("Idempotency-Key", UUID.randomUUID().toString()))).path("orderId").asText());

        String idempotencyKey = UUID.randomUUID().toString();
        String payload = """
                {"items":[{"menuItemId":"%s","quantity":1,"fulfillment":"DINE_IN"}]}
                """.formatted(extraItem);

        assertThat(post("/api/v1/operational/orders/" + orderId + "/items", token, payload,
                Map.of("Idempotency-Key", idempotencyKey)).statusCode()).isEqualTo(200);
        var replay = post("/api/v1/operational/orders/" + orderId + "/items", token, payload,
                Map.of("Idempotency-Key", idempotencyKey));
        assertThat(replay.statusCode()).isEqualTo(200);
        assertThat(body(replay).path("items")).hasSize(2);
        assertThat(count("SELECT count(*) FROM wok.order_items WHERE order_id = ?", orderId)).isEqualTo(2);

        var conflicting = post("/api/v1/operational/orders/" + orderId + "/items", token,
                payload.replace("\"quantity\":1", "\"quantity\":3"), Map.of("Idempotency-Key", idempotencyKey));
        assertThat(conflicting.statusCode()).isEqualTo(409);
        assertThat(count("SELECT count(*) FROM wok.order_items WHERE order_id = ?", orderId)).isEqualTo(2);

        assertThat(changeOrderStatus(token, orderId, "CANCELLED").path("status").asText()).isEqualTo("CANCELLED");
        var rejected = post("/api/v1/operational/orders/" + orderId + "/items", token, payload,
                Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(rejected.statusCode()).isEqualTo(409);
    }

    @Test
    void returnsAccountDetailsWithOrdersAndTotalExcludingCancelled() {
        String token = tokenForRole("OPERATIONAL");
        String stationCode = "WOK_ACCOUNT";
        UUID tableId = createDiningTable("Mesa Cuenta");
        UUID firstItem = seedMenuItem("Wok Cuenta A", "40.00", stationCode, 60);
        UUID secondItem = seedMenuItem("Wok Cuenta B", "15.00", stationCode, 60);
        String tableName = jdbc.queryForObject("SELECT name FROM wok.dining_tables WHERE id = ?", String.class, tableId);
        UUID accountId = UUID.fromString(
                body(post("/api/v1/operational/tables/" + tableId + "/open", token, null)).path("accountId").asText());

        body(post("/api/v1/operational/orders", token, """
                {"accountId":"%s","channel":"DINE_IN","guestCount":2,"items":[
                  {"menuItemId":"%s","quantity":1,"fulfillment":"DINE_IN"}]}
                """.formatted(accountId, firstItem), Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        UUID cancelledOrder = UUID.fromString(body(post("/api/v1/operational/orders", token, """
                {"accountId":"%s","channel":"DINE_IN","guestCount":1,"items":[
                  {"menuItemId":"%s","quantity":1,"fulfillment":"DINE_IN"}]}
                """.formatted(accountId, secondItem),
                Map.of("Idempotency-Key", UUID.randomUUID().toString()))).path("orderId").asText());
        assertThat(changeOrderStatus(token, cancelledOrder, "CANCELLED").path("status").asText()).isEqualTo("CANCELLED");

        JsonNode details = body(get("/api/v1/operational/accounts/" + accountId, token));
        assertThat(details.path("account").path("id").asText()).isEqualTo(accountId.toString());
        assertThat(details.path("account").path("status").asText()).isEqualTo("OPEN");
        assertThat(details.path("account").path("diningTableId").asText()).isEqualTo(tableId.toString());
        assertThat(details.path("account").path("diningTableName").asText()).isEqualTo(tableName);
        assertThat(details.path("orders")).hasSize(2);
        assertThat(details.path("total").decimalValue()).isEqualByComparingTo("40.00");

        assertThat(get("/api/v1/operational/accounts/" + UUID.randomUUID(), token).statusCode()).isEqualTo(404);
        assertThat(get("/api/v1/operational/accounts/" + accountId, tokenForRole("CLIENT")).statusCode()).isEqualTo(403);
    }

    private JsonNode changeOrderStatus(String token, UUID orderId, String status) {
        JsonNode current = body(get("/api/v1/operational/orders/" + orderId, token)).path("order");
        return body(patch("/api/v1/operational/orders/" + orderId + "/status", token, """
                {"status":"%s","expectedVersion":%d}
                """.formatted(status, current.path("rowVersion").asInt())));
    }

    private String orderStatus(UUID orderId) {
        return jdbc.queryForObject("SELECT status FROM wok.orders WHERE id = ?", String.class, orderId);
    }

    private UUID stationId(String stationCode) {
        return jdbc.queryForObject("SELECT id FROM wok.preparation_areas WHERE code = ?", UUID.class, stationCode);
    }

    private int count(String sql, Object... arguments) {
        return jdbc.queryForObject(sql, Integer.class, arguments);
    }

    private UUID createDiningTable(String name) {
        var response = post("/api/v1/operational/tables", tokenForRole("OPERATIONAL"), """
                {"name":"%s","capacity":4,"zone":"SALON"}
                """.formatted(name + " " + UUID.randomUUID().toString().substring(0, 8)));
        assertThat(response.statusCode()).isEqualTo(201);
        return UUID.fromString(body(response).path("id").asText());
    }

    private UUID seedMenuItem(String name, String price, String stationCode, int preparationSeconds) {
        String sku = ("SKU-" + UUID.randomUUID()).toString().toUpperCase();
        String category = "Categoría " + stationCode;
        jdbc.update("INSERT INTO wok.item_types (code, name) VALUES ('DISH', 'Plato') ON CONFLICT (code) DO NOTHING");
        jdbc.update("""
                INSERT INTO wok.units (code, name, dimension, factor_to_base)
                VALUES ('UNIT', 'Unidad', 'COUNT', 1) ON CONFLICT (code) DO NOTHING
                """);
        jdbc.update("""
                INSERT INTO wok.preparation_areas (code, name) VALUES (?, ?) ON CONFLICT (code) DO NOTHING
                """, stationCode, "Estación " + stationCode);
        jdbc.update("INSERT INTO wok.menu_categories (name) VALUES (?) ON CONFLICT (name) DO NOTHING", category);

        UUID itemTypeId = jdbc.queryForObject("SELECT id FROM wok.item_types WHERE code = 'DISH'", UUID.class);
        UUID unitId = jdbc.queryForObject("SELECT id FROM wok.units WHERE code = 'UNIT'", UUID.class);
        UUID areaId = jdbc.queryForObject("SELECT id FROM wok.preparation_areas WHERE code = ?", UUID.class, stationCode);
        UUID categoryId = jdbc.queryForObject("SELECT id FROM wok.menu_categories WHERE name = ?", UUID.class, category);
        UUID currencyId = jdbc.queryForObject("SELECT id FROM wok.currencies WHERE code = 'GTQ'", UUID.class);
        UUID itemId = jdbc.queryForObject("""
                INSERT INTO wok.items (sku, name, item_type_id, base_unit_id) VALUES (?, ?, ?, ?) RETURNING id
                """, UUID.class, sku, name, itemTypeId, unitId);
        return jdbc.queryForObject("""
                INSERT INTO wok.menu_items
                    (item_id, category_id, preparation_area_id, name, price, currency_id,
                     visibility, status, estimated_preparation_seconds)
                VALUES (?, ?, ?, ?, ?, ?, 'PUBLIC', 'ACTIVE', ?) RETURNING id
                """, UUID.class, itemId, categoryId, areaId, name, new BigDecimal(price), currencyId, preparationSeconds);
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
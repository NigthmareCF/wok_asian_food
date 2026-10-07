package com.wokasianfood.api.operational;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.math.BigDecimal;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.time.LocalTime;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class OrderRequestDecisionIntegrationTest extends PostgresIntegrationTest {

    private final ObjectMapper json = new ObjectMapper();

    @BeforeEach
    void allowRemoteRequestFixturesAcrossServiceHours() {
        setEveryWeekday("PICKUP", LocalTime.MIDNIGHT, LocalTime.of(23, 59));
        setEveryWeekday("DELIVERY", LocalTime.MIDNIGHT, LocalTime.of(23, 59));
    }

    @AfterEach
    void restoreConfiguredRemoteServiceHours() {
        jdbc.update("DELETE FROM wok.business_hours WHERE service_type IN ('PICKUP', 'DELIVERY')");
        setOpenWeekdays("PICKUP", LocalTime.of(14, 0), LocalTime.of(21, 30));
        setOpenWeekdays("DELIVERY", LocalTime.of(14, 0), LocalTime.of(21, 0));
    }

    @Test
    void publishesRequiredIdempotencyKeyForDeliveryTransitionsInOpenApi() {
        JsonNode parameters = body(get("/api/v1/openapi", null)).path("paths")
                .path("/api/v1/operational/deliveries/{orderId}").path("patch").path("parameters");
        boolean requiredKey = false;
        for (JsonNode parameter : parameters) {
            if ("Idempotency-Key".equals(parameter.path("name").asText())
                    && "header".equals(parameter.path("in").asText())
                    && parameter.path("required").asBoolean()) {
                requiredKey = true;
                break;
            }
        }
        assertThat(requiredKey).isTrue();
    }

    @Test
    void acceptsPickupRequestCreatingOrderAndReplaysDecision() {
        UUID menuItemId = seedMenuItem("Wok Pickup", "25.00", "WOK_DECISION", 120);
        JsonNode submitted = submit(tokenForRole("CLIENT"), menuItemId, 2, Instant.now().plusSeconds(900).toString());
        UUID requestId = UUID.fromString(submitted.path("requestId").asText());
        assertThat(submitted.path("status").asText()).isEqualTo("PENDING_REVIEW");

        String operator = tokenForRole("OPERATIONAL");
        JsonNode decision = body(post("/api/v1/operational/order-requests/" + requestId + "/decision", operator,
                """
                {"action":"ACCEPT"}
                """));
        assertThat(decision.path("status").asText()).isEqualTo("ACCEPTED");
        assertThat(decision.path("idempotentReplay").asBoolean()).isFalse();
        UUID orderId = UUID.fromString(decision.path("orderId").asText());

        var order = jdbc.queryForMap("""
                SELECT o.channel, o.status, o.total, a.dining_table_id, a.status AS account_status,
                       (SELECT count(*) FROM wok.order_items i WHERE i.order_id = o.id) AS items
                FROM wok.orders o JOIN wok.order_accounts a ON a.id = o.account_id WHERE o.id = ?
                """, orderId);
        assertThat(order.get("channel")).isEqualTo("PICKUP");
        assertThat(order.get("status")).isEqualTo("SENT");
        assertThat((BigDecimal) order.get("total")).isEqualByComparingTo("50.00");
        assertThat(order.get("dining_table_id")).isNull();
        assertThat(order.get("account_status")).isEqualTo("OPEN");
        assertThat(((Number) order.get("items")).intValue()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT fulfillment FROM wok.order_items WHERE order_id = ?", String.class,
                orderId)).isEqualTo("TAKEAWAY");
        assertThat(jdbc.queryForObject("SELECT order_id FROM wok.order_requests WHERE id = ?", UUID.class, requestId))
                .isEqualTo(orderId);
        assertThat(count("""
                SELECT count(*) FROM wok.order_request_events
                WHERE order_request_id = ? AND event_type = 'ACCEPTED'
                """, requestId)).isEqualTo(1);

        JsonNode replay = body(post("/api/v1/operational/order-requests/" + requestId + "/decision", operator,
                """
                {"action":"ACCEPT"}
                """));
        assertThat(replay.path("idempotentReplay").asBoolean()).isTrue();
        assertThat(replay.path("orderId").asText()).isEqualTo(orderId.toString());
        assertThat(count("SELECT count(*) FROM wok.orders WHERE account_id = (SELECT account_id FROM wok.orders WHERE id = ?)",
                orderId)).isEqualTo(1);
        assertThat(count("""
                SELECT count(*) FROM wok.order_request_events
                WHERE order_request_id = ? AND event_type = 'ACCEPTED'
                """, requestId)).isEqualTo(1);

        assertThat(post("/api/v1/operational/order-requests/" + requestId + "/decision", operator,
                """
                {"action":"REJECT","reason":"tarde"}
                """).statusCode()).isEqualTo(409);
        assertThat(post("/api/v1/operational/order-requests/" + requestId + "/decision", tokenForRole("CLIENT"),
                """
                {"action":"REJECT","reason":"no corresponde"}
                """).statusCode()).isEqualTo(403);
    }

    @Test
    void rejectsPickupRequestWhenActiveKitchenQueuePushesItPastRequestedTime() {
        UUID menuItemId = seedMenuItem("Wok Cola de Cocina", "25.00", "WOK_QUEUE_GATE", 1_200);
        String client = tokenForRole("CLIENT");
        String operator = tokenForRole("OPERATIONAL");

        UUID firstRequestId = UUID.fromString(submit(client, menuItemId, 1,
                Instant.now().plusSeconds(7_200).toString()).path("requestId").asText());
        JsonNode firstDecision = body(post("/api/v1/operational/order-requests/" + firstRequestId + "/decision",
                operator, """
                {"action":"ACCEPT"}
                """));
        assertThat(firstDecision.path("status").asText()).isEqualTo("ACCEPTED");
        UUID firstOrderId = UUID.fromString(firstDecision.path("orderId").asText());

        UUID secondRequestId = UUID.fromString(submit(client, menuItemId, 1,
                Instant.now().plusSeconds(1_800).toString()).path("requestId").asText());
        int ordersBeforeSecondDecision = count("SELECT count(*) FROM wok.orders");

        var response = post("/api/v1/operational/order-requests/" + secondRequestId + "/decision", operator,
                """
                {"action":"ACCEPT"}
                """ );

        assertThat(response.statusCode()).isEqualTo(422);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_requests WHERE id = ?", String.class,
                secondRequestId)).isEqualTo("PENDING_REVIEW");
        assertThat(jdbc.queryForObject("SELECT order_id FROM wok.order_requests WHERE id = ?", UUID.class,
                secondRequestId)).isNull();
        assertThat(count("SELECT count(*) FROM wok.orders")).isEqualTo(ordersBeforeSecondDecision);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.orders WHERE id = ?", String.class, firstOrderId))
                .isEqualTo("SENT");
    }

    @Test
    void pickupCapabilityBlocksNewRequestsButPreservesIdempotentReplay() {
        UUID menuItemId = seedMenuItem("Wok Pickup Pausable", "25.00", "WOK_PICKUP_PAUSE", 60);
        String client = tokenForRole("CLIENT");
        UUID replayKey = UUID.randomUUID();
        String payload = """
                {"requestedFor":"%s","items":[{"menuItemId":"%s","quantity":1}]}
                """.formatted(Instant.now().plusSeconds(7_200), menuItemId);
        JsonNode original = body(post("/api/v1/client/order-requests", client, payload,
                Map.of("Idempotency-Key", replayKey.toString())));
        UUID originalRequestId = UUID.fromString(original.path("requestId").asText());

        jdbc.update("UPDATE wok.service_capabilities SET status = 'PAUSED' WHERE code = 'PICKUP'");
        try {
            UUID pausedKey = UUID.randomUUID();
            var paused = post("/api/v1/client/order-requests", client, payload,
                    Map.of("Idempotency-Key", pausedKey.toString()));
            assertThat(paused.statusCode()).isEqualTo(503);
            assertThat(count("SELECT count(*) FROM wok.order_requests WHERE idempotency_key = ?", pausedKey)).isZero();

            JsonNode replay = body(post("/api/v1/client/order-requests", client, payload,
                    Map.of("Idempotency-Key", replayKey.toString())));
            assertThat(replay.path("requestId").asText()).isEqualTo(originalRequestId.toString());
            assertThat(replay.path("idempotentReplay").asBoolean()).isTrue();
        } finally {
            jdbc.update("UPDATE wok.service_capabilities SET status = 'MANUAL_APPROVAL' WHERE code = 'PICKUP'");
        }
    }

    @Test
    void pausedCapabilityKeepsExistingRemoteRequestPendingUntilServiceResumes() {
        UUID menuItemId = seedMenuItem("Wok Pickup Pendiente", "25.00", "WOK_PENDING_PAUSE", 60);
        String client = tokenForRole("CLIENT");
        String operator = tokenForRole("OPERATIONAL");
        UUID requestId = UUID.fromString(submit(client, menuItemId, 1,
                Instant.now().plusSeconds(7_200).toString()).path("requestId").asText());
        int ordersBefore = count("SELECT count(*) FROM wok.orders");

        jdbc.update("UPDATE wok.service_capabilities SET status = 'PAUSED' WHERE code = 'PICKUP'");
        try {
            var pausedDecision = post("/api/v1/operational/order-requests/" + requestId + "/decision", operator,
                    """
                    {"action":"ACCEPT"}
                    """);
            assertThat(pausedDecision.statusCode()).isEqualTo(503);
            assertThat(jdbc.queryForObject("SELECT status FROM wok.order_requests WHERE id = ?", String.class, requestId))
                    .isEqualTo("PENDING_REVIEW");
            assertThat(jdbc.queryForObject("SELECT order_id FROM wok.order_requests WHERE id = ?", UUID.class, requestId))
                    .isNull();
            assertThat(count("SELECT count(*) FROM wok.orders")).isEqualTo(ordersBefore);
        } finally {
            jdbc.update("UPDATE wok.service_capabilities SET status = 'MANUAL_APPROVAL' WHERE code = 'PICKUP'");
        }

        JsonNode resumed = body(post("/api/v1/operational/order-requests/" + requestId + "/decision", operator,
                """
                {"action":"ACCEPT"}
                """));
        assertThat(resumed.path("status").asText()).isEqualTo("ACCEPTED");
        assertThat(count("SELECT count(*) FROM wok.orders")).isEqualTo(ordersBefore + 1);
    }

    @Test
    void rejectsPickupRequestRequiringReason() {
        UUID menuItemId = seedMenuItem("Wok Reject", "30.00", "WOK_REJECT", 60);
        String client = tokenForRole("CLIENT");
        String operator = tokenForRole("OPERATIONAL");
        UUID requestId = UUID.fromString(submit(client, menuItemId, 1, Instant.now().plusSeconds(600).toString())
                .path("requestId").asText());

        assertThat(post("/api/v1/operational/order-requests/" + requestId + "/decision", operator,
                """
                {"action":"REJECT"}
                """).statusCode()).isEqualTo(422);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_requests WHERE id = ?", String.class, requestId))
                .isEqualTo("PENDING_REVIEW");

        JsonNode decided = body(post("/api/v1/operational/order-requests/" + requestId + "/decision", operator,
                """
                {"action":"REJECT","reason":"Sin insumos"}
                """));
        assertThat(decided.path("status").asText()).isEqualTo("REJECTED");
        assertThat(decided.hasNonNull("orderId")).isFalse();
        var persisted = jdbc.queryForMap("SELECT status, decision_reason FROM wok.order_requests WHERE id = ?", requestId);
        assertThat(persisted.get("status")).isEqualTo("REJECTED");
        assertThat(persisted.get("decision_reason")).isEqualTo("Sin insumos");
        JsonNode clientHistory = body(get("/api/v1/client/order-requests", client));
        assertThat(clientHistory.get(0).path("decisionReason").asText()).isEqualTo("Sin insumos");
        assertThat(clientHistory.get(0).path("message").asText()).contains("no pudo aceptar");
        assertThat(jdbc.queryForObject("SELECT order_id FROM wok.order_requests WHERE id = ?", UUID.class, requestId))
                .isNull();
        assertThat(count("""
                SELECT count(*) FROM wok.order_request_events
                WHERE order_request_id = ? AND event_type = 'REJECTED'
                """, requestId)).isEqualTo(1);
    }

    @Test
    void keepsRequestPendingWhenProductBecomesUnavailable() {
        UUID menuItemId = seedMenuItem("Wok Gone", "12.00", "WOK_GONE", 60);
        UUID requestId = UUID.fromString(submit(tokenForRole("CLIENT"), menuItemId, 1,
                Instant.now().plusSeconds(600).toString()).path("requestId").asText());
        jdbc.update("UPDATE wok.menu_items SET status = 'INACTIVE' WHERE id = ?", menuItemId);

        assertThat(post("/api/v1/operational/order-requests/" + requestId + "/decision",
                tokenForRole("OPERATIONAL"), """
                {"action":"ACCEPT"}
                """).statusCode()).isEqualTo(422);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_requests WHERE id = ?", String.class, requestId))
                .isEqualTo("PENDING_REVIEW");
        assertThat(jdbc.queryForObject("SELECT order_id FROM wok.order_requests WHERE id = ?", UUID.class, requestId))
                .isNull();
    }

    @Test
    void doesNotAcceptRequestWhenMenuPriceChangedAfterSubmission() {
        UUID menuItemId = seedMenuItem("Wok Price Change", "12.00", "WOK_PRICE_CHANGE", 60);
        UUID requestId = UUID.fromString(submit(tokenForRole("CLIENT"), menuItemId, 2,
                Instant.now().plusSeconds(900).toString()).path("requestId").asText());
        long existingOrders = count("SELECT count(*) FROM wok.orders");
        jdbc.update("UPDATE wok.menu_items SET price = 13.00 WHERE id = ?", menuItemId);

        var response = post("/api/v1/operational/order-requests/" + requestId + "/decision",
                tokenForRole("OPERATIONAL"), """
                {"action":"ACCEPT"}
                """);

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_requests WHERE id = ?", String.class, requestId))
                .isEqualTo("PENDING_REVIEW");
        assertThat(jdbc.queryForObject("SELECT order_id FROM wok.order_requests WHERE id = ?", UUID.class, requestId))
                .isNull();
        assertThat(count("SELECT count(*) FROM wok.orders")).isEqualTo(existingOrders);
    }

    @Test
    void validatesModifierSelectionSnapshotsPriceAndCarriesChoicesIntoAcceptedOrder() {
        UUID menuItemId = seedMenuItem("Wok with Options", "25.00", "WOK_MODIFIER", 60);
        UUID groupId = jdbc.queryForObject("""
                INSERT INTO wok.modifier_groups (name, min_selection, max_selection, required)
                VALUES ('Proteína', 1, 1, true) RETURNING id
                """, UUID.class);
        UUID tofuId = jdbc.queryForObject("""
                INSERT INTO wok.modifiers (group_id, name, price_delta) VALUES (?, 'Tofu', 5.00) RETURNING id
                """, UUID.class, groupId);
        UUID chickenId = jdbc.queryForObject("""
                INSERT INTO wok.modifiers (group_id, name, price_delta) VALUES (?, 'Pollo', 8.00) RETURNING id
                """, UUID.class, groupId);
        jdbc.update("INSERT INTO wok.menu_item_modifier_groups (menu_item_id, group_id) VALUES (?, ?)", menuItemId, groupId);
        UUID inventoryItemId = seedInventoryItem(menuItemId);
        jdbc.update("INSERT INTO wok.inventory_balances (item_id, quantity_on_hand) VALUES (?, 10)", inventoryItemId);
        jdbc.update("""
                INSERT INTO wok.modifier_item_impacts (modifier_id, item_id, quantity_delta, affects_availability)
                VALUES (?, ?, 0.250000, true)
                """, tofuId, inventoryItemId);

        JsonNode menu = body(get("/api/v1/public/menu", null));
        JsonNode publicItem = null;
        for (JsonNode category : menu.path("categories")) {
            for (JsonNode item : category.path("items")) {
                if (menuItemId.toString().equals(item.path("id").asText())) publicItem = item;
            }
        }
        assertThat(publicItem).isNotNull();
        assertThat(publicItem.path("modifierGroups").get(0).path("minSelection").asInt()).isEqualTo(1);
        assertThat(publicItem.path("modifierGroups").get(0).path("options")).hasSize(2);

        String client = tokenForRole("CLIENT");
        String operator = tokenForRole("OPERATIONAL");
        String requestedFor = Instant.now().plusSeconds(900).toString();
        String missingOptions = """
                {"requestedFor":"%s","items":[{"menuItemId":"%s","quantity":2,"modifierIds":[]}]}
                """.formatted(requestedFor, menuItemId);
        assertThat(post("/api/v1/client/order-requests", client, missingOptions,
                Map.of("Idempotency-Key", UUID.randomUUID().toString())).statusCode()).isEqualTo(422);

        UUID key = UUID.randomUUID();
        JsonNode submitted = submitWithModifier(client, menuItemId, tofuId, 2, requestedFor, key);
        UUID requestId = UUID.fromString(submitted.path("requestId").asText());
        assertThat(submitted.path("subtotal").decimalValue()).isEqualByComparingTo("60.00");
        JsonNode replay = submitWithModifier(client, menuItemId, tofuId, 2, requestedFor, key);
        assertThat(replay.path("idempotentReplay").asBoolean()).isTrue();
        assertThat(post("/api/v1/client/order-requests", client,
                """
                {"requestedFor":"%s","items":[{"menuItemId":"%s","quantity":2,"modifierIds":["%s"]}]}
                """.formatted(requestedFor, menuItemId, chickenId),
                Map.of("Idempotency-Key", key.toString())).statusCode()).isEqualTo(409);

        JsonNode clientDetails = body(get("/api/v1/client/order-requests/" + requestId, client));
        assertThat(clientDetails.path("items").get(0).path("unitPrice").decimalValue()).isEqualByComparingTo("30.00");
        assertThat(clientDetails.path("items").get(0).path("modifiers").get(0).path("name").asText()).isEqualTo("Tofu");
        JsonNode operationalDetails = body(get("/api/v1/operational/order-requests/" + requestId, operator));
        assertThat(operationalDetails.path("items").get(0).path("modifiers").get(0).path("group").asText())
                .isEqualTo("Proteína");
        assertThat(operationalDetails.path("items").get(0).path("modifiers").get(0).path("name").asText())
                .isEqualTo("Tofu");

        JsonNode decision = body(post("/api/v1/operational/order-requests/" + requestId + "/decision", operator,
                """
                {"action":"ACCEPT"}
                """));
        UUID orderId = UUID.fromString(decision.path("orderId").asText());
        var orderItem = jdbc.queryForMap("SELECT unit_price, line_total, notes FROM wok.order_items WHERE order_id = ?", orderId);
        assertThat((BigDecimal) orderItem.get("unit_price")).isEqualByComparingTo("30.00");
        assertThat((BigDecimal) orderItem.get("line_total")).isEqualByComparingTo("60.00");
        assertThat((String) orderItem.get("notes")).contains("Proteína: Tofu");
        assertThat(jdbc.queryForObject("SELECT subtotal FROM wok.orders WHERE id = ?", BigDecimal.class, orderId))
                .isEqualByComparingTo("60.00");
        assertThat(count("SELECT count(*) FROM wok.order_item_modifiers WHERE order_item_id = (SELECT id FROM wok.order_items WHERE order_id = ?)",
                orderId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT modifier_name_snapshot FROM wok.order_item_modifiers WHERE order_item_id = (SELECT id FROM wok.order_items WHERE order_id = ?)",
                String.class, orderId)).isEqualTo("Tofu");
        assertThat(jdbc.queryForObject("SELECT quantity FROM wok.inventory_reservations WHERE order_id = ? AND item_id = ? "
                + "AND status = 'ACTIVE'", BigDecimal.class, orderId, inventoryItemId)).isEqualByComparingTo("0.500000");

        UUID secondRequestId = UUID.fromString(submitWithModifier(client, menuItemId, tofuId, 1,
                Instant.now().plusSeconds(900).toString(), UUID.randomUUID()).path("requestId").asText());
        jdbc.update("UPDATE wok.inventory_balances SET quantity_on_hand = 0 WHERE item_id = ?", inventoryItemId);
        int orderCountBeforeUnavailableAcceptance = count("SELECT count(*) FROM wok.orders");
        assertThat(post("/api/v1/operational/order-requests/" + secondRequestId + "/decision", operator,
                "{\"action\":\"ACCEPT\"}").statusCode()).isEqualTo(409);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_requests WHERE id = ?", String.class, secondRequestId))
                .isEqualTo("PENDING_REVIEW");
        assertThat(count("SELECT count(*) FROM wok.orders")).isEqualTo(orderCountBeforeUnavailableAcceptance);
    }

    @Test
    void rejectsLargeMixedSkuOrderWhenSharedIngredientStockIsOnlySufficientPerSku() {
        UUID firstSku = seedMenuItem("Wok Shared Resource A", "20.00", "WOK_SHARED_A", 60);
        UUID secondSku = seedMenuItem("Wok Shared Resource B", "22.00", "WOK_SHARED_B", 60);
        UUID sharedGroup = jdbc.queryForObject("""
                INSERT INTO wok.modifier_groups (name, min_selection, max_selection, required)
                VALUES ('Proteína de prueba compartida', 1, 1, true) RETURNING id
                """, UUID.class);
        UUID sharedModifier = jdbc.queryForObject("""
                INSERT INTO wok.modifiers (group_id, name, price_delta) VALUES (?, 'Proteína compartida', 0) RETURNING id
                """, UUID.class, sharedGroup);
        jdbc.update("INSERT INTO wok.menu_item_modifier_groups (menu_item_id, group_id) VALUES (?, ?), (?, ?)",
                firstSku, sharedGroup, secondSku, sharedGroup);
        UUID sharedIngredient = seedInventoryItem(firstSku);
        jdbc.update("INSERT INTO wok.inventory_balances (item_id, quantity_on_hand) VALUES (?, 10)", sharedIngredient);
        jdbc.update("""
                INSERT INTO wok.modifier_item_impacts (modifier_id, item_id, quantity_delta, affects_availability)
                VALUES (?, ?, 1, true)
                """, sharedModifier, sharedIngredient);

        String oneSkuEstimate = """
                {"items":[{"menuItemId":"%s","quantity":6,"modifierIds":["%s"]}]}
                """;
        assertThat(body(post("/api/v1/public/menu/availability", null,
                oneSkuEstimate.formatted(firstSku, sharedModifier))).path("availableEstimate").asBoolean()).isTrue();
        assertThat(body(post("/api/v1/public/menu/availability", null,
                oneSkuEstimate.formatted(secondSku, sharedModifier))).path("availableEstimate").asBoolean()).isTrue();
        JsonNode combined = body(post("/api/v1/public/menu/availability", null, """
                {"items":[
                  {"menuItemId":"%s","quantity":6,"modifierIds":["%s"]},
                  {"menuItemId":"%s","quantity":6,"modifierIds":["%s"]}
                ]}
                """.formatted(firstSku, sharedModifier, secondSku, sharedModifier)));
        assertThat(combined.path("availableEstimate").asBoolean()).isFalse();

        String requestedFor = Instant.now().plusSeconds(7_200).toString();
        JsonNode submitted = body(post("/api/v1/client/order-requests", tokenForRole("CLIENT"), """
                {"requestedFor":"%s","items":[
                  {"menuItemId":"%s","quantity":6,"modifierIds":["%s"]},
                  {"menuItemId":"%s","quantity":6,"modifierIds":["%s"]}
                ]}
                """.formatted(requestedFor, firstSku, sharedModifier, secondSku, sharedModifier),
                Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        UUID requestId = UUID.fromString(submitted.path("requestId").asText());
        int ordersBefore = count("SELECT count(*) FROM wok.orders");
        int reservationsBefore = count("SELECT count(*) FROM wok.inventory_reservations WHERE status = 'ACTIVE'");
        var response = post("/api/v1/operational/order-requests/" + requestId + "/decision",
                tokenForRole("OPERATIONAL"), "{\"action\":\"ACCEPT\"}");

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_requests WHERE id = ?", String.class, requestId))
                .isEqualTo("PENDING_REVIEW");
        assertThat(jdbc.queryForObject("SELECT order_id FROM wok.order_requests WHERE id = ?", UUID.class, requestId))
                .isNull();
        assertThat(count("SELECT count(*) FROM wok.orders")).isEqualTo(ordersBefore);
        assertThat(count("SELECT count(*) FROM wok.inventory_reservations WHERE status = 'ACTIVE'"))
                .isEqualTo(reservationsBefore);
    }

    @Test
    void acceptsBulkSkuQuantityAboveTheFormerAvailabilityLimitWhenStockAndTimeAllowIt() {
        UUID menuItemId = seedMenuItem("Wok Pedido Mayorista", "20.00", "WOK_BULK_ORDER", 60);
        UUID groupId = jdbc.queryForObject("""
                INSERT INTO wok.modifier_groups (name, min_selection, max_selection, required)
                VALUES ('Proteína mayorista', 1, 1, true) RETURNING id
                """, UUID.class);
        UUID modifierId = jdbc.queryForObject("""
                INSERT INTO wok.modifiers (group_id, name, price_delta) VALUES (?, 'Proteína', 0) RETURNING id
                """, UUID.class, groupId);
        jdbc.update("INSERT INTO wok.menu_item_modifier_groups (menu_item_id, group_id) VALUES (?, ?)",
                menuItemId, groupId);
        UUID ingredientId = seedInventoryItem(menuItemId);
        jdbc.update("INSERT INTO wok.inventory_balances (item_id, quantity_on_hand) VALUES (?, 60)", ingredientId);
        jdbc.update("""
                INSERT INTO wok.modifier_item_impacts (modifier_id, item_id, quantity_delta, affects_availability)
                VALUES (?, ?, 1, true)
                """, modifierId, ingredientId);

        assertThat(body(post("/api/v1/public/menu/availability", null, """
                {"items":[{"menuItemId":"%s","quantity":51,"modifierIds":["%s"]}]}
                """.formatted(menuItemId, modifierId))).path("availableEstimate").asBoolean()).isTrue();

        String requestedFor = Instant.now().plusSeconds(7_200).toString();
        JsonNode submitted = body(post("/api/v1/client/order-requests", tokenForRole("CLIENT"), """
                {"requestedFor":"%s","items":[{"menuItemId":"%s","quantity":51,"modifierIds":["%s"]}]}
                """.formatted(requestedFor, menuItemId, modifierId),
                Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        UUID requestId = UUID.fromString(submitted.path("requestId").asText());
        JsonNode accepted = body(post("/api/v1/operational/order-requests/" + requestId + "/decision",
                tokenForRole("OPERATIONAL"), "{\"action\":\"ACCEPT\"}"));
        UUID orderId = UUID.fromString(accepted.path("orderId").asText());

        assertThat(accepted.path("status").asText()).isEqualTo("ACCEPTED");
        assertThat(jdbc.queryForObject("""
                SELECT quantity FROM wok.inventory_reservations
                WHERE order_id = ? AND item_id = ? AND status = 'ACTIVE'
                """, BigDecimal.class, orderId, ingredientId)).isEqualByComparingTo("51.000000");
    }

    @Test
    void acceptsDeliveryRequestAsDeliveryOrderAndReplaysDecision() {
        UUID menuItemId = seedMenuItem("Wok Delivery", "18.00", "WOK_DELIVERY_DECISION", 60);
        String client = tokenForRole("CLIENT");
        UUID requestId = UUID.fromString(submit(client, menuItemId, 1,
                Instant.now().plusSeconds(600).toString()).path("requestId").asText());
        jdbc.update("""
                UPDATE wok.order_requests
                SET fulfillment_type = 'DELIVERY', delivery_address = 'Zona 1, Ciudad de Guatemala',
                    contact_phone = '+502 5555-0101', payment_preference = 'CASH_ON_DELIVERY'
                WHERE id = ?
                """, requestId);

        String operator = tokenForRole("OPERATIONAL");
        var response = post("/api/v1/operational/order-requests/" + requestId + "/decision", operator, """
                {"action":"ACCEPT"}
                """);

        assertThat(response.statusCode()).isEqualTo(200);
        JsonNode decision = body(response);
        assertThat(decision.path("status").asText()).isEqualTo("ACCEPTED");
        assertThat(decision.path("idempotentReplay").asBoolean()).isFalse();
        UUID orderId = UUID.fromString(decision.path("orderId").asText());
        var order = jdbc.queryForMap("""
                SELECT o.channel, o.status, o.total, a.dining_table_id,
                       (SELECT count(*) FROM wok.order_items i WHERE i.order_id = o.id) AS items
                FROM wok.orders o JOIN wok.order_accounts a ON a.id = o.account_id WHERE o.id = ?
                """, orderId);
        assertThat(order.get("channel")).isEqualTo("DELIVERY");
        assertThat(order.get("status")).isEqualTo("SENT");
        assertThat((BigDecimal) order.get("total")).isEqualByComparingTo("18.00");
        assertThat(order.get("dining_table_id")).isNull();
        assertThat(((Number) order.get("items")).intValue()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT fulfillment FROM wok.order_items WHERE order_id = ?", String.class,
                orderId)).isEqualTo("TAKEAWAY");
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_requests WHERE id = ?", String.class, requestId))
                .isEqualTo("ACCEPTED");
        assertThat(jdbc.queryForObject("SELECT order_id FROM wok.order_requests WHERE id = ?", UUID.class, requestId))
                .isEqualTo(orderId);
        assertThat(jdbc.queryForObject("SELECT delivery_address FROM wok.order_requests WHERE id = ?", String.class,
                requestId)).isEqualTo("Zona 1, Ciudad de Guatemala");
        assertThat(jdbc.queryForObject("SELECT contact_phone FROM wok.order_requests WHERE id = ?", String.class,
                requestId)).isEqualTo("+502 5555-0101");

        JsonNode replay = body(post("/api/v1/operational/order-requests/" + requestId + "/decision", operator, """
                {"action":"ACCEPT"}
                """));
        assertThat(replay.path("idempotentReplay").asBoolean()).isTrue();
        assertThat(replay.path("orderId").asText()).isEqualTo(orderId.toString());
        assertThat(count("SELECT count(*) FROM wok.orders WHERE account_id = (SELECT account_id FROM wok.orders WHERE id = ?)",
                orderId)).isEqualTo(1);

        JsonNode history = body(get("/api/v1/client/delivery-requests", client));
        JsonNode trackedRequest = null;
        for (JsonNode item : history) {
            if (requestId.toString().equals(item.path("requestId").asText())) trackedRequest = item;
        }
        assertThat(trackedRequest).isNotNull();
        assertThat(trackedRequest.path("orderCode").asText()).isEqualTo(
                jdbc.queryForObject("SELECT code FROM wok.orders WHERE id = ?", String.class, orderId));
        assertThat(trackedRequest.path("orderStatus").asText()).isEqualTo("SENT");
        assertThat(trackedRequest.path("dispatchStatus").asText()).isEqualTo("AWAITING_KITCHEN");

        int orderVersion = jdbc.queryForObject("SELECT row_version FROM wok.orders WHERE id = ?", Integer.class, orderId);
        assertThat(patch("/api/v1/operational/orders/" + orderId + "/status", operator,
                "{\"status\":\"CANCELLED\",\"expectedVersion\":%d,\"reason\":\"Cliente solicitó cancelar\"}".formatted(orderVersion))
                .statusCode()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.delivery_dispatches WHERE order_id = ?", String.class,
                orderId)).isEqualTo("CANCELLED");
        assertThat(count("SELECT count(*) FROM wok.delivery_dispatch_events WHERE dispatch_id = (SELECT id FROM wok.delivery_dispatches WHERE order_id = ?)",
                orderId)).isEqualTo(2);
    }

    @Test
    void dispatchesAcceptedDeliveryWithCourierFailureRetryAndCompletionHistory() {
        UUID menuItemId = seedMenuItem("Wok Delivery Lifecycle", "21.00", "WOK_DELIVERY_LIFECYCLE", 60);
        String client = tokenForRole("CLIENT");
        UUID requestId = UUID.fromString(submit(client, menuItemId, 1,
                Instant.now().plusSeconds(900).toString()).path("requestId").asText());
        jdbc.update("""
            UPDATE wok.order_requests SET fulfillment_type = 'DELIVERY', delivery_address = 'Zona 4',
                contact_phone = '+502 5555-0101', payment_preference = 'CASH_ON_DELIVERY' WHERE id = ?
            """, requestId);
        String operator = tokenForRole("OPERATIONAL");
        JsonNode accepted = body(post("/api/v1/operational/order-requests/" + requestId + "/decision", operator,
                "{\"action\":\"ACCEPT\"}"));
        UUID orderId = UUID.fromString(accepted.path("orderId").asText());
        UUID courier = createUserWithRole("courier-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        UUID dispatchId = jdbc.queryForObject("SELECT id FROM wok.delivery_dispatches WHERE order_id = ?", UUID.class, orderId);

        assertThat(dispatchPatch(orderId, operator,
                "{\"action\":\"DISPATCH\",\"expectedVersion\":1}").statusCode()).isEqualTo(409);
        jdbc.update("UPDATE wok.orders SET status = 'READY' WHERE id = ?", orderId);
        jdbc.update("UPDATE wok.delivery_dispatches SET status = 'READY_FOR_DISPATCH', row_version = row_version + 1 WHERE id = ?",
                dispatchId);
        JsonNode queue = body(get("/api/v1/operational/deliveries?status=READY_FOR_DISPATCH", operator));
        assertThat(queue.findValuesAsText("orderId")).contains(orderId.toString());
        JsonNode couriers = body(get("/api/v1/operational/deliveries/eligible-couriers", operator));
        assertThat(couriers.findValuesAsText("userId")).contains(courier.toString());
        UUID clientUser = createUserWithRole("not-courier-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        assertThat(dispatchPatch(orderId, operator,
                "{\"action\":\"ASSIGN\",\"assignedToUserId\":\"%s\",\"expectedVersion\":2}"
                        .formatted(clientUser)).statusCode()).isEqualTo(422);

        JsonNode assigned = body(dispatchPatch(orderId, operator,
                "{\"action\":\"ASSIGN\",\"assignedToUserId\":\"%s\",\"expectedVersion\":2}".formatted(courier)));
        assertThat(assigned.path("status").asText()).isEqualTo("ASSIGNED");
        assertThat(assigned.path("assignedToUserId").asText()).isEqualTo(courier.toString());
        assertThat(assigned.path("rowVersion").asInt()).isEqualTo(3);

        UUID dispatchKey = UUID.randomUUID();
        String dispatchPayload = "{\"action\":\"DISPATCH\",\"expectedVersion\":3}";
        JsonNode dispatched = body(dispatchPatch(orderId, operator, dispatchPayload, dispatchKey));
        assertThat(dispatched.path("status").asText()).isEqualTo("OUT_FOR_DELIVERY");
        JsonNode dispatchReplay = body(dispatchPatch(orderId, operator, dispatchPayload, dispatchKey));
        assertThat(dispatchReplay.path("status").asText()).isEqualTo(dispatched.path("status").asText());
        assertThat(dispatchReplay.path("rowVersion").asInt()).isEqualTo(dispatched.path("rowVersion").asInt());
        assertThat(patch("/api/v1/operational/deliveries/" + orderId, operator, dispatchPayload).statusCode())
                .isEqualTo(400);
        assertThat(patch("/api/v1/operational/deliveries/" + orderId, operator, dispatchPayload,
                Map.of("Idempotency-Key", "not-a-uuid")).statusCode()).isEqualTo(400);
        assertThat(dispatchPatch(orderId, operator,
                "{\"action\":\"DISPATCH\",\"expectedVersion\":4}", dispatchKey).statusCode()).isEqualTo(409);
        assertThat(dispatchPatch(orderId, operator,
                "{\"action\":\"FAIL\",\"expectedVersion\":4}").statusCode()).isEqualTo(422);

        JsonNode failed = body(dispatchPatch(orderId, operator,
                "{\"action\":\"FAIL\",\"expectedVersion\":4,\"reason\":\"No respondió\"}"));
        assertThat(failed.path("status").asText()).isEqualTo("DELIVERY_FAILED");
        JsonNode retried = body(dispatchPatch(orderId, operator,
                "{\"action\":\"RETRY\",\"expectedVersion\":5,\"reason\":\"Cliente confirmó nueva entrega\"}"));
        assertThat(retried.path("status").asText()).isEqualTo("READY_FOR_DISPATCH");
        assertThat(retried.hasNonNull("assignedToUserId")).isFalse();
        assertThat(dispatchPatch(orderId, operator,
                "{\"action\":\"ASSIGN\",\"assignedToUserId\":\"%s\",\"expectedVersion\":5}".formatted(courier))
                .statusCode()).isEqualTo(409);

        JsonNode reassigned = body(dispatchPatch(orderId, operator,
                "{\"action\":\"ASSIGN\",\"assignedToUserId\":\"%s\",\"expectedVersion\":6}".formatted(courier)));
        JsonNode secondDispatch = body(dispatchPatch(orderId, operator,
                "{\"action\":\"DISPATCH\",\"expectedVersion\":7}"));
        JsonNode delivered = body(dispatchPatch(orderId, operator,
                "{\"action\":\"DELIVER\",\"expectedVersion\":8}"));
        assertThat(reassigned.path("status").asText()).isEqualTo("ASSIGNED");
        assertThat(secondDispatch.path("status").asText()).isEqualTo("OUT_FOR_DELIVERY");
        assertThat(delivered.path("status").asText()).isEqualTo("DELIVERED");
        assertThat(delivered.path("deliveredAt").isNull()).isFalse();
        assertThat(jdbc.queryForObject("SELECT status FROM wok.orders WHERE id = ?", String.class, orderId)).isEqualTo("SERVED");
        assertThat(count("SELECT count(*) FROM wok.delivery_dispatch_events WHERE dispatch_id = ?", dispatchId)).isEqualTo(8);
        assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE entity_id = ? AND action = 'DELIVERY_DISPATCH_TRANSITIONED'",
                dispatchId)).isEqualTo(7);
        JsonNode history = body(get("/api/v1/client/delivery-requests", client));
        JsonNode trackedRequest = null;
        for (JsonNode item : history) {
            if (requestId.toString().equals(item.path("requestId").asText())) trackedRequest = item;
        }
        assertThat(trackedRequest).isNotNull();
        assertThat(trackedRequest.path("dispatchStatus").asText()).isEqualTo("DELIVERED");
        assertThat(trackedRequest.path("deliveredAt").isTextual()).isTrue();
    }

    @Test
    void listsAndLoadsOperationalDeliveryRequestDetailsWithPermissionChecks() {
        UUID menuItemId = seedMenuItem("Wok Delivery Review", "18.00", "WOK_DELIVERY_REVIEW", 60);
        String client = tokenForRole("CLIENT");
        UUID requestId = UUID.fromString(submit(client, menuItemId, 2,
                Instant.now().plusSeconds(900).toString()).path("requestId").asText());
        jdbc.update("""
                UPDATE wok.order_requests
                SET fulfillment_type = 'DELIVERY', delivery_address = 'Zona 1, Ciudad de Guatemala',
                    delivery_reference = 'Portón negro', contact_phone = '+502 5555-0101',
                    payment_preference = 'CASH_ON_DELIVERY'
                WHERE id = ?
                """, requestId);
        String operator = tokenForRole("OPERATIONAL");

        var listResponse = get("/api/v1/operational/order-requests?status=PENDING_REVIEW&fulfillmentType=delivery", operator);
        assertThat(listResponse.statusCode()).isEqualTo(200);
        JsonNode list = body(listResponse);
        JsonNode listedRequest = null;
        for (JsonNode item : list) {
            if (requestId.toString().equals(item.path("requestId").asText())) listedRequest = item;
        }
        assertThat(listedRequest).isNotNull();
        assertThat(listedRequest.path("fulfillmentType").asText()).isEqualTo("DELIVERY");
        assertThat(listedRequest.path("deliveryAddress").asText()).isEqualTo("Zona 1, Ciudad de Guatemala");
        assertThat(listedRequest.path("contactPhone").asText()).isEqualTo("+502 5555-0101");

        var detailsResponse = get("/api/v1/operational/order-requests/" + requestId, operator);
        assertThat(detailsResponse.statusCode()).isEqualTo(200);
        JsonNode details = body(detailsResponse);
        assertThat(details.path("request").path("paymentPreference").asText()).isEqualTo("CASH_ON_DELIVERY");
        assertThat(details.path("request").path("deliveryReference").asText()).isEqualTo("Portón negro");
        assertThat(details.path("items")).hasSize(1);
        assertThat(details.path("items").get(0).path("quantity").asInt()).isEqualTo(2);

        assertThat(get("/api/v1/operational/order-requests/" + requestId, client).statusCode()).isEqualTo(403);
        assertThat(get("/api/v1/operational/order-requests?status=UNKNOWN", operator).statusCode()).isEqualTo(400);
    }

    @Test
    void pickupInvoicePreferencePersistsButTaxDetailsRequireInvoicePermission() {
        UUID menuItemId = seedMenuItem("Wok Invoice Preference", "18.00", "WOK_INVOICE_PREF", 60);
        String client = tokenForRole("CLIENT");
        UUID requestId = UUID.fromString(body(post("/api/v1/client/order-requests", client, """
                {"requestedFor":"%s","paymentPreference":"CARD_AT_PICKUP","invoiceRequested":true,
                 "invoiceName":"Cliente WOK","invoiceTaxId":"1234567",
                 "items":[{"menuItemId":"%s","quantity":1}]}
                """.formatted(Instant.now().plusSeconds(3600), menuItemId),
                Map.of("Idempotency-Key", UUID.randomUUID().toString()))).path("requestId").asText());

        var ownDetails = body(get("/api/v1/client/order-requests/" + requestId, client));
        assertThat(ownDetails.path("paymentPreference").asText()).isEqualTo("CARD_AT_PICKUP");
        assertThat(ownDetails.path("invoiceRequested").asBoolean()).isTrue();
        assertThat(ownDetails.path("invoiceTaxId").asText()).isEqualTo("1234567");

        String ordersRole = "ORDERS_ONLY_" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        jdbc.update("INSERT INTO wok.roles (code, name) VALUES (?, ?)", ordersRole, "Pedidos solamente");
        jdbc.update("""
                INSERT INTO wok.role_permissions (role_id, permission_id)
                SELECT r.id, p.id FROM wok.roles r JOIN wok.permissions p ON p.code = 'orders:manage'
                WHERE r.code = ?
                """, ordersRole);
        String orderOperator = tokenForRole(ordersRole);
        JsonNode queueDetails = body(get("/api/v1/operational/order-requests/" + requestId, orderOperator));
        assertThat(queueDetails.path("request").path("invoiceRequested").asBoolean()).isTrue();
        assertThat(queueDetails.toString()).doesNotContain("1234567", "Cliente WOK");
        assertThat(get("/api/v1/operational/order-requests/" + requestId + "/invoice-request", orderOperator)
                .statusCode()).isEqualTo(403);

        String invoiceRole = "INVOICES_ONLY_" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        jdbc.update("INSERT INTO wok.roles (code, name) VALUES (?, ?)", invoiceRole, "Facturación solamente");
        jdbc.update("""
                INSERT INTO wok.role_permissions (role_id, permission_id)
                SELECT r.id, p.id FROM wok.roles r JOIN wok.permissions p ON p.code = 'invoices:manage'
                WHERE r.code = ?
                """, invoiceRole);
        var fiscalData = body(get("/api/v1/operational/order-requests/" + requestId + "/invoice-request",
                tokenForRole(invoiceRole)));
        assertThat(fiscalData.path("invoiceTaxId").asText()).isEqualTo("1234567");
        assertThat(fiscalData.path("invoiceName").asText()).isEqualTo("Cliente WOK");
    }

    @Test
    void deliveryInvoicePreferenceIsStoredWithTheRequestWithoutIssuingAnInvoice() {
        UUID menuItemId = seedMenuItem("Wok Delivery Invoice", "19.00", "WOK_DELIVERY_INVOICE", 60);
        String client = tokenForRole("CLIENT");
        int invoiceCountBefore = jdbc.queryForObject("SELECT count(*) FROM wok.invoices", Integer.class);
        JsonNode submitted = body(post("/api/v1/client/delivery-requests", client, """
                {"requestedFor":"%s","address":"Zona 10, Ciudad de Guatemala",
                 "reference":"Portón negro","contactPhone":"+502 5555-0101",
                 "paymentPreference":"ONLINE_PAYMENT_REQUESTED","invoiceRequested":true,
                 "invoiceName":"Cliente Delivery","invoiceTaxId":"7654321",
                 "items":[{"menuItemId":"%s","quantity":1}]}
                """.formatted(Instant.now().plusSeconds(3600), menuItemId),
                Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        UUID requestId = UUID.fromString(submitted.path("requestId").asText());

        assertThat(submitted.path("invoiceRequested").asBoolean()).isTrue();
        assertThat(submitted.path("invoiceTaxId").asText()).isEqualTo("7654321");
        assertThat(submitted.path("message").asText()).contains("todavía no es un pedido ni un pago");
        assertThat(jdbc.queryForObject("SELECT status FROM wok.order_requests WHERE id = ?", String.class, requestId))
                .isEqualTo("PENDING_REVIEW");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.invoices", Integer.class)).isEqualTo(invoiceCountBefore);

        JsonNode ownDetails = body(get("/api/v1/client/delivery-requests/" + requestId, client));
        assertThat(ownDetails.path("invoiceName").asText()).isEqualTo("Cliente Delivery");
        assertThat(ownDetails.path("invoiceTaxId").asText()).isEqualTo("7654321");
    }

    private JsonNode body(HttpResponse<String> response) {
        assertThat(response.statusCode()).as("body %s", response.body()).isBetween(200, 299);
        try {
            return json.readTree(response.body());
        } catch (Exception failure) {
            throw new IllegalStateException(failure);
        }
    }

    private HttpResponse<String> dispatchPatch(UUID orderId, String token, String payload) {
        return dispatchPatch(orderId, token, payload, UUID.randomUUID());
    }

    private HttpResponse<String> dispatchPatch(UUID orderId, String token, String payload, UUID idempotencyKey) {
        return patch("/api/v1/operational/deliveries/" + orderId, token, payload,
                Map.of("Idempotency-Key", idempotencyKey.toString()));
    }

    private JsonNode submit(String token, UUID menuItemId, int quantity, String requestedFor) {
        return body(post("/api/v1/client/order-requests", token, """
                {"requestedFor":"%s","customerNote":"prueba","items":[{"menuItemId":"%s","quantity":%d}]}
                """.formatted(requestedFor, menuItemId, quantity),
                Map.of("Idempotency-Key", UUID.randomUUID().toString())));
    }

    private JsonNode submitWithModifier(String token, UUID menuItemId, UUID modifierId, int quantity,
                                        String requestedFor, UUID idempotencyKey) {
        return body(post("/api/v1/client/order-requests", token, """
                {"requestedFor":"%s","customerNote":"opción probada","items":[{"menuItemId":"%s","quantity":%d,"modifierIds":["%s"]}]}
                """.formatted(requestedFor, menuItemId, quantity, modifierId),
                Map.of("Idempotency-Key", idempotencyKey.toString())));
    }

    private UUID seedInventoryItem(UUID menuItemId) {
        UUID parentItemId = jdbc.queryForObject("SELECT item_id FROM wok.menu_items WHERE id = ?", UUID.class, menuItemId);
        UUID itemTypeId = jdbc.queryForObject("SELECT item_type_id FROM wok.items WHERE id = ?", UUID.class, parentItemId);
        UUID unitId = jdbc.queryForObject("SELECT base_unit_id FROM wok.items WHERE id = ?", UUID.class, parentItemId);
        UUID inventoryItemId = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO wok.items (id, sku, name, item_type_id, base_unit_id, track_inventory, active)
            VALUES (?, ?, 'Proteína de prueba', ?, ?, true, true)
            """, inventoryItemId, "MOD_" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(), itemTypeId, unitId);
        return inventoryItemId;
    }

    private int count(String sql, Object... arguments) {
        return jdbc.queryForObject(sql, Integer.class, arguments);
    }

    private void setEveryWeekday(String service, LocalTime opensAt, LocalTime closesAt) {
        for (int weekday = 1; weekday <= 7; weekday++) {
            jdbc.update("""
                INSERT INTO wok.business_hours (service_type, weekday, opens_at, closes_at, timezone_name, active)
                VALUES (?, ?, ?, ?, 'America/Guatemala', true)
                ON CONFLICT (service_type, weekday) DO UPDATE
                SET opens_at = excluded.opens_at, closes_at = excluded.closes_at,
                    timezone_name = excluded.timezone_name, active = true
                """, service, weekday, opensAt, closesAt);
        }
    }

    private void setOpenWeekdays(String service, LocalTime opensAt, LocalTime closesAt) {
        for (int weekday = 2; weekday <= 7; weekday++) {
            jdbc.update("""
                INSERT INTO wok.business_hours (service_type, weekday, opens_at, closes_at, timezone_name, active)
                VALUES (?, ?, ?, ?, 'America/Guatemala', true)
                """, service, weekday, opensAt, closesAt);
        }
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
}

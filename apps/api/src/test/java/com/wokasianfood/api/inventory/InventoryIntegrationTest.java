package com.wokasianfood.api.inventory;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.net.http.HttpResponse;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class InventoryIntegrationTest extends PostgresIntegrationTest {

    private final ObjectMapper json = new ObjectMapper();

    @Test
    void recordsEntryAdjustmentAndWasteKeepingLedgerAndNoNegativeStock() {
        String token = tokenForRole("OPERATIONAL");
        UUID itemId = createItem("HARINA", "Harina", true, "5");

        JsonNode empty = body(get("/api/v1/operational/inventory/items?status=OUT", token));
        assertThat(empty.findValuesAsText("itemId")).contains(itemId.toString());

        String entryKey = UUID.randomUUID().toString();
        JsonNode entry = body(post("/api/v1/operational/inventory/items/" + itemId + "/movements", token, """
                {"type":"ENTRY","quantity":10}
                """, Map.of("Idempotency-Key", entryKey)));
        assertThat(entry.path("quantityDelta").decimalValue()).isEqualByComparingTo("10");
        assertThat(entry.path("quantityOnHand").decimalValue()).isEqualByComparingTo("10");
        assertThat(entry.path("unit").asText()).startsWith("UNIT_");
        assertThat(entry.path("idempotentReplay").asBoolean()).isFalse();

        JsonNode replay = body(post("/api/v1/operational/inventory/items/" + itemId + "/movements", token, """
                {"type":"ENTRY","quantity":10}
                """, Map.of("Idempotency-Key", entryKey)));
        assertThat(replay.path("movementId").asText()).isEqualTo(entry.path("movementId").asText());
        assertThat(replay.path("idempotentReplay").asBoolean()).isTrue();
        assertThat(count("SELECT count(*) FROM wok.inventory_movements WHERE item_id = ?", itemId)).isEqualTo(1);

        JsonNode adjustment = body(post("/api/v1/operational/inventory/items/" + itemId + "/movements", token, """
                {"type":"ADJUSTMENT","quantity":4,"reason":"conteo fisico"}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        assertThat(adjustment.path("quantityDelta").decimalValue()).isEqualByComparingTo("-6");
        assertThat(adjustment.path("quantityOnHand").decimalValue()).isEqualByComparingTo("4");

        JsonNode detail = body(get("/api/v1/operational/inventory/items/" + itemId, token));
        assertThat(detail.path("item").path("status").asText()).isEqualTo("LOW");
        assertThat(detail.path("item").path("quantityOnHand").decimalValue()).isEqualByComparingTo("4");
        assertThat(detail.path("item").path("quantityAvailable").decimalValue()).isEqualByComparingTo("4");
        assertThat(detail.path("movements")).hasSize(2);

        var negative = post("/api/v1/operational/inventory/items/" + itemId + "/movements", token, """
                {"type":"WASTE","quantity":10,"reason":"derrame"}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(negative.statusCode()).isEqualTo(409);
        assertThat(count("SELECT count(*) FROM wok.inventory_movements WHERE item_id = ?", itemId)).isEqualTo(2);

        var noReason = post("/api/v1/operational/inventory/items/" + itemId + "/movements", token, """
                {"type":"WASTE","quantity":1}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(noReason.statusCode()).isEqualTo(422);

        var conflicting = post("/api/v1/operational/inventory/items/" + itemId + "/movements", token, """
                {"type":"ENTRY","quantity":99}
                """, Map.of("Idempotency-Key", entryKey));
        assertThat(conflicting.statusCode()).isEqualTo(409);
    }

    @Test
    void rejectsUntrackedItemsAndRequiresInventoryPermission() {
        String token = tokenForRole("OPERATIONAL");
        UUID untracked = createItem("SERVICIO", "Mantel", false, "0");

        var untrackedMovement = post("/api/v1/operational/inventory/items/" + untracked + "/movements", token, """
                {"type":"ENTRY","quantity":1}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(untrackedMovement.statusCode()).isEqualTo(422);

        var forbidden = get("/api/v1/operational/inventory/items", tokenForRole("CLIENT"));
        assertThat(forbidden.statusCode()).isEqualTo(403);
    }

    @Test
    void searchesAndFiltersItems() {
        String token = tokenForRole("OPERATIONAL");
        createItem("ARROZ", "Arroz jazmin", true, "3");
        UUID missingId = createItem("FIDEOS", "Fideos de arroz", true, "0");

        JsonNode searched = body(get("/api/v1/operational/inventory/items?search=fideos", token));
        assertThat(searched).hasSize(1);
        assertThat(searched.get(0).path("itemId").asText()).isEqualTo(missingId.toString());

        var badFilter = get("/api/v1/operational/inventory/items?status=DESCONOCIDO", token);
        assertThat(badFilter.statusCode()).isEqualTo(400);
    }

    private UUID createItem(String skuPrefix, String name, boolean trackInventory, String minimumStock) {
        UUID typeId = UUID.randomUUID();
        UUID unitId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO wok.item_types (id, code, name) VALUES (?, ?, ?)
                """, typeId, uniqueCode("TYPE"), "Tipo " + typeId);
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

    @Test
    void recipeChangesPreserveCompleteHistoricalSnapshotsAndRejectedChangesDoNotEraseThem() throws Exception {
        String token = tokenForRole("OPERATIONAL");
        UUID parent = createItem("RECIPE", "Receta ficticia", true, "0");
        UUID component = createItem("COMPONENT", "Ingrediente ficticio", true, "0");
        String path = "/api/v1/operational/inventory/items/" + parent + "/recipe";
        UUID first = UUID.randomUUID(), second = UUID.randomUUID();
        body(send("PUT", path, token, "{\"components\":[{\"componentItemId\":\"" + component + "\",\"quantity\":2}]}",
                Map.of("X-Request-Id", first.toString())));
        body(send("PUT", path, token, "{\"components\":[{\"componentItemId\":\"" + component + "\",\"quantity\":3}]}",
                Map.of("X-Request-Id", second.toString())));
        JsonNode original = json.readTree(jdbc.queryForObject(
                "SELECT after_data::text FROM wok.audit_logs WHERE request_id = ? AND action = 'ITEM_RECIPE_UPDATED'", String.class, first));
        JsonNode before = json.readTree(jdbc.queryForObject(
                "SELECT before_data::text FROM wok.audit_logs WHERE request_id = ? AND action = 'ITEM_RECIPE_UPDATED'", String.class, second));
        assertThat(before).isEqualTo(original);
        assertThat(original.path("components").get(0).path("quantity").decimalValue()).isEqualByComparingTo("2");
        assertThat(body(get(path, token)).path("components").get(0).path("quantity").decimalValue()).isEqualByComparingTo("3");
        assertThat(send("PUT", path, token, "{\"components\":[{\"componentItemId\":\"" + parent + "\",\"quantity\":1}]}", Map.of()).statusCode()).isEqualTo(422);
        assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE entity_id = ? AND action = 'ITEM_RECIPE_UPDATED' AND actor_user_id IS NOT NULL AND created_at IS NOT NULL", parent)).isEqualTo(2);
        assertThat(body(get(path, token)).path("components").get(0).path("quantity").decimalValue()).isEqualByComparingTo("3");
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

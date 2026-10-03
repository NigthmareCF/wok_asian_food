package com.wokasianfood.api.production;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.math.BigDecimal;
import java.net.http.HttpResponse;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ProductionIntegrationTest extends PostgresIntegrationTest {

    private final ObjectMapper json = new ObjectMapper();

    @Test
    void registerConsumesRecipeInputsAndCreditsProducedItem() {
        UUID actor = createUserWithRole("produccion-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        UUID componentId = createItem("CARNE", "Carne molida", true, "0");
        setOnHand(componentId, "10");
        UUID producedItemId = createItem("SALSA", "Salsa madre", true, "0");
        putRecipe(token, producedItemId, componentId, "2");

        UUID key = UUID.randomUUID();
        String payload = """
                {"producedItemId":"%s","quantity":3,"actualQuantity":2.5}
                """.formatted(producedItemId);
        JsonNode receipt = body(send("POST", "/api/v1/operational/production/batches", token, payload,
                Map.of("Idempotency-Key", key.toString())));
        assertThat(receipt.path("quantity").decimalValue()).isEqualByComparingTo("3");
        assertThat(receipt.path("yieldQuantity").decimalValue()).isEqualByComparingTo("2.5");
        assertThat(receipt.path("producedOnHand").decimalValue()).isEqualByComparingTo("2.5");
        assertThat(receipt.path("idempotentReplay").asBoolean()).isFalse();
        assertThat(receipt.path("items")).hasSize(1);
        assertThat(receipt.path("items").get(0).path("quantity").decimalValue()).isEqualByComparingTo("6");

        assertThat(onHand(componentId)).isEqualByComparingTo("4");
        assertThat(onHand(producedItemId)).isEqualByComparingTo("2.5");
        UUID batchId = UUID.fromString(receipt.path("batchId").asText());
        assertThat(count("""
                SELECT count(*) FROM wok.inventory_movements
                WHERE production_batch_id = ? AND item_id = ? AND movement_type = 'CONSUMPTION'
                """, batchId, componentId)).isEqualTo(1);
        assertThat(count("""
                SELECT count(*) FROM wok.inventory_movements
                WHERE production_batch_id = ? AND item_id = ? AND movement_type = 'ENTRY'
                """, batchId, producedItemId)).isEqualTo(1);

        JsonNode replay = body(send("POST", "/api/v1/operational/production/batches", token, payload,
                Map.of("Idempotency-Key", key.toString())));
        assertThat(replay.path("batchId").asText()).isEqualTo(batchId.toString());
        assertThat(replay.path("idempotentReplay").asBoolean()).isTrue();
        assertThat(onHand(componentId)).isEqualByComparingTo("4");

        JsonNode details = body(get("/api/v1/operational/production/batches/" + batchId, token));
        assertThat(details.path("batch").path("producedItem").asText()).isEqualTo("Salsa madre");
        assertThat(details.path("items")).hasSize(1);
        assertThat(body(get("/api/v1/operational/production/batches", token))).isNotEmpty();
    }

    @Test
    void rejectsMissingRecipeInsufficientStockUntrackedInputsAndPermissions() {
        String token = tokenForRole("OPERATIONAL");

        UUID noRecipe = createItem("SIMPLE", "Item sin receta", true, "0");
        var missing = send("POST", "/api/v1/operational/production/batches", token, """
                {"producedItemId":"%s","quantity":1}
                """.formatted(noRecipe), Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(missing.statusCode()).isEqualTo(422);

        UUID scarceComponent = createItem("POCO", "Insumo escaso", true, "0");
        setOnHand(scarceComponent, "1");
        UUID scarceProduct = createItem("ESCASO", "Producto escaso", true, "0");
        putRecipe(token, scarceProduct, scarceComponent, "5");
        var insufficient = send("POST", "/api/v1/operational/production/batches", token, """
                {"producedItemId":"%s","quantity":1}
                """.formatted(scarceProduct), Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(insufficient.statusCode()).isEqualTo(409);
        assertThat(onHand(scarceComponent)).isEqualByComparingTo("1");

        UUID untracked = createItem("LIBRE", "Insumo libre", false, "0");
        UUID untrackedProduct = createItem("CONLIBRE", "Producto con libre", true, "0");
        var untrackedRecipe = send("PUT", "/api/v1/operational/inventory/items/" + untrackedProduct + "/recipe",
                token, """
                {"components":[{"componentItemId":"%s","quantity":1}]}
                """.formatted(untracked), Map.of());
        assertThat(untrackedRecipe.statusCode()).isEqualTo(422);

        UUID producedForForbidden = createItem("PERMISO", "Producto permiso", true, "0");
        putRecipe(token, producedForForbidden, createItem("BASE", "Base", true, "0"), "1");
        var forbidden = send("POST", "/api/v1/operational/production/batches", tokenForRole("CLIENT"), """
                {"producedItemId":"%s","quantity":1}
                """.formatted(producedForForbidden), Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(forbidden.statusCode()).isEqualTo(403);
    }

    private void putRecipe(String token, UUID parentItemId, UUID componentItemId, String quantity) {
        body(send("PUT", "/api/v1/operational/inventory/items/" + parentItemId + "/recipe", token, """
                {"components":[{"componentItemId":"%s","quantity":%s}]}
                """.formatted(componentItemId, quantity), Map.of()));
    }

    private BigDecimal onHand(UUID itemId) {
        return jdbc.queryForObject("""
                SELECT COALESCE(quantity_on_hand, 0) FROM wok.inventory_balances WHERE item_id = ?
                """, BigDecimal.class, itemId);
    }

    private void setOnHand(UUID itemId, String quantity) {
        jdbc.update("""
                INSERT INTO wok.inventory_balances (item_id, quantity_on_hand) VALUES (?, ?::numeric)
                """, itemId, quantity);
    }

    private UUID createItem(String skuPrefix, String name, boolean trackInventory, String minimumStock) {
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

package com.wokasianfood.api.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.math.BigDecimal;
import java.net.http.HttpResponse;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class PublicMenuAvailabilityIntegrationTest extends PostgresIntegrationTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void estimatesRecipeAndModifierStockAfterExistingReservationsWithoutReserving() {
        UUID menuItemId = createMenuItem();
        UUID sellableItemId = jdbc.queryForObject("SELECT item_id FROM wok.menu_items WHERE id = ?", UUID.class, menuItemId);
        UUID ingredientId = createInventoryItem(menuItemId);
        jdbc.update("INSERT INTO wok.item_recipe_components (parent_item_id, component_item_id, quantity) VALUES (?, ?, 1)",
                sellableItemId, ingredientId);
        jdbc.update("INSERT INTO wok.inventory_balances (item_id, quantity_on_hand) VALUES (?, 5)", ingredientId);
        createExistingReservation(ingredientId, new BigDecimal("2.000000"));

        UUID groupId = jdbc.queryForObject("""
            INSERT INTO wok.modifier_groups (name, min_selection, max_selection, required)
            VALUES ('Adiciones disponibilidad', 0, 1, false) RETURNING id
            """, UUID.class);
        UUID extraId = jdbc.queryForObject("""
            INSERT INTO wok.modifiers (group_id, name, price_delta) VALUES (?, 'Extra', 2.00) RETURNING id
            """, UUID.class, groupId);
        UUID replacementId = jdbc.queryForObject("""
            INSERT INTO wok.modifiers (group_id, name, price_delta) VALUES (?, 'Sustitución', 0.00) RETURNING id
            """, UUID.class, groupId);
        jdbc.update("INSERT INTO wok.menu_item_modifier_groups (menu_item_id, group_id) VALUES (?, ?)", menuItemId, groupId);
        jdbc.update("INSERT INTO wok.modifier_item_impacts (modifier_id, item_id, quantity_delta) VALUES (?, ?, 0.500000)",
                extraId, ingredientId);
        jdbc.update("INSERT INTO wok.modifier_item_impacts (modifier_id, item_id, quantity_delta) VALUES (?, ?, -0.500000)",
                replacementId, ingredientId);

        JsonNode exactAvailable = body(estimate(menuItemId, 3));
        assertThat(exactAvailable.path("availableEstimate").asBoolean()).isTrue();
        assertThat(exactAvailable.path("estimateOnly").asBoolean()).isTrue();
        assertThat(exactAvailable.path("items").get(0).path("status").asText()).isEqualTo("AVAILABLE_ESTIMATE");

        JsonNode extraAvailable = body(estimate(menuItemId, 2, extraId));
        assertThat(extraAvailable.path("availableEstimate").asBoolean()).isTrue();
        JsonNode extraUnavailable = body(estimate(menuItemId, 3, extraId));
        assertThat(extraUnavailable.path("availableEstimate").asBoolean()).isFalse();
        assertThat(extraUnavailable.path("items").get(0).path("reasonCode").asText())
                .isEqualTo("INSUFFICIENT_STOCK_OR_CATALOG_CONFIGURATION");

        JsonNode replacementLimited = body(estimate(menuItemId, 4, replacementId));
        assertThat(replacementLimited.path("availableEstimate").asBoolean()).isFalse();
        assertThat(replacementLimited.toString()).doesNotContain("quantityOnHand", "reservedQuantity", "availableQuantity");

        UUID untrackedMenuItem = createMenuItem();
        JsonNode untracked = body(estimate(untrackedMenuItem, 1));
        assertThat(untracked.path("availableEstimate").isNull()).isTrue();
        assertThat(untracked.path("items").get(0).path("status").asText()).isEqualTo("NOT_TRACKED");
        JsonNode mixed = body(estimateMixed(menuItemId, untrackedMenuItem));
        assertThat(mixed.path("availableEstimate").isNull()).isTrue();
        assertThat(mixed.path("items").get(0).path("status").asText()).isEqualTo("AVAILABLE_ESTIMATE");
        assertThat(mixed.path("items").get(1).path("status").asText()).isEqualTo("NOT_TRACKED");

        assertThat(estimate(menuItemId, 1, UUID.randomUUID()).statusCode()).isEqualTo(422);
        assertThat(estimate(menuItemId, 1, extraId, extraId).statusCode()).isEqualTo(422);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.inventory_reservations WHERE item_id = ? AND status = 'ACTIVE'",
                Integer.class, ingredientId)).isEqualTo(1);
    }

    @Test
    void aggregatesSharedInventoryAcrossMoreThanTwentyDistinctProducts() {
        var menuItems = java.util.stream.IntStream.range(0, 21).mapToObj(ignored -> createMenuItem()).toList();
        UUID sharedIngredient = createInventoryItem(menuItems.getFirst());
        jdbc.update("INSERT INTO wok.inventory_balances (item_id, quantity_on_hand) VALUES (?, 20)", sharedIngredient);
        for (UUID menuItemId : menuItems) {
            UUID sellableItemId = jdbc.queryForObject("SELECT item_id FROM wok.menu_items WHERE id = ?", UUID.class, menuItemId);
            jdbc.update("INSERT INTO wok.item_recipe_components (parent_item_id, component_item_id, quantity) VALUES (?, ?, 1)",
                    sellableItemId, sharedIngredient);
        }

        HttpResponse<String> response = estimateMany(menuItems);
        assertThat(response.statusCode()).isEqualTo(200);
        JsonNode estimate = body(response);
        assertThat(estimate.path("availableEstimate").asBoolean()).isFalse();
        assertThat(estimate.path("items").size()).isEqualTo(21);
        assertThat(java.util.stream.StreamSupport.stream(estimate.path("items").spliterator(), false)
                .allMatch(item -> item.path("status").asText().equals("UNAVAILABLE_ESTIMATE"))).isTrue();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.inventory_reservations WHERE item_id = ?", Integer.class,
                sharedIngredient)).isZero();
    }

    private HttpResponse<String> estimate(UUID itemId, int quantity, UUID... modifierIds) {
        String ids = modifierIds == null || modifierIds.length == 0 ? "[]" : "[" +
                java.util.Arrays.stream(modifierIds).map(id -> "\"" + id + "\"")
                        .collect(java.util.stream.Collectors.joining(",")) + "]";
        return post("/api/v1/public/menu/availability", null,
                "{\"items\":[{\"menuItemId\":\"%s\",\"quantity\":%d,\"modifierIds\":%s}]}"
                        .formatted(itemId, quantity, ids));
    }

    private HttpResponse<String> estimateMixed(UUID trackedItem, UUID untrackedItem) {
        String payload = ("{\"items\":[{\"menuItemId\":\"%s\",\"quantity\":1,\"modifierIds\":[]}," +
                "{\"menuItemId\":\"%s\",\"quantity\":1,\"modifierIds\":[]}]}"
                ).formatted(trackedItem, untrackedItem);
        return post("/api/v1/public/menu/availability", null, payload);
    }

    private HttpResponse<String> estimateMany(java.util.List<UUID> menuItems) {
        String lines = menuItems.stream()
                .map(itemId -> "{\"menuItemId\":\"" + itemId + "\",\"quantity\":1,\"modifierIds\":[]}")
                .collect(java.util.stream.Collectors.joining(","));
        return post("/api/v1/public/menu/availability", null, "{\"items\":[" + lines + "]}");
    }

    private UUID createMenuItem() {
        jdbc.update("INSERT INTO wok.item_types (code, name) VALUES ('DISH', 'Plato') ON CONFLICT (code) DO NOTHING");
        jdbc.update("INSERT INTO wok.units (code, name, dimension, factor_to_base) VALUES ('UNIT', 'Unidad', 'COUNT', 1) ON CONFLICT (code) DO NOTHING");
        UUID type = jdbc.queryForObject("SELECT id FROM wok.item_types WHERE code = 'DISH'", UUID.class);
        UUID unit = jdbc.queryForObject("SELECT id FROM wok.units WHERE code = 'UNIT'", UUID.class);
        String suffix = UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        UUID sellable = UUID.randomUUID();
        jdbc.update("INSERT INTO wok.items (id, sku, name, item_type_id, base_unit_id, track_inventory) " +
                "VALUES (?, ?, 'Disponibilidad', ?, ?, false)", sellable, "AVAIL_" + suffix, type, unit);
        UUID category = jdbc.queryForObject("INSERT INTO wok.menu_categories (name) VALUES (?) RETURNING id",
                UUID.class, "Disponibilidad " + suffix);
        UUID area = jdbc.queryForObject("INSERT INTO wok.preparation_areas (code, name) VALUES (?, 'Prueba') RETURNING id",
                UUID.class, "AVAIL_" + suffix);
        UUID currency = jdbc.queryForObject("SELECT id FROM wok.currencies WHERE code = 'GTQ'", UUID.class);
        return jdbc.queryForObject("""
            INSERT INTO wok.menu_items (item_id, category_id, preparation_area_id, name, price, currency_id,
                visibility, status, estimated_preparation_seconds)
            VALUES (?, ?, ?, 'Disponibilidad', 20.00, ?, 'PUBLIC', 'ACTIVE', 60) RETURNING id
            """, UUID.class, sellable, category, area, currency);
    }

    private UUID createInventoryItem(UUID menuItemId) {
        UUID parent = jdbc.queryForObject("SELECT item_id FROM wok.menu_items WHERE id = ?", UUID.class, menuItemId);
        UUID type = jdbc.queryForObject("SELECT item_type_id FROM wok.items WHERE id = ?", UUID.class, parent);
        UUID unit = jdbc.queryForObject("SELECT base_unit_id FROM wok.items WHERE id = ?", UUID.class, parent);
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO wok.items (id, sku, name, item_type_id, base_unit_id, track_inventory) " +
                "VALUES (?, ?, 'Ingrediente disponibilidad', ?, ?, true)", id,
                "ING_" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(), type, unit);
        return id;
    }

    private void createExistingReservation(UUID itemId, BigDecimal quantity) {
        UUID operator = createUserWithRole("availability-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        UUID account = jdbc.queryForObject("INSERT INTO wok.order_accounts (name, opened_by) VALUES (?, ?) RETURNING id",
                UUID.class, "availability-" + UUID.randomUUID(), operator);
        UUID currency = jdbc.queryForObject("SELECT id FROM wok.currencies WHERE code = 'GTQ'", UUID.class);
        UUID order = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO wok.orders (id, code, account_id, channel, status, currency_id, guest_count, opened_by)
            VALUES (?, ?, ?, 'DELIVERY', 'SENT', ?, 1, ?)
            """, order, "AVAIL-" + UUID.randomUUID(), account, currency, operator);
        jdbc.update("INSERT INTO wok.inventory_reservations (order_id, item_id, quantity) VALUES (?, ?, ?)",
                order, itemId, quantity);
    }

    private JsonNode body(HttpResponse<String> response) {
        assertThat(response.statusCode()).as("body %s", response.body()).isBetween(200, 299);
        try { return json.readTree(response.body()); }
        catch (Exception error) { throw new IllegalStateException(error); }
    }
}

package com.wokasianfood.api.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.math.BigDecimal;
import java.net.http.HttpResponse;
import java.util.Map;
import java.util.UUID;
import java.util.stream.StreamSupport;
import org.junit.jupiter.api.Test;

class AdminCatalogIntegrationTest extends PostgresIntegrationTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void adminCanReadAndUpdateMenuItemWithOptimisticVersionAndAudit() {
        UUID itemId = createMenuItem();
        String admin = tokenForRole("ADMIN");
        String endpoint = "/api/v1/admin/catalog/menu-items/" + itemId;

        JsonNode items = body(get("/api/v1/admin/catalog/menu-items", admin));
        JsonNode listed = StreamSupport.stream(items.spliterator(), false)
                .filter(item -> item.path("id").asText().equals(itemId.toString())).findFirst().orElseThrow();
        assertThat(listed.path("inventoryItemActive").asBoolean()).isTrue();
        assertThat(listed.path("preparationAreaActive").asBoolean()).isTrue();

        String update = """
            {"name":"Noodles de prueba editados","description":"Descripción actualizada","price":72.50,
             "currency":"gtq","imageReference":"/menu/noodles.webp","visibility":"PUBLIC","status":"ACTIVE",
             "displayOrder":4,"estimatedPreparationSeconds":780,"expectedVersion":1,
             "reason":"Precio y preparación revisados"}
            """;
        JsonNode changed = body(send("PUT", endpoint, admin, update, Map.of()));
        assertThat(changed.path("name").asText()).isEqualTo("Noodles de prueba editados");
        assertThat(changed.path("price").decimalValue()).isEqualByComparingTo("72.50");
        assertThat(changed.path("currency").asText()).isEqualTo("GTQ");
        assertThat(changed.path("rowVersion").asInt()).isEqualTo(2);

        assertThat(jdbc.queryForObject("SELECT before_data ->> 'price' FROM wok.audit_logs WHERE entity_id = ? "
                + "AND action = 'MENU_ITEM_UPDATED'", String.class, itemId)).isEqualTo("58.00");
        assertThat(jdbc.queryForObject("SELECT after_data ->> 'price' FROM wok.audit_logs WHERE entity_id = ? "
                + "AND action = 'MENU_ITEM_UPDATED'", String.class, itemId)).isEqualTo("72.50");
        assertThat(jdbc.queryForObject("SELECT reason FROM wok.audit_logs WHERE entity_id = ? "
                + "AND action = 'MENU_ITEM_UPDATED'", String.class, itemId)).isEqualTo("Precio y preparación revisados");

        String staleUpdate = update.replace("72.50", "74.00");
        assertThat(send("PUT", endpoint, admin, staleUpdate, Map.of()).statusCode()).isEqualTo(409);
        assertThat(jdbc.queryForObject("SELECT price FROM wok.menu_items WHERE id = ?", BigDecimal.class, itemId))
                .isEqualByComparingTo("72.50");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.audit_logs WHERE entity_id = ? "
                + "AND action = 'MENU_ITEM_UPDATED'", Integer.class, itemId)).isEqualTo(1);
    }

    @Test
    void nonAdminCannotReadOrUpdateAdminCatalog() {
        UUID itemId = createMenuItem();
        assertThat(get("/api/v1/admin/catalog/menu-items", tokenForRole("CLIENT")).statusCode()).isEqualTo(403);
        assertThat(get("/api/v1/admin/catalog/menu-items", tokenForRole("OPERATIONAL")).statusCode()).isEqualTo(403);
    }

    private UUID createMenuItem() {
        UUID itemType = UUID.randomUUID();
        UUID unit = UUID.randomUUID();
        jdbc.update("INSERT INTO wok.item_types(id, code, name) VALUES (?, ?, 'Catalog test item type') "
                + "ON CONFLICT (code) DO NOTHING", itemType, "TEST_" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        String itemTypeCode = jdbc.queryForObject("SELECT code FROM wok.item_types WHERE id = ?", String.class, itemType);
        UUID actualItemType = jdbc.queryForObject("SELECT id FROM wok.item_types WHERE code = ?", UUID.class, itemTypeCode);
        jdbc.update("INSERT INTO wok.units(id, code, name, dimension, factor_to_base) "
                + "VALUES (?, ?, 'Unidad prueba', 'COUNT', 1) ON CONFLICT (code) DO NOTHING", unit,
                "UT_" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        UUID actualUnit = jdbc.queryForObject("SELECT id FROM wok.units WHERE id = ?", UUID.class, unit);
        UUID inventoryItem = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO wok.items(id, sku, name, item_type_id, base_unit_id, track_inventory, active)
            VALUES (?, ?, 'Noodles de prueba', ?, ?, false, true)
            """, inventoryItem, "SKU_" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(), actualItemType, actualUnit);
        UUID category = UUID.randomUUID();
        jdbc.update("INSERT INTO wok.menu_categories(id, name) VALUES (?, ?)", category,
                "Categoría de prueba " + UUID.randomUUID());
        UUID area = UUID.randomUUID();
        jdbc.update("INSERT INTO wok.preparation_areas(id, code, name) VALUES (?, ?, 'Área de prueba')", area,
                "TEST_" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        UUID currency = jdbc.queryForObject("SELECT id FROM wok.currencies WHERE code = 'GTQ'", UUID.class);
        UUID menuItem = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO wok.menu_items(id, item_id, category_id, preparation_area_id, name, description,
                price, currency_id, visibility, status, estimated_preparation_seconds)
            VALUES (?, ?, ?, ?, 'Noodles de prueba', 'Descripción inicial', 58.00, ?, 'PUBLIC', 'ACTIVE', 600)
            """, menuItem, inventoryItem, category, area, currency);
        return menuItem;
    }

    private JsonNode body(HttpResponse<String> response) {
        assertThat(response.statusCode()).as("body %s", response.body()).isBetween(200, 299);
        try { return json.readTree(response.body()); }
        catch (Exception failure) { throw new IllegalStateException(failure); }
    }
}

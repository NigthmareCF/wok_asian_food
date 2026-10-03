package com.wokasianfood.api.invoices;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.math.BigDecimal;
import java.net.http.HttpResponse;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class InvoiceIntegrationTest extends PostgresIntegrationTest {

    private final ObjectMapper json = new ObjectMapper();

    @Test
    void createsMultipleDraftsAndListsThemPerAccount() {
        UUID actor = createUserWithRole("factura-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        UUID accountId = createAccount(actor, "Cuenta factura");
        MenuItemSeed menu = seedMenuItem("Chowmein", "50.00");
        closedOrderWithItem(accountId, actor, menu, "Chowmein", 2, "50.00", "100.00");

        JsonNode first = body(post("/api/v1/operational/accounts/" + accountId + "/invoices", token, """
                {"customerName":"Cliente Fiscal","customerTaxId":"12345678"}
                """));
        assertThat(first.path("status").asText()).isEqualTo("DRAFT");
        assertThat(first.path("currency").asText()).isEqualTo("GTQ");
        assertThat(first.path("total").decimalValue()).isEqualByComparingTo("100.00");
        assertThat(first.path("subtotal").decimalValue()).isEqualByComparingTo("89.29");
        assertThat(first.path("taxTotal").decimalValue()).isEqualByComparingTo("10.71");
        assertThat(first.path("customerName").asText()).isEqualTo("Cliente Fiscal");
        assertThat(first.path("items")).hasSize(1);
        assertThat(first.path("items").get(0).path("quantity").asInt()).isEqualTo(2);
        assertThat(first.path("items").get(0).path("lineTotal").decimalValue()).isEqualByComparingTo("100.00");

        JsonNode second = body(post("/api/v1/operational/accounts/" + accountId + "/invoices", token, "{}"));
        assertThat(second.path("invoiceId").asText()).isNotEqualTo(first.path("invoiceId").asText());
        assertThat(second.path("customerName").isMissingNode()).isTrue();

        JsonNode list = body(get("/api/v1/operational/accounts/" + accountId + "/invoices", token));
        assertThat(list).hasSize(2);
        assertThat(list.get(0).path("itemCount").asInt()).isEqualTo(1);

        JsonNode details = body(get("/api/v1/operational/invoices/" + first.path("invoiceId").asText(), token));
        assertThat(details.path("accountName").asText()).isEqualTo("Cuenta factura");
        assertThat(details.path("customerTaxId").asText()).isEqualTo("12345678");
    }

    @Test
    void rejectsDraftsWithoutConsumptionAndWithoutPermission() {
        UUID actor = createUserWithRole("factura-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);

        UUID empty = createAccount(actor, "Cuenta vacia");
        var noConsumption = post("/api/v1/operational/accounts/" + empty + "/invoices", token, "{}");
        assertThat(noConsumption.statusCode()).isEqualTo(422);

        var unknown = post("/api/v1/operational/accounts/" + UUID.randomUUID() + "/invoices", token, "{}");
        assertThat(unknown.statusCode()).isEqualTo(404);

        var forbidden = post("/api/v1/operational/accounts/" + empty + "/invoices", tokenForRole("CLIENT"), "{}");
        assertThat(forbidden.statusCode()).isEqualTo(403);

        var missingInvoice = get("/api/v1/operational/invoices/" + UUID.randomUUID(), token);
        assertThat(missingInvoice.statusCode()).isEqualTo(404);
    }

    private UUID createAccount(UUID actor, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO wok.order_accounts (id, name, status, opened_by, created_by, updated_by)
                VALUES (?, ?, 'OPEN', ?, ?, ?)
                """, id, name, actor, actor, actor);
        return id;
    }

    private void closedOrderWithItem(UUID accountId, UUID actor, MenuItemSeed menu, String name, int quantity,
                                     String unitPrice, String total) {
        UUID orderId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO wok.orders
                    (id, code, account_id, dining_table_id, channel, status, subtotal, discount, total,
                     currency_id, guest_count, opened_by, closed_at)
                SELECT ?, ?, ?, NULL, 'PICKUP', 'CLOSED', ?::numeric, 0, ?::numeric, id, 1, ?, now()
                FROM wok.currencies WHERE code = 'GTQ'
                """, orderId, uniqueCode("ORD-INV"), accountId, total, total, actor);
        jdbc.update("""
                INSERT INTO wok.order_items
                    (order_id, menu_item_id, name_snapshot, quantity, unit_price, preparation_area_id)
                VALUES (?, ?, ?, ?, ?::numeric, ?)
                """, orderId, menu.menuItemId(), name, quantity, unitPrice, menu.areaId());
    }

    private MenuItemSeed seedMenuItem(String name, String price) {
        String sku = ("SKU-" + UUID.randomUUID()).toString().toUpperCase();
        String stationCode = uniqueCode("ST");
        jdbc.update("INSERT INTO wok.item_types (code, name) VALUES ('DISH', 'Plato') ON CONFLICT (code) DO NOTHING");
        jdbc.update("""
                INSERT INTO wok.units (code, name, dimension, factor_to_base)
                VALUES ('UNIT', 'Unidad', 'COUNT', 1) ON CONFLICT (code) DO NOTHING
                """);
        UUID areaId = jdbc.queryForObject("""
                INSERT INTO wok.preparation_areas (code, name) VALUES (?, ?) RETURNING id
                """, UUID.class, stationCode, "Estacion " + stationCode);
        String category = "Categoria " + stationCode;
        jdbc.update("INSERT INTO wok.menu_categories (name) VALUES (?) ON CONFLICT (name) DO NOTHING", category);
        UUID itemTypeId = jdbc.queryForObject("SELECT id FROM wok.item_types WHERE code = 'DISH'", UUID.class);
        UUID unitId = jdbc.queryForObject("SELECT id FROM wok.units WHERE code = 'UNIT'", UUID.class);
        UUID categoryId = jdbc.queryForObject("SELECT id FROM wok.menu_categories WHERE name = ?", UUID.class, category);
        UUID currencyId = jdbc.queryForObject("SELECT id FROM wok.currencies WHERE code = 'GTQ'", UUID.class);
        UUID itemId = jdbc.queryForObject("""
                INSERT INTO wok.items (sku, name, item_type_id, base_unit_id) VALUES (?, ?, ?, ?) RETURNING id
                """, UUID.class, sku, name, itemTypeId, unitId);
        UUID menuItemId = jdbc.queryForObject("""
                INSERT INTO wok.menu_items
                    (item_id, category_id, preparation_area_id, name, price, currency_id,
                     visibility, status, estimated_preparation_seconds)
                VALUES (?, ?, ?, ?, ?, ?, 'PUBLIC', 'ACTIVE', 300) RETURNING id
                """, UUID.class, itemId, categoryId, areaId, name, new BigDecimal(price), currencyId);
        return new MenuItemSeed(menuItemId, areaId);
    }

    private String uniqueCode(String prefix) {
        return (prefix + "_" + UUID.randomUUID().toString().substring(0, 8)).toUpperCase();
    }

    private JsonNode body(HttpResponse<String> response) {
        assertThat(response.statusCode()).as("body %s", response.body()).isBetween(200, 299);
        try {
            return json.readTree(response.body());
        } catch (Exception failure) {
            throw new IllegalStateException(failure);
        }
    }

    private record MenuItemSeed(UUID menuItemId, UUID areaId) {}
}

package com.wokasianfood.api.invoices;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.math.BigDecimal;
import java.net.http.HttpResponse;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class InvoiceIntegrationTest extends PostgresIntegrationTest {

    private final ObjectMapper json = new ObjectMapper();

    @Autowired
    private InvoiceIssuanceWorker invoiceIssuance;

    @Test
    void createsMultipleDraftsAndListsThemPerAccount() {
        UUID actor = createUserWithRole("factura-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        UUID accountId = createAccount(actor, "Cuenta factura");
        MenuItemSeed menu = seedMenuItem("Chowmein", "50.00");
        closedOrderWithItem(accountId, actor, menu, "Chowmein", 2, "50.00", "100.00");

        JsonNode first = body(post("/api/v1/operational/accounts/" + accountId + "/invoices", token, """
                {"customerName":"Cliente Fiscal","customerTaxId":"12345678"}
                """, Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        assertThat(first.path("status").asText()).isEqualTo("DRAFT");
        assertThat(first.path("currency").asText()).isEqualTo("GTQ");
        assertThat(first.path("total").decimalValue()).isEqualByComparingTo("100.00");
        assertThat(first.path("subtotal").decimalValue()).isEqualByComparingTo("89.29");
        assertThat(first.path("taxTotal").decimalValue()).isEqualByComparingTo("10.71");
        assertThat(first.path("customerName").asText()).isEqualTo("Cliente Fiscal");
        assertThat(first.path("items")).hasSize(1);
        assertThat(first.path("items").get(0).path("quantity").asInt()).isEqualTo(2);
        assertThat(first.path("items").get(0).path("lineTotal").decimalValue()).isEqualByComparingTo("100.00");

        JsonNode second = body(post("/api/v1/operational/accounts/" + accountId + "/invoices", token, "{}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString())));
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
    void preloadsFiscalDataRequestedByAcceptedPickupIntoInvoiceDraft() {
        UUID actor = createUserWithRole("factura-prefill-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        UUID accountId = createAccount(actor, "Cuenta pickup con factura solicitada");
        MenuItemSeed menu = seedMenuItem("Wok prefill", "35.00");
        UUID orderId = closedOrderWithItem(accountId, actor, menu, "Wok prefill", 1, "35.00", "35.00");
        UUID customer = createUserWithRole("cliente-prefill-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        UUID currencyId = jdbc.queryForObject("SELECT id FROM wok.currencies WHERE code = 'GTQ'", UUID.class);
        jdbc.update("""
            INSERT INTO wok.order_requests
                (customer_user_id, status, idempotency_key, request_fingerprint, requested_for,
                 subtotal, currency_id, decided_by, decided_at, decision_reason, order_id,
                 invoice_requested, invoice_name, invoice_tax_id)
            VALUES (?, 'ACCEPTED', ?, repeat('a', 64), now() + interval '1 hour', 35.00, ?, ?, now(),
                    'ACCEPTED', ?, true, 'Cliente Pickup', '11223344')
            """, customer, UUID.randomUUID(), currencyId, actor, orderId);

        JsonNode draft = body(post("/api/v1/operational/accounts/" + accountId + "/invoices", token, "{}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString())));

        assertThat(draft.path("status").asText()).isEqualTo("DRAFT");
        assertThat(draft.path("customerName").asText()).isEqualTo("Cliente Pickup");
        assertThat(draft.path("customerTaxId").asText()).isEqualTo("11223344");
        assertThat(jdbc.queryForObject("SELECT invoice_requested FROM wok.order_requests WHERE order_id = ?",
                Boolean.class, orderId)).isTrue();
    }

    @Test
    void clientCanReadOnlyIssuedInvoicesForTheirEntirelyOwnedPickupAccount() {
        UUID actor = createUserWithRole("factura-cliente-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String operator = tokenFor(actor);
        UUID accountId = createAccount(actor, "Cuenta Cliente factura");
        MenuItemSeed menu = seedMenuItem("Wok cliente factura", "42.00");
        UUID orderId = closedOrderWithItem(accountId, actor, menu, "Wok cliente factura", 1, "42.00", "42.00");
        UUID customer = createUserWithRole("cliente-factura-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        UUID otherCustomer = createUserWithRole("otro-cliente-factura-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        linkAcceptedPickup(orderId, customer, actor);
        UUID invoiceId = draft(operator, accountId);
        body(post(issuePath(invoiceId), operator, null, Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        invoiceIssuance.issueNext();

        JsonNode history = body(get("/api/v1/client/invoices", tokenFor(customer)));
        assertThat(history).hasSize(1);
        assertThat(history.get(0).path("invoiceId").asText()).isEqualTo(invoiceId.toString());
        assertThat(history.get(0).path("testDocument").asBoolean()).isTrue();

        JsonNode details = body(get("/api/v1/client/invoices/" + invoiceId, tokenFor(customer)));
        assertThat(details.path("customerTaxId").asText()).isEqualTo("11223344");
        assertThat(details.path("items")).hasSize(1);
        assertThat(get("/api/v1/client/invoices", tokenFor(otherCustomer)).body()).isEqualTo("[]");
        assertThat(get("/api/v1/client/invoices/" + invoiceId, tokenFor(otherCustomer)).statusCode()).isEqualTo(404);
        assertThat(get("/api/v1/client/invoices", operator).statusCode()).isEqualTo(403);
    }

    @Test
    void rejectsDraftsWithoutConsumptionAndWithoutPermission() {
        UUID actor = createUserWithRole("factura-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);

        UUID empty = createAccount(actor, "Cuenta vacia");
        var noConsumption = post("/api/v1/operational/accounts/" + empty + "/invoices", token, "{}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(noConsumption.statusCode()).isEqualTo(422);

        var unknown = post("/api/v1/operational/accounts/" + UUID.randomUUID() + "/invoices", token, "{}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(unknown.statusCode()).isEqualTo(404);

        var forbidden = post("/api/v1/operational/accounts/" + empty + "/invoices", tokenForRole("CLIENT"), "{}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(forbidden.statusCode()).isEqualTo(403);

        var missingInvoice = get("/api/v1/operational/invoices/" + UUID.randomUUID(), token);
        assertThat(missingInvoice.statusCode()).isEqualTo(404);
    }

    @Test
    void issuesDraftThroughOutboxAndIsIdempotent() {
        UUID actor = createUserWithRole("factura-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        UUID accountId = createAccount(actor, "Cuenta emision");
        MenuItemSeed menu = seedMenuItem("Arroz frito", "50.00");
        closedOrderWithItem(accountId, actor, menu, "Arroz frito", 2, "50.00", "100.00");
        UUID invoiceId = draft(token, accountId);

        String key = UUID.randomUUID().toString();
        JsonNode queued = body(post(issuePath(invoiceId), token, null, Map.of("Idempotency-Key", key)));
        assertThat(queued.path("status").asText()).isEqualTo("QUEUED");
        assertThat(queued.path("authorizationNumber").isMissingNode()).isTrue();
        assertThat(count("""
                SELECT count(*) FROM wok.outbox_events
                WHERE event_type = 'INVOICE_ISSUANCE_REQUESTED' AND aggregate_id = ? AND published_at IS NULL
                """, invoiceId)).isEqualTo(1);

        invoiceIssuance.issueNext();

        JsonNode issued = body(get("/api/v1/operational/invoices/" + invoiceId, token));
        assertThat(issued.path("status").asText()).isEqualTo("ISSUED");
        assertThat(issued.path("authorizationNumber").asText()).startsWith("MOCK-");
        assertThat(issued.path("dteUuid").isMissingNode()).isFalse();
        assertThat(issued.path("issuedAt").isMissingNode()).isFalse();
        assertThat(count("""
                SELECT count(*) FROM wok.outbox_events WHERE aggregate_id = ? AND published_at IS NOT NULL
                """, invoiceId)).isEqualTo(1);
        assertThat(count("""
                SELECT count(*) FROM wok.audit_logs WHERE action = 'INVOICE_ISSUED' AND entity_id = ?
                """, invoiceId)).isEqualTo(1);

        JsonNode replay = body(post(issuePath(invoiceId), token, null, Map.of("Idempotency-Key", key)));
        assertThat(replay.path("status").asText()).isEqualTo("ISSUED");
        assertThat(replay.path("authorizationNumber").asText()).isEqualTo(issued.path("authorizationNumber").asText());
        assertThat(count("SELECT count(*) FROM wok.outbox_events WHERE aggregate_id = ?", invoiceId)).isEqualTo(1);
    }

    @Test
    void rejectsIssuingAgainOrAnUnknownInvoice() {
        UUID actor = createUserWithRole("factura-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        UUID accountId = createAccount(actor, "Cuenta reemision");
        MenuItemSeed menu = seedMenuItem("Tallarines", "40.00");
        closedOrderWithItem(accountId, actor, menu, "Tallarines", 1, "40.00", "40.00");
        UUID invoiceId = draft(token, accountId);

        body(post(issuePath(invoiceId), token, null, Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        var again = post(issuePath(invoiceId), token, null, Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(again.statusCode()).isEqualTo(409);

        var unknown = post(issuePath(UUID.randomUUID()), token, null,
                Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(unknown.statusCode()).isEqualTo(404);

        var forbidden = post(issuePath(invoiceId), tokenForRole("CLIENT"), null,
                Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(forbidden.statusCode()).isEqualTo(403);
    }

    @Test
    void replaysDraftCreationAndBlocksSecondActiveInvoice() {
        UUID actor = createUserWithRole("factura-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        UUID accountId = createAccount(actor, "Cuenta antidoble");
        MenuItemSeed menu = seedMenuItem("Ramen", "30.00");
        closedOrderWithItem(accountId, actor, menu, "Ramen", 1, "30.00", "30.00");

        String path = "/api/v1/operational/accounts/" + accountId + "/invoices";
        String key = UUID.randomUUID().toString();
        JsonNode first = body(post(path, token, "{\"customerName\":\"Cliente Uno\"}",
                Map.of("Idempotency-Key", key)));
        JsonNode replay = body(post(path, token, "{\"customerName\":\"Cliente Uno\"}",
                Map.of("Idempotency-Key", key)));
        assertThat(replay.path("invoiceId").asText()).isEqualTo(first.path("invoiceId").asText());
        assertThat(count("SELECT count(*) FROM wok.invoices WHERE account_id = ?", accountId)).isEqualTo(1);

        body(post(issuePath(UUID.fromString(first.path("invoiceId").asText())), token, null,
                Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        UUID second = draft(token, accountId);
        var conflict = post(issuePath(second), token, null,
                Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(conflict.statusCode()).isEqualTo(409);
        assertThat(count("""
                SELECT count(*) FROM wok.invoices WHERE account_id = ? AND status IN ('QUEUED', 'ISSUED')
                """, accountId)).isEqualTo(1);
    }

    private UUID draft(String token, UUID accountId) {
        return UUID.fromString(body(post("/api/v1/operational/accounts/" + accountId + "/invoices", token, "{}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString()))).path("invoiceId").asText());
    }

    private String issuePath(UUID invoiceId) {
        return "/api/v1/operational/invoices/" + invoiceId + "/issue";
    }

    private int count(String sql, Object... arguments) {
        return jdbc.queryForObject(sql, Integer.class, arguments);
    }

    private UUID createAccount(UUID actor, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO wok.order_accounts (id, name, status, opened_by, created_by, updated_by)
                VALUES (?, ?, 'OPEN', ?, ?, ?)
                """, id, name, actor, actor, actor);
        return id;
    }

    private void linkAcceptedPickup(UUID orderId, UUID customerId, UUID actor) {
        UUID currencyId = jdbc.queryForObject("SELECT id FROM wok.currencies WHERE code = 'GTQ'", UUID.class);
        jdbc.update("""
            INSERT INTO wok.order_requests
                (customer_user_id, status, idempotency_key, request_fingerprint, requested_for,
                 subtotal, currency_id, decided_by, decided_at, decision_reason, order_id,
                 invoice_requested, invoice_name, invoice_tax_id)
            VALUES (?, 'ACCEPTED', ?, repeat('b', 64), now() + interval '1 hour', 42.00, ?, ?, now(),
                    'ACCEPTED', ?, true, 'Cliente Factura', '11223344')
            """, customerId, UUID.randomUUID(), currencyId, actor, orderId);
    }

    private UUID closedOrderWithItem(UUID accountId, UUID actor, MenuItemSeed menu, String name, int quantity,
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
        return orderId;
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

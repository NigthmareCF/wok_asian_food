package com.wokasianfood.api.invoices;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.fiscal.FiscalProvider;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.math.BigDecimal;
import java.net.http.HttpResponse;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@TestPropertySource(properties = "wok.fiscal.poll-ms=60000")
class InvoiceUnknownOutcomeIntegrationTest extends PostgresIntegrationTest {
    @MockitoBean
    private FiscalProvider provider;

    @Autowired
    private InvoiceIssuanceWorker worker;

    private final ObjectMapper json = new ObjectMapper();

    @BeforeEach
    void isolateFiscalOutbox() {
        jdbc.update("""
            UPDATE wok.outbox_events SET published_at = now(), claimed_until = NULL, claimed_by = NULL
            WHERE event_type = 'INVOICE_ISSUANCE_REQUESTED' AND published_at IS NULL
            """);
    }

    @Test
    void uncertainProviderResponseStopsRetryUntilHumanConfirmsNotCertified() {
        UUID actor = createUserWithRole("fel-unknown-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        UUID accountId = createAccount(actor, "Cuenta resultado incierto");
        MenuItemSeed menu = seedMenuItem("Cuenta ramen", "70.00");
        closedOrderWithItem(accountId, actor, menu, "Cuenta ramen", "70.00");
        UUID invoiceId = draft(token, accountId);
        body(post(issuePath(invoiceId), token, null, Map.of("Idempotency-Key", UUID.randomUUID().toString())));

        when(provider.certify(any())).thenThrow(new IllegalStateException("Read timed out"));
        worker.issueNext();
        assertThat(invoiceStatus(token, invoiceId)).isEqualTo("UNKNOWN");
        assertThat(count("SELECT count(*) FROM wok.outbox_events WHERE aggregate_id = ? AND published_at IS NOT NULL",
                invoiceId)).isEqualTo(1);
        var blockedAdditionalDraft = post("/api/v1/operational/accounts/" + accountId + "/invoices", token,
                "{\"total\":\"0.01\"}", Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(blockedAdditionalDraft.statusCode()).isEqualTo(422);
        clearInvocations(provider);
        worker.issueNext();
        verify(provider, never()).certify(argThat(request -> request != null && invoiceId.equals(request.invoiceId())));

        UUID reconciliationRequest = UUID.randomUUID();
        String reconcilePath = "/api/v1/operational/invoices/" + invoiceId + "/reconcile";
        String reconciliationBody = """
                {"decision":"CONFIRMED_NOT_CERTIFIED","reason":"Proveedor confirma que no emitió el DTE.",
                 "providerCheckReference":"consulta-proveedor-5481"}
                """;
        String reconciliationKey = UUID.randomUUID().toString();
        Map<String, String> reconciliationHeaders = Map.of("Idempotency-Key", reconciliationKey,
                "X-Request-Id", reconciliationRequest.toString());
        JsonNode queued = body(post(reconcilePath, token, reconciliationBody, reconciliationHeaders));
        assertThat(queued.path("status").asText()).isEqualTo("QUEUED");
        JsonNode replay = body(post(reconcilePath, token, reconciliationBody, reconciliationHeaders));
        assertThat(replay.path("status").asText()).isEqualTo("QUEUED");
        assertThat(count("SELECT count(*) FROM wok.outbox_events WHERE aggregate_id = ?", invoiceId)).isEqualTo(2);
        assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE action = 'INVOICE_RECONCILIATION_REQUEUED' "
                + "AND entity_id = ? AND request_id = ?", invoiceId, reconciliationRequest)).isEqualTo(1);

        doReturn(new FiscalProvider.Certification("TEST-" + invoiceId,
                UUID.nameUUIDFromBytes(invoiceId.toString().getBytes()), "TEST-PROVIDER"))
                .when(provider).certify(any());
        clearInvocations(provider);
        worker.issueNext();
        assertThat(invoiceStatus(token, invoiceId)).isEqualTo("ISSUED");
        verify(provider, times(1)).certify(argThat(request -> request != null && invoiceId.equals(request.invoiceId())));
        assertThat(count("SELECT count(*) FROM wok.outbox_events WHERE aggregate_id = ?", invoiceId)).isEqualTo(2);
    }

    @Test
    void expiredIssuanceLeaseRequiresReconciliationWithoutCallingProviderAgain() {
        UUID actor = createUserWithRole("fel-lease-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        UUID accountId = createAccount(actor, "Cuenta lease vencido");
        MenuItemSeed menu = seedMenuItem("Cuenta lease", "55.00");
        closedOrderWithItem(accountId, actor, menu, "Cuenta lease", "55.00");
        UUID invoiceId = draft(token, accountId);
        body(post(issuePath(invoiceId), token, null, Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        UUID eventId = jdbc.queryForObject("""
                SELECT id FROM wok.outbox_events
                WHERE aggregate_id = ? AND event_type = 'INVOICE_ISSUANCE_REQUESTED'
                """, UUID.class, invoiceId);

        jdbc.update("""
                UPDATE wok.outbox_events
                SET next_attempt_at = now() - interval '1 minute',
                    claimed_until = now() - interval '1 minute', claimed_by = 'worker-that-crashed'
                WHERE id = ?
                """, eventId);

        worker.issueNext();

        assertThat(invoiceStatus(token, invoiceId)).isEqualTo("UNKNOWN");
        assertThat(count("SELECT count(*) FROM wok.outbox_events WHERE id = ? AND published_at IS NOT NULL", eventId))
                .isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE action = 'INVOICE_OUTCOME_UNKNOWN' AND entity_id = ?",
                invoiceId)).isEqualTo(1);
        verify(provider, never()).certify(argThat(request -> request != null && invoiceId.equals(request.invoiceId())));

        worker.issueNext();
        verify(provider, never()).certify(argThat(request -> request != null && invoiceId.equals(request.invoiceId())));
        assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE action = 'INVOICE_OUTCOME_UNKNOWN' AND entity_id = ?",
                invoiceId)).isEqualTo(1);
    }

    @Test
    void lateProviderResponseAfterLeaseExpiryDoesNotCertifyTwiceOrDuplicateAudit() throws Exception {
        UUID actor = createUserWithRole("fel-slow-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        UUID accountId = createAccount(actor, "Cuenta proveedor lento");
        MenuItemSeed menu = seedMenuItem("Cuenta proveedor lento", "65.00");
        closedOrderWithItem(accountId, actor, menu, "Cuenta proveedor lento", "65.00");
        UUID invoiceId = draft(token, accountId);
        body(post(issuePath(invoiceId), token, null, Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        UUID eventId = jdbc.queryForObject("""
                SELECT id FROM wok.outbox_events
                WHERE aggregate_id = ? AND event_type = 'INVOICE_ISSUANCE_REQUESTED'
                """, UUID.class, invoiceId);
        CountDownLatch providerStarted = new CountDownLatch(1);
        CountDownLatch finishProvider = new CountDownLatch(1);
        doAnswer(invocation -> {
            providerStarted.countDown();
            if (!finishProvider.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Test timed out");
            return new FiscalProvider.Certification("LATE-" + invoiceId,
                    UUID.nameUUIDFromBytes(invoiceId.toString().getBytes()), "LATE-PROVIDER");
        }).when(provider).certify(any());

        Thread originalWorker = new Thread(worker::issueNext);
        originalWorker.start();
        assertThat(providerStarted.await(10, TimeUnit.SECONDS)).isTrue();
        jdbc.update("""
                UPDATE wok.outbox_events
                SET next_attempt_at = now() - interval '1 minute',
                    claimed_until = now() - interval '1 minute'
                WHERE id = ?
                """, eventId);

        worker.issueNext();
        finishProvider.countDown();
        originalWorker.join(10_000);

        assertThat(originalWorker.isAlive()).isFalse();
        assertThat(invoiceStatus(token, invoiceId)).isEqualTo("UNKNOWN");
        verify(provider, times(1)).certify(argThat(request -> request != null && invoiceId.equals(request.invoiceId())));
        assertThat(count("SELECT count(*) FROM wok.audit_logs WHERE action = 'INVOICE_OUTCOME_UNKNOWN' AND entity_id = ?",
                invoiceId)).isEqualTo(1);
    }

    @Test
    void operatorCanRecordCertificationConfirmedInProviderPortal() {
        UUID actor = createUserWithRole("fel-known-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        String token = tokenFor(actor);
        UUID accountId = createAccount(actor, "Cuenta certificada afuera");
        MenuItemSeed menu = seedMenuItem("Cuenta sushi", "80.00");
        closedOrderWithItem(accountId, actor, menu, "Cuenta sushi", "80.00");
        UUID invoiceId = draft(token, accountId);
        body(post(issuePath(invoiceId), token, null, Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        when(provider.certify(any())).thenThrow(new IllegalStateException("Connection reset"));
        worker.issueNext();
        clearInvocations(provider);

        UUID dte = UUID.randomUUID();
        String path = "/api/v1/operational/invoices/" + invoiceId + "/reconcile";
        JsonNode issued = body(post(path, token, """
                {"decision":"CONFIRMED_CERTIFIED","reason":"Certificación visible en portal.",
                 "providerCheckReference":"consulta-portal-9902","authorizationNumber":"AUTH-9902",
                 "dteUuid":"%s","providerReference":"EXT-9902"}
                """.formatted(dte), Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        assertThat(issued.path("status").asText()).isEqualTo("ISSUED");
        assertThat(issued.path("authorizationNumber").asText()).isEqualTo("AUTH-9902");
        assertThat(issued.path("dteUuid").asText()).isEqualTo(dte.toString());
        worker.issueNext();
        verify(provider, never()).certify(argThat(request -> request != null && invoiceId.equals(request.invoiceId())));
    }

    private UUID draft(String token, UUID accountId) {
        return UUID.fromString(body(post("/api/v1/operational/accounts/" + accountId + "/invoices", token, "{}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString()))).path("invoiceId").asText());
    }

    private String issuePath(UUID invoiceId) {
        return "/api/v1/operational/invoices/" + invoiceId + "/issue";
    }

    private String invoiceStatus(String token, UUID invoiceId) {
        return body(get("/api/v1/operational/invoices/" + invoiceId, token)).path("status").asText();
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

    private UUID closedOrderWithItem(UUID accountId, UUID actor, MenuItemSeed menu,
                                     String name, String price) {
        UUID orderId = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO wok.orders
                (id, code, account_id, channel, status, subtotal, discount, total, currency_id,
                 guest_count, opened_by, closed_at)
            SELECT ?, ?, ?, 'PICKUP', 'CLOSED', ?::numeric, 0, ?::numeric, id, 1, ?, now()
            FROM wok.currencies WHERE code = 'GTQ'
            """, orderId, "FEL-" + UUID.randomUUID().toString().substring(0, 8), accountId, price, price, actor);
        jdbc.update("""
            INSERT INTO wok.order_items (order_id, menu_item_id, name_snapshot, quantity, unit_price, preparation_area_id)
            VALUES (?, ?, ?, 1, ?::numeric, ?)
            """, orderId, menu.menuItemId(), name, price, menu.areaId());
        return orderId;
    }

    private MenuItemSeed seedMenuItem(String name, String price) {
        String code = UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        jdbc.update("INSERT INTO wok.item_types (code, name) VALUES ('DISH', 'Plato') ON CONFLICT (code) DO NOTHING");
        jdbc.update("INSERT INTO wok.units (code, name, dimension, factor_to_base) "
                + "VALUES ('UNIT', 'Unidad', 'COUNT', 1) ON CONFLICT (code) DO NOTHING");
        UUID areaId = jdbc.queryForObject("INSERT INTO wok.preparation_areas (code, name) VALUES (?, ?) RETURNING id",
                UUID.class, "FEL_" + code, "Estación FEL " + code);
        jdbc.update("INSERT INTO wok.menu_categories (name) VALUES (?) ON CONFLICT (name) DO NOTHING", "FEL " + code);
        UUID typeId = jdbc.queryForObject("SELECT id FROM wok.item_types WHERE code = 'DISH'", UUID.class);
        UUID unitId = jdbc.queryForObject("SELECT id FROM wok.units WHERE code = 'UNIT'", UUID.class);
        UUID categoryId = jdbc.queryForObject("SELECT id FROM wok.menu_categories WHERE name = ?", UUID.class, "FEL " + code);
        UUID currencyId = jdbc.queryForObject("SELECT id FROM wok.currencies WHERE code = 'GTQ'", UUID.class);
        UUID itemId = jdbc.queryForObject("""
            INSERT INTO wok.items (sku, name, item_type_id, base_unit_id) VALUES (?, ?, ?, ?) RETURNING id
            """, UUID.class, "FEL-" + code, name, typeId, unitId);
        UUID menuItemId = jdbc.queryForObject("""
            INSERT INTO wok.menu_items
                (item_id, category_id, preparation_area_id, name, price, currency_id, visibility, status,
                 estimated_preparation_seconds)
            VALUES (?, ?, ?, ?, ?, ?, 'PUBLIC', 'ACTIVE', 300) RETURNING id
            """, UUID.class, itemId, categoryId, areaId, name, new BigDecimal(price), currencyId);
        return new MenuItemSeed(menuItemId, areaId);
    }

    private JsonNode body(HttpResponse<String> response) {
        assertThat(response.statusCode()).as("response: %s", response.body()).isBetween(200, 299);
        try {
            return json.readTree(response.body());
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private record MenuItemSeed(UUID menuItemId, UUID areaId) {}
}

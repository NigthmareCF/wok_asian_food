package com.wokasianfood.api.reports;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AdminSalesReportIntegrationTest extends PostgresIntegrationTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void reportsCapturedSalesAndRefundMovementsOnGuatemalaBusinessDates() throws Exception {
        UUID admin = createUserWithRole("sales-report-" + UUID.randomUUID() + "@wok.test", "ADMIN");
        UUID accountId = jdbc.queryForObject("""
            INSERT INTO wok.order_accounts (name, opened_by, created_by, updated_by)
            VALUES ('Reporte prueba', ?, ?, ?) RETURNING id
            """, UUID.class, admin, admin, admin);
        UUID currencyId = jdbc.queryForObject("SELECT id FROM wok.currencies WHERE code = 'GTQ'", UUID.class);
        UUID firstPayment = insertPayment(accountId, currencyId, admin, "100.00", "10.00", "2020-01-02T05:30:00Z");
        insertPayment(accountId, currencyId, admin, "50.00", "5.00", "2020-01-02T06:30:00Z");
        jdbc.update("""
            INSERT INTO wok.payment_refunds
                (payment_id, refund_amount, tip_refund_amount, refund_method, reason, recorded_by, request_id, created_at)
            VALUES (?, 20.00, 2.00, 'CASH', 'Ajuste de prueba', ?, ?, '2020-01-02T07:00:00Z'::timestamptz)
            """, firstPayment, admin, UUID.randomUUID());

        var response = get("/api/v1/admin/reports/sales/daily?from=2020-01-01&to=2020-01-02", tokenFor(admin));
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        JsonNode report = json.readTree(response.body());
        assertThat(report.path("timeZone").asText()).isEqualTo("America/Guatemala");
        assertThat(report.path("totals")).hasSize(2);
        JsonNode previousDay = report.path("totals").get(0);
        assertThat(previousDay.path("date").asText()).isEqualTo("2020-01-01");
        assertMoney(previousDay, "salesCaptured", "100.00");
        assertMoney(previousDay, "netSales", "100.00");
        assertMoney(previousDay, "netTips", "10.00");
        JsonNode refundDay = report.path("totals").get(1);
        assertThat(refundDay.path("date").asText()).isEqualTo("2020-01-02");
        assertMoney(refundDay, "salesCaptured", "50.00");
        assertMoney(refundDay, "salesRefunded", "20.00");
        assertMoney(refundDay, "netSales", "30.00");
        assertMoney(refundDay, "tipsReceived", "5.00");
        assertMoney(refundDay, "tipsRefunded", "2.00");
        assertMoney(refundDay, "netTips", "3.00");

        assertThat(get("/api/v1/admin/reports/sales/daily?from=2020-01-01&to=2020-01-02",
                tokenForRole("OPERATIONAL")).statusCode()).isEqualTo(403);
    }

    @Test
    void rejectsInvertedAndOverlongReportPeriods() {
        String token = tokenForRole("ADMIN");
        assertThat(get("/api/v1/admin/reports/sales/daily?from=2026-10-05&to=2026-10-04", token).statusCode()).isEqualTo(422);
        assertThat(get("/api/v1/admin/reports/sales/daily?from=2026-09-01&to=2026-10-02", token).statusCode()).isEqualTo(422);
    }

    private UUID insertPayment(UUID accountId, UUID currencyId, UUID actor, String amount, String tip, String capturedAt) {
        return jdbc.queryForObject("""
            INSERT INTO wok.payments
                (account_id, amount, tip_amount, currency_id, method, captured_by, captured_at)
            VALUES (?, ?, ?, ?, 'CASH', ?, ?::timestamptz) RETURNING id
            """, UUID.class, accountId, new BigDecimal(amount), new BigDecimal(tip), currencyId,
                actor, Instant.parse(capturedAt).toString());
    }

    private void assertMoney(JsonNode row, String field, String expected) {
        assertThat(row.path(field).decimalValue()).isEqualByComparingTo(expected);
    }
}

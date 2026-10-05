package com.wokasianfood.api.reports;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import com.wokasianfood.api.identity.AuthException;
import org.springframework.security.access.prepost.PreAuthorize;

@RestController
@RequestMapping("/api/v1/admin/reports")
@PreAuthorize("hasRole('ADMIN')")
public class AdminSalesReportController {
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Guatemala");
    private final JdbcTemplate jdbc;

    public AdminSalesReportController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @GetMapping("/sales/daily")
    public DailySalesReport dailySales(@RequestParam LocalDate from, @RequestParam LocalDate to) {
        if (to.isBefore(from)) throw new AuthException(422, "La fecha final debe ser igual o posterior a la inicial.");
        if (to.toEpochDay() - from.toEpochDay() >= 31)
            throw new AuthException(422, "El período no puede superar 31 días.");
        if (to.isAfter(LocalDate.now(BUSINESS_ZONE)))
            throw new AuthException(422, "El reporte sólo admite fechas hasta el día actual de Guatemala.");
        var fromInstant = from.atStartOfDay(BUSINESS_ZONE).toInstant();
        var toInstant = to.plusDays(1).atStartOfDay(BUSINESS_ZONE).toInstant();
        List<DailySalesTotal> rows = jdbc.query("""
            WITH events AS (
                SELECT (p.captured_at AT TIME ZONE 'America/Guatemala')::date AS business_date,
                       p.currency_id, p.amount AS sales_captured, 0::numeric AS sales_refunded,
                       p.tip_amount AS tips_received, 0::numeric AS tips_refunded
                FROM wok.payments p
                WHERE p.status <> 'VOIDED' AND p.captured_at >= ? AND p.captured_at < ?
                UNION ALL
                SELECT (r.created_at AT TIME ZONE 'America/Guatemala')::date AS business_date,
                       p.currency_id, 0::numeric, r.refund_amount, 0::numeric, r.tip_refund_amount
                FROM wok.payment_refunds r JOIN wok.payments p ON p.id = r.payment_id
                WHERE r.created_at >= ? AND r.created_at < ?
            )
            SELECT e.business_date, c.code AS currency,
                   COALESCE(SUM(e.sales_captured), 0) AS sales_captured,
                   COALESCE(SUM(e.sales_refunded), 0) AS sales_refunded,
                   COALESCE(SUM(e.sales_captured - e.sales_refunded), 0) AS net_sales,
                   COALESCE(SUM(e.tips_received), 0) AS tips_received,
                   COALESCE(SUM(e.tips_refunded), 0) AS tips_refunded,
                   COALESCE(SUM(e.tips_received - e.tips_refunded), 0) AS net_tips
            FROM events e JOIN wok.currencies c ON c.id = e.currency_id
            GROUP BY e.business_date, c.code ORDER BY e.business_date, c.code
            """, (rs, row) -> new DailySalesTotal(rs.getObject("business_date", LocalDate.class),
                    rs.getString("currency"), rs.getBigDecimal("sales_captured"), rs.getBigDecimal("sales_refunded"),
                    rs.getBigDecimal("net_sales"), rs.getBigDecimal("tips_received"),
                    rs.getBigDecimal("tips_refunded"), rs.getBigDecimal("net_tips")),
                java.sql.Timestamp.from(fromInstant), java.sql.Timestamp.from(toInstant),
                java.sql.Timestamp.from(fromInstant), java.sql.Timestamp.from(toInstant));
        return new DailySalesReport(from, to, BUSINESS_ZONE.getId(), rows);
    }

    public record DailySalesReport(LocalDate from, LocalDate to, String timeZone, List<DailySalesTotal> totals) {}
    public record DailySalesTotal(LocalDate date, String currency, BigDecimal salesCaptured, BigDecimal salesRefunded,
                                  BigDecimal netSales, BigDecimal tipsReceived, BigDecimal tipsRefunded,
                                  BigDecimal netTips) {}
}

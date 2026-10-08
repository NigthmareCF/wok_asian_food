package com.wokasianfood.api.accounts;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Computes account balances per currency and nets manually recorded refunds. */
@Service
public class AccountFinancialTotalsService {
    private final JdbcTemplate jdbc;

    public AccountFinancialTotalsService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public List<CurrencyTotal> totals(UUID accountId) {
        return List.copyOf(jdbc.query("""
            WITH order_totals AS (
                SELECT currency_id, SUM(total) AS total, 0::numeric AS paid, 0::numeric AS tips
                FROM wok.orders
                WHERE account_id = ? AND status <> 'CANCELLED'
                GROUP BY currency_id
            ), payment_totals AS (
                SELECT p.currency_id, 0::numeric AS total,
                       SUM(p.amount - COALESCE(r.refunded_amount, 0)) AS paid,
                       SUM(p.tip_amount - COALESCE(r.refunded_tip_amount, 0)) AS tips
                FROM wok.payments p
                LEFT JOIN LATERAL (
                    SELECT SUM(refund_amount) AS refunded_amount,
                           SUM(tip_refund_amount) AS refunded_tip_amount
                    FROM wok.payment_refunds WHERE payment_id = p.id AND status = 'RECORDED_MANUALLY'
                ) r ON true
                WHERE p.account_id = ? AND p.status <> 'VOIDED'
                GROUP BY p.currency_id
            ), totals AS (
                SELECT currency_id, SUM(total) AS total, SUM(paid) AS paid, SUM(tips) AS tips
                FROM (SELECT * FROM order_totals UNION ALL SELECT * FROM payment_totals) grouped
                GROUP BY currency_id
            )
            SELECT c.code, t.total, t.paid, t.total - t.paid AS balance, t.tips
            FROM totals t JOIN wok.currencies c ON c.id = t.currency_id
            ORDER BY c.code
            """, (rs, row) -> new CurrencyTotal(rs.getString("code"), rs.getBigDecimal("total"),
                rs.getBigDecimal("paid"), rs.getBigDecimal("balance"), rs.getBigDecimal("tips")),
                accountId, accountId));
    }

    public record CurrencyTotal(String currency, BigDecimal total, BigDecimal paid,
                                BigDecimal balance, BigDecimal tips) {}
}

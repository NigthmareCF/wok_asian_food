package com.wokasianfood.api.accounts;

import com.wokasianfood.api.identity.AuthException;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Agregado por cuenta y moneda; el llamador conserva su transacción y sus bloqueos. */
@Service
public class AccountFinancialTotalsService {
    private final JdbcTemplate jdbc;

    public AccountFinancialTotalsService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public Totals totals(UUID accountId) {
        return new Totals(jdbc.query("""
            SELECT c.code AS currency, SUM(v.total) AS total, SUM(v.paid) AS paid,
                   SUM(v.total) - SUM(v.paid) AS balance, SUM(v.tips) AS tips
            FROM (
                SELECT currency_id, total, 0::numeric AS paid, 0::numeric AS tips
                FROM wok.orders WHERE account_id = ? AND status <> 'CANCELLED'
                UNION ALL
                SELECT currency_id, 0::numeric, amount, tip_amount
                FROM wok.payments WHERE account_id = ? AND status = 'CAPTURED'
            ) v JOIN wok.currencies c ON c.id = v.currency_id
            GROUP BY c.code ORDER BY c.code
            """, (rs, row) -> new CurrencyTotal(rs.getString("currency"), rs.getBigDecimal("total"),
                rs.getBigDecimal("paid"), rs.getBigDecimal("balance"), rs.getBigDecimal("tips")),
            accountId, accountId));
    }

    public record CurrencyTotal(String currency, BigDecimal total, BigDecimal paid,
                                BigDecimal balance, BigDecimal tips) {}

    public record Totals(List<CurrencyTotal> currencies) {
        public Totals { currencies = List.copyOf(currencies); }
        public CurrencyTotal single() {
            return currencies.isEmpty() ? new CurrencyTotal(null, BigDecimal.ZERO, BigDecimal.ZERO,
                    BigDecimal.ZERO, BigDecimal.ZERO) : currencies.size() == 1 ? currencies.getFirst() : null;
        }
        private boolean anomalous() {
            return currencies.stream().anyMatch(c -> c.balance().signum() < 0 || c.total().signum() < 0
                    || c.paid().signum() < 0 || c.tips().signum() < 0);
        }
        public void requireSettled() {
            if (single() == null || anomalous())
                throw new AuthException(409, "La cuenta tiene monedas incompatibles o saldos anómalos; requiere conciliación antes de cerrar.");
            if (single().balance().signum() != 0)
                throw new AuthException(409, "La cuenta debe tener saldo cero antes de finalizar o liberar la mesa.");
        }
        public BigDecimal receiptBalance(UUID paymentId, String currency) {
            CurrencyTotal single = single();
            if (single == null || anomalous() || !currency.equals(single.currency()))
                throw new AuthException(409, "El pago " + paymentId
                        + " está registrado; el saldo de la cuenta requiere conciliación. No registres otro cobro para reemplazarlo.");
            return single.balance();
        }
    }
}

package com.wokasianfood.api.accounts;

import com.wokasianfood.api.identity.AuthException;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/operational/accounts")
@PreAuthorize("hasAuthority('accounts:manage')")
public class OperationalAccountController {
    private final AccountService accounts;

    public OperationalAccountController(AccountService accounts) { this.accounts = accounts; }

    @GetMapping("/{accountId}")
    public AccountService.AccountDetails details(@PathVariable UUID accountId) {
        return accounts.details(accountId);
    }
}

@Service
class AccountService {
    private final JdbcTemplate jdbc;

    AccountService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    AccountDetails details(UUID accountId) {
        List<AccountSummary> found = jdbc.query("""
            SELECT a.id, a.name, a.status, a.dining_table_id, t.name AS dining_table_name,
                   a.opened_at, a.closed_at, a.row_version
            FROM wok.order_accounts a
            LEFT JOIN wok.dining_tables t ON t.id = a.dining_table_id
            WHERE a.id = ?
            """, (rs, row) -> new AccountSummary(rs.getObject("id", UUID.class), rs.getString("name"),
                rs.getString("status"), rs.getObject("dining_table_id", UUID.class), rs.getString("dining_table_name"),
                rs.getTimestamp("opened_at").toInstant(),
                rs.getTimestamp("closed_at") == null ? null : rs.getTimestamp("closed_at").toInstant(),
                rs.getInt("row_version")), accountId);
        if (found.isEmpty()) throw new AuthException(404, "No encontramos la cuenta.");

        List<AccountOrder> orders = jdbc.query("""
            SELECT o.id, o.code, o.status, o.channel, o.total, o.opened_at, o.closed_at,
                   (SELECT count(*) FROM wok.order_items i WHERE i.order_id = o.id) AS item_count
            FROM wok.orders o
            WHERE o.account_id = ?
            ORDER BY o.opened_at, o.id
            """, (rs, row) -> new AccountOrder(rs.getObject("id", UUID.class), rs.getString("code"),
                rs.getString("status"), rs.getString("channel"), rs.getBigDecimal("total"),
                rs.getTimestamp("opened_at").toInstant(),
                rs.getTimestamp("closed_at") == null ? null : rs.getTimestamp("closed_at").toInstant(),
                rs.getInt("item_count")), accountId);

        BigDecimal total = orders.stream()
                .filter(order -> !"CANCELLED".equals(order.status()))
                .map(AccountOrder::total)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        List<AccountPayment> payments = jdbc.query("""
            SELECT p.id, p.amount, p.tip_amount, p.method, p.status, p.reference, p.captured_at,
                   COALESCE(r.refunded_amount, 0) AS refunded_amount,
                   COALESCE(r.refunded_tip_amount, 0) AS refunded_tip_amount
            FROM wok.payments p
            LEFT JOIN LATERAL (
                SELECT SUM(refund_amount) AS refunded_amount,
                       SUM(tip_refund_amount) AS refunded_tip_amount
                FROM wok.payment_refunds WHERE payment_id = p.id AND status = 'RECORDED_MANUALLY'
            ) r ON true
            WHERE p.account_id = ? ORDER BY p.captured_at, p.id
            """, (rs, row) -> new AccountPayment(rs.getObject("id", UUID.class), rs.getBigDecimal("amount"),
                rs.getBigDecimal("tip_amount"), rs.getString("method"), rs.getString("status"),
                rs.getString("reference"), rs.getTimestamp("captured_at").toInstant(),
                rs.getBigDecimal("refunded_amount"), rs.getBigDecimal("refunded_tip_amount")), accountId);
        BigDecimal paid = payments.stream()
                .filter(payment -> !"VOIDED".equals(payment.status()))
                .map(payment -> payment.amount().subtract(payment.refundedAmount()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal tips = payments.stream()
                .filter(payment -> !"VOIDED".equals(payment.status()))
                .map(payment -> payment.tipAmount().subtract(payment.refundedTipAmount()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return new AccountDetails(found.getFirst(), orders, total, paid, total.subtract(paid), tips, payments);
    }

    public record AccountSummary(UUID id, String name, String status, UUID diningTableId, String diningTableName,
                                 Instant openedAt, Instant closedAt, int rowVersion) {}

    public record AccountOrder(UUID id, String code, String status, String channel, BigDecimal total,
                               Instant openedAt, Instant closedAt, int itemCount) {}

    public record AccountPayment(UUID id, BigDecimal amount, BigDecimal tipAmount, String method, String status,
                                 String reference, Instant capturedAt, BigDecimal refundedAmount,
                                 BigDecimal refundedTipAmount) {}

    public record AccountDetails(AccountSummary account, List<AccountOrder> orders, BigDecimal total,
                                 BigDecimal paid, BigDecimal balance, BigDecimal tips, List<AccountPayment> payments) {}
}

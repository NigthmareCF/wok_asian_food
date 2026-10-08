package com.wokasianfood.api.accounts;

import com.wokasianfood.api.identity.AuthException;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/operational/accounts")
@PreAuthorize("hasAnyAuthority('accounts:manage', 'payments:manage')")
public class OperationalAccountController {
    private final AccountService accounts;

    public OperationalAccountController(AccountService accounts) { this.accounts = accounts; }

    @GetMapping
    public List<AccountService.AccountBalance> list(@RequestParam(required = false) UUID tableId) {
        return accounts.list(tableId);
    }

    @GetMapping("/{accountId}")
    public AccountService.AccountDetails details(@PathVariable UUID accountId) {
        return accounts.details(accountId);
    }
}

@Service
class AccountService {
    private final JdbcTemplate jdbc;
    private final AccountFinancialTotalsService financialTotals;

    AccountService(JdbcTemplate jdbc, AccountFinancialTotalsService financialTotals) {
        this.jdbc = jdbc;
        this.financialTotals = financialTotals;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    List<AccountBalance> list(UUID tableId) {
        if (tableId != null && !Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM wok.dining_tables WHERE id = ?)", Boolean.class, tableId)))
            throw new AuthException(404, "No encontramos la mesa.");
        List<UUID> ids = jdbc.query("""
            SELECT id FROM wok.order_accounts
            WHERE dining_table_id IS NOT NULL AND status IN ('OPEN', 'IN_COBRO', 'PAID')
              AND (CAST(? AS uuid) IS NULL OR dining_table_id = ?)
            ORDER BY opened_at, id
            """, (rs, row) -> rs.getObject(1, UUID.class), tableId, tableId);
        return ids.stream().map(id -> {
            AccountDetails details = details(id);
            return new AccountBalance(details.account(), details.total(), details.paid(), details.balance(),
                    details.tips(), details.currencyTotals(), details.orders().size(),
                    details.pendingOrderCount(), details.unfinalizedOrderCount());
        }).toList();
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
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

        Map<UUID, List<AccountItem>> itemsByOrder = new LinkedHashMap<>();
        jdbc.query("""
            SELECT i.order_id, i.id, i.name_snapshot, i.quantity, i.unit_price, i.line_total, i.status
            FROM wok.order_items i JOIN wok.orders o ON o.id = i.order_id
            WHERE o.account_id = ? ORDER BY i.created_at, i.id
            """, (org.springframework.jdbc.core.RowCallbackHandler) rs -> itemsByOrder
                .computeIfAbsent(rs.getObject("order_id", UUID.class), ignored -> new ArrayList<>())
                .add(new AccountItem(rs.getObject("id", UUID.class), rs.getString("name_snapshot"),
                        rs.getInt("quantity"), rs.getBigDecimal("unit_price"), rs.getBigDecimal("line_total"),
                        rs.getString("status"))), accountId);

        List<AccountOrder> orders = jdbc.query("""
            SELECT o.id, o.code, o.status, o.channel, o.total, o.subtotal, o.discount, o.row_version,
                   c.code AS currency, o.opened_at, o.closed_at,
                   (SELECT count(*) FROM wok.order_items i WHERE i.order_id = o.id AND i.status = 'ACTIVE') AS item_count
            FROM wok.orders o JOIN wok.currencies c ON c.id = o.currency_id
            WHERE o.account_id = ? ORDER BY o.opened_at, o.id
            """, (rs, row) -> new AccountOrder(rs.getObject("id", UUID.class), rs.getString("code"),
                rs.getString("status"), rs.getString("channel"), rs.getBigDecimal("total"),
                rs.getTimestamp("opened_at").toInstant(),
                rs.getTimestamp("closed_at") == null ? null : rs.getTimestamp("closed_at").toInstant(),
                rs.getInt("item_count"), rs.getBigDecimal("subtotal"), rs.getBigDecimal("discount"),
                rs.getString("currency"), rs.getInt("row_version"),
                itemsByOrder.getOrDefault(rs.getObject("id", UUID.class), List.of())), accountId);

        List<AccountPayment> payments = jdbc.query("""
            SELECT p.id, p.amount, p.tip_amount, p.method, p.status, p.reference, p.captured_at,
                   COALESCE(r.refunded_amount, 0) AS refunded_amount,
                   COALESCE(r.refunded_tip_amount, 0) AS refunded_tip_amount, c.code AS currency
            FROM wok.payments p JOIN wok.currencies c ON c.id = p.currency_id
            LEFT JOIN LATERAL (
                SELECT SUM(refund_amount) AS refunded_amount,
                       SUM(tip_refund_amount) AS refunded_tip_amount
                FROM wok.payment_refunds WHERE payment_id = p.id AND status = 'RECORDED_MANUALLY'
            ) r ON true
            WHERE p.account_id = ? ORDER BY p.captured_at, p.id
            """, (rs, row) -> new AccountPayment(rs.getObject("id", UUID.class), rs.getBigDecimal("amount"),
                rs.getBigDecimal("tip_amount"), rs.getString("method"), rs.getString("status"),
                rs.getString("reference"), rs.getTimestamp("captured_at").toInstant(),
                rs.getBigDecimal("refunded_amount"), rs.getBigDecimal("refunded_tip_amount"),
                rs.getString("currency")), accountId);

        List<AccountFinancialTotalsService.CurrencyTotal> currencyTotals = financialTotals.totals(accountId);
        AccountFinancialTotalsService.CurrencyTotal single = currencyTotals.size() == 1 ? currencyTotals.getFirst() : null;
        boolean mixedCurrencies = currencyTotals.size() > 1;
        BigDecimal emptyTotal = currencyTotals.isEmpty() ? BigDecimal.ZERO : null;
        int pending = (int) orders.stream().filter(order -> !List.of("SERVED", "CLOSED", "CANCELLED")
                .contains(order.status())).count();
        int unfinalized = (int) orders.stream().filter(order -> !List.of("CLOSED", "CANCELLED")
                .contains(order.status())).count();
        return new AccountDetails(found.getFirst(), orders,
                single == null ? (mixedCurrencies ? null : emptyTotal) : single.total(),
                single == null ? (mixedCurrencies ? null : emptyTotal) : single.paid(),
                single == null ? (mixedCurrencies ? null : emptyTotal) : single.balance(),
                single == null ? (mixedCurrencies ? null : emptyTotal) : single.tips(), payments,
                currencyTotals, pending, unfinalized);
    }

    public record AccountSummary(UUID id, String name, String status, UUID diningTableId, String diningTableName,
                                 Instant openedAt, Instant closedAt, int rowVersion) {}
    public record AccountOrder(UUID id, String code, String status, String channel, BigDecimal total,
                               Instant openedAt, Instant closedAt, int itemCount, BigDecimal subtotal,
                               BigDecimal discount, String currency, int rowVersion, List<AccountItem> items) {}
    public record AccountItem(UUID id, String name, int quantity, BigDecimal unitPrice, BigDecimal lineTotal,
                              String status) {}
    public record AccountPayment(UUID id, BigDecimal amount, BigDecimal tipAmount, String method, String status,
                                 String reference, Instant capturedAt, BigDecimal refundedAmount,
                                 BigDecimal refundedTipAmount, String currency) {}
    public record AccountDetails(AccountSummary account, List<AccountOrder> orders, BigDecimal total,
                                 BigDecimal paid, BigDecimal balance, BigDecimal tips, List<AccountPayment> payments,
                                 List<AccountFinancialTotalsService.CurrencyTotal> currencyTotals,
                                 int pendingOrderCount, int unfinalizedOrderCount) {}
    public record AccountBalance(AccountSummary account, BigDecimal total, BigDecimal paid, BigDecimal balance,
                                 BigDecimal tips, List<AccountFinancialTotalsService.CurrencyTotal> currencyTotals,
                                 int orderCount, int pendingOrderCount, int unfinalizedOrderCount) {}
}

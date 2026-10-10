package com.wokasianfood.api.orders;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.inventory.InventoryReservationService;
import com.wokasianfood.api.platform.IdempotencyStore;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

@ExtendWith(MockitoExtension.class)
class OrderServiceTest {
    @Mock JdbcTemplate jdbc;
    @Mock IdempotencyStore idempotency;
    @Mock InventoryReservationService reservations;
    private UUID insertedOrderId;

    private OrderService service() {
        return new OrderService(jdbc, idempotency, reservations);
    }

    @Test
    void opensOrderRecomputingTotalInDatabaseAndQueuingKitchenTickets() {
        UUID actor = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        UUID idempotencyKey = UUID.randomUUID();
        UUID accountId = UUID.randomUUID();
        UUID tableId = UUID.randomUUID();
        UUID menuItemId = UUID.randomUUID();
        UUID currencyId = UUID.randomUUID();
        UUID stationId = UUID.randomUUID();
        UUID summaryId = UUID.randomUUID();

        stubHappyPath(accountId, tableId, menuItemId, currencyId, stationId, summaryId, actor, idempotencyKey);

        var request = new OperationalOrderController.OpenOrderRequest(accountId, "DINE_IN", 4, "Sin cebolla",
                List.of(new OperationalOrderController.OrderLineRequest(menuItemId, 2, "DINE_IN", null)));

        var receipt = service().open(actor, requestId, idempotencyKey, request);

        assertEquals("SENT", receipt.status());
        assertFalse(receipt.idempotentReplay());
        assertEquals(1, receipt.itemCount());
        assertNotNull(insertedOrderId);
        verify(jdbc).update(contains("INSERT INTO wok.orders"), eq(insertedOrderId),
                argThat(code -> code.toString().startsWith("ORD-")), eq(accountId), eq(tableId), eq("DINE_IN"),
                eq(currencyId), eq(4), eq("Sin cebolla"), eq(idempotencyKey), any(String.class), eq(actor), eq(actor));
        verify(jdbc).update(contains("SET subtotal = totals.subtotal"), eq(actor), eq(insertedOrderId),
                eq(insertedOrderId));
        verify(jdbc).queryForObject(contains("INSERT INTO wok.order_items"), eq(UUID.class), eq(insertedOrderId),
                eq(menuItemId), eq("Pad Thai"), eq(2), eq(new BigDecimal("10.25")), eq(stationId), eq("DINE_IN"),
                eq(null));
        verify(jdbc).update(contains("SET subtotal = totals.subtotal"), eq(actor), eq(insertedOrderId),
                eq(insertedOrderId));
        verify(jdbc).update(contains("INSERT INTO wok.kitchen_tickets"), any(UUID.class), eq(insertedOrderId), eq(1),
                eq(stationId));
        verify(jdbc).update(contains("INSERT INTO wok.kitchen_ticket_items"), any(UUID.class), any(UUID.class), eq(2));
        verify(jdbc).update(contains("estimated_ready_at = now() + make_interval"), eq(300), any(UUID.class));
        verify(jdbc).update(contains("INSERT INTO wok.order_status_history"), eq(insertedOrderId), eq(actor),
                eq(requestId));
    }

    @Test
    void replaysSameIdempotencyKeyWithoutCreatingAnotherOrder() {
        UUID actor = UUID.randomUUID();
        UUID idempotencyKey = UUID.randomUUID();
        UUID accountId = UUID.randomUUID();
        UUID tableId = UUID.randomUUID();
        UUID menuItemId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        var lines = List.of(new OperationalOrderController.OrderLineRequest(menuItemId, 1, "DINE_IN", null));
        var request = new OperationalOrderController.OpenOrderRequest(accountId, "DINE_IN", 2, null, lines);
        String modernFp = calculateFp(accountId, menuItemId);

        when(jdbc.query(contains("FROM wok.orders WHERE opened_by = ? AND idempotency_key = ?"), any(RowMapper.class),
                eq(actor), eq(idempotencyKey))).thenReturn(List.of(new OrderService.OrderFingerprintRow(orderId, accountId, modernFp)));
        stubDetails(orderId, menuItemId, tableId);

        var receipt = service().open(actor, UUID.randomUUID(), idempotencyKey, request);

        assertTrue(receipt.idempotentReplay());
        assertEquals(1, receipt.itemCount());
        verify(jdbc, never()).update(contains("INSERT INTO wok.orders"), any(Object[].class));
        verify(jdbc, never()).update(contains("INSERT INTO wok.kitchen_tickets"), any(Object[].class));
    }

    @Test
    void replaysLegacyFingerprintOnSameAccount() {
        UUID actor = UUID.randomUUID();
        UUID idempotencyKey = UUID.randomUUID();
        UUID accountId = UUID.randomUUID();
        UUID tableId = UUID.randomUUID();
        UUID menuItemId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        var lines = List.of(new OperationalOrderController.OrderLineRequest(menuItemId, 1, "DINE_IN", null));
        var request = new OperationalOrderController.OpenOrderRequest(accountId, "DINE_IN", 2, null, lines);
        String legacyFp = calculateLegacyFp(menuItemId);

        when(jdbc.query(contains("FROM wok.orders WHERE opened_by = ? AND idempotency_key = ?"), any(RowMapper.class),
                eq(actor), eq(idempotencyKey))).thenReturn(List.of(new OrderService.OrderFingerprintRow(orderId, accountId, legacyFp)));
        stubDetails(orderId, menuItemId, tableId);

        var receipt = service().open(actor, UUID.randomUUID(), idempotencyKey, request);

        assertTrue(receipt.idempotentReplay());
        assertEquals(orderId, receipt.orderId());
    }

    @Test
    void rejectsLegacyFingerprintOnDifferentAccount() {
        UUID actor = UUID.randomUUID();
        UUID idempotencyKey = UUID.randomUUID();
        UUID accountIdA = UUID.randomUUID();
        UUID accountIdB = UUID.randomUUID();
        UUID menuItemId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        var lines = List.of(new OperationalOrderController.OrderLineRequest(menuItemId, 1, "DINE_IN", null));
        var requestB = new OperationalOrderController.OpenOrderRequest(accountIdB, "DINE_IN", 2, null, lines);
        String legacyFp = calculateLegacyFp(menuItemId);

        when(jdbc.query(contains("FROM wok.orders WHERE opened_by = ? AND idempotency_key = ?"), any(RowMapper.class),
                eq(actor), eq(idempotencyKey))).thenReturn(List.of(new OrderService.OrderFingerprintRow(orderId, accountIdA, legacyFp)));

        AuthException error = assertThrows(AuthException.class,
                () -> service().open(actor, UUID.randomUUID(), idempotencyKey, requestB));

        assertEquals(409, error.status());
    }

    @Test
    void rejectsSameIdempotencyKeyAndContentForDifferentAccount() {
        UUID actor = UUID.randomUUID();
        UUID idempotencyKey = UUID.randomUUID();
        UUID accountId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        UUID menuItemId = UUID.randomUUID();
        var lines = List.of(new OperationalOrderController.OrderLineRequest(menuItemId, 1, "DINE_IN", null));
        String modernFp = calculateFp(accountId, menuItemId);
        when(jdbc.query(contains("FROM wok.orders WHERE opened_by = ? AND idempotency_key = ?"), any(RowMapper.class),
                eq(actor), eq(idempotencyKey))).thenReturn(List.of(new OrderService.OrderFingerprintRow(orderId, accountId, modernFp)));
        stubDetails(orderId, menuItemId, UUID.randomUUID());
        var original = new OperationalOrderController.OpenOrderRequest(accountId, "DINE_IN", 2, null, lines);
        var differentAccount = new OperationalOrderController.OpenOrderRequest(
                UUID.randomUUID(), "DINE_IN", 2, null, lines);
        var service = service();

        assertEquals(orderId, service.open(actor, UUID.randomUUID(), idempotencyKey, original).orderId());
        assertTrue(service.open(actor, UUID.randomUUID(), idempotencyKey, original).idempotentReplay());
        AuthException error = assertThrows(AuthException.class,
                () -> service.open(actor, UUID.randomUUID(), idempotencyKey, differentAccount));

        assertEquals(409, error.status());
        verify(jdbc, times(2)).query(contains("JOIN wok.currencies c ON c.id = o.currency_id"),
                any(RowMapper.class), eq(orderId));
        verify(jdbc, never()).update(anyString(), any(Object[].class));
        verifyNoInteractions(reservations, idempotency);
    }

    @Test
    void rejectsIdempotencyKeyReusedWithDifferentPayload() {
        UUID actor = UUID.randomUUID();
        UUID idempotencyKey = UUID.randomUUID();
        when(jdbc.query(contains("FROM wok.orders WHERE opened_by = ? AND idempotency_key = ?"), any(RowMapper.class),
                eq(actor), eq(idempotencyKey))).thenReturn(List.of(
                        new OrderService.OrderFingerprintRow(UUID.randomUUID(), UUID.randomUUID(), "differentFp")));

        var request = new OperationalOrderController.OpenOrderRequest(UUID.randomUUID(), "DINE_IN", 2, "otro nota",
                List.of(new OperationalOrderController.OrderLineRequest(UUID.randomUUID(), 3, "DINE_IN", null)));

        AuthException error = assertThrows(AuthException.class,
                () -> service().open(actor, UUID.randomUUID(), idempotencyKey, request));

        assertEquals(409, error.status());
    }

    private String calculateFp(UUID accountId, UUID menuItemId) {
        String canonical = accountId + "\nDINE_IN\n2\n\n" + menuItemId + ":1:DINE_IN:";
        try {
            return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256")
                    .digest(canonical.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (Exception e) { throw new RuntimeException(e); }
    }

    private String calculateLegacyFp(UUID menuItemId) {
        String canonical = "DINE_IN\n2\n\n" + menuItemId + ":1:DINE_IN:";
        try {
            return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256")
                    .digest(canonical.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (Exception e) { throw new RuntimeException(e); }
    }

    @Test
    void rejectsProductThatIsNoLongerAvailable() {
        UUID actor = UUID.randomUUID();
        UUID idempotencyKey = UUID.randomUUID();
        when(jdbc.query(contains("FROM wok.orders WHERE opened_by = ? AND idempotency_key = ?"), any(RowMapper.class),
                eq(actor), eq(idempotencyKey))).thenReturn(List.of());
        when(jdbc.query(contains("FROM wok.order_accounts WHERE id = ? FOR UPDATE"), any(RowMapper.class), any(UUID.class)))
                .thenReturn(List.of(new OrderService.Account(null, UUID.randomUUID(), "OPEN")));
        doAnswer(invocation -> List.of()).when(jdbc).query(contains("JOIN wok.currencies c ON c.id = mi.currency_id"),
                any(RowMapper.class), any(Object[].class));

        var request = new OperationalOrderController.OpenOrderRequest(UUID.randomUUID(), "DINE_IN", 2, null,
                List.of(new OperationalOrderController.OrderLineRequest(UUID.randomUUID(), 1, "DINE_IN", null)));

        AuthException error = assertThrows(AuthException.class,
                () -> service().open(actor, UUID.randomUUID(), idempotencyKey, request));

        assertEquals(422, error.status());
        verify(jdbc, never()).update(contains("INSERT INTO wok.orders"), any(Object[].class));
    }

    @Test
    void rejectsDineInOrderForAccountWithoutTable() {
        UUID actor = UUID.randomUUID();
        UUID idempotencyKey = UUID.randomUUID();
        when(jdbc.query(contains("FROM wok.orders WHERE opened_by = ? AND idempotency_key = ?"), any(RowMapper.class),
                eq(actor), eq(idempotencyKey))).thenReturn(List.of());
        when(jdbc.query(contains("FROM wok.order_accounts WHERE id = ? FOR UPDATE"), any(RowMapper.class), any(UUID.class)))
                .thenReturn(List.of(new OrderService.Account(null, null, "OPEN")));

        var request = new OperationalOrderController.OpenOrderRequest(UUID.randomUUID(), "DINE_IN", 2, null,
                List.of(new OperationalOrderController.OrderLineRequest(UUID.randomUUID(), 1, "DINE_IN", null)));

        AuthException error = assertThrows(AuthException.class,
                () -> service().open(actor, UUID.randomUUID(), idempotencyKey, request));

        assertEquals(422, error.status());
    }

    @Test
    void rejectsOrderOnAccountThatIsNoLongerOpen() {
        UUID actor = UUID.randomUUID();
        UUID idempotencyKey = UUID.randomUUID();
        when(jdbc.query(contains("FROM wok.orders WHERE opened_by = ? AND idempotency_key = ?"), any(RowMapper.class),
                eq(actor), eq(idempotencyKey))).thenReturn(List.of());
        when(jdbc.query(contains("FROM wok.order_accounts WHERE id = ? FOR UPDATE"), any(RowMapper.class), any(UUID.class)))
                .thenReturn(List.of(new OrderService.Account(null, UUID.randomUUID(), "CLOSED")));

        var request = new OperationalOrderController.OpenOrderRequest(UUID.randomUUID(), "DINE_IN", 2, null,
                List.of(new OperationalOrderController.OrderLineRequest(UUID.randomUUID(), 1, "DINE_IN", null)));

        AuthException error = assertThrows(AuthException.class,
                () -> service().open(actor, UUID.randomUUID(), idempotencyKey, request));

        assertEquals(409, error.status());
    }

    @Test
    void rejectsDuplicatedProductLines() {
        UUID menuItemId = UUID.randomUUID();
        var request = new OperationalOrderController.OpenOrderRequest(UUID.randomUUID(), "DINE_IN", 2, null,
                List.of(new OperationalOrderController.OrderLineRequest(menuItemId, 1, "DINE_IN", null),
                        new OperationalOrderController.OrderLineRequest(menuItemId, 2, "DINE_IN", null)));

        AuthException error = assertThrows(AuthException.class,
                () -> service().open(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), request));

        assertEquals(400, error.status());
    }

    @Test
    void rejectsMissingOrderOnStatusChange() {
        UUID orderId = UUID.randomUUID();
        when(jdbc.query(contains("SELECT status FROM wok.orders WHERE id = ? FOR UPDATE"), any(RowMapper.class),
                eq(orderId))).thenReturn(List.of());

        AuthException error = assertThrows(AuthException.class, () -> service()
                .changeStatus(UUID.randomUUID(), UUID.randomUUID(), orderId,
                        new OperationalOrderController.StatusRequest(OrderService.OrderStatus.PREPARING, 1, null)));

        assertEquals(404, error.status());
    }

    @Test
    void rejectsSkippedStateTransition() {
        UUID orderId = UUID.randomUUID();
        when(jdbc.query(contains("SELECT status FROM wok.orders WHERE id = ? FOR UPDATE"), any(RowMapper.class),
                eq(orderId))).thenReturn(List.of(OrderService.OrderStatus.SENT));

        AuthException error = assertThrows(AuthException.class, () -> service()
                .changeStatus(UUID.randomUUID(), UUID.randomUUID(), orderId,
                        new OperationalOrderController.StatusRequest(OrderService.OrderStatus.SERVED, 1, null)));

        assertEquals(409, error.status());
        verify(jdbc, never()).update(contains("SET status = ?"), any(Object[].class));
    }

    @Test
    void movingOrderToPreparingRecordsHistoryAndAudit() {
        UUID actor = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        when(jdbc.query(contains("SELECT status FROM wok.orders WHERE id = ? FOR UPDATE"), any(RowMapper.class),
                eq(orderId))).thenReturn(List.of(OrderService.OrderStatus.SENT));
        when(jdbc.update(contains("SET status = ?"), eq("PREPARING"), eq("PREPARING"), eq(actor), eq(orderId),
                eq("SENT"), eq(1))).thenReturn(1);
        when(jdbc.update(contains("INSERT INTO wok.order_status_history"), any(Object[].class))).thenReturn(1);
        when(jdbc.update(contains("audit_logs"), any(Object[].class))).thenReturn(1);
        when(jdbc.query(contains("JOIN wok.currencies c ON c.id = o.currency_id"), any(RowMapper.class), eq(orderId)))
                .thenReturn(List.of(summary(orderId, "PREPARING", 2)));

        var result = service().changeStatus(actor, requestId, orderId,
                new OperationalOrderController.StatusRequest(OrderService.OrderStatus.PREPARING, 1, "cocinero"));

        assertEquals("PREPARING", result.status());
        assertEquals(2, result.rowVersion());
        verify(jdbc).update(contains("INSERT INTO wok.order_status_history"), eq(orderId), eq("SENT"),
                eq("PREPARING"), eq("cocinero"), eq(actor), eq(requestId));
    }

    @Test
    void cancellingOrderAlsoCancelsPendingTickets() {
        UUID actor = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        UUID ticketId = UUID.randomUUID();
        when(jdbc.query(contains("SELECT status FROM wok.orders WHERE id = ? FOR UPDATE"), any(RowMapper.class),
                eq(orderId))).thenReturn(List.of(OrderService.OrderStatus.PREPARING));
        when(jdbc.update(contains("SET status = ?"), eq("CANCELLED"), eq("CANCELLED"), eq(actor), eq(orderId),
                eq("PREPARING"), eq(3))).thenReturn(1);
        when(jdbc.update(contains("INSERT INTO wok.order_status_history"), any(Object[].class))).thenReturn(1);
        when(jdbc.update(contains("audit_logs"), any(Object[].class))).thenReturn(1);
        when(jdbc.update(contains("SET status = 'CANCELLED', claimed_by = NULL"), any(Object[].class))).thenReturn(1);
        when(jdbc.update(contains("kitchen_ticket_status_history"), any(Object[].class))).thenReturn(1);
        when(jdbc.query(contains("WHERE order_id = ? AND status IN ('QUEUED', 'PREPARING')"), any(RowMapper.class),
                eq(orderId))).thenReturn(List.of(ticketId));
        when(jdbc.query(contains("JOIN wok.currencies c ON c.id = o.currency_id"), any(RowMapper.class), eq(orderId)))
                .thenReturn(List.of(summary(orderId, "CANCELLED", 4)));

        var result = service().changeStatus(actor, UUID.randomUUID(), orderId,
                new OperationalOrderController.StatusRequest(OrderService.OrderStatus.CANCELLED, 3, "cliente se retiró"));

        assertEquals("CANCELLED", result.status());
        verify(jdbc).update(contains("SET status = 'CANCELLED', claimed_by = NULL"), eq(ticketId));
    }

    @Test
    void reportsStaleVersionAsConflict() {
        UUID orderId = UUID.randomUUID();
        when(jdbc.query(contains("SELECT status FROM wok.orders WHERE id = ? FOR UPDATE"), any(RowMapper.class),
                eq(orderId))).thenReturn(List.of(OrderService.OrderStatus.READY));
        when(jdbc.update(contains("SET status = ?"), eq("SERVED"), eq("SERVED"), any(UUID.class), eq(orderId),
                eq("READY"), eq(9))).thenReturn(0);

        AuthException error = assertThrows(AuthException.class, () -> service()
                .changeStatus(UUID.randomUUID(), UUID.randomUUID(), orderId,
                        new OperationalOrderController.StatusRequest(OrderService.OrderStatus.SERVED, 9, null)));

        assertEquals(409, error.status());
        verify(jdbc, never()).update(contains("INSERT INTO wok.order_status_history"), any(Object[].class));
    }

    @Test
    void stillWritesItemsWhenTheOrderRowIsAlreadyVisibleToItsOwnFingerprintLookup() {
        UUID actor = UUID.randomUUID();
        UUID idempotencyKey = UUID.randomUUID();
        UUID accountId = UUID.randomUUID();
        UUID tableId = UUID.randomUUID();
        UUID menuItemId = UUID.randomUUID();
        UUID currencyId = UUID.randomUUID();
        UUID stationId = UUID.randomUUID();
        UUID summaryId = UUID.randomUUID();

        stubHappyPath(accountId, tableId, menuItemId, currencyId, stationId, List.of(),
                List.of(new OrderService.OrderFingerprintRow(summaryId, accountId, calculateFp(accountId, menuItemId))),
                actor, idempotencyKey);
        stubDetails(summaryId, menuItemId, tableId);

        var request = new OperationalOrderController.OpenOrderRequest(accountId, "DINE_IN", 2, null,
                List.of(new OperationalOrderController.OrderLineRequest(menuItemId, 1, "DINE_IN", null)));

        var receipt = service().open(actor, UUID.randomUUID(), idempotencyKey, request);

        assertFalse(receipt.idempotentReplay());
        assertEquals(1, receipt.itemCount());
        verify(jdbc, times(1)).query(contains("FROM wok.orders WHERE opened_by = ? AND idempotency_key = ?"), any(RowMapper.class), eq(actor),
                eq(idempotencyKey));
        verify(jdbc).queryForObject(contains("INSERT INTO wok.order_items"), eq(UUID.class), eq(insertedOrderId),
                eq(menuItemId), eq("Pad Thai"), eq(1), eq(new BigDecimal("10.25")), eq(stationId), eq("DINE_IN"),
                eq(null));
        verify(jdbc).update(contains("SET subtotal = totals.subtotal"), eq(actor), eq(insertedOrderId),
                eq(insertedOrderId));
        verify(jdbc).update(contains("INSERT INTO wok.kitchen_tickets"), any(UUID.class), eq(insertedOrderId), eq(1),
                eq(stationId));
    }

    private void stubHappyPath(UUID accountId, UUID tableId, UUID menuItemId, UUID currencyId, UUID stationId,
                              UUID summaryId, UUID actor, UUID idempotencyKey) {
        stubHappyPath(accountId, tableId, menuItemId, currencyId, stationId, List.of(), List.of(), actor, idempotencyKey);
        stubDetails(summaryId, menuItemId, tableId);
    }

    private void stubHappyPath(UUID accountId, UUID tableId, UUID menuItemId, UUID currencyId, UUID stationId,
                              UUID actor, UUID idempotencyKey) {
        stubHappyPath(accountId, tableId, menuItemId, currencyId, stationId, List.of(), List.of(), actor, idempotencyKey);
    }

    private void stubHappyPath(UUID accountId, UUID tableId, UUID menuItemId, UUID currencyId, UUID stationId,
                              List<OrderService.OrderFingerprintRow> firstLookup,
                              List<OrderService.OrderFingerprintRow> secondLookup,
                              UUID actor, UUID idempotencyKey) {
        when(jdbc.query(contains("FROM wok.orders WHERE opened_by = ? AND idempotency_key = ?"), any(RowMapper.class),
                eq(actor), eq(idempotencyKey))).thenReturn(firstLookup, secondLookup);
        when(jdbc.query(contains("FROM wok.order_accounts WHERE id = ? FOR UPDATE"), any(RowMapper.class), eq(accountId)))
                .thenReturn(List.of(new OrderService.Account(accountId, tableId, "OPEN")));
        when(jdbc.queryForObject(contains("nextval"), eq(Integer.class))).thenReturn(1);
        when(jdbc.queryForObject(contains("COALESCE(max(sequence_no)"), eq(Integer.class), any())).thenReturn(0);
        when(jdbc.query(contains("JOIN wok.currencies c ON c.id = mi.currency_id"), any(RowMapper.class), eq(menuItemId)))
                .thenReturn(List.of(new OrderService.Product(menuItemId, "Pad Thai", new BigDecimal("10.25"),
                        currencyId, "GTQ", stationId, "COCINA", 300)));
        when(jdbc.update(contains("INSERT INTO wok.orders"), any(Object[].class))).thenAnswer(invocation -> {
            insertedOrderId = invocation.getArgument(1);
            return 1;
        });
        when(jdbc.queryForObject(contains("INSERT INTO wok.order_items"), eq(UUID.class), any(), eq(menuItemId),
                eq("Pad Thai"), any(), any(), eq(stationId), any(), any())).thenReturn(UUID.randomUUID());
        when(jdbc.update(contains("SET subtotal = totals.subtotal"), any(Object[].class))).thenReturn(1);
        when(jdbc.update(contains("INSERT INTO wok.kitchen_tickets"), any(Object[].class))).thenReturn(1);
        when(jdbc.update(contains("INSERT INTO wok.kitchen_ticket_items"), any(Object[].class))).thenReturn(1);
        when(jdbc.update(contains("estimated_ready_at"), any(Object[].class))).thenReturn(1);
        when(jdbc.update(contains("kitchen_ticket_status_history"), any(Object[].class))).thenReturn(1);
        when(jdbc.update(contains("INSERT INTO wok.order_status_history"), any(Object[].class))).thenReturn(1);
        when(jdbc.update(contains("audit_logs"), any(Object[].class))).thenReturn(1);
        when(jdbc.queryForObject(contains("status IN ('QUEUED', 'PREPARING')"), eq(Integer.class), eq(stationId)))
                .thenReturn(1);
    }

    private void stubDetails(UUID orderId, UUID menuItemId, UUID tableId) {
        when(jdbc.query(contains("JOIN wok.currencies c ON c.id = o.currency_id"), any(RowMapper.class), any(UUID.class)))
                .thenReturn(List.of(summary(orderId, "SENT", 1)));
        when(jdbc.query(contains("JOIN wok.preparation_areas pa ON pa.id = i.preparation_area_id"), any(RowMapper.class),
                any(UUID.class)))
                .thenReturn(List.of(new OrderService.OrderLine(menuItemId, "Pad Thai", 2, new BigDecimal("10.25"),
                        new BigDecimal("20.50"), "DINE_IN", null, UUID.randomUUID(), "COCINA")));
        when(jdbc.query(contains("JOIN wok.preparation_areas pa ON pa.id = t.station_id"), any(RowMapper.class), any(UUID.class)))
                .thenReturn(List.of());
    }

    private OrderService.OrderSummary summary(UUID id, String status, int rowVersion) {
        return new OrderService.OrderSummary(id, "ORD-20260930-0001", status, "DINE_IN", new BigDecimal("20.50"),
                BigDecimal.ZERO, new BigDecimal("20.50"), 2, Instant.parse("2026-09-30T12:00:00Z"), null, rowVersion,
                UUID.randomUUID(), "GTQ", UUID.randomUUID(), "Mesa 01", UUID.randomUUID(), "Cuenta 1", 1);
    }
}

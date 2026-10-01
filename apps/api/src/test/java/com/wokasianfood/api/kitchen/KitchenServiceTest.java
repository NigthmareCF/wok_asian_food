package com.wokasianfood.api.kitchen;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.wokasianfood.api.identity.AuthException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

@ExtendWith(MockitoExtension.class)
class KitchenServiceTest {
    @Mock JdbcTemplate jdbc;

    @Test
    void claimingQueuedTicketMovesItToPreparingAndStartsTheOrder() {
        UUID actor = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        UUID ticketId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        when(jdbc.query(contains("SELECT status FROM wok.kitchen_tickets WHERE id = ? FOR UPDATE"),
                any(RowMapper.class), eq(ticketId)))
                .thenReturn(List.of(KitchenService.TicketStatus.QUEUED));
        when(jdbc.update(contains("SET status = 'PREPARING'"), any(Object[].class))).thenReturn(1);
        when(jdbc.update(contains("kitchen_ticket_status_history"), any(Object[].class))).thenReturn(1);
        when(jdbc.update(contains("INSERT INTO wok.order_status_history"), any(Object[].class))).thenReturn(1);
        when(jdbc.query(contains("RETURNING id"), any(RowMapper.class), eq(actor), eq(ticketId)))
                .thenReturn(List.of(orderId));
        stubView(ticketId, "PREPARING", 2);

        var result = new KitchenService(jdbc).claim(actor, requestId, ticketId);

        assertEquals("PREPARING", result.status());
        assertEquals(2, result.rowVersion());
        verify(jdbc).update(contains("SET status = 'PREPARING'"), eq(actor), eq(ticketId));
        verify(jdbc).update(contains("kitchen_ticket_status_history"), eq(ticketId), eq(null), eq("PREPARING"),
                eq("CLAIMED_BY_STAFF"), eq(actor), eq(requestId));
        verify(jdbc).update(contains("INSERT INTO wok.order_status_history"), eq(orderId), eq(actor), eq(requestId));
    }

    @Test
    void rejectsClaimingTicketAlreadyTaken() {
        UUID ticketId = UUID.randomUUID();
        when(jdbc.query(contains("SELECT status FROM wok.kitchen_tickets WHERE id = ? FOR UPDATE"),
                any(RowMapper.class), eq(ticketId)))
                .thenReturn(List.of(KitchenService.TicketStatus.PREPARING));

        AuthException error = assertThrows(AuthException.class,
                () -> new KitchenService(jdbc).claim(UUID.randomUUID(), UUID.randomUUID(), ticketId));

        assertEquals(409, error.status());
        verify(jdbc, never()).update(contains("SET status = 'PREPARING'"), any(Object[].class));
    }

    @Test
    void rejectsMissingTicket() {
        UUID ticketId = UUID.randomUUID();
        when(jdbc.query(contains("SELECT status FROM wok.kitchen_tickets WHERE id = ? FOR UPDATE"),
                any(RowMapper.class), eq(ticketId))).thenReturn(List.of());

        AuthException error = assertThrows(AuthException.class,
                () -> new KitchenService(jdbc).claim(UUID.randomUUID(), UUID.randomUUID(), ticketId));

        assertEquals(404, error.status());
    }

    @Test
    void markingTicketReadyReleasesTheOrderWhenNoStationIsPending() {
        UUID actor = UUID.randomUUID();
        UUID ticketId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        when(jdbc.query(contains("SELECT status FROM wok.kitchen_tickets WHERE id = ? FOR UPDATE"),
                any(RowMapper.class), eq(ticketId)))
                .thenReturn(List.of(KitchenService.TicketStatus.PREPARING));
        when(jdbc.update(contains("ready_at = CASE WHEN ? = 'READY'"), any(Object[].class))).thenReturn(1);
        when(jdbc.update(contains("kitchen_ticket_status_history"), any(Object[].class))).thenReturn(1);
        when(jdbc.update(contains("audit_logs"), any(Object[].class))).thenReturn(1);
        when(jdbc.query(contains("t.status NOT IN ('READY', 'CANCELLED')"), any(RowMapper.class), eq(ticketId)))
                .thenReturn(List.of());
        when(jdbc.query(contains("SET status = 'READY'"), any(RowMapper.class), eq(actor), eq(ticketId)))
                .thenReturn(List.of(orderId));
        when(jdbc.update(contains("INSERT INTO wok.order_status_history"), any(Object[].class))).thenReturn(1);
        stubView(ticketId, "READY", 4);

        var result = new KitchenService(jdbc).changeStatus(actor, UUID.randomUUID(), ticketId,
                new KitchenController.TicketStatusRequest(KitchenService.TicketStatus.READY, 3, null));

        assertEquals("READY", result.status());
        assertNotNull(result.readyAt());
        verify(jdbc).update(contains("INSERT INTO wok.order_status_history"), eq(orderId), eq(actor), any(UUID.class));
    }

    @Test
    void keepsOrderPreparingWhileAnotherStationIsStillWorking() {
        UUID actor = UUID.randomUUID();
        UUID ticketId = UUID.randomUUID();
        when(jdbc.query(contains("SELECT status FROM wok.kitchen_tickets WHERE id = ? FOR UPDATE"),
                any(RowMapper.class), eq(ticketId)))
                .thenReturn(List.of(KitchenService.TicketStatus.PREPARING));
        when(jdbc.update(contains("ready_at = CASE WHEN ? = 'READY'"), any(Object[].class))).thenReturn(1);
        when(jdbc.update(contains("kitchen_ticket_status_history"), any(Object[].class))).thenReturn(1);
        when(jdbc.update(contains("audit_logs"), any(Object[].class))).thenReturn(1);
        when(jdbc.query(contains("t.status NOT IN ('READY', 'CANCELLED')"), any(RowMapper.class), eq(ticketId)))
                .thenReturn(List.of(UUID.randomUUID()));
        stubView(ticketId, "READY", 4);

        new KitchenService(jdbc).changeStatus(actor, UUID.randomUUID(), ticketId,
                new KitchenController.TicketStatusRequest(KitchenService.TicketStatus.READY, 3, null));

        verify(jdbc, never()).update(contains("SET status = 'READY', updated_at"), any(Object[].class));
    }

    @Test
    void rejectsSkippedTicketTransition() {
        UUID ticketId = UUID.randomUUID();
        when(jdbc.query(contains("SELECT status FROM wok.kitchen_tickets WHERE id = ? FOR UPDATE"),
                any(RowMapper.class), eq(ticketId)))
                .thenReturn(List.of(KitchenService.TicketStatus.QUEUED));

        AuthException error = assertThrows(AuthException.class,
                () -> new KitchenService(jdbc).changeStatus(UUID.randomUUID(), UUID.randomUUID(), ticketId,
                        new KitchenController.TicketStatusRequest(KitchenService.TicketStatus.READY, 1, null)));

        assertEquals(409, error.status());
        verify(jdbc, never()).update(contains("ready_at = CASE WHEN"), any(Object[].class));
    }

    @Test
    void reportsStaleTicketVersionAsConflict() {
        UUID ticketId = UUID.randomUUID();
        when(jdbc.query(contains("SELECT status FROM wok.kitchen_tickets WHERE id = ? FOR UPDATE"),
                any(RowMapper.class), eq(ticketId)))
                .thenReturn(List.of(KitchenService.TicketStatus.PREPARING));
        when(jdbc.update(contains("ready_at = CASE WHEN ? = 'READY'"), any(Object[].class))).thenReturn(0);

        AuthException error = assertThrows(AuthException.class,
                () -> new KitchenService(jdbc).changeStatus(UUID.randomUUID(), UUID.randomUUID(), ticketId,
                        new KitchenController.TicketStatusRequest(KitchenService.TicketStatus.READY, 7, null)));

        assertEquals(409, error.status());
        verify(jdbc, never()).update(contains("kitchen_ticket_status_history"), any(Object[].class));
    }

    @Test
    void returningTicketToQueueClearsClaim() {
        UUID actor = UUID.randomUUID();
        UUID ticketId = UUID.randomUUID();
        when(jdbc.query(contains("SELECT status FROM wok.kitchen_tickets WHERE id = ? FOR UPDATE"),
                any(RowMapper.class), eq(ticketId)))
                .thenReturn(List.of(KitchenService.TicketStatus.PREPARING));
        when(jdbc.update(contains("ready_at = CASE WHEN ? = 'READY'"), any(Object[].class))).thenReturn(1);
        when(jdbc.update(contains("kitchen_ticket_status_history"), any(Object[].class))).thenReturn(1);
        when(jdbc.update(contains("audit_logs"), any(Object[].class))).thenReturn(1);
        stubView(ticketId, "QUEUED", 6);

        var result = new KitchenService(jdbc).changeStatus(actor, UUID.randomUUID(), ticketId,
                new KitchenController.TicketStatusRequest(KitchenService.TicketStatus.QUEUED, 5, "faltó ingredient"));

        assertEquals("QUEUED", result.status());
        verify(jdbc).update(contains("kitchen_ticket_status_history"), eq(ticketId), eq("PREPARING"), eq("QUEUED"),
                eq("faltó ingredient"), eq(actor), any(UUID.class));
    }

    @Test
    void openQueueExcludesReadyTicketsAndFiltersByStation() {
        UUID stationId = UUID.randomUUID();
        when(jdbc.query(contains("ticket_items.oldest_created_at"), any(RowMapper.class), eq(stationId), eq(stationId),
                eq("OPEN"), eq("OPEN"))).thenReturn(List.of());

        var queue = new KitchenService(jdbc).queue(stationId, "OPEN");

        assertTrue(queue.isEmpty());
        verify(jdbc).query(contains("t.status IN ('QUEUED', 'PREPARING', 'RECALLED')"), any(RowMapper.class),
                eq(stationId), eq(stationId), eq("OPEN"), eq("OPEN"));
    }

    @Test
    void stationLoadReportsQueuedAndPreparingCounts() {
        UUID stationId = UUID.randomUUID();
        when(jdbc.query(contains("oldest_created_at"), any(RowMapper.class))).thenReturn(List.of(
                new KitchenService.StationLoad(stationId, "COCINA", 2, 1, 3, Instant.parse("2026-09-30T12:05:00Z"))));

        var load = new KitchenService(jdbc).load();

        assertEquals(1, load.size());
        assertEquals(2, load.getFirst().queued());
        assertEquals(1, load.getFirst().preparing());
        assertEquals(3, load.getFirst().ready());
    }

    private void stubView(UUID ticketId, String status, int rowVersion) {
        when(jdbc.query(contains("WHERE t.id = ?"), any(RowMapper.class), eq(ticketId)))
                .thenReturn(List.of(new KitchenService.TicketView(ticketId, UUID.randomUUID(), "ORD-20260930-0001", 1,
                        status, rowVersion, UUID.randomUUID(), "COCINA", null, null,
                        "READY".equals(status) ? Instant.parse("2026-09-30T12:20:00Z") : null,
                        Instant.parse("2026-09-30T12:15:00Z"), "DINE_IN", "Mesa 01", "Cuenta 1", 2, 3,
                        Instant.parse("2026-09-30T12:00:00Z"))));
    }
}

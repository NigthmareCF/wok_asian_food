package com.wokasianfood.api.reservations;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.ResultSet;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class ReservationRequestCancellationTest {
    @Mock JdbcTemplate jdbc;

    @Test
    void cancelsOwnedPendingRequestAndWritesHistory() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID reservationId = UUID.randomUUID();
        stubStatus("REQUESTED");
        when(jdbc.update(contains("UPDATE wok.reservations"), any(Object[].class))).thenReturn(1);

        var result = service().cancelPending(userId, reservationId);

        assertEquals(new ReservationRequestService.CancellationResult(reservationId, "CANCELLED"), result);
        verify(jdbc).update(contains("reservation_status_history"), eq(reservationId), eq(userId));
    }

    @Test
    void hidesForeignOrMissingReservations() throws Exception {
        stubStatus(null);

        ResponseStatusException error = assertThrows(ResponseStatusException.class, () ->
                service().cancelPending(UUID.randomUUID(), UUID.randomUUID()));

        assertEquals(404, error.getStatusCode().value());
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void repeatedCancellationDoesNotWriteAnotherEvent() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID reservationId = UUID.randomUUID();
        stubStatus("CANCELLED");

        var result = service().cancelPending(userId, reservationId);

        assertEquals("CANCELLED", result.status());
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void confirmedReservationCannotBeCancelledThroughPendingEndpoint() throws Exception {
        stubStatus("CONFIRMED");

        ResponseStatusException error = assertThrows(ResponseStatusException.class, () ->
                service().cancelPending(UUID.randomUUID(), UUID.randomUUID()));

        assertEquals(409, error.getStatusCode().value());
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    private ReservationRequestService service() { return new ReservationRequestService(jdbc, null, null); }

    private void stubStatus(String status) throws Exception {
        doAnswer(invocation -> {
            if (status == null) return List.of();
            @SuppressWarnings("unchecked") RowMapper<Object> mapper = invocation.getArgument(1);
            ResultSet rs = mock(ResultSet.class);
            when(rs.getString("status")).thenReturn(status);
            return List.of(mapper.mapRow(rs, 0));
        }).when(jdbc).query(anyString(), any(RowMapper.class), any(Object[].class));
    }
}

package com.wokasianfood.api.reservations;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import java.sql.ResultSet;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class OperationalReservationControllerTest {
    @Mock JdbcTemplate jdbc;
    private ReservationReviewService service;
    private final UUID reservationId = UUID.randomUUID();
    private final UUID actorId = UUID.randomUUID();
    private final UUID requestId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new ReservationReviewService(jdbc);
    }

    private void stubCurrentReservation(int version) throws Exception {
        doAnswer(invocation -> {
            @SuppressWarnings("unchecked") RowMapper<Object> mapper = invocation.getArgument(1);
            ResultSet rs = mock(ResultSet.class);
            when(rs.getObject("id", UUID.class)).thenReturn(reservationId);
            when(rs.getString("status")).thenReturn("REQUESTED");
            when(rs.getInt("row_version")).thenReturn(version);
            return List.of(mapper.mapRow(rs, 0));
        }).when(jdbc).query(contains("FOR UPDATE"), any(RowMapper.class), any(Object[].class));
    }

    @Test
    void confirmsPendingRequestAndAuditsTheTransition() throws Exception {
        stubCurrentReservation(4);
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);
        var result = service.decide(reservationId, actorId, requestId,
                OperationalReservationController.Decision.CONFIRM, "Capacidad revisada", 4);

        assertEquals("CONFIRMED", result.status());
        assertEquals(5, result.rowVersion());
        verify(jdbc).update(contains("SET status = ?"), any(Object[].class));
        verify(jdbc).update(contains("INSERT INTO wok.reservation_status_history"), any(Object[].class));
        verify(jdbc).update(contains("INSERT INTO wok.audit_logs"), any(Object[].class));
    }

    @Test
    void rejectsPendingRequestAndRecordsTheReason() throws Exception {
        stubCurrentReservation(4);
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);
        var result = service.decide(reservationId, actorId, requestId,
                OperationalReservationController.Decision.REJECT, "Sin disponibilidad", 4);

        assertEquals("CANCELLED", result.status());
        assertEquals("Sin disponibilidad", result.reason());
        verify(jdbc).update(contains("INSERT INTO wok.reservation_status_history"), any(Object[].class));
        verify(jdbc).update(contains("INSERT INTO wok.audit_logs"), any(Object[].class));
    }

    @Test
    void refusesAStaleVersionWithoutChangingOrAuditingReservation() throws Exception {
        stubCurrentReservation(4);
        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> service.decide(
                reservationId, actorId, requestId, OperationalReservationController.Decision.CONFIRM,
                "Capacidad revisada", 3));

        assertEquals(409, error.getStatusCode().value());
        verify(jdbc, never()).update(contains("SET status = ?"), any(Object[].class));
        verify(jdbc, never()).update(contains("INSERT INTO wok.audit_logs"), any(Object[].class));
    }

    @Test
    void returnsNotFoundWithoutWritingForUnknownReservation() {
        doReturn(List.of()).when(jdbc).query(contains("FOR UPDATE"), any(RowMapper.class), any(Object[].class));

        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> service.decide(
                reservationId, actorId, requestId, OperationalReservationController.Decision.CONFIRM,
                "Capacidad revisada", 4));

        assertEquals(404, error.getStatusCode().value());
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }
}

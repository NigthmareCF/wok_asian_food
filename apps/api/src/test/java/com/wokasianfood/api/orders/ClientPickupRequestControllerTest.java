package com.wokasianfood.api.orders;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.wokasianfood.api.identity.AuthException;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.oauth2.jwt.Jwt;

@ExtendWith(MockitoExtension.class)
class ClientPickupRequestControllerTest {
    @Mock JdbcTemplate jdbc;
    @Mock PickupSchedulePolicy schedule;

    @Test
    void refusesFormalSubmissionWithoutAcceptedQuote() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID menuItemId = UUID.randomUUID();
        UUID currencyId = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        stubRequestFlow(menuItemId, currencyId, requestId, false);
        Instant requestedFor = Instant.now().plusSeconds(900);
        var request = new ClientPickupRequestController.PickupRequest(requestedFor, "Sin cebolla",
                List.of(new ClientPickupRequestController.RequestedItem(menuItemId, 2)));

        var error=assertThrows(AuthException.class,()->new ClientPickupRequestController(jdbc,schedule).submit(jwt(userId),UUID.randomUUID(),request));
        assertEquals(422,error.status());
        verify(jdbc,never()).update(contains("order_request_events"),any(Object[].class));
    }

    @Test
    void rejectsUnpublishedProductsWithoutCreatingRequest() {
        UUID userId = UUID.randomUUID();
        UUID menuItemId = UUID.randomUUID();
        doAnswer(invocation -> List.of()).when(jdbc).query(anyString(), any(RowMapper.class), any(Object[].class));
        var request = new ClientPickupRequestController.PickupRequest(Instant.now().plusSeconds(3600), null,
                List.of(new ClientPickupRequestController.RequestedItem(menuItemId, 1)));

        AuthException error = assertThrows(AuthException.class, () ->
                new ClientPickupRequestController(jdbc, schedule).submit(jwt(userId), UUID.randomUUID(), request));

        assertEquals(422, error.status());
        verify(jdbc, never()).update(contains("order_request_items"), any(Object[].class));
        verify(jdbc, never()).update(contains("order_request_events"), any(Object[].class));
    }

    @Test
    void clientCanCancelOwnPendingRequestAndCancellationIsRecorded() {
        UUID userId = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        stubRequestStatus("PENDING_REVIEW");
        when(jdbc.update(contains("SET status = 'CANCELLED'"), any(Object[].class))).thenReturn(1);

        var result = new ClientPickupRequestController(jdbc, schedule).cancel(jwt(userId), requestId);

        assertEquals(new ClientPickupRequestController.OrderRequestState(requestId, "CANCELLED"), result);
        verify(jdbc).update(contains("order_request_events"), eq(requestId), eq(userId));
    }

    @Test
    void cannotCancelAnotherCustomersRequest() {
        UUID userId = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        stubRequestStatus(null);

        AuthException error = assertThrows(AuthException.class, () ->
                new ClientPickupRequestController(jdbc, schedule).cancel(jwt(userId), requestId));

        assertEquals(404, error.status());
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void cancellationRetryIsIdempotentAndDoesNotDuplicateEvent() {
        UUID userId = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        stubRequestStatus("CANCELLED");

        var result = new ClientPickupRequestController(jdbc, schedule).cancel(jwt(userId), requestId);

        assertEquals("CANCELLED", result.status());
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void detailsReturnTheSavedProductSnapshotForOwner() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        UUID currencyId = UUID.randomUUID();
        Instant requestedFor = Instant.now().plusSeconds(3600);
        doAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            @SuppressWarnings("unchecked") RowMapper<Object> mapper = invocation.getArgument(1);
            ResultSet rs = mock(ResultSet.class);
            if (sql.contains("order_request_items")) {
                when(rs.getString("name_snapshot")).thenReturn("Pad Thai");
                when(rs.getInt("quantity")).thenReturn(2);
                when(rs.getBigDecimal("unit_price")).thenReturn(new BigDecimal("10.25"));
                when(rs.getBigDecimal("line_total")).thenReturn(new BigDecimal("20.50"));
                when(rs.getObject("currency_id", UUID.class)).thenReturn(currencyId);
            } else {
                when(rs.getObject("id", UUID.class)).thenReturn(requestId);
                when(rs.getString("status")).thenReturn("PENDING_REVIEW");
                when(rs.getTimestamp("requested_for")).thenReturn(Timestamp.from(requestedFor));
                when(rs.getBigDecimal("subtotal")).thenReturn(new BigDecimal("20.50"));
                when(rs.getObject("currency_id", UUID.class)).thenReturn(currencyId);
                when(rs.getString("currency_code")).thenReturn("GTQ");
                when(rs.getString("customer_note")).thenReturn("Sin cebolla");
                when(rs.getObject("order_id", UUID.class)).thenReturn(UUID.randomUUID());
                when(rs.getString("order_status")).thenReturn("PREPARING");
            }
            return List.of(mapper.mapRow(rs, 0));
        }).when(jdbc).query(anyString(), any(RowMapper.class), any(Object[].class));

        var result = new ClientPickupRequestController(jdbc, schedule).details(jwt(userId), requestId);

        assertEquals("Sin cebolla", result.customerNote());
        assertEquals("Pad Thai", result.items().getFirst().name());
        assertEquals(new BigDecimal("20.50"), result.items().getFirst().lineTotal());
        assertEquals("PREPARING", result.orderStatus());
    }

    @Test
    void detailsHideRequestsOwnedByAnotherCustomer() {
        doAnswer(invocation -> List.of()).when(jdbc).query(anyString(), any(RowMapper.class), any(Object[].class));

        AuthException error = assertThrows(AuthException.class, () ->
                new ClientPickupRequestController(jdbc, schedule).details(jwt(UUID.randomUUID()), UUID.randomUUID()));

        assertEquals(404, error.status());
        verify(jdbc, times(1)).query(anyString(), any(RowMapper.class), any(Object[].class));
    }

    private void stubRequestStatus(String status) {
        doAnswer(invocation -> {
            if (status == null || !((String)invocation.getArgument(0)).contains("SELECT status FROM wok.order_requests")) return List.of();
            @SuppressWarnings("unchecked") RowMapper<Object> mapper = invocation.getArgument(1);
            ResultSet rs = mock(ResultSet.class);
            when(rs.getString("status")).thenReturn(status);
            return List.of(mapper.mapRow(rs, 0));
        }).when(jdbc).query(anyString(), any(RowMapper.class), any(Object[].class));
    }

    private void stubRequestFlow(UUID menuItemId, UUID currencyId, UUID requestId, boolean conflict) throws Exception {
        doAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            @SuppressWarnings("unchecked") RowMapper<Object> mapper = invocation.getArgument(1);
            if (sql.contains("FROM wok.order_requests r JOIN wok.currencies")) {
                if (!conflict) return List.of();
                ResultSet rs = mock(ResultSet.class);
                when(rs.getString("request_fingerprint")).thenReturn("different");
                return List.of(mapper.mapRow(rs, 0));
            }
            ResultSet rs = mock(ResultSet.class);
            if (sql.contains("FROM wok.menu_items mi")) {
                when(rs.getObject("id", UUID.class)).thenReturn(menuItemId);
                when(rs.getString("name")).thenReturn("Pad Thai");
                when(rs.getBigDecimal("price")).thenReturn(new BigDecimal("10.25"));
                when(rs.getObject("currency_id", UUID.class)).thenReturn(currencyId);
                when(rs.getString("currency_code")).thenReturn("GTQ");
                when(rs.getInt("estimated_preparation_seconds")).thenReturn(60);
            } else {
                when(rs.getObject(1, UUID.class)).thenReturn(requestId);
            }
            return List.of(mapper.mapRow(rs, 0));
        }).when(jdbc).query(anyString(), any(RowMapper.class), any(Object[].class));
    }

    private Jwt jwt(UUID userId) {
        return Jwt.withTokenValue("test-token").header("alg", "none").subject(userId.toString())
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(600)).build();
    }
}

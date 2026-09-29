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

    @Test
    void submitsPendingPickupRequestUsingCurrentBackendPriceSnapshots() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID menuItemId = UUID.randomUUID();
        UUID currencyId = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        stubRequestFlow(menuItemId, currencyId, requestId, false);
        Instant requestedFor = Instant.now().plusSeconds(900);
        var request = new ClientPickupRequestController.PickupRequest(requestedFor, "Sin cebolla",
                List.of(new ClientPickupRequestController.RequestedItem(menuItemId, 2)));

        var result = new ClientPickupRequestController(jdbc).submit(jwt(userId), UUID.randomUUID(), request);

        assertEquals(requestId, result.requestId());
        assertEquals("PENDING_REVIEW", result.status());
        assertEquals(new BigDecimal("20.50"), result.subtotal());
        assertFalse(result.idempotentReplay());
        assertTrue(result.message().contains("confirmar disponibilidad"));
        verify(jdbc).update(contains("order_request_items"), eq(requestId), eq(menuItemId),
                eq("Pad Thai"), eq(2), eq(new BigDecimal("10.25")), eq(currencyId));
        verify(jdbc).update(contains("order_request_events"), eq(requestId), eq(userId));
    }

    @Test
    void rejectsUnpublishedProductsWithoutCreatingRequest() {
        UUID userId = UUID.randomUUID();
        UUID menuItemId = UUID.randomUUID();
        doAnswer(invocation -> List.of()).when(jdbc).query(anyString(), any(RowMapper.class), any(Object[].class));
        var request = new ClientPickupRequestController.PickupRequest(Instant.now().plusSeconds(3600), null,
                List.of(new ClientPickupRequestController.RequestedItem(menuItemId, 1)));

        AuthException error = assertThrows(AuthException.class, () ->
                new ClientPickupRequestController(jdbc).submit(jwt(userId), UUID.randomUUID(), request));

        assertEquals(422, error.status());
        verify(jdbc, never()).update(contains("order_request_items"), any(Object[].class));
        verify(jdbc, never()).update(contains("order_request_events"), any(Object[].class));
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

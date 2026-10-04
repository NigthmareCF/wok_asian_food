package com.wokasianfood.api.orders;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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
class ClientOrderTrackingControllerTest {
    @Mock JdbcTemplate jdbc;

    @Test
    void returnsOwnedAcceptedPickupOrdersWithKitchenEta() throws Exception {
        UUID customerId = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        Instant requestedFor = Instant.parse("2026-10-04T20:30:00Z");
        Instant eta = Instant.parse("2026-10-04T19:55:00Z");
        Instant updatedAt = Instant.parse("2026-10-04T19:40:00Z");
        doAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            assertTrue(sql.contains("r.customer_user_id = ?"));
            assertTrue(sql.contains("r.status = 'ACCEPTED'"));
            assertEquals(customerId, invocation.getArgument(2));

            @SuppressWarnings("unchecked") RowMapper<ClientOrderTrackingController.PickupOrderTracking> mapper =
                    invocation.getArgument(1);
            ResultSet rs = mock(ResultSet.class);
            when(rs.getObject("request_id", UUID.class)).thenReturn(requestId);
            when(rs.getString("order_code")).thenReturn("WOK-1042");
            when(rs.getString("status")).thenReturn("PREPARING");
            when(rs.getTimestamp("requested_for")).thenReturn(Timestamp.from(requestedFor));
            when(rs.getTimestamp("estimated_ready_at")).thenReturn(Timestamp.from(eta));
            when(rs.getTimestamp("updated_at")).thenReturn(Timestamp.from(updatedAt));
            return List.of(mapper.mapRow(rs, 0));
        }).when(jdbc).query(anyString(), any(RowMapper.class), any(Object[].class));

        Jwt jwt = Jwt.withTokenValue("test")
                .header("alg", "none")
                .subject(customerId.toString())
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(60))
                .build();
        var result = new ClientOrderTrackingController(jdbc).tracking(jwt);

        assertEquals(1, result.size());
        assertEquals(requestId, result.getFirst().requestId());
        assertEquals("WOK-1042", result.getFirst().orderCode());
        assertEquals("PREPARING", result.getFirst().status());
        assertEquals(eta, result.getFirst().estimatedReadyAt());
        assertEquals(requestedFor, result.getFirst().requestedFor());
        assertEquals(updatedAt, result.getFirst().updatedAt());
    }

    @Test
    void doesNotExposeAnEtaAfterTheOrderIsReady() throws Exception {
        UUID customerId = UUID.randomUUID();
        doAnswer(invocation -> {
            @SuppressWarnings("unchecked") RowMapper<ClientOrderTrackingController.PickupOrderTracking> mapper =
                    invocation.getArgument(1);
            ResultSet rs = mock(ResultSet.class);
            when(rs.getObject("request_id", UUID.class)).thenReturn(UUID.randomUUID());
            when(rs.getString("order_code")).thenReturn("WOK-1043");
            when(rs.getString("status")).thenReturn("READY");
            when(rs.getTimestamp("requested_for")).thenReturn(Timestamp.from(Instant.now()));
            when(rs.getTimestamp("estimated_ready_at")).thenReturn(null);
            when(rs.getTimestamp("updated_at")).thenReturn(Timestamp.from(Instant.now()));
            return List.of(mapper.mapRow(rs, 0));
        }).when(jdbc).query(anyString(), any(RowMapper.class), any(Object[].class));

        Jwt jwt = Jwt.withTokenValue("test")
                .header("alg", "none")
                .subject(customerId.toString())
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(60))
                .build();
        var result = new ClientOrderTrackingController(jdbc).tracking(jwt);

        assertNull(result.getFirst().estimatedReadyAt());
        verify(jdbc).query(anyString(), any(RowMapper.class), any(Object[].class));
    }
}

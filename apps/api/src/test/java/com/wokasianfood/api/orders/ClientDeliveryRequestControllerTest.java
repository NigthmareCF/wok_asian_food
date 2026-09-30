package com.wokasianfood.api.orders;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import com.wokasianfood.api.identity.AuthException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.oauth2.jwt.Jwt;

@ExtendWith(MockitoExtension.class)
class ClientDeliveryRequestControllerTest {
    @Mock JdbcTemplate jdbc;

    @Test
    void pausedDeliveryServiceRejectsTheRequestBeforeProductLookupOrPersistence() {
        doReturn(List.of()).when(jdbc).query(contains("request_fingerprint"), any(RowMapper.class), any(Object[].class));
        doReturn(List.of("PAUSED")).when(jdbc).query(contains("code = 'DELIVERY'"), any(RowMapper.class));
        var controller = new ClientDeliveryRequestController(jdbc);
        UUID userId = UUID.randomUUID();
        var request = new ClientDeliveryRequestController.DeliveryRequest(Instant.now().plusSeconds(7200), null,
                "Zona 10, Ciudad de Guatemala", null, "+502 5555-1234",
                ClientDeliveryRequestController.PaymentPreference.CASH_ON_DELIVERY,
                List.of(new ClientDeliveryRequestController.RequestedItem(UUID.randomUUID(), 1)));

        AuthException error = assertThrows(AuthException.class, () -> controller.submit(
                jwt(userId), UUID.randomUUID(), request));

        assertEquals(503, error.status());
        verify(jdbc, never()).update(contains("order_request_items"), any(Object[].class));
        verify(jdbc, never()).query(contains("INSERT INTO wok.order_requests"), any(RowMapper.class), any(Object[].class));
    }

    @Test
    void deliveryRequestRevalidatesCatalogAndPersistsPendingRequestSnapshots() throws Exception {
        UUID requestId = UUID.randomUUID();
        UUID menuItemId = UUID.randomUUID();
        UUID currencyId = UUID.randomUUID();
        doReturn(List.of("MANUAL_APPROVAL")).when(jdbc).query(contains("code = 'DELIVERY'"), any(RowMapper.class));
        org.mockito.Mockito.doAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            @SuppressWarnings("unchecked") RowMapper<Object> mapper = invocation.getArgument(1);
            if (sql.contains("FROM wok.order_requests")) return List.of();
            ResultSet rs = org.mockito.Mockito.mock(ResultSet.class);
            if (sql.contains("FROM wok.menu_items")) {
                when(rs.getObject("id", UUID.class)).thenReturn(menuItemId);
                when(rs.getString("name")).thenReturn("Pad Thai");
                when(rs.getBigDecimal("price")).thenReturn(new BigDecimal("48.00"));
                when(rs.getObject("currency_id", UUID.class)).thenReturn(currencyId);
                when(rs.getString("currency_code")).thenReturn("GTQ");
                when(rs.getInt("estimated_preparation_seconds")).thenReturn(600);
            } else {
                when(rs.getObject(1, UUID.class)).thenReturn(requestId);
            }
            return List.of(mapper.mapRow(rs, 0));
        }).when(jdbc).query(org.mockito.ArgumentMatchers.anyString(), any(RowMapper.class), any(Object[].class));

        Instant requestedFor = Instant.now().plusSeconds(3600);
        var request = new ClientDeliveryRequestController.DeliveryRequest(requestedFor, "Sin cubiertos",
                "Zona 10, Ciudad de Guatemala", "Casa con portón negro", "+502 5555-1234",
                ClientDeliveryRequestController.PaymentPreference.ONLINE_PAYMENT_REQUESTED,
                List.of(new ClientDeliveryRequestController.RequestedItem(menuItemId, 2)));
        var receipt = new ClientDeliveryRequestController(jdbc).submit(jwt(UUID.randomUUID()), UUID.randomUUID(), request);

        assertEquals(requestId, receipt.requestId());
        assertEquals("DELIVERY", receipt.fulfillmentType());
        assertEquals("PENDING_REVIEW", receipt.status());
        assertEquals(new BigDecimal("96.00"), receipt.subtotal());
        assertEquals(ClientDeliveryRequestController.PaymentPreference.ONLINE_PAYMENT_REQUESTED, receipt.paymentPreference());
        verify(jdbc).update(contains("INSERT INTO wok.order_request_items"), any(Object[].class));
        verify(jdbc).update(contains("INSERT INTO wok.order_request_events"), org.mockito.ArgumentMatchers.eq(requestId), org.mockito.ArgumentMatchers.any());
    }

    private Jwt jwt(UUID userId) {
        return Jwt.withTokenValue("test").header("alg", "none").subject(userId.toString()).build();
    }
}

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
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import com.wokasianfood.api.catalog.ModifierSelectionService;
import com.wokasianfood.api.identity.AuthException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.oauth2.jwt.Jwt;

@ExtendWith(MockitoExtension.class)
class ClientDeliveryRequestControllerTest {
    @Mock JdbcTemplate jdbc;
    @Mock ModifierSelectionService modifiers;

    @BeforeEach
    void allowItemsWithoutConfiguredModifierGroups() {
        org.mockito.Mockito.lenient().when(modifiers.validate(org.mockito.ArgumentMatchers.any(UUID.class),
                org.mockito.ArgumentMatchers.anyList())).thenReturn(List.of());
    }

    @Test
    void requiresFiscalDataToBeCompleteWhenRequested() {
        var request = new ClientDeliveryRequestController.DeliveryRequest(Instant.now().plusSeconds(7200), null,
                "Zona 10, Ciudad de Guatemala", null, "+502 5555-1234",
                ClientDeliveryRequestController.PaymentPreference.CASH_ON_DELIVERY, true, "WOK Cliente", null,
                List.of(new ClientDeliveryRequestController.RequestedItem(UUID.randomUUID(), 1)));
        AuthException error = assertThrows(AuthException.class, () -> new ClientDeliveryRequestController(jdbc, modifiers)
                .submit(jwt(UUID.randomUUID()), UUID.randomUUID(), request));
        assertEquals(400, error.status());
        org.mockito.Mockito.verifyNoInteractions(jdbc);
    }

    @Test
    void deliveryDetailsAreScopedToTheAuthenticatedCustomerAndFulfillmentType() {
        UUID requestId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        doReturn(List.of()).when(jdbc).query(contains("r.customer_user_id = ? AND r.fulfillment_type = 'DELIVERY'"),
                any(RowMapper.class), org.mockito.ArgumentMatchers.eq(requestId), org.mockito.ArgumentMatchers.eq(customerId));
        var controller = new ClientDeliveryRequestController(jdbc, modifiers);

        AuthException error = assertThrows(AuthException.class, () -> controller.details(jwt(customerId), requestId));

        assertEquals(404, error.status());
        verify(jdbc).query(contains("r.customer_user_id = ? AND r.fulfillment_type = 'DELIVERY'"),
                any(RowMapper.class), org.mockito.ArgumentMatchers.eq(requestId), org.mockito.ArgumentMatchers.eq(customerId));
        verify(jdbc, never()).query(contains("FROM wok.order_request_items"), any(RowMapper.class), any(Object[].class));
    }

    @Test
    void customerCanReadOnlyTheSnapshotOfTheirDeliveryRequest() throws Exception {
        UUID requestId = UUID.randomUUID();
        UUID customerId = UUID.randomUUID();
        var requestedFor = Instant.now().plusSeconds(3600);
        org.mockito.Mockito.doAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            @SuppressWarnings("unchecked") RowMapper<Object> mapper = invocation.getArgument(1);
            ResultSet rs = org.mockito.Mockito.mock(ResultSet.class);
            if (sql.contains("order_request_item_modifiers")) return List.of();
            if (sql.contains("FROM wok.order_requests")) {
                when(rs.getObject("id", UUID.class)).thenReturn(requestId);
                when(rs.getString("status")).thenReturn("PENDING_REVIEW");
                when(rs.getTimestamp("requested_for")).thenReturn(Timestamp.from(requestedFor));
                when(rs.getBigDecimal("subtotal")).thenReturn(new BigDecimal("96.00"));
                when(rs.getString("currency_code")).thenReturn("GTQ");
                when(rs.getString("payment_preference")).thenReturn("CASH_ON_DELIVERY");
                when(rs.getString("customer_note")).thenReturn("Llamar al llegar");
            } else {
                when(rs.getString("name_snapshot")).thenReturn("Pad Thai");
                when(rs.getInt("quantity")).thenReturn(2);
                when(rs.getBigDecimal("unit_price")).thenReturn(new BigDecimal("48.00"));
                when(rs.getBigDecimal("line_total")).thenReturn(new BigDecimal("96.00"));
            }
            return List.of(mapper.mapRow(rs, 0));
        }).when(jdbc).query(org.mockito.ArgumentMatchers.anyString(), any(RowMapper.class), any(Object[].class));

        var details = new ClientDeliveryRequestController(jdbc, modifiers).details(jwt(customerId), requestId);

        assertEquals("PENDING_REVIEW", details.status());
        assertEquals(requestedFor, details.requestedFor());
        assertEquals("Llamar al llegar", details.customerNote());
        assertEquals(new BigDecimal("96.00"), details.items().getFirst().lineTotal());
        verify(jdbc).query(contains("r.customer_user_id = ? AND r.fulfillment_type = 'DELIVERY'"),
                any(RowMapper.class), org.mockito.ArgumentMatchers.eq(requestId), org.mockito.ArgumentMatchers.eq(customerId));
        verify(jdbc).query(contains("FROM wok.order_request_items"), any(RowMapper.class), org.mockito.ArgumentMatchers.eq(requestId));
    }

    @Test
    void pausedDeliveryServiceRejectsTheRequestBeforeProductLookupOrPersistence() {
        doReturn(List.of()).when(jdbc).query(contains("request_fingerprint"), any(RowMapper.class), any(Object[].class));
        doReturn(List.of("PAUSED")).when(jdbc).query(contains("code = 'DELIVERY'"), any(RowMapper.class));
        var controller = new ClientDeliveryRequestController(jdbc, modifiers);
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
            if (sql.contains("FROM wok.business_hours_overrides")) return List.of();
            ResultSet rs = org.mockito.Mockito.mock(ResultSet.class);
            if (sql.contains("FROM wok.business_hours")) {
                when(rs.getObject("opens_at", LocalTime.class)).thenReturn(LocalTime.MIDNIGHT);
                when(rs.getObject("closes_at", LocalTime.class)).thenReturn(LocalTime.of(23, 59));
                when(rs.getString("timezone_name")).thenReturn("America/Guatemala");
            } else if (sql.contains("FROM wok.menu_items")) {
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

        Instant requestedFor = LocalDate.now(ZoneId.of("America/Guatemala")).plusDays(1)
                .atTime(18, 0).atZone(ZoneId.of("America/Guatemala")).toInstant();
        var request = new ClientDeliveryRequestController.DeliveryRequest(requestedFor, "Sin cubiertos",
                "Zona 10, Ciudad de Guatemala", "Casa con portón negro", "+502 5555-1234",
                ClientDeliveryRequestController.PaymentPreference.TRANSFER_IN_ADVANCE,
                List.of(new ClientDeliveryRequestController.RequestedItem(menuItemId, 2)));
        var receipt = new ClientDeliveryRequestController(jdbc, modifiers).submit(jwt(UUID.randomUUID()), UUID.randomUUID(), request);

        assertEquals(requestId, receipt.requestId());
        assertEquals("DELIVERY", receipt.fulfillmentType());
        assertEquals("PENDING_REVIEW", receipt.status());
        assertEquals(new BigDecimal("96.00"), receipt.subtotal());
        assertEquals(ClientDeliveryRequestController.PaymentPreference.TRANSFER_IN_ADVANCE, receipt.paymentPreference());
        verify(jdbc).query(contains("INSERT INTO wok.order_request_items"), any(RowMapper.class), any(Object[].class));
        verify(jdbc).update(contains("INSERT INTO wok.order_request_events"), org.mockito.ArgumentMatchers.eq(requestId), org.mockito.ArgumentMatchers.any());
    }

    private Jwt jwt(UUID userId) {
        return Jwt.withTokenValue("test").header("alg", "none").subject(userId.toString()).build();
    }
}

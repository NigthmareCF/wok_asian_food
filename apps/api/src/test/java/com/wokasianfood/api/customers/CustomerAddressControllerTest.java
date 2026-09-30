package com.wokasianfood.api.customers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class CustomerAddressControllerTest {
    @Mock JdbcTemplate jdbc;

    @Test
    void customerCannotDeleteAnAddressOutsideTheirOwnership() {
        doReturn(0).when(jdbc).update(contains("DELETE FROM wok.customer_addresses"), any(Object[].class));
        var controller = new CustomerAddressController(jdbc);

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> controller.delete(jwt(UUID.randomUUID()), UUID.randomUUID()));

        assertEquals(HttpStatus.NOT_FOUND, error.getStatusCode());
        verify(jdbc).update(contains("customer_user_id = ?"), any(Object[].class));
    }

    @Test
    void staleAddressVersionDoesNotOverwriteTheCurrentValue() {
        doReturn(List.of(2)).when(jdbc).query(contains("row_version"), any(RowMapper.class), any(Object[].class));
        var controller = new CustomerAddressController(jdbc);
        var update = new CustomerAddressController.AddressUpdate("Casa", "Zona 10, Ciudad de Guatemala",
                null, "+502 5555-1234", true, 1);

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> controller.update(jwt(UUID.randomUUID()), UUID.randomUUID(), update));

        assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
        verify(jdbc, never()).update(contains("SET label ="), any(Object[].class));
    }

    private Jwt jwt(UUID userId) {
        return Jwt.withTokenValue("test").header("alg", "none").subject(userId.toString()).build();
    }
}

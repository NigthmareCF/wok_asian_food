package com.wokasianfood.api.messaging;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.sql.ResultSet;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class CustomerMessagingServiceTest {
    @Mock JdbcTemplate jdbc;

    @Test
    void hidesConversationWhenCustomerDoesNotOwnIt() {
        doAnswer(invocation -> List.of()).when(jdbc).query(anyString(), any(RowMapper.class), any(Object[].class));
        var service = new CustomerMessagingService(jdbc);

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> service.messagesForCustomer(UUID.randomUUID(), UUID.randomUUID()));

        assertEquals(HttpStatus.NOT_FOUND, error.getStatusCode());
        verify(jdbc).query(contains("cp.user_id = ?"), any(RowMapper.class), any(Object[].class));
    }

    @Test
    void closedConversationRejectsANewMessage() throws Exception {
        UUID conversationId = UUID.randomUUID();
        doAnswer(invocation -> {
            @SuppressWarnings("unchecked") RowMapper<Object> mapper = invocation.getArgument(1);
            ResultSet rs = mock(ResultSet.class);
            org.mockito.Mockito.when(rs.getString("status")).thenReturn("CLOSED");
            return List.of(mapper.mapRow(rs, 0));
        }).when(jdbc).query(contains("FOR UPDATE"), any(RowMapper.class), any(Object[].class));
        doAnswer(invocation -> List.of()).when(jdbc).query(contains("idempotency_key = ?"), any(RowMapper.class), any(Object[].class));
        var service = new CustomerMessagingService(jdbc);

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> service.sendFromHuman(UUID.randomUUID(), conversationId, UUID.randomUUID(), "Hola"));

        assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
    }
}

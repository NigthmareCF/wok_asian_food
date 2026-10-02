package com.wokasianfood.api.orders;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

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
import org.springframework.security.oauth2.jwt.Jwt;

@ExtendWith(MockitoExtension.class)
class OperationalOrderRequestControllerTest {
    @Mock JdbcTemplate jdbc;

    @Test
    void rejectionLocksRequestAndWritesDecisionEvent() {
        UUID requestId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Instant decidedAt = Instant.parse("2026-10-02T16:00:00Z");
        doReturn(List.of(new OperationalOrderRequestController.DecisionState("PENDING_REVIEW", null, null, null)))
                .when(jdbc).query(contains("FOR UPDATE"), any(RowMapper.class), any(Object[].class));
        doReturn(List.of(decidedAt)).when(jdbc).query(contains("RETURNING decided_at"),
                any(RowMapper.class), any(Object[].class));
        doReturn(1).when(jdbc).update(contains("INSERT INTO wok.order_request_events"), any(Object[].class));

        var result = new OperationalOrderRequestController(jdbc).reject(jwt(actorId), requestId,
                new OperationalOrderRequestController.DecisionRequest("  Fuera de horario  "));

        assertEquals("REJECTED", result.status());
        assertEquals(actorId, result.actorUserId());
        assertEquals("Fuera de horario", result.reason());
        assertEquals(decidedAt, result.decidedAt());
        assertTrue(!result.idempotentReplay());
        verify(jdbc).update(contains("event_type, actor_user_id, reason"), any(Object[].class));
    }

    @Test
    void repeatedSameRejectionIsIdempotentAndDoesNotWriteDuplicateEvent() {
        UUID requestId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Instant decidedAt = Instant.parse("2026-10-02T16:00:00Z");
        doReturn(List.of(new OperationalOrderRequestController.DecisionState("REJECTED", actorId, "Fuera de horario", decidedAt)))
                .when(jdbc).query(contains("FOR UPDATE"), any(RowMapper.class), any(Object[].class));

        var result = new OperationalOrderRequestController(jdbc).reject(jwt(actorId), requestId,
                new OperationalOrderRequestController.DecisionRequest("Fuera de horario"));

        assertEquals("REJECTED", result.status());
        assertTrue(result.idempotentReplay());
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void alreadyProcessedRequestCannotBeRejectedAgainWithAnotherDecision() {
        UUID requestId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        doReturn(List.of(new OperationalOrderRequestController.DecisionState("CANCELLED", actorId, "CANCELLED_BY_CLIENT", Instant.now())))
                .when(jdbc).query(contains("FOR UPDATE"), any(RowMapper.class), any(Object[].class));

        AuthException error = assertThrows(AuthException.class, () -> new OperationalOrderRequestController(jdbc)
                .reject(jwt(actorId), requestId, new OperationalOrderRequestController.DecisionRequest("No disponible")));

        assertEquals(409, error.status());
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void missingRequestDoesNotWriteARejection() {
        doReturn(List.of()).when(jdbc).query(contains("FOR UPDATE"), any(RowMapper.class), any(Object[].class));

        AuthException error = assertThrows(AuthException.class, () -> new OperationalOrderRequestController(jdbc)
                .reject(jwt(UUID.randomUUID()), UUID.randomUUID(),
                        new OperationalOrderRequestController.DecisionRequest("No disponible")));

        assertEquals(404, error.status());
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void rejectionReasonMustRemainValidAfterTrimming() {
        AuthException error = assertThrows(AuthException.class, () -> new OperationalOrderRequestController(jdbc)
                .reject(jwt(UUID.randomUUID()), UUID.randomUUID(),
                        new OperationalOrderRequestController.DecisionRequest("  no  ")));

        assertEquals(400, error.status());
        verify(jdbc, never()).query(anyString(), any(RowMapper.class), any(Object[].class));
    }

    private Jwt jwt(UUID userId) {
        return Jwt.withTokenValue("test").header("alg", "none").subject(userId.toString()).build();
    }
}

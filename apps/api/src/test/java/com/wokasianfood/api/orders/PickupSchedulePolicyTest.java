package com.wokasianfood.api.orders;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;

import com.wokasianfood.api.identity.AuthException;
import java.sql.ResultSet;
import java.sql.Time;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class PickupSchedulePolicyTest {
    private static final Instant NOW = Instant.parse("2026-10-04T18:00:00Z");

    @Test
    void acceptsAPreparationSafeTimeInsideBusinessHours() throws Exception {
        PickupSchedulePolicy policy = policyWithHours();
        assertDoesNotThrow(() -> policy.validate(NOW.plusSeconds(4 * 60 * 60), 20 * 60));
    }

    @Test
    void rejectsRequestsBeforeOpeningTime() throws Exception {
        AuthException error = assertThrows(AuthException.class,
                () -> policyWithHours().validate(NOW.plusSeconds(60 * 60), 60));
        assertEquals(422, error.status());
    }

    @Test
    void rejectsRequestsOutsideBusinessHours() {
        JdbcTemplate jdbc = org.mockito.Mockito.mock(JdbcTemplate.class);
        doAnswer(invocation -> List.of()).when(jdbc)
                .query(anyString(), any(RowMapper.class), any(Object[].class));
        AuthException error = assertThrows(AuthException.class,
                () -> new PickupSchedulePolicy(jdbc, Clock.fixed(NOW, ZoneOffset.UTC))
                        .validate(NOW.plusSeconds(60 * 60), 60));
        assertEquals(422, error.status());
    }

    private PickupSchedulePolicy policyWithHours() throws Exception {
        JdbcTemplate jdbc = org.mockito.Mockito.mock(JdbcTemplate.class);
        doAnswer(invocation -> {
            @SuppressWarnings("unchecked") RowMapper<Object> mapper = invocation.getArgument(1);
            ResultSet rs = org.mockito.Mockito.mock(ResultSet.class);
            org.mockito.Mockito.when(rs.getTime("opens_at")).thenReturn(Time.valueOf("14:00:00"));
            org.mockito.Mockito.when(rs.getTime("closes_at")).thenReturn(Time.valueOf("22:00:00"));
            org.mockito.Mockito.when(rs.getString("timezone_name")).thenReturn("America/Guatemala");
            return List.of(mapper.mapRow(rs, 0));
        }).when(jdbc).query(anyString(), any(RowMapper.class), any(Object[].class));
        return new PickupSchedulePolicy(jdbc, Clock.fixed(NOW, ZoneOffset.UTC));
    }
}

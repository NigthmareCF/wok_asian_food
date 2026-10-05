package com.wokasianfood.api.reservations;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class ReservationHistoryQueryTest {
    @Test
    void historyIsScopedToTheAuthenticatedUserAndHasABoundedResult() {
        CapturingJdbcTemplate jdbc = new CapturingJdbcTemplate();
        ReservationRequestService service = new ReservationRequestService(jdbc, null, null, null);
        UUID userId = UUID.fromString("11111111-1111-4111-8111-111111111111");

        assertThat(service.history(userId)).isEmpty();

        assertThat(jdbc.sql).contains("WHERE e.requester_user_id = ?").contains("LIMIT 50");
        assertThat(jdbc.arguments).containsExactly(userId);
    }

    private static final class CapturingJdbcTemplate extends JdbcTemplate {
        private String sql;
        private Object[] arguments;

        @Override
        public <T> List<T> query(String sql, RowMapper<T> rowMapper, Object... arguments) {
            this.sql = sql;
            this.arguments = arguments;
            return List.of();
        }
    }
}

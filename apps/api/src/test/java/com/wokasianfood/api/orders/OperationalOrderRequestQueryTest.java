package com.wokasianfood.api.orders;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import com.wokasianfood.api.identity.AuthException;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

@ExtendWith(MockitoExtension.class)
class OperationalOrderRequestQueryTest {
    @Mock JdbcTemplate jdbc;

    @Test
    void combinesFiltersAsBoundParametersAndLimitsTheQueue() {
        new OperationalOrderRequestQuery(jdbc).list("PENDING_REVIEW", "DELIVERY");
        verify(jdbc).query(contains("LIMIT 50"), any(RowMapper.class),
                eq("PENDING_REVIEW"), eq("PENDING_REVIEW"), eq("DELIVERY"), eq("DELIVERY"));
    }

    @Test
    void rejectsInvalidOrEmptyFiltersWithoutReadingTheDatabase() {
        var query = new OperationalOrderRequestQuery(jdbc);
        for (String invalid : new String[] { "", "pending_review", "INVALID", "PICKUP' OR 1=1" }) {
            assertThatThrownBy(() -> query.list(invalid, null)).isInstanceOf(AuthException.class);
            assertThatThrownBy(() -> query.list(null, invalid)).isInstanceOf(AuthException.class);
        }
        verifyNoInteractions(jdbc);
    }

    @Test
    void missingDetailsDoNotDependOnQueueMembership() {
        assertThatThrownBy(() -> new OperationalOrderRequestQuery(jdbc).details(UUID.randomUUID()))
                .isInstanceOf(AuthException.class).hasMessage("No encontramos esa solicitud.");
    }
}

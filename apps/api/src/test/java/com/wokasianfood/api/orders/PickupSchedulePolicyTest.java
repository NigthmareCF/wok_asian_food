package com.wokasianfood.api.orders;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.service.ServiceHoursPolicy;
import java.sql.ResultSet;
import java.sql.Time;
import java.time.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
class PickupSchedulePolicyTest {
    private static final Instant NOW=Instant.parse("2026-10-05T02:00:00Z");
    private JdbcTemplate jdbc(boolean open)throws Exception{
        JdbcTemplate jdbc=mock(JdbcTemplate.class);
        doReturn(new ServiceHoursPolicy.Policy(1,12,LocalTime.of(21,15),LocalTime.of(20,0),LocalTime.of(21,30),LocalTime.of(21,20)))
            .when(jdbc).queryForObject(contains("FROM wok.service_policy"),any(RowMapper.class));
        doAnswer(inv->{if(!open)return List.of();ResultSet rs=mock(ResultSet.class);when(rs.getTime(1)).thenReturn(Time.valueOf("14:00:00"));when(rs.getTime(2)).thenReturn(Time.valueOf("22:00:00"));return List.of(((RowMapper<?>)inv.getArgument(1)).mapRow(rs,0));})
            .when(jdbc).query(anyString(),any(RowMapper.class),any(Object[].class));return jdbc;
    }
    @Test void acceptsEtaSafeTime()throws Exception{assertDoesNotThrow(()->new PickupSchedulePolicy(jdbc(true),Clock.fixed(NOW,ZoneOffset.UTC)).validate(NOW.plusSeconds(3600),1200));}
    @Test void noThreeHourMaximum()throws Exception{assertDoesNotThrow(()->new PickupSchedulePolicy(jdbc(true),Clock.fixed(NOW,ZoneOffset.UTC)).validate(NOW.plusSeconds(22*3600),60));}
    @Test void rejectsPickupAfter2130()throws Exception{assertEquals(422,assertThrows(AuthException.class,()->new PickupSchedulePolicy(jdbc(true),Clock.fixed(NOW,ZoneOffset.UTC)).validate(NOW.plusSeconds(91*60),60)).status());}
    @Test void outsideHoursRequiresReviewRatherThanFabricatingOpenService()throws Exception{assertTrue(new ServiceHoursPolicy(jdbc(false)).assess("PICKUP",NOW.plusSeconds(3600),NOW,60).requiresHumanReview());}
    @Test void preparationAfter2120RequiresReview()throws Exception{assertTrue(new ServiceHoursPolicy(jdbc(true)).assess("PICKUP",NOW.plusSeconds(90*60),NOW.plusSeconds(81*60),0).requiresHumanReview());}
}

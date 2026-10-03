package com.wokasianfood.api.tables;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

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
class TableServiceTest {
    @Mock JdbcTemplate jdbc;

    private static final String SELECT_TABLE = "FROM wok.dining_tables t";

    @Test
    void openingFreeTableCreatesAccountAndMarksItOccupied() {
        UUID actor = UUID.randomUUID();
        UUID tableId = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        when(jdbc.query(contains("NULL::UUID AS account_id"), any(RowMapper.class), eq(tableId)))
                .thenReturn(List.of(view(tableId, "FREE", 1)));
        when(jdbc.queryForObject(contains("count(*) + 1"), eq(Integer.class), eq(tableId))).thenReturn(1);
        when(jdbc.update(contains("INSERT INTO wok.order_accounts"), any(Object[].class))).thenReturn(1);
        when(jdbc.update(contains("SET current_status = ?"), eq("OCCUPIED"), eq(actor), eq(tableId), eq("FREE")))
                .thenReturn(1);
        when(jdbc.update(contains("dining_table_status_history"), any(Object[].class))).thenReturn(1);
        when(jdbc.update(contains("audit_logs"), any(Object[].class))).thenReturn(1);
        when(jdbc.query(contains("account.id AS account_id"), any(RowMapper.class), eq(tableId)))
                .thenReturn(List.of(view(tableId, "OCCUPIED", 2)));

        var result = new TableService(jdbc).open(actor, requestId, tableId);

        assertEquals("OCCUPIED", result.status());
        assertEquals(2, result.rowVersion());
        verify(jdbc).update(contains("INSERT INTO wok.order_accounts"), any(UUID.class), eq(tableId),
                eq("Cuenta 1"), eq(actor), eq(actor), eq(actor));
        verify(jdbc).update(contains("dining_table_status_history"), eq(tableId), eq("FREE"), eq("OCCUPIED"),
                eq(actor), eq(requestId));
        verify(jdbc).update(contains("audit_logs"), eq(actor), eq("TABLE_OPENED"), eq(tableId), eq("FREE"),
                eq("OCCUPIED"), eq(requestId));
    }

    @Test
    void rejectsOpeningTableThatIsNotFree() {
        UUID actor = UUID.randomUUID();
        UUID tableId = UUID.randomUUID();
        when(jdbc.query(contains("NULL::UUID AS account_id"), any(RowMapper.class), eq(tableId)))
                .thenReturn(List.of(view(tableId, "OCCUPIED", 4)));

        AuthException error = assertThrows(AuthException.class, () -> new TableService(jdbc).open(actor, UUID.randomUUID(), tableId));

        assertEquals(409, error.status());
        verify(jdbc, never()).update(contains("SET current_status = ?"), any(Object[].class));
    }

    @Test
    void rejectsMissingTable() {
        UUID tableId = UUID.randomUUID();
        when(jdbc.query(contains("NULL::UUID AS account_id"), any(RowMapper.class), eq(tableId))).thenReturn(List.of());

        AuthException error = assertThrows(AuthException.class, () -> new TableService(jdbc).close(UUID.randomUUID(), UUID.randomUUID(), tableId));

        assertEquals(404, error.status());
    }

    @Test
    void refusesToCloseTableWhileOrdersAreStillOpen() {
        UUID actor = UUID.randomUUID();
        UUID tableId = UUID.randomUUID();
        when(jdbc.query(contains("NULL::UUID AS account_id"), any(RowMapper.class), eq(tableId)))
                .thenReturn(List.of(view(tableId, "OCCUPIED", 3)));
        when(jdbc.queryForObject(contains("FROM wok.orders"), eq(Integer.class), eq(tableId))).thenReturn(2);

        AuthException error = assertThrows(AuthException.class, () -> new TableService(jdbc).close(actor, UUID.randomUUID(), tableId));

        assertEquals(409, error.status());
        verify(jdbc, never()).update(contains("UPDATE wok.order_accounts"), any(Object[].class));
    }

    @Test
    void closingTableEndsOpenAccountsAndMovesTableToCleaning() {
        UUID actor = UUID.randomUUID();
        UUID tableId = UUID.randomUUID();
        UUID accountId = UUID.randomUUID();
        when(jdbc.query(contains("NULL::UUID AS account_id"), any(RowMapper.class), eq(tableId)))
                .thenReturn(List.of(view(tableId, "OCCUPIED", 5)));
        when(jdbc.queryForObject(contains("FROM wok.orders"), eq(Integer.class), eq(tableId))).thenReturn(0);
        when(jdbc.query(contains("SELECT id FROM wok.order_accounts"), any(RowMapper.class), eq(tableId)))
                .thenReturn(List.of(accountId));
        when(jdbc.update(contains("UPDATE wok.order_accounts"), any(Object[].class))).thenReturn(1);
        when(jdbc.update(contains("SET current_status = ?"), eq("CLEANING"), eq(actor), eq(tableId), eq("OCCUPIED")))
                .thenReturn(1);
        when(jdbc.update(contains("dining_table_status_history"), any(Object[].class))).thenReturn(1);
        when(jdbc.update(contains("audit_logs"), any(Object[].class))).thenReturn(1);
        when(jdbc.query(contains("account.id AS account_id"), any(RowMapper.class), eq(tableId)))
                .thenReturn(List.of(view(tableId, "CLEANING", 6)));

        var result = new TableService(jdbc).close(actor, UUID.randomUUID(), tableId);

        assertEquals("CLEANING", result.status());
        verify(jdbc).update(contains("UPDATE wok.order_accounts"), eq(actor), eq(accountId));
        verify(jdbc).update(contains("dining_table_status_history"), eq(tableId), eq("OCCUPIED"), eq("CLEANING"),
                eq(actor), any(UUID.class));
    }

    @Test
    void reportsConcurrentTableChangeAsConflict() {
        UUID actor = UUID.randomUUID();
        UUID tableId = UUID.randomUUID();
        when(jdbc.query(contains("NULL::UUID AS account_id"), any(RowMapper.class), eq(tableId)))
                .thenReturn(List.of(view(tableId, "FREE", 1)));
        when(jdbc.queryForObject(contains("count(*) + 1"), eq(Integer.class), eq(tableId))).thenReturn(1);
        when(jdbc.update(contains("INSERT INTO wok.order_accounts"), any(Object[].class))).thenReturn(1);
        when(jdbc.update(contains("SET current_status = ?"), eq("OCCUPIED"), eq(actor), eq(tableId), eq("FREE")))
                .thenReturn(0);

        AuthException error = assertThrows(AuthException.class, () -> new TableService(jdbc).open(actor, UUID.randomUUID(), tableId));

        assertEquals(409, error.status());
    }

    @Test
    void rejectsDuplicateTableName() {
        UUID actor = UUID.randomUUID();
        when(jdbc.query(contains("ON CONFLICT (name) DO NOTHING"), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());

        AuthException error = assertThrows(AuthException.class,
                () -> new TableService(jdbc).create(actor, UUID.randomUUID(), "Mesa 01", 4, "PRINCIPAL"));

        assertEquals(409, error.status());
        verify(jdbc, never()).update(contains("audit_logs"), any(Object[].class));
    }

    @Test
    void listPassesNormalizedFiltersToDatabase() {
        when(jdbc.query(contains(SELECT_TABLE), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of(view(UUID.randomUUID(), "FREE", 1)));

        var rows = new TableService(jdbc).list("FREE", "TERRAZA", true);

        assertEquals(1, rows.size());
        verify(jdbc).query(contains(SELECT_TABLE), any(RowMapper.class),
                eq("FREE"), eq("FREE"), eq("TERRAZA"), eq("TERRAZA"), eq(true), eq(true));
    }

    private TableService.TableView view(UUID id, String status, int rowVersion) {
        return new TableService.TableView(id, "Mesa 01", 4, "PRINCIPAL", true, status, rowVersion,
                Instant.parse("2026-09-30T12:00:00Z"), null, null, null);
    }
}

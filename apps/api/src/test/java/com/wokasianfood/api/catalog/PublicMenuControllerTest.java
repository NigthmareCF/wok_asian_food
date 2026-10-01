package com.wokasianfood.api.catalog;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;

@ExtendWith(MockitoExtension.class)
class PublicMenuControllerTest {
    @Mock JdbcTemplate jdbc;

    @Test
    void returnsOnlyRowsAllowedByThePublicMenuQuery() throws Exception {
        UUID categoryId = UUID.randomUUID();
        UUID menuItemId = UUID.randomUUID();
        doAnswer(invocation -> {
            RowCallbackHandler handler = invocation.getArgument(1);
            ResultSet rs = mock(ResultSet.class);
            when(rs.getObject("category_id", UUID.class)).thenReturn(categoryId);
            when(rs.getString("category_name")).thenReturn("Platos principales");
            when(rs.getInt("category_order")).thenReturn(2);
            when(rs.getObject("menu_item_id", UUID.class)).thenReturn(menuItemId);
            when(rs.getString("menu_item_name")).thenReturn("Pad Thai");
            when(rs.getString("menu_item_description")).thenReturn("Fideos salteados");
            when(rs.getBigDecimal("price")).thenReturn(new BigDecimal("58.00"));
            when(rs.getString("currency_code")).thenReturn("GTQ");
            when(rs.getString("image_reference")).thenReturn(null);
            when(rs.getInt("estimated_preparation_seconds")).thenReturn(900);
            when(rs.getInt("menu_item_order")).thenReturn(1);
            handler.processRow(rs);
            return null;
        }).when(jdbc).query(anyString(), any(RowCallbackHandler.class));

        var response = new PublicMenuController(jdbc).readMenu();

        assertEquals(1, response.categories().size());
        assertEquals("Platos principales", response.categories().getFirst().name());
        assertEquals(new BigDecimal("58.00"), response.categories().getFirst().items().getFirst().price());
        assertEquals("GTQ", response.categories().getFirst().items().getFirst().currency());
        assertNotNull(response.asOf());
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc).query(sql.capture(), any(RowCallbackHandler.class));
        assertTrue(sql.getValue().contains("m.status = 'ACTIVE'"));
        assertTrue(sql.getValue().contains("m.visibility = 'PUBLIC'"));
        assertTrue(sql.getValue().contains("i.active = true"));
    }

    @Test
    void emptyDatabaseReturnsAnEmptyMenuWithoutInventedProducts() {
        doNothing().when(jdbc).query(anyString(), any(RowCallbackHandler.class));

        var response = new PublicMenuController(jdbc).readMenu();

        assertTrue(response.categories().isEmpty());
        assertNotNull(response.asOf());
    }
}

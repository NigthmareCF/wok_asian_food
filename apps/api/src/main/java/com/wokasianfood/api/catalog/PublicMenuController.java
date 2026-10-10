package com.wokasianfood.api.catalog;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Public read-only menu. Availability and checkout totals remain separate backend decisions. */
@RestController
@RequestMapping("/api/v1/public/menu")
public class PublicMenuController {
    private final JdbcTemplate jdbc;

    public PublicMenuController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    public MenuResponse readMenu() {
        Map<UUID, CategoryBuilder> categories = new LinkedHashMap<>();
        jdbc.query("""
            SELECT c.id AS category_id, c.name AS category_name, c.display_order AS category_order,
                   m.id AS menu_item_id, m.name AS menu_item_name, m.description AS menu_item_description,
                   m.price, currency.code AS currency_code, m.image_reference,
                   m.estimated_preparation_seconds, m.display_order AS menu_item_order
            FROM wok.menu_categories c
            LEFT JOIN wok.menu_items m ON m.category_id = c.id
                AND m.status = 'ACTIVE' AND m.visibility = 'PUBLIC'
            LEFT JOIN wok.items i ON i.id = m.item_id AND i.active = true
            LEFT JOIN wok.currencies currency ON currency.id = m.currency_id
            WHERE c.active = true AND (m.id IS NULL OR i.id IS NOT NULL)
            ORDER BY c.display_order, c.name, m.display_order, m.name, m.id
            """, (RowCallbackHandler) rs -> appendRow(categories, rs));

        List<Category> result = categories.values().stream().map(CategoryBuilder::build).toList();
        return new MenuResponse(result, Instant.now());
    }

    private void appendRow(Map<UUID, CategoryBuilder> categories, ResultSet rs) throws SQLException {
        UUID categoryId = rs.getObject("category_id", UUID.class);
        CategoryBuilder category = categories.computeIfAbsent(categoryId,
                ignored -> new CategoryBuilder(categoryId, value(rs, "category_name"), rsInt(rs, "category_order")));
        UUID menuItemId = rs.getObject("menu_item_id", UUID.class);
        if (menuItemId == null) return;
        category.items.add(new MenuItem(menuItemId, value(rs, "menu_item_name"),
                rs.getString("menu_item_description"), rs.getBigDecimal("price"),
                value(rs, "currency_code"), MenuPhotoCatalog.reference(
                        rs.getString("image_reference"), value(rs, "menu_item_name")),
                rsInt(rs, "estimated_preparation_seconds"), rsInt(rs, "menu_item_order")));
    }

    private static String value(ResultSet rs, String column) {
        try { return rs.getString(column); }
        catch (SQLException error) { throw new IllegalStateException("Unable to read public menu", error); }
    }

    private static int rsInt(ResultSet rs, String column) {
        try { return rs.getInt(column); }
        catch (SQLException error) { throw new IllegalStateException("Unable to read public menu", error); }
    }

    private static final class CategoryBuilder {
        private final UUID id;
        private final String name;
        private final int displayOrder;
        private final List<MenuItem> items = new ArrayList<>();
        private CategoryBuilder(UUID id, String name, int displayOrder) {
            this.id = id; this.name = name; this.displayOrder = displayOrder;
        }
        private Category build() { return new Category(id, name, displayOrder, List.copyOf(items)); }
    }

    public record MenuResponse(List<Category> categories, Instant asOf) {}
    public record Category(UUID id, String name, int displayOrder, List<MenuItem> items) {}
    public record MenuItem(UUID id, String name, String description, BigDecimal price, String currency,
                           String imageReference, int estimatedPreparationSeconds, int displayOrder) {}
}

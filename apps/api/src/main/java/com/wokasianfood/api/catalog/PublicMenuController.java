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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

/** Public read-only menu. Availability and checkout totals remain separate backend decisions. */
@RestController
@RequestMapping("/api/v1/public/menu")
public class PublicMenuController {
    private final JdbcTemplate jdbc;
    private final ModifierSelectionService modifiers;

    @Autowired
    public PublicMenuController(JdbcTemplate jdbc, ModifierSelectionService modifiers) {
        this.jdbc = jdbc;
        this.modifiers = modifiers;
    }

    PublicMenuController(JdbcTemplate jdbc) { this(jdbc, new ModifierSelectionService(jdbc)); }

    @GetMapping
    public MenuResponse readMenu() {
        Map<UUID, CategoryBuilder> categories = new LinkedHashMap<>();
        jdbc.query("""
            SELECT c.id AS category_id, c.name AS category_name, c.display_order AS category_order,
                   m.id AS menu_item_id, m.name AS menu_item_name, m.description AS menu_item_description,
                   m.price, currency.code AS currency_code, m.image_reference, m.slug, m.age_restricted,
                   m.estimated_preparation_seconds, m.display_order AS menu_item_order
            FROM wok.menu_categories c
            LEFT JOIN wok.menu_items m ON m.category_id = c.id
                AND m.status = 'ACTIVE' AND m.visibility = 'PUBLIC'
            LEFT JOIN wok.items i ON i.id = m.item_id AND i.active = true
            LEFT JOIN wok.currencies currency ON currency.id = m.currency_id
            WHERE c.active = true AND (m.id IS NULL OR i.id IS NOT NULL)
            ORDER BY c.display_order, c.name, m.display_order, m.name, m.id
            """, (RowCallbackHandler) rs -> appendRow(categories, rs));

        List<UUID> menuItemIds = categories.values().stream().flatMap(category -> category.items.keySet().stream()).toList();
        Map<UUID, List<ModifierSelectionService.ModifierGroup>> groups = modifiers.groupsForMenuItems(menuItemIds);
        List<Category> result = categories.values().stream().map(category -> category.build(groups)).toList();
        return new MenuResponse(result, Instant.now());
    }

    @GetMapping("/products/{idOrSlug}")
    public MenuItem readProduct(@PathVariable String idOrSlug) {
        return readMenu().categories().stream().flatMap(category -> category.items().stream())
                .filter(item -> item.id().toString().equalsIgnoreCase(idOrSlug)
                        || (item.slug() != null && item.slug().equals(idOrSlug)))
                .findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "No encontramos un producto publicado con ese identificador."));
    }

    private void appendRow(Map<UUID, CategoryBuilder> categories, ResultSet rs) throws SQLException {
        UUID categoryId = rs.getObject("category_id", UUID.class);
        CategoryBuilder category = categories.computeIfAbsent(categoryId,
                ignored -> new CategoryBuilder(categoryId, value(rs, "category_name"), rsInt(rs, "category_order")));
        UUID menuItemId = rs.getObject("menu_item_id", UUID.class);
        if (menuItemId == null) return;
        category.items.computeIfAbsent(menuItemId, ignored -> new MenuItemBuilder(menuItemId,
                value(rs, "menu_item_name"), rsString(rs, "menu_item_description"), rsDecimal(rs, "price"),
                value(rs, "currency_code"), rsString(rs, "image_reference"), rsString(rs, "slug"),
                rsBoolean(rs, "age_restricted"),
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

    private static String rsString(ResultSet rs, String column) {
        try { return rs.getString(column); }
        catch (SQLException error) { throw new IllegalStateException("Unable to read public menu", error); }
    }

    private static BigDecimal rsDecimal(ResultSet rs, String column) {
        try { return rs.getBigDecimal(column); }
        catch (SQLException error) { throw new IllegalStateException("Unable to read public menu", error); }
    }

    private static boolean rsBoolean(ResultSet rs, String column) {
        try { return rs.getBoolean(column); }
        catch (SQLException error) { throw new IllegalStateException("Unable to read public menu", error); }
    }

    private static final class CategoryBuilder {
        private final UUID id;
        private final String name;
        private final int displayOrder;
        private final Map<UUID, MenuItemBuilder> items = new LinkedHashMap<>();
        private CategoryBuilder(UUID id, String name, int displayOrder) {
            this.id = id; this.name = name; this.displayOrder = displayOrder;
        }
        private Category build(Map<UUID, List<ModifierSelectionService.ModifierGroup>> groups) {
            return new Category(id, name, displayOrder, items.values()
                    .stream().map(item -> item.build(groups.getOrDefault(item.id, List.of()))).toList());
        }
    }

    private static final class MenuItemBuilder {
        private final UUID id;
        private final String name;
        private final String description;
        private final BigDecimal price;
        private final String currency;
        private final String imageReference;
        private final String slug;
        private final boolean ageRestricted;
        private final int estimatedPreparationSeconds;
        private final int displayOrder;

        private MenuItemBuilder(UUID id, String name, String description, BigDecimal price, String currency,
                                String imageReference, String slug, boolean ageRestricted,
                                int estimatedPreparationSeconds, int displayOrder) {
            this.id = id; this.name = name; this.description = description; this.price = price;
            this.currency = currency; this.imageReference = imageReference; this.slug = slug;
            this.ageRestricted = ageRestricted;
            this.estimatedPreparationSeconds = estimatedPreparationSeconds; this.displayOrder = displayOrder;
        }

        private MenuItem build(List<ModifierSelectionService.ModifierGroup> groups) {
            return new MenuItem(id, name, description, price, currency, imageReference, slug, ageRestricted,
                    estimatedPreparationSeconds, displayOrder, groups);
        }
    }

    public record MenuResponse(List<Category> categories, Instant asOf) {}
    public record Category(UUID id, String name, int displayOrder, List<MenuItem> items) {}
    public record MenuItem(UUID id, String name, String description, BigDecimal price, String currency,
                           String imageReference, String slug, boolean ageRestricted,
                           int estimatedPreparationSeconds, int displayOrder,
                           List<ModifierSelectionService.ModifierGroup> modifierGroups) {}
}

package com.wokasianfood.api.catalog;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.transaction.annotation.Transactional;

@RestController
@RequestMapping("/api/v1/admin/catalog/menu-items")
@PreAuthorize("hasAuthority('catalog:manage')")
public class AdminCatalogController {
    private final JdbcTemplate jdbc;

    public AdminCatalogController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @GetMapping
    public List<AdminMenuItem> list() {
        return jdbc.query("""
            SELECT mi.id, mi.item_id, mi.category_id, mi.preparation_area_id, mi.slug, mi.age_restricted, mi.recipe_status, c.name AS category_name, mi.name, mi.description,
                   mi.price, currency.code AS currency, mi.image_reference, mi.visibility, mi.status,
                   mi.display_order, mi.estimated_preparation_seconds, mi.row_version, mi.updated_at,
                   i.active AS inventory_item_active, area.active AS preparation_area_active
            FROM wok.menu_items mi
            JOIN wok.menu_categories c ON c.id = mi.category_id
            JOIN wok.items i ON i.id = mi.item_id
            JOIN wok.preparation_areas area ON area.id = mi.preparation_area_id
            JOIN wok.currencies currency ON currency.id = mi.currency_id
            ORDER BY c.display_order, c.name, mi.display_order, mi.name, mi.id
            """, (rs, row) -> new AdminMenuItem(rs.getObject("id", UUID.class),
                rs.getObject("item_id", UUID.class), rs.getObject("category_id", UUID.class),
                rs.getObject("preparation_area_id", UUID.class), rs.getString("slug"),
                rs.getBoolean("age_restricted"), rs.getString("recipe_status"), rs.getString("category_name"),
                rs.getString("name"), rs.getString("description"),
                rs.getBigDecimal("price"), rs.getString("currency"), rs.getString("image_reference"),
                Visibility.valueOf(rs.getString("visibility")), ItemStatus.valueOf(rs.getString("status")),
                rs.getInt("display_order"), rs.getInt("estimated_preparation_seconds"),
                rs.getInt("row_version"), rs.getTimestamp("updated_at").toInstant(),
                rs.getBoolean("inventory_item_active"), rs.getBoolean("preparation_area_active")));
    }

    @PutMapping("/{menuItemId}")
    @Transactional
    public AdminMenuItem update(@PathVariable UUID menuItemId, @AuthenticationPrincipal Jwt jwt,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody MenuItemUpdate request) {
        UUID actor = UUID.fromString(jwt.getSubject());
        List<AdminMenuItem> beforeRows = jdbc.query("""
            SELECT mi.id, mi.item_id, mi.category_id, mi.preparation_area_id, mi.slug, mi.age_restricted, mi.recipe_status, c.name AS category_name, mi.name, mi.description,
                   mi.price, currency.code AS currency, mi.image_reference, mi.visibility, mi.status,
                   mi.display_order, mi.estimated_preparation_seconds, mi.row_version, mi.updated_at,
                   i.active AS inventory_item_active, area.active AS preparation_area_active
            FROM wok.menu_items mi
            JOIN wok.menu_categories c ON c.id = mi.category_id
            JOIN wok.items i ON i.id = mi.item_id
            JOIN wok.preparation_areas area ON area.id = mi.preparation_area_id
            JOIN wok.currencies currency ON currency.id = mi.currency_id
            WHERE mi.id = ? FOR UPDATE OF mi
            """, AdminCatalogController::map, menuItemId);
        if (beforeRows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No encontramos el producto del menú.");
        AdminMenuItem before = beforeRows.getFirst();
        if (before.rowVersion() != request.expectedVersion())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "El producto cambió. Actualiza el catálogo antes de guardar.");

        UUID categoryId = request.categoryId() == null ? before.categoryId() : request.categoryId();
        UUID preparationAreaId = request.preparationAreaId() == null ? before.preparationAreaId() : request.preparationAreaId();
        if (!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM wok.menu_categories WHERE id = ? AND active = true)",
                Boolean.class, categoryId)))
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Selecciona una categoría activa.");
        if (!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM wok.preparation_areas WHERE id = ? AND active = true)",
                Boolean.class, preparationAreaId)))
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Selecciona un área de preparación activa.");

        String currency = request.currency().trim().toUpperCase(java.util.Locale.ROOT);
        String slug = request.slug() == null ? before.slug() : request.slug().trim().toLowerCase(java.util.Locale.ROOT);
        if (slug != null && !slug.matches("[a-z0-9]+(-[a-z0-9]+)*"))
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "El identificador sólo admite letras, números y guiones.");
        boolean ageRestricted = request.ageRestricted() == null ? before.ageRestricted() : request.ageRestricted();
        List<UUID> currencies = jdbc.query("SELECT id FROM wok.currencies WHERE code = ?",
                (rs, row) -> rs.getObject(1, UUID.class), currency);
        if (currencies.isEmpty()) throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "La moneda no está disponible.");

        UUID operationId = requestId == null ? UUID.randomUUID() : requestId;
        int changed = jdbc.update("""
            UPDATE wok.menu_items SET category_id = ?, preparation_area_id = ?, slug = ?, age_restricted = ?, name = ?, description = ?, price = ?, currency_id = ?, image_reference = ?,
                visibility = ?, status = ?, display_order = ?, estimated_preparation_seconds = ?,
                updated_at = now(), row_version = row_version + 1
            WHERE id = ? AND row_version = ?
            """, categoryId, preparationAreaId, slug, ageRestricted, request.name().trim(), cleanOptional(request.description()), request.price(), currencies.getFirst(),
                cleanOptional(request.imageReference()), request.visibility().name(), request.status().name(),
                request.displayOrder(), request.estimatedPreparationSeconds(), menuItemId, request.expectedVersion());
        if (changed != 1) throw new ResponseStatusException(HttpStatus.CONFLICT, "El producto cambió. Actualiza el catálogo antes de guardar.");

        AdminMenuItem after = jdbc.query("""
            SELECT mi.id, mi.item_id, mi.category_id, mi.preparation_area_id, mi.slug, mi.age_restricted, mi.recipe_status, c.name AS category_name, mi.name, mi.description,
                   mi.price, currency.code AS currency, mi.image_reference, mi.visibility, mi.status,
                   mi.display_order, mi.estimated_preparation_seconds, mi.row_version, mi.updated_at,
                   i.active AS inventory_item_active, area.active AS preparation_area_active
            FROM wok.menu_items mi
            JOIN wok.menu_categories c ON c.id = mi.category_id
            JOIN wok.items i ON i.id = mi.item_id
            JOIN wok.preparation_areas area ON area.id = mi.preparation_area_id
            JOIN wok.currencies currency ON currency.id = mi.currency_id
            WHERE mi.id = ?
            """, AdminCatalogController::map, menuItemId).getFirst();
        jdbc.update("""
            INSERT INTO wok.audit_logs
                (actor_user_id, action, entity_type, entity_id, before_data, after_data, reason, result, request_id)
            VALUES (?, 'MENU_ITEM_UPDATED', 'MENU_ITEM', ?,
                jsonb_build_object('categoryId', ?::uuid, 'preparationAreaId', ?::uuid, 'slug', ?::text, 'ageRestricted', ?::boolean, 'recipeStatus', ?::text,
                    'name', ?::text, 'description', ?::text, 'price', ?::numeric,
                    'currency', ?::text, 'imageReference', ?::text, 'visibility', ?::text, 'status', ?::text,
                    'displayOrder', ?::integer, 'estimatedPreparationSeconds', ?::integer, 'rowVersion', ?::integer),
                jsonb_build_object('categoryId', ?::uuid, 'preparationAreaId', ?::uuid, 'slug', ?::text, 'ageRestricted', ?::boolean, 'recipeStatus', ?::text,
                    'name', ?::text, 'description', ?::text, 'price', ?::numeric,
                    'currency', ?::text, 'imageReference', ?::text, 'visibility', ?::text, 'status', ?::text,
                    'displayOrder', ?::integer, 'estimatedPreparationSeconds', ?::integer, 'rowVersion', ?::integer),
                ?, 'SUCCESS', ?)
            """, actor, menuItemId, before.categoryId(), before.preparationAreaId(), before.slug(), before.ageRestricted(), before.recipeStatus(), before.name(), before.description(), before.price(), before.currency(),
                before.imageReference(), before.visibility().name(), before.status().name(), before.displayOrder(),
                before.estimatedPreparationSeconds(), before.rowVersion(), after.categoryId(), after.preparationAreaId(),
                after.slug(), after.ageRestricted(), after.recipeStatus(), after.name(), after.description(),
                after.price(), after.currency(), after.imageReference(), after.visibility().name(), after.status().name(),
                after.displayOrder(), after.estimatedPreparationSeconds(), after.rowVersion(), request.reason().trim(),
                operationId);
        return after;
    }

    private static AdminMenuItem map(java.sql.ResultSet rs, int row) throws java.sql.SQLException {
        return new AdminMenuItem(rs.getObject("id", UUID.class), rs.getObject("item_id", UUID.class),
                rs.getObject("category_id", UUID.class), rs.getObject("preparation_area_id", UUID.class),
                rs.getString("slug"), rs.getBoolean("age_restricted"), rs.getString("recipe_status"),
                rs.getString("category_name"), rs.getString("name"),
                rs.getString("description"), rs.getBigDecimal("price"), rs.getString("currency"),
                rs.getString("image_reference"), Visibility.valueOf(rs.getString("visibility")),
                ItemStatus.valueOf(rs.getString("status")), rs.getInt("display_order"),
                rs.getInt("estimated_preparation_seconds"), rs.getInt("row_version"),
                rs.getTimestamp("updated_at").toInstant(), rs.getBoolean("inventory_item_active"),
                rs.getBoolean("preparation_area_active"));
    }

    private static String cleanOptional(String value) { return value == null || value.isBlank() ? null : value.trim(); }

    public record MenuItemUpdate(@NotBlank @Size(max = 150) String name, @Size(max = 1000) String description,
            @NotNull @DecimalMin("0.00") @Digits(integer = 12, fraction = 2) BigDecimal price,
            @NotBlank @Size(min = 3, max = 3) String currency,
            @Size(max = 500) String imageReference, UUID categoryId, UUID preparationAreaId,
            @Size(max = 80) String slug, Boolean ageRestricted,
            @NotNull Visibility visibility, @NotNull ItemStatus status,
            int displayOrder, @jakarta.validation.constraints.PositiveOrZero int estimatedPreparationSeconds,
            @Positive int expectedVersion, @NotBlank @Size(min = 3, max = 500) String reason) {}

    public record AdminMenuItem(UUID id, UUID itemId, UUID categoryId, UUID preparationAreaId, String slug,
            boolean ageRestricted, String recipeStatus, String categoryName, String name,
            String description, BigDecimal price, String currency, String imageReference, Visibility visibility,
            ItemStatus status, int displayOrder, int estimatedPreparationSeconds, int rowVersion, Instant updatedAt,
            boolean inventoryItemActive, boolean preparationAreaActive) {}

    public enum Visibility { PUBLIC, STAFF, HIDDEN }
    public enum ItemStatus { ACTIVE, INACTIVE }
}

package com.wokasianfood.api.catalog;

import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.platform.IdempotencyStore;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/catalog")
@PreAuthorize("hasAuthority('catalog:manage')")
public class AdminCatalogSetupController {
    private final CatalogSetupService catalog;

    public AdminCatalogSetupController(CatalogSetupService catalog) { this.catalog = catalog; }

    @GetMapping("/categories")
    public List<CatalogCategory> categories(@RequestParam(defaultValue = "false") boolean includeInactive) {
        return catalog.categories(includeInactive);
    }

    @PostMapping("/categories")
    @ResponseStatus(HttpStatus.CREATED)
    public CatalogCategory createCategory(@AuthenticationPrincipal Jwt jwt,
            @RequestHeader("Idempotency-Key") UUID key,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody CategoryCreate request) {
        return catalog.createCategory(actor(jwt), operationId(requestId), key, request);
    }

    @PutMapping("/categories/{categoryId}")
    public CatalogCategory updateCategory(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID categoryId,
            @RequestHeader("Idempotency-Key") UUID key,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody CategoryUpdate request) {
        return catalog.updateCategory(actor(jwt), operationId(requestId), categoryId, key, request);
    }

    @GetMapping("/preparation-areas")
    public List<PreparationArea> preparationAreas(@RequestParam(defaultValue = "false") boolean includeInactive) {
        return catalog.preparationAreas(includeInactive);
    }

    @PostMapping("/preparation-areas")
    @ResponseStatus(HttpStatus.CREATED)
    public PreparationArea createPreparationArea(@AuthenticationPrincipal Jwt jwt,
            @RequestHeader("Idempotency-Key") UUID key,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody PreparationAreaCreate request) {
        return catalog.createPreparationArea(actor(jwt), operationId(requestId), key, request);
    }

    @PutMapping("/preparation-areas/{areaId}")
    public PreparationArea updatePreparationArea(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID areaId,
            @RequestHeader("Idempotency-Key") UUID key,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody PreparationAreaUpdate request) {
        return catalog.updatePreparationArea(actor(jwt), operationId(requestId), areaId, key, request);
    }

    @PostMapping("/menu-items")
    @ResponseStatus(HttpStatus.CREATED)
    public MenuItemCreation createMenuItem(@AuthenticationPrincipal Jwt jwt,
            @RequestHeader("Idempotency-Key") UUID key,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody MenuItemCreate request) {
        return catalog.createMenuItem(actor(jwt), operationId(requestId), key, request);
    }

    private static UUID actor(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }
    private static UUID operationId(UUID requestId) { return requestId == null ? UUID.randomUUID() : requestId; }

    public record CategoryCreate(@NotBlank @Size(max = 120) String name,
            @PositiveOrZero int displayOrder, @NotBlank @Size(min = 3, max = 500) String reason) {}
    public record CategoryUpdate(@NotBlank @Size(max = 120) String name,
            @PositiveOrZero int displayOrder, boolean active, @Positive int expectedVersion,
            @NotBlank @Size(min = 3, max = 500) String reason) {}
    public record CatalogCategory(UUID id, String name, int displayOrder, boolean active,
            int rowVersion, Instant updatedAt) {}
    public record PreparationAreaCreate(@NotBlank @Size(min = 2, max = 40) String code,
            @NotBlank @Size(max = 100) String name, @NotBlank @Size(min = 3, max = 500) String reason) {}
    public record PreparationAreaUpdate(@NotBlank @Size(max = 100) String name,
            boolean active, @Positive int expectedVersion, @NotBlank @Size(min = 3, max = 500) String reason) {}
    public record PreparationArea(UUID id, String code, String name, boolean active,
            int rowVersion, Instant updatedAt) {}
    public record MenuItemCreate(@NotNull UUID categoryId, @NotNull UUID preparationAreaId,
            @NotBlank @Size(max = 150) String name, @Size(max = 1000) String description,
            @NotNull @DecimalMin("0.00") @Digits(integer = 12, fraction = 2) BigDecimal price,
            @NotBlank @Size(min = 3, max = 3) String currency, @Size(max = 500) String imageReference,
            @PositiveOrZero int displayOrder, @PositiveOrZero int estimatedPreparationSeconds,
            @Size(max = 80) String slug, Boolean ageRestricted,
            @NotBlank @Size(min = 3, max = 500) String reason) {}
    public record MenuItemCreation(UUID menuItemId, UUID itemId, String sku, String name,
            String visibility, String status, String slug, boolean ageRestricted, String recipeStatus,
            boolean inventoryTracked, int rowVersion) {}
}

@Service
class CatalogSetupService {
    private final JdbcTemplate jdbc;
    private final IdempotencyStore idempotency;

    CatalogSetupService(JdbcTemplate jdbc, IdempotencyStore idempotency) {
        this.jdbc = jdbc;
        this.idempotency = idempotency;
    }

    List<AdminCatalogSetupController.CatalogCategory> categories(boolean includeInactive) {
        return jdbc.query("""
            SELECT id, name, display_order, active, row_version, updated_at
            FROM wok.menu_categories WHERE (? = true OR active = true)
            ORDER BY display_order, name, id
            """, (rs, row) -> new AdminCatalogSetupController.CatalogCategory(
                rs.getObject("id", UUID.class), rs.getString("name"), rs.getInt("display_order"),
                rs.getBoolean("active"), rs.getInt("row_version"), rs.getTimestamp("updated_at").toInstant()),
            includeInactive);
    }

    @Transactional
    AdminCatalogSetupController.CatalogCategory createCategory(UUID actor, UUID requestId, UUID key,
            AdminCatalogSetupController.CategoryCreate request) {
        String name = request.name().trim();
        String fingerprint = fingerprint(name + "|" + request.displayOrder() + "|" + request.reason().trim());
        IdempotencyStore.Result claim = idempotency.claim(actor.toString(), "CATALOG_CATEGORY_CREATED", key, fingerprint);
        if (claim.replay()) return category(claim.resourceId());
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO wok.menu_categories (id, name, display_order) VALUES (?, ?, ?)",
                id, name, request.displayOrder());
        audit(actor, requestId, "MENU_CATEGORY_CREATED", "MENU_CATEGORY", id, null,
                "{\"name\":\"" + jsonEscape(name) + "\",\"displayOrder\":" + request.displayOrder() + "}",
                request.reason().trim());
        idempotency.complete(actor.toString(), "CATALOG_CATEGORY_CREATED", key, id);
        return category(id);
    }

    @Transactional
    AdminCatalogSetupController.CatalogCategory updateCategory(UUID actor, UUID requestId, UUID categoryId,
            UUID key, AdminCatalogSetupController.CategoryUpdate request) {
        String fingerprint = fingerprint(categoryId + "|" + request.name().trim() + "|" + request.displayOrder()
                + "|" + request.active() + "|" + request.expectedVersion() + "|" + request.reason().trim());
        IdempotencyStore.Result claim = idempotency.claim(actor.toString(), "CATALOG_CATEGORY_UPDATED", key, fingerprint);
        if (claim.replay()) return category(claim.resourceId());
        List<AdminCatalogSetupController.CatalogCategory> current = jdbc.query("""
            SELECT id, name, display_order, active, row_version, updated_at
            FROM wok.menu_categories WHERE id = ? FOR UPDATE
            """, (rs, row) -> new AdminCatalogSetupController.CatalogCategory(
                rs.getObject("id", UUID.class), rs.getString("name"), rs.getInt("display_order"),
                rs.getBoolean("active"), rs.getInt("row_version"), rs.getTimestamp("updated_at").toInstant()), categoryId);
        if (current.isEmpty()) throw new AuthException(404, "No encontramos la categoría.");
        var before = current.getFirst();
        if (before.rowVersion() != request.expectedVersion()) throw new AuthException(409, "La categoría cambió. Actualiza antes de guardar.");
        if (!request.active() && before.active()) {
            Boolean hasVisibleProducts = jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM wok.menu_items WHERE category_id = ? AND status = 'ACTIVE')
                """, Boolean.class, categoryId);
            if (Boolean.TRUE.equals(hasVisibleProducts)) throw new AuthException(409, "Mueve o desactiva los productos activos antes de desactivar la categoría.");
        }
        String name = request.name().trim();
        jdbc.update("""
            UPDATE wok.menu_categories SET name = ?, display_order = ?, active = ?, updated_at = now(), row_version = row_version + 1
            WHERE id = ? AND row_version = ?
            """, name, request.displayOrder(), request.active(), categoryId, request.expectedVersion());
        audit(actor, requestId, "MENU_CATEGORY_UPDATED", "MENU_CATEGORY", categoryId,
                "{\"name\":\"" + jsonEscape(before.name()) + "\",\"displayOrder\":" + before.displayOrder()
                        + ",\"active\":" + before.active() + ",\"rowVersion\":" + before.rowVersion() + "}",
                "{\"name\":\"" + jsonEscape(name) + "\",\"displayOrder\":" + request.displayOrder()
                        + ",\"active\":" + request.active() + ",\"rowVersion\":" + (before.rowVersion() + 1) + "}",
                request.reason().trim());
        idempotency.complete(actor.toString(), "CATALOG_CATEGORY_UPDATED", key, categoryId);
        return category(categoryId);
    }

    List<AdminCatalogSetupController.PreparationArea> preparationAreas(boolean includeInactive) {
        return jdbc.query("""
            SELECT id, code, name, active, row_version, updated_at
            FROM wok.preparation_areas WHERE (? = true OR active = true)
            ORDER BY name, code, id
            """, (rs, row) -> new AdminCatalogSetupController.PreparationArea(
                rs.getObject("id", UUID.class), rs.getString("code"), rs.getString("name"),
                rs.getBoolean("active"), rs.getInt("row_version"), rs.getTimestamp("updated_at").toInstant()), includeInactive);
    }

    @Transactional
    AdminCatalogSetupController.PreparationArea createPreparationArea(UUID actor, UUID requestId, UUID key,
            AdminCatalogSetupController.PreparationAreaCreate request) {
        String code = request.code().trim().toUpperCase(Locale.ROOT);
        if (!code.matches("[A-Z0-9_]{2,40}")) throw new AuthException(422, "El código sólo admite letras, números y guion bajo.");
        String name = request.name().trim();
        String fingerprint = fingerprint(code + "|" + name + "|" + request.reason().trim());
        IdempotencyStore.Result claim = idempotency.claim(actor.toString(), "PREPARATION_AREA_CREATED", key, fingerprint);
        if (claim.replay()) return preparationArea(claim.resourceId());
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO wok.preparation_areas (id, code, name) VALUES (?, ?, ?)", id, code, name);
        audit(actor, requestId, "PREPARATION_AREA_CREATED", "PREPARATION_AREA", id, null,
                "{\"code\":\"" + code + "\",\"name\":\"" + jsonEscape(name) + "\"}", request.reason().trim());
        idempotency.complete(actor.toString(), "PREPARATION_AREA_CREATED", key, id);
        return preparationArea(id);
    }

    @Transactional
    AdminCatalogSetupController.PreparationArea updatePreparationArea(UUID actor, UUID requestId, UUID areaId,
            UUID key, AdminCatalogSetupController.PreparationAreaUpdate request) {
        String fingerprint = fingerprint(areaId + "|" + request.name().trim() + "|" + request.active()
                + "|" + request.expectedVersion() + "|" + request.reason().trim());
        IdempotencyStore.Result claim = idempotency.claim(actor.toString(), "PREPARATION_AREA_UPDATED", key, fingerprint);
        if (claim.replay()) return preparationArea(claim.resourceId());
        List<AdminCatalogSetupController.PreparationArea> current = jdbc.query("""
            SELECT id, code, name, active, row_version, updated_at
            FROM wok.preparation_areas WHERE id = ? FOR UPDATE
            """, (rs, row) -> new AdminCatalogSetupController.PreparationArea(
                rs.getObject("id", UUID.class), rs.getString("code"), rs.getString("name"),
                rs.getBoolean("active"), rs.getInt("row_version"), rs.getTimestamp("updated_at").toInstant()), areaId);
        if (current.isEmpty()) throw new AuthException(404, "No encontramos el área de preparación.");
        var before = current.getFirst();
        if (before.rowVersion() != request.expectedVersion()) throw new AuthException(409, "El área cambió. Actualiza antes de guardar.");
        if (!request.active() && before.active()) {
            Boolean hasActiveItems = jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM wok.menu_items WHERE preparation_area_id = ? AND status = 'ACTIVE')
                """, Boolean.class, areaId);
            if (Boolean.TRUE.equals(hasActiveItems)) throw new AuthException(409, "Desactiva o reasigna los productos antes de desactivar el área.");
        }
        String name = request.name().trim();
        jdbc.update("""
            UPDATE wok.preparation_areas SET name = ?, active = ?, updated_at = now(), row_version = row_version + 1
            WHERE id = ? AND row_version = ?
            """, name, request.active(), areaId, request.expectedVersion());
        audit(actor, requestId, "PREPARATION_AREA_UPDATED", "PREPARATION_AREA", areaId,
                "{\"name\":\"" + jsonEscape(before.name()) + "\",\"active\":" + before.active()
                        + ",\"rowVersion\":" + before.rowVersion() + "}",
                "{\"name\":\"" + jsonEscape(name) + "\",\"active\":" + request.active()
                        + ",\"rowVersion\":" + (before.rowVersion() + 1) + "}", request.reason().trim());
        idempotency.complete(actor.toString(), "PREPARATION_AREA_UPDATED", key, areaId);
        return preparationArea(areaId);
    }

    @Transactional
    AdminCatalogSetupController.MenuItemCreation createMenuItem(UUID actor, UUID requestId, UUID key,
            AdminCatalogSetupController.MenuItemCreate request) {
        String currencyCode = request.currency().trim().toUpperCase(Locale.ROOT);
        String fingerprint = fingerprint(request.categoryId() + "|" + request.preparationAreaId() + "|"
                + request.name().trim() + "|" + (request.description() == null ? "" : request.description().trim())
                + "|" + request.price().stripTrailingZeros().toPlainString() + "|" + currencyCode + "|"
                + (request.imageReference() == null ? "" : request.imageReference().trim()) + "|"
                + request.displayOrder() + "|" + request.estimatedPreparationSeconds() + "|"
                + (request.slug() == null ? "" : request.slug().trim()) + "|" + request.ageRestricted()
                + "|" + request.reason().trim());
        IdempotencyStore.Result claim = idempotency.claim(actor.toString(), "CATALOG_MENU_ITEM_CREATED", key, fingerprint);
        if (claim.replay()) return menuItemCreation(claim.resourceId());
        boolean categoryExists = Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM wok.menu_categories WHERE id = ? AND active = true)", Boolean.class,
                request.categoryId()));
        boolean areaExists = Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM wok.preparation_areas WHERE id = ? AND active = true)", Boolean.class,
                request.preparationAreaId()));
        UUID currencyId = jdbc.query("SELECT id FROM wok.currencies WHERE code = ?", (rs, row) -> rs.getObject(1, UUID.class), currencyCode)
                .stream().findFirst().orElse(null);
        if (!categoryExists) throw new AuthException(422, "Selecciona una categoría activa.");
        if (!areaExists) throw new AuthException(422, "Selecciona un área de preparación activa.");
        if (currencyId == null) throw new AuthException(422, "La moneda no está disponible.");
        UUID itemTypeId = referenceId("SELECT id FROM wok.item_types WHERE code = 'MENU_PRODUCT'");
        UUID unitId = referenceId("SELECT id FROM wok.units WHERE code = 'UNIT'");
        UUID itemId = UUID.randomUUID();
        String sku = "MENU_" + itemId.toString().replace("-", "").toUpperCase(Locale.ROOT);
        String name = request.name().trim();
        String slug = request.slug() == null || request.slug().isBlank()
                ? null : request.slug().trim().toLowerCase(Locale.ROOT);
        if (slug != null && !slug.matches("[a-z0-9]+(-[a-z0-9]+)*"))
            throw new AuthException(422, "El identificador sólo admite letras, números y guiones.");
        jdbc.update("""
            INSERT INTO wok.items (id, sku, name, item_type_id, base_unit_id, track_inventory, active)
            VALUES (?, ?, ?, ?, ?, false, true)
            """, itemId, sku, name, itemTypeId, unitId);
        UUID menuItemId = jdbc.queryForObject("""
            INSERT INTO wok.menu_items
                (item_id, category_id, preparation_area_id, name, description, price, currency_id,
                 image_reference, visibility, status, display_order, estimated_preparation_seconds, slug, age_restricted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'HIDDEN', 'INACTIVE', ?, ?, ?, ?) RETURNING id
            """, UUID.class, itemId, request.categoryId(), request.preparationAreaId(), name,
                clean(request.description()), request.price(), currencyId, clean(request.imageReference()),
                request.displayOrder(), request.estimatedPreparationSeconds(), slug,
                Boolean.TRUE.equals(request.ageRestricted()));
        audit(actor, requestId, "MENU_ITEM_CREATED", "MENU_ITEM", menuItemId, null,
                "{\"itemId\":\"" + itemId + "\",\"sku\":\"" + sku + "\",\"name\":\""
                        + jsonEscape(name) + "\",\"price\":" + request.price().toPlainString()
                        + ",\"currency\":\"" + currencyCode + "\",\"slug\":"
                        + (slug == null ? "null" : "\"" + jsonEscape(slug) + "\"" )
                        + ",\"ageRestricted\":" + Boolean.TRUE.equals(request.ageRestricted())
                        + ",\"recipeStatus\":\"PENDING_DATA\",\"visibility\":\"HIDDEN\",\"status\":\"INACTIVE\",\"trackInventory\":false}",
                request.reason().trim());
        idempotency.complete(actor.toString(), "CATALOG_MENU_ITEM_CREATED", key, menuItemId);
        return menuItemCreation(menuItemId);
    }

    private AdminCatalogSetupController.CatalogCategory category(UUID id) {
        return jdbc.query("""
            SELECT id, name, display_order, active, row_version, updated_at FROM wok.menu_categories WHERE id = ?
            """, (rs, row) -> new AdminCatalogSetupController.CatalogCategory(rs.getObject("id", UUID.class),
                rs.getString("name"), rs.getInt("display_order"), rs.getBoolean("active"), rs.getInt("row_version"),
                rs.getTimestamp("updated_at").toInstant()), id).stream().findFirst()
                .orElseThrow(() -> new AuthException(404, "No encontramos la categoría."));
    }

    private AdminCatalogSetupController.PreparationArea preparationArea(UUID id) {
        return jdbc.query("""
            SELECT id, code, name, active, row_version, updated_at FROM wok.preparation_areas WHERE id = ?
            """, (rs, row) -> new AdminCatalogSetupController.PreparationArea(rs.getObject("id", UUID.class),
                rs.getString("code"), rs.getString("name"), rs.getBoolean("active"), rs.getInt("row_version"),
                rs.getTimestamp("updated_at").toInstant()), id).stream().findFirst()
                .orElseThrow(() -> new AuthException(404, "No encontramos el área de preparación."));
    }

    private AdminCatalogSetupController.MenuItemCreation menuItemCreation(UUID id) {
        return jdbc.query("""
            SELECT mi.id AS menu_item_id, i.id AS item_id, i.sku, mi.name, mi.visibility, mi.status,
                   mi.slug, mi.age_restricted, mi.recipe_status,
                   i.track_inventory, mi.row_version
            FROM wok.menu_items mi JOIN wok.items i ON i.id = mi.item_id WHERE mi.id = ?
            """, (rs, row) -> new AdminCatalogSetupController.MenuItemCreation(
                rs.getObject("menu_item_id", UUID.class), rs.getObject("item_id", UUID.class), rs.getString("sku"),
                rs.getString("name"), rs.getString("visibility"), rs.getString("status"),
                rs.getString("slug"), rs.getBoolean("age_restricted"), rs.getString("recipe_status"),
                rs.getBoolean("track_inventory"), rs.getInt("row_version")), id).stream().findFirst()
                .orElseThrow(() -> new AuthException(404, "No encontramos el producto del menú."));
    }

    private UUID referenceId(String query) {
        return jdbc.query(query, (rs, row) -> rs.getObject(1, UUID.class)).stream().findFirst()
                .orElseThrow(() -> new AuthException(500, "No está disponible la configuración base del catálogo."));
    }

    private void audit(UUID actor, UUID requestId, String action, String entity, UUID entityId,
                       String before, String after, String reason) {
        jdbc.update("""
            INSERT INTO wok.audit_logs (actor_user_id, action, entity_type, entity_id, before_data, after_data, reason, result, request_id)
            VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, 'SUCCESS', ?)
            """, actor, action, entity, entityId, before, after, reason, requestId);
    }

    private static String fingerprint(String input) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(input.getBytes(java.nio.charset.StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException failure) { throw new IllegalStateException("SHA-256 unavailable", failure); }
    }
    private static String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private static String jsonEscape(String value) {
        StringBuilder escaped = new StringBuilder(value.length());
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            switch (character) {
                case '"' -> escaped.append("\\\"");
                case '\\' -> escaped.append("\\\\");
                case '\b' -> escaped.append("\\b");
                case '\f' -> escaped.append("\\f");
                case '\n' -> escaped.append("\\n");
                case '\r' -> escaped.append("\\r");
                case '\t' -> escaped.append("\\t");
                default -> {
                    if (character < 0x20) escaped.append(String.format(Locale.ROOT, "\\u%04x", (int) character));
                    else escaped.append(character);
                }
            }
        }
        return escaped.toString();
    }
}

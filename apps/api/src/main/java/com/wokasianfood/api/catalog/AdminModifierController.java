package com.wokasianfood.api.catalog;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
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
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/admin/catalog")
@PreAuthorize("hasAuthority('catalog:manage')")
public class AdminModifierController {
    private final JdbcTemplate jdbc;

    public AdminModifierController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @GetMapping("/modifier-groups")
    public List<ModifierGroup> groups() {
        List<ModifierGroup> groups = jdbc.query("""
            SELECT id, name, min_selection, max_selection, required, row_version, updated_at
            FROM wok.modifier_groups ORDER BY name, id
            """, (rs, row) -> new ModifierGroup(rs.getObject("id", UUID.class), rs.getString("name"),
                rs.getInt("min_selection"), rs.getInt("max_selection"), rs.getBoolean("required"),
                rs.getInt("row_version"), rs.getTimestamp("updated_at").toInstant(), List.of()));
        return groups.stream().map(group -> new ModifierGroup(group.id(), group.name(), group.minSelection(),
                group.maxSelection(), group.required(), group.rowVersion(), group.updatedAt(), options(group.id()))).toList();
    }

    @PostMapping("/modifier-groups")
    @Transactional
    public ModifierGroup createGroup(@AuthenticationPrincipal Jwt jwt,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody ModifierGroupCreate request) {
        validateGroupBounds(request.minSelection(), request.maxSelection(), request.required());
        UUID actor = actor(jwt);
        UUID id = jdbc.queryForObject("""
            INSERT INTO wok.modifier_groups (name, min_selection, max_selection, required)
            VALUES (?, ?, ?, ?) RETURNING id
            """, UUID.class, request.name().trim(), request.minSelection(), request.maxSelection(), request.required());
        audit(actor, requestId, "MODIFIER_GROUP_CREATED", "MODIFIER_GROUP", id, null,
                groupSnapshot(request.name().trim(), request.minSelection(), request.maxSelection(), request.required()),
                request.reason());
        return group(id);
    }

    @PutMapping("/modifier-groups/{groupId}")
    @Transactional
    public ModifierGroup updateGroup(@PathVariable UUID groupId, @AuthenticationPrincipal Jwt jwt,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody ModifierGroupUpdate request) {
        validateGroupBounds(request.minSelection(), request.maxSelection(), request.required());
        ModifierGroup before = lockedGroup(groupId, request.expectedVersion());
        Integer activeOptions = jdbc.queryForObject("SELECT count(*) FROM wok.modifiers WHERE group_id = ? AND active = true",
                Integer.class, groupId);
        if (request.minSelection() > activeOptions)
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "El grupo no puede exigir más opciones de las disponibles.");
        jdbc.update("""
            UPDATE wok.modifier_groups SET name = ?, min_selection = ?, max_selection = ?, required = ?,
                updated_at = now(), row_version = row_version + 1 WHERE id = ? AND row_version = ?
            """, request.name().trim(), request.minSelection(), request.maxSelection(), request.required(), groupId,
                request.expectedVersion());
        ModifierGroup after = group(groupId);
        audit(actor(jwt), requestId, "MODIFIER_GROUP_UPDATED", "MODIFIER_GROUP", groupId,
                groupSnapshot(before.name(), before.minSelection(), before.maxSelection(), before.required()),
                groupSnapshot(after.name(), after.minSelection(), after.maxSelection(), after.required()), request.reason());
        return after;
    }

    @PostMapping("/modifier-groups/{groupId}/options")
    @Transactional
    public ModifierOption createOption(@PathVariable UUID groupId, @AuthenticationPrincipal Jwt jwt,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody ModifierOptionCreate request) {
        lockedGroup(groupId, null);
        UUID optionId = jdbc.queryForObject("""
            INSERT INTO wok.modifiers (group_id, name, price_delta, active)
            VALUES (?, ?, ?, ?) RETURNING id
            """, UUID.class, groupId, request.name().trim(), request.priceDelta(), request.active());
        ModifierOption option = option(groupId, optionId);
        audit(actor(jwt), requestId, "MODIFIER_OPTION_CREATED", "MODIFIER", optionId, null,
                optionSnapshot(option), request.reason());
        return option;
    }

    @PutMapping("/modifier-groups/{groupId}/options/{optionId}")
    @Transactional
    public ModifierOption updateOption(@PathVariable UUID groupId, @PathVariable UUID optionId,
            @AuthenticationPrincipal Jwt jwt,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody ModifierOptionUpdate request) {
        lockedGroup(groupId, null);
        ModifierOption before = lockedOption(groupId, optionId, request.expectedVersion());
        if (!request.active()) ensureGroupCanDisable(optionId, groupId);
        jdbc.update("""
            UPDATE wok.modifiers SET name = ?, price_delta = ?, active = ?, updated_at = now(),
                row_version = row_version + 1 WHERE id = ? AND group_id = ? AND row_version = ?
            """, request.name().trim(), request.priceDelta(), request.active(), optionId, groupId,
                request.expectedVersion());
        ModifierOption after = option(groupId, optionId);
        audit(actor(jwt), requestId, "MODIFIER_OPTION_UPDATED", "MODIFIER", optionId,
                optionSnapshot(before), optionSnapshot(after), request.reason());
        return after;
    }

    @PutMapping("/modifier-groups/{groupId}/options/{optionId}/inventory-impacts")
    @Transactional
    public List<ModifierItemImpact> replaceInventoryImpacts(@PathVariable UUID groupId,
            @PathVariable UUID optionId, @AuthenticationPrincipal Jwt jwt,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody ModifierImpactsUpdate request) {
        lockedGroup(groupId, null);
        ModifierOption option = lockedOption(groupId, optionId, request.expectedVersion());
        List<UUID> itemIds = request.impacts().stream().map(ModifierImpactInput::itemId).toList();
        if (itemIds.stream().distinct().count() != itemIds.size())
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "No repitas insumos en los impactos.");
        for (ModifierImpactInput impact : request.impacts()) {
            if (impact.quantityDelta().signum() == 0)
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Cada impacto debe cambiar una cantidad distinta de cero.");
        }
        if (!itemIds.isEmpty()) {
            String placeholders = String.join(",", java.util.Collections.nCopies(itemIds.size(), "?"));
            List<UUID> validItems = jdbc.query("SELECT id FROM wok.items WHERE active = true " +
                    "AND track_inventory = true AND id IN (" + placeholders + ") ORDER BY id FOR SHARE",
                    (rs, row) -> rs.getObject(1, UUID.class), itemIds.toArray());
            if (validItems.size() != itemIds.size())
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                        "Todos los insumos deben existir, estar activos y llevar inventario.");
        }
        List<ModifierItemImpact> before = impacts(optionId);
        jdbc.update("DELETE FROM wok.modifier_item_impacts WHERE modifier_id = ?", optionId);
        for (ModifierImpactInput impact : request.impacts())
            jdbc.update("""
                INSERT INTO wok.modifier_item_impacts (modifier_id, item_id, quantity_delta, affects_availability)
                VALUES (?, ?, ?, ?)
                """, optionId, impact.itemId(), impact.quantityDelta(), impact.affectsAvailability());
        jdbc.update("UPDATE wok.modifiers SET updated_at = now(), row_version = row_version + 1 WHERE id = ?", optionId);
        List<ModifierItemImpact> after = impacts(optionId);
        audit(actor(jwt), requestId, "MODIFIER_INVENTORY_IMPACTS_REPLACED", "MODIFIER", optionId,
                impactsSnapshot(before), impactsSnapshot(after), request.reason());
        return after;
    }

    @PutMapping("/menu-items/{menuItemId}/modifier-groups")
    @Transactional
    public List<ModifierGroup> replaceMenuItemGroups(@PathVariable UUID menuItemId, @AuthenticationPrincipal Jwt jwt,
            @RequestHeader(value = "X-Request-Id", required = false) UUID requestId,
            @Valid @RequestBody MenuItemGroupsUpdate request) {
        List<UUID> distinctIds = request.groupIds().stream().distinct().sorted().toList();
        if (distinctIds.size() != request.groupIds().size())
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "No repitas grupos de opciones.");
        List<Integer> versions = jdbc.query("SELECT row_version FROM wok.menu_items WHERE id = ? FOR UPDATE",
                (rs, row) -> rs.getInt(1), menuItemId);
        if (versions.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No encontramos el producto del menú.");
        if (versions.getFirst() != request.expectedVersion())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "El producto cambió. Actualiza el catálogo antes de guardar.");
        if (!distinctIds.isEmpty()) {
            jdbc.query("SELECT id FROM wok.modifier_groups WHERE id IN (" +
                    String.join(",", java.util.Collections.nCopies(distinctIds.size(), "?")) + ") ORDER BY id FOR UPDATE",
                    (rs, row) -> rs.getObject(1, UUID.class), distinctIds.toArray());
            Integer found = jdbc.queryForObject("SELECT count(*) FROM wok.modifier_groups WHERE id IN (" +
                    String.join(",", java.util.Collections.nCopies(distinctIds.size(), "?")) + ")",
                    Integer.class, distinctIds.toArray());
            if (found == null || found != distinctIds.size())
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Uno o más grupos no existen.");
            String placeholders = String.join(",", java.util.Collections.nCopies(distinctIds.size(), "?"));
            List<UUID> unsatisfied = jdbc.query("""
                SELECT g.id FROM wok.modifier_groups g LEFT JOIN wok.modifiers m
                    ON m.group_id = g.id AND m.active = true
                WHERE g.id IN (%s) GROUP BY g.id HAVING g.min_selection > count(m.id)
                """.formatted(placeholders), (rs, row) -> rs.getObject(1, UUID.class), distinctIds.toArray());
            if (!unsatisfied.isEmpty())
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                        "Agrega opciones activas antes de vincular un grupo requerido.");
        }
        List<UUID> before = jdbc.query("SELECT group_id FROM wok.menu_item_modifier_groups WHERE menu_item_id = ? ORDER BY group_id",
                (rs, row) -> rs.getObject(1, UUID.class), menuItemId);
        jdbc.update("DELETE FROM wok.menu_item_modifier_groups WHERE menu_item_id = ?", menuItemId);
        for (int index = 0; index < distinctIds.size(); index++)
            jdbc.update("INSERT INTO wok.menu_item_modifier_groups (menu_item_id, group_id, display_order) VALUES (?, ?, ?)",
                    menuItemId, distinctIds.get(index), index);
        jdbc.update("UPDATE wok.menu_items SET updated_at = now(), row_version = row_version + 1 WHERE id = ?", menuItemId);
        List<UUID> after = jdbc.query("SELECT group_id FROM wok.menu_item_modifier_groups WHERE menu_item_id = ? ORDER BY group_id",
                (rs, row) -> rs.getObject(1, UUID.class), menuItemId);
        audit(actor(jwt), requestId, "MENU_ITEM_MODIFIER_GROUPS_REPLACED", "MENU_ITEM", menuItemId,
                snapshotIds(before), snapshotIds(after), request.reason());
        return jdbc.query("""
            SELECT g.id, g.name, g.min_selection, g.max_selection, g.required, g.row_version, g.updated_at
            FROM wok.menu_item_modifier_groups mg JOIN wok.modifier_groups g ON g.id = mg.group_id
            WHERE mg.menu_item_id = ? ORDER BY mg.display_order, g.name, g.id
            """, (rs, row) -> new ModifierGroup(rs.getObject("id", UUID.class), rs.getString("name"),
                rs.getInt("min_selection"), rs.getInt("max_selection"), rs.getBoolean("required"),
                rs.getInt("row_version"), rs.getTimestamp("updated_at").toInstant(), List.of()), menuItemId)
                .stream().map(group -> new ModifierGroup(group.id(), group.name(), group.minSelection(), group.maxSelection(),
                        group.required(), group.rowVersion(), group.updatedAt(), options(group.id()))).toList();
    }

    private void ensureGroupCanDisable(UUID optionId, UUID groupId) {
        List<Integer> required = jdbc.query("""
            SELECT g.min_selection, count(m.id) FILTER (WHERE m.active = true) AS active_count
            FROM wok.modifier_groups g LEFT JOIN wok.modifiers m ON m.group_id = g.id AND m.id <> ?
            WHERE g.id = ? GROUP BY g.id
            """, (rs, row) -> rs.getInt("min_selection") > rs.getInt("active_count") ? 1 : 0, optionId, groupId);
        if (!required.isEmpty() && required.getFirst() == 1)
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "No puedes desactivar la última opción requerida del grupo.");
    }

    private void validateGroupBounds(int min, int max, boolean required) {
        if (max < min || (required != (min > 0)))
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Revisa los límites y el requisito del grupo.");
    }

    private ModifierGroup lockedGroup(UUID groupId, Integer expectedVersion) {
        List<ModifierGroup> rows = jdbc.query("""
            SELECT id, name, min_selection, max_selection, required, row_version, updated_at
            FROM wok.modifier_groups WHERE id = ? FOR UPDATE
            """, (rs, row) -> new ModifierGroup(rs.getObject("id", UUID.class), rs.getString("name"),
                rs.getInt("min_selection"), rs.getInt("max_selection"), rs.getBoolean("required"),
                rs.getInt("row_version"), rs.getTimestamp("updated_at").toInstant(), List.of()), groupId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No encontramos el grupo de opciones.");
        ModifierGroup group = rows.getFirst();
        if (expectedVersion != null && group.rowVersion() != expectedVersion)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "El grupo cambió. Actualiza el catálogo antes de guardar.");
        return group;
    }

    private ModifierOption lockedOption(UUID groupId, UUID optionId, int expectedVersion) {
        List<ModifierOption> rows = jdbc.query("""
            SELECT id, group_id, name, price_delta, active, row_version, updated_at FROM wok.modifiers
            WHERE id = ? AND group_id = ? FOR UPDATE
            """, (rs, row) -> mapOption(rs), optionId, groupId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No encontramos la opción.");
        ModifierOption option = rows.getFirst();
        if (option.rowVersion() != expectedVersion)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "La opción cambió. Actualiza el catálogo antes de guardar.");
        return option;
    }

    private ModifierGroup group(UUID id) {
        return jdbc.query("""
            SELECT id, name, min_selection, max_selection, required, row_version, updated_at
            FROM wok.modifier_groups WHERE id = ?
            """, (rs, row) -> new ModifierGroup(rs.getObject("id", UUID.class), rs.getString("name"),
                rs.getInt("min_selection"), rs.getInt("max_selection"), rs.getBoolean("required"),
                rs.getInt("row_version"), rs.getTimestamp("updated_at").toInstant(), options(id)), id).getFirst();
    }

    private List<ModifierOption> options(UUID groupId) {
        return jdbc.query("""
            SELECT id, group_id, name, price_delta, active, row_version, updated_at
            FROM wok.modifiers WHERE group_id = ? ORDER BY name, id
            """, (rs, row) -> mapOption(rs), groupId).stream()
                .map(option -> withImpacts(option)).toList();
    }

    private List<ModifierItemImpact> impacts(UUID optionId) {
        return jdbc.query("""
            SELECT impact.item_id, item.name AS item_name, impact.quantity_delta, impact.affects_availability
            FROM wok.modifier_item_impacts impact JOIN wok.items item ON item.id = impact.item_id
            WHERE impact.modifier_id = ? ORDER BY item.name, item.id
            """, (rs, row) -> new ModifierItemImpact(rs.getObject("item_id", UUID.class),
                rs.getString("item_name"), rs.getBigDecimal("quantity_delta"),
                rs.getBoolean("affects_availability")), optionId);
    }

    private ModifierOption option(UUID groupId, UUID optionId) {
        ModifierOption found = jdbc.query("""
            SELECT id, group_id, name, price_delta, active, row_version, updated_at
            FROM wok.modifiers WHERE id = ? AND group_id = ?
            """, (rs, row) -> mapOption(rs), optionId, groupId).getFirst();
        return withImpacts(found);
    }

    private ModifierOption withImpacts(ModifierOption option) {
        return new ModifierOption(option.id(), option.groupId(), option.name(), option.priceDelta(), option.active(),
                option.rowVersion(), option.updatedAt(), impacts(option.id()));
    }

    private static ModifierOption mapOption(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new ModifierOption(rs.getObject("id", UUID.class), rs.getObject("group_id", UUID.class),
                rs.getString("name"), rs.getBigDecimal("price_delta"), rs.getBoolean("active"),
                rs.getInt("row_version"), rs.getTimestamp("updated_at").toInstant(), List.of());
    }

    private void audit(UUID actor, UUID requestId, String action, String entityType, UUID entityId,
                       String before, String after, String reason) {
        jdbc.update("""
            INSERT INTO wok.audit_logs (actor_user_id, action, entity_type, entity_id, before_data, after_data,
                reason, result, request_id)
            VALUES (?, ?, ?, ?, CAST(? AS jsonb), CAST(? AS jsonb), ?, 'SUCCESS', ?)
            """, actor, action, entityType, entityId, before, after, reason.trim(),
                requestId == null ? UUID.randomUUID() : requestId);
    }

    private static String groupSnapshot(String name, int min, int max, boolean required) {
        return "{\"name\":\"" + json(name) + "\",\"minSelection\":" + min +
                ",\"maxSelection\":" + max + ",\"required\":" + required + "}";
    }

    private static String optionSnapshot(ModifierOption option) {
        return "{\"groupId\":\"" + option.groupId() + "\",\"name\":\"" + json(option.name()) +
                "\",\"priceDelta\":" + option.priceDelta().toPlainString() + ",\"active\":" + option.active() + "}";
    }

    private static String snapshotIds(List<UUID> ids) {
        return "{\"groupIds\":[" + ids.stream().map(id -> "\"" + id + "\"").collect(java.util.stream.Collectors.joining(",")) + "]}";
    }

    private static String impactsSnapshot(List<ModifierItemImpact> impacts) {
        return "{\"impacts\":[" + impacts.stream().map(impact -> "{\"itemId\":\"" + impact.itemId() +
                "\",\"quantityDelta\":" + impact.quantityDelta().toPlainString() +
                ",\"affectsAvailability\":" + impact.affectsAvailability() + "}")
                .collect(java.util.stream.Collectors.joining(",")) + "]}";
    }

    private static String json(String value) {
        StringBuilder escaped = new StringBuilder(value.length());
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            if (character == '\\' || character == '"') escaped.append('\\').append(character);
            else if (character < 0x20) escaped.append(String.format("\\u%04x", (int) character));
            else escaped.append(character);
        }
        return escaped.toString();
    }

    private static UUID actor(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }

    public record ModifierGroup(UUID id, String name, int minSelection, int maxSelection, boolean required,
                                int rowVersion, Instant updatedAt, List<ModifierOption> options) {}
    public record ModifierOption(UUID id, UUID groupId, String name, BigDecimal priceDelta, boolean active,
                                 int rowVersion, Instant updatedAt, List<ModifierItemImpact> inventoryImpacts) {}
    public record ModifierItemImpact(UUID itemId, String itemName, BigDecimal quantityDelta,
                                     boolean affectsAvailability) {}
    public record ModifierGroupCreate(@NotBlank @Size(max = 100) String name, @Min(0) int minSelection,
            @Positive @Max(30) int maxSelection, boolean required, @NotBlank @Size(min = 3, max = 500) String reason) {}
    public record ModifierGroupUpdate(@NotBlank @Size(max = 100) String name, @Min(0) int minSelection,
            @Positive @Max(30) int maxSelection, boolean required, @Positive int expectedVersion,
            @NotBlank @Size(min = 3, max = 500) String reason) {}
    public record ModifierOptionCreate(@NotBlank @Size(max = 100) String name,
            @NotNull @DecimalMin("0.00") @Digits(integer = 12, fraction = 2) BigDecimal priceDelta,
            boolean active, @NotBlank @Size(min = 3, max = 500) String reason) {}
    public record ModifierOptionUpdate(@NotBlank @Size(max = 100) String name,
            @NotNull @DecimalMin("0.00") @Digits(integer = 12, fraction = 2) BigDecimal priceDelta,
            boolean active, @Positive int expectedVersion, @NotBlank @Size(min = 3, max = 500) String reason) {}
    public record MenuItemGroupsUpdate(@NotNull @Size(max = 30) List<@NotNull UUID> groupIds,
            @Positive int expectedVersion, @NotBlank @Size(min = 3, max = 500) String reason) {}
    public record ModifierImpactInput(@NotNull UUID itemId,
            @NotNull @Digits(integer = 12, fraction = 6) BigDecimal quantityDelta,
            boolean affectsAvailability) {}
    public record ModifierImpactsUpdate(@NotNull @Size(max = 30) List<@Valid ModifierImpactInput> impacts,
            @Positive int expectedVersion, @NotBlank @Size(min = 3, max = 500) String reason) {}
}

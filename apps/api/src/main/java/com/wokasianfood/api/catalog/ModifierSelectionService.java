package com.wokasianfood.api.catalog;

import com.wokasianfood.api.identity.AuthException;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Reads public modifier choices and validates submitted choices against the current catalog. */
@Service
public class ModifierSelectionService {
    private final JdbcTemplate jdbc;

    public ModifierSelectionService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public List<ModifierGroup> groups(UUID menuItemId) {
        return groupsForMenuItems(List.of(menuItemId)).getOrDefault(menuItemId, List.of());
    }

    public Map<UUID, List<ModifierGroup>> groupsForMenuItems(List<UUID> menuItemIds) {
        if (menuItemIds.isEmpty()) return Map.of();
        String placeholders = String.join(",", Collections.nCopies(menuItemIds.size(), "?"));
        String sql = """
            SELECT g.id AS group_id, g.name AS group_name, g.min_selection, g.max_selection, g.required,
                   mg.menu_item_id, mg.display_order AS group_order,
                   m.id AS modifier_id, m.name AS modifier_name, m.price_delta
            FROM wok.menu_item_modifier_groups mg
            JOIN wok.modifier_groups g ON g.id = mg.group_id
            LEFT JOIN wok.modifiers m ON m.group_id = g.id AND m.active = true
            WHERE mg.menu_item_id IN (%s)
            ORDER BY mg.menu_item_id, mg.display_order, g.name, m.name, m.id
            """.formatted(placeholders);
        Map<UUID, Map<UUID, GroupBuilder>> byMenuItem = new LinkedHashMap<>();
        jdbc.query(sql, rs -> {
                UUID menuItemId = rs.getObject("menu_item_id", UUID.class);
                Map<UUID, GroupBuilder> groups = byMenuItem.computeIfAbsent(menuItemId, ignored -> new LinkedHashMap<>());
                UUID groupId = rs.getObject("group_id", UUID.class);
                GroupBuilder group = groups.computeIfAbsent(groupId, ignored -> new GroupBuilder(groupId,
                        rsString(rs, "group_name"), rsInt(rs, "min_selection"), rsInt(rs, "max_selection"),
                        rsBool(rs, "required"), rsInt(rs, "group_order")));
                UUID modifierId = rs.getObject("modifier_id", UUID.class);
                if (modifierId != null) group.modifiers.add(new ModifierOption(modifierId,
                        rsString(rs, "modifier_name"), rs.getBigDecimal("price_delta")));
            }, menuItemIds.toArray());
        Map<UUID, List<ModifierGroup>> result = new LinkedHashMap<>();
        byMenuItem.forEach((menuItemId, groups) -> result.put(menuItemId,
                groups.values().stream().map(GroupBuilder::build).toList()));
        return result;
    }

    public List<SelectedModifier> validate(UUID menuItemId, List<UUID> requestedIds) {
        List<UUID> ids = requestedIds == null ? List.of() : requestedIds;
        if (ids.size() > 30 || ids.stream().anyMatch(id -> id == null)
                || ids.stream().distinct().count() != ids.size())
            throw new AuthException(422, "Revisa las opciones seleccionadas para el producto.");

        jdbc.query("""
            SELECT g.id FROM wok.menu_item_modifier_groups mg
            JOIN wok.modifier_groups g ON g.id = mg.group_id
            WHERE mg.menu_item_id = ? ORDER BY g.id FOR SHARE OF mg, g
            """, (rs, row) -> rs.getObject(1, UUID.class), menuItemId);
        jdbc.query("""
            SELECT m.id FROM wok.menu_item_modifier_groups mg
            JOIN wok.modifiers m ON m.group_id = mg.group_id AND m.active = true
            WHERE mg.menu_item_id = ? ORDER BY m.id FOR SHARE OF mg, m
            """, (rs, row) -> rs.getObject(1, UUID.class), menuItemId);

        List<ModifierGroup> groups = groups(menuItemId);
        Map<UUID, ModifierGroup> groupByModifier = new LinkedHashMap<>();
        Map<UUID, ModifierOption> modifierById = new LinkedHashMap<>();
        for (ModifierGroup group : groups) {
            for (ModifierOption modifier : group.options()) {
                groupByModifier.put(modifier.id(), group);
                modifierById.put(modifier.id(), modifier);
            }
        }

        Map<UUID, Integer> selectedCounts = new LinkedHashMap<>();
        for (UUID id : ids) {
            ModifierGroup group = groupByModifier.get(id);
            if (group == null) throw new AuthException(422, "Una opción seleccionada ya no está disponible para este producto.");
            selectedCounts.merge(group.id(), 1, Integer::sum);
        }
        for (ModifierGroup group : groups) {
            int count = selectedCounts.getOrDefault(group.id(), 0);
            if (count < group.minSelection() || count > group.maxSelection())
                throw new AuthException(422, "Completa las opciones requeridas de " + group.name() + ".");
        }

        List<SelectedModifier> selected = new ArrayList<>();
        for (ModifierGroup group : groups) {
            for (ModifierOption option : group.options()) {
                if (ids.contains(option.id())) selected.add(new SelectedModifier(option.id(), group.id(),
                        group.name(), option.name(), option.priceDelta()));
            }
        }
        return List.copyOf(selected);
    }

    private static String rsString(java.sql.ResultSet rs, String column) {
        try { return rs.getString(column); }
        catch (java.sql.SQLException error) { throw new IllegalStateException("Unable to read menu modifiers", error); }
    }

    private static int rsInt(java.sql.ResultSet rs, String column) {
        try { return rs.getInt(column); }
        catch (java.sql.SQLException error) { throw new IllegalStateException("Unable to read menu modifiers", error); }
    }

    private static boolean rsBool(java.sql.ResultSet rs, String column) {
        try { return rs.getBoolean(column); }
        catch (java.sql.SQLException error) { throw new IllegalStateException("Unable to read menu modifiers", error); }
    }

    private static final class GroupBuilder {
        private final UUID id;
        private final String name;
        private final int minSelection;
        private final int maxSelection;
        private final boolean required;
        private final int displayOrder;
        private final List<ModifierOption> modifiers = new ArrayList<>();

        private GroupBuilder(UUID id, String name, int minSelection, int maxSelection, boolean required, int displayOrder) {
            this.id = id; this.name = name; this.minSelection = minSelection; this.maxSelection = maxSelection;
            this.required = required; this.displayOrder = displayOrder;
        }

        private ModifierGroup build() {
            return new ModifierGroup(id, name, minSelection, maxSelection, required, displayOrder, List.copyOf(modifiers));
        }
    }

    public record ModifierGroup(UUID id, String name, int minSelection, int maxSelection,
                                boolean required, int displayOrder, List<ModifierOption> options) {}
    public record ModifierOption(UUID id, String name, BigDecimal priceDelta) {}
    public record SelectedModifier(UUID id, UUID groupId, String groupName, String name, BigDecimal priceDelta) {}
}

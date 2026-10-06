package com.wokasianfood.api.catalog;

import com.wokasianfood.api.identity.AuthException;
import com.wokasianfood.api.catalog.ModifierSelectionService.SelectedModifier;
import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Returns a point-in-time stock estimate. It never reserves inventory or guarantees later acceptance. */
@RestController
@RequestMapping("/api/v1/public/menu/availability")
public class PublicMenuAvailabilityController {
    private final JdbcTemplate jdbc;
    private final ModifierSelectionService modifiers;

    public PublicMenuAvailabilityController(JdbcTemplate jdbc, ModifierSelectionService modifiers) {
        this.jdbc = jdbc;
        this.modifiers = modifiers;
    }

    @PostMapping
    @Transactional(isolation = Isolation.REPEATABLE_READ)
    public AvailabilityEstimate estimate(@Valid @RequestBody AvailabilityRequest request) {
        if (request.items().stream().map(AvailabilityLine::menuItemId).distinct().count() != request.items().size())
            throw new AuthException(422, "Envía cada producto una sola vez en la revisión de disponibilidad.");

        List<LineState> lineStates = new ArrayList<>();
        Map<UUID, Requirement> requirements = new LinkedHashMap<>();
        for (int lineIndex = 0; lineIndex < request.items().size(); lineIndex++) {
            AvailabilityLine line = request.items().get(lineIndex);
            List<UUID> products = jdbc.query("""
                SELECT mi.id FROM wok.menu_items mi
                JOIN wok.items sellable ON sellable.id = mi.item_id AND sellable.active = true
                JOIN wok.menu_categories category ON category.id = mi.category_id AND category.active = true
                WHERE mi.id = ? AND mi.status = 'ACTIVE' AND mi.visibility = 'PUBLIC'
                FOR SHARE OF mi, sellable, category
                """, (rs, row) -> rs.getObject("id", UUID.class), line.menuItemId());
            if (products.isEmpty()) throw new AuthException(422, "Uno o más productos ya no están publicados.");

            List<SelectedModifier> selected;
            try { selected = modifiers.validate(line.menuItemId(), line.modifierIds()); }
            catch (AuthException invalid) { throw invalid; }
            lineStates.add(new LineState(line.menuItemId()));

            List<RecipeRequirement> recipe = jdbc.query("""
                SELECT rc.component_item_id, rc.quantity
                FROM wok.item_recipe_components rc
                JOIN wok.menu_items mi ON mi.item_id = rc.parent_item_id
                WHERE mi.id = ?
                ORDER BY rc.component_item_id
                """, (rs, row) -> new RecipeRequirement(rs.getObject("component_item_id", UUID.class),
                    rs.getBigDecimal("quantity")), line.menuItemId());
            for (RecipeRequirement component : recipe) {
                Requirement requirement = requirements.computeIfAbsent(component.itemId(), ignored -> new Requirement());
                requirement.base = requirement.base.add(component.quantity().multiply(BigDecimal.valueOf(line.quantity())));
                requirement.lines.add(lineIndex);
                lineStates.getLast().tracked = true;
            }

            if (!selected.isEmpty()) {
                String placeholders = String.join(",", java.util.Collections.nCopies(selected.size(), "?"));
                List<Impact> impacts = jdbc.query("""
                    SELECT modifier_id, item_id, quantity_delta
                    FROM wok.modifier_item_impacts
                    WHERE affects_availability = true AND modifier_id IN (%s)
                    ORDER BY item_id, modifier_id
                    """.formatted(placeholders), (rs, row) -> new Impact(rs.getObject("modifier_id", UUID.class),
                        rs.getObject("item_id", UUID.class), rs.getBigDecimal("quantity_delta")),
                        selected.stream().map(SelectedModifier::id).toArray());
                for (Impact impact : impacts) {
                    Requirement requirement = requirements.computeIfAbsent(impact.itemId(), ignored -> new Requirement());
                    requirement.modifierDelta = requirement.modifierDelta.add(
                            impact.quantityDelta().multiply(BigDecimal.valueOf(line.quantity())));
                    requirement.lines.add(lineIndex);
                    lineStates.getLast().tracked = true;
                }
            }
        }

        for (Map.Entry<UUID, Requirement> entry : requirements.entrySet()) {
            UUID itemId = entry.getKey();
            Requirement requirement = entry.getValue();
            BigDecimal netReserved = requirement.base.add(requirement.modifierDelta);
            BigDecimal requiredFromStock = requirement.base.add(requirement.modifierDelta.max(BigDecimal.ZERO));
            boolean available = netReserved.signum() >= 0;
            if (available && requiredFromStock.signum() > 0) {
                List<Stock> stock = jdbc.query("""
                    SELECT item.active, COALESCE(balance.quantity_on_hand, 0) AS on_hand,
                           COALESCE(reserved.quantity, 0) AS reserved
                    FROM wok.items item
                    LEFT JOIN wok.inventory_balances balance ON balance.item_id = item.id
                    LEFT JOIN LATERAL (
                        SELECT COALESCE(sum(reservation.quantity), 0) AS quantity
                        FROM wok.inventory_reservations reservation
                        WHERE reservation.item_id = item.id AND reservation.status = 'ACTIVE'
                    ) reserved ON true
                    WHERE item.id = ?
                    FOR SHARE OF item
                """, (rs, row) -> new Stock(rs.getBoolean("active"),
                        rs.getBigDecimal("on_hand"), rs.getBigDecimal("reserved")), itemId);
                available = !stock.isEmpty() && stock.getFirst().active()
                        && stock.getFirst().onHand().subtract(stock.getFirst().reserved()).compareTo(requiredFromStock) >= 0;
            }
            if (!available) requirement.lines.forEach(index -> lineStates.get(index).available = false);
        }

        List<LineAvailability> lines = lineStates.stream().map(LineState::toResult).toList();
        boolean anyTracked = lineStates.stream().anyMatch(state -> state.tracked);
        boolean hasUnavailable = lineStates.stream().anyMatch(state -> Boolean.FALSE.equals(state.available));
        boolean hasUntracked = lineStates.stream().anyMatch(state -> !state.tracked);
        Boolean cartAvailable = null;
        if (hasUnavailable) cartAvailable = Boolean.FALSE;
        else if (anyTracked && !hasUntracked) cartAvailable = Boolean.TRUE;
        return new AvailabilityEstimate(cartAvailable, true, Instant.now(), lines);
    }

    public record AvailabilityRequest(@NotEmpty @Size(max = 100) List<@Valid AvailabilityLine> items) {}
    public record AvailabilityLine(@NotNull UUID menuItemId, @Positive @Max(50) int quantity,
                                   @Size(max = 30) List<@NotNull UUID> modifierIds) {
        public AvailabilityLine {
            modifierIds = modifierIds == null ? List.of()
                    : Collections.unmodifiableList(new ArrayList<>(modifierIds));
        }
    }
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record AvailabilityEstimate(Boolean availableEstimate, boolean estimateOnly, Instant asOf,
                                       List<LineAvailability> items) {}
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record LineAvailability(UUID menuItemId, String status, String reasonCode) {}

    private record RecipeRequirement(UUID itemId, BigDecimal quantity) {}
    private record Impact(UUID modifierId, UUID itemId, BigDecimal quantityDelta) {}
    private record Stock(boolean active, BigDecimal onHand, BigDecimal reserved) {}

    private static final class Requirement {
        private BigDecimal base = BigDecimal.ZERO;
        private BigDecimal modifierDelta = BigDecimal.ZERO;
        private final Set<Integer> lines = new LinkedHashSet<>();
    }

    private static final class LineState {
        private final UUID menuItemId;
        private boolean tracked;
        private Boolean available = true;
        private LineState(UUID menuItemId) { this.menuItemId = menuItemId; }
        private LineAvailability toResult() {
            if (!tracked) return new LineAvailability(menuItemId, "NOT_TRACKED", null);
            if (Boolean.FALSE.equals(available)) return new LineAvailability(menuItemId, "UNAVAILABLE_ESTIMATE", "INSUFFICIENT_STOCK_OR_CATALOG_CONFIGURATION");
            return new LineAvailability(menuItemId, "AVAILABLE_ESTIMATE", null);
        }
    }
}

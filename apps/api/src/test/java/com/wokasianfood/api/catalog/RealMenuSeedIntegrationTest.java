package com.wokasianfood.api.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.sql.Connection;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "wok.catalog.seed-enabled=true",
        "wok.catalog.seed-file=file:../../database/seeds/menu_real_dev.sql"
})
class RealMenuSeedIntegrationTest extends PostgresIntegrationTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void seedsTheCurrentMenuAndPreliminaryDrinkMeasuresWithoutActivatingStockUse() throws Exception {
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.menu_items WHERE slug IS NOT NULL", Integer.class)).isEqualTo(31);
        createLegacyPreparationAreasAndAttachExistingMenuItem();
        jdbc.update("UPDATE wok.units SET factor_to_base=1 WHERE code='FL_OZ'");
        runSeed();

        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.menu_categories WHERE name IN ('Sushi','Especialidades','Bebidas','Bebidas +18')",
                Integer.class)).isEqualTo(4);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.menu_items WHERE slug LIKE 'maki-%' OR slug LIKE 'uramaki-%' OR slug IN ('gamba-roll','camaron-crunchy','panko','onigiris')",
                Integer.class)).isEqualTo(9);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.menu_items WHERE slug IS NOT NULL AND status='ACTIVE' AND visibility='PUBLIC'",
                Integer.class)).isEqualTo(31);
        assertThat(jdbc.queryForObject("SELECT price FROM wok.menu_items WHERE slug='maki-atun'", BigDecimal.class))
                .isEqualByComparingTo("70.00");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.menu_items WHERE age_restricted=true AND slug IN ('cerveza-nacional','cerveza-tsingtao','cerveza-sapporo','soju')",
                Integer.class)).isEqualTo(4);
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM wok.menu_items mi
                JOIN wok.preparation_areas pa ON pa.id=mi.preparation_area_id
                WHERE (mi.category_id=(SELECT id FROM wok.menu_categories WHERE name='Sushi') AND pa.code='COCINA_FRIA')
                   OR (mi.category_id=(SELECT id FROM wok.menu_categories WHERE name='Especialidades') AND pa.code='COCINA_CALIENTE')
                   OR (mi.category_id IN (SELECT id FROM wok.menu_categories WHERE name IN ('Bebidas','Bebidas +18')) AND pa.code='BARRA')
                """, Integer.class)).isEqualTo(31);
        assertThat(jdbc.queryForObject("SELECT active FROM wok.preparation_areas WHERE code='HOT_KITCHEN'", Boolean.class))
                .isFalse();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.menu_items WHERE slug IS NOT NULL AND recipe_status='PENDING_DATA'",
                Integer.class)).isEqualTo(31);
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM wok.item_recipe_components rc
                JOIN wok.menu_items product ON product.item_id=rc.parent_item_id
                WHERE product.slug IN ('matcha-latte','matcha-kiwi','matcha-maracuya','blue-matcha','carbonatada')
                """, Integer.class)).isEqualTo(19);
        assertThat(recipeQuantity("matcha-latte", "ING_MATCHA_GREEN")).isEqualByComparingTo("1");
        assertThat(recipeQuantity("matcha-latte", "ING_WATER")).isEqualByComparingTo("59.14706");
        assertThat(recipeQuantity("matcha-latte", "ING_MILK")).isEqualByComparingTo("147.86765");
        assertThat(recipeQuantity("matcha-latte", "ING_SIMPLE_SYRUP")).isEqualByComparingTo("59.14706");
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM wok.item_recipe_components rc
                JOIN wok.menu_items product ON product.item_id=rc.parent_item_id
                JOIN wok.items component ON component.id=rc.component_item_id
                WHERE product.slug IN ('matcha-latte','matcha-kiwi','matcha-maracuya','blue-matcha')
                  AND component.sku='ING_SIMPLE_SYRUP' AND rc.quantity=59.14706
                """, Integer.class)).isEqualTo(4);
        assertThat(recipeQuantity("matcha-kiwi", "ING_KIWI_PULP")).isEqualByComparingTo("29.57353");
        assertThat(recipeQuantity("matcha-maracuya", "ING_PASSIONFRUIT_PULP")).isEqualByComparingTo("29.57353");
        assertThat(recipeQuantity("blue-matcha", "ING_MATCHA_BLUE")).isEqualByComparingTo("1");
        assertThat(recipeQuantity("carbonatada", "ING_MINERAL_WATER_CAN")).isEqualByComparingTo("1");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.items i JOIN wok.item_types t ON t.id=i.item_type_id WHERE t.code='PRELIMINARY_INGREDIENT' AND i.track_inventory", Integer.class)).isEqualTo(8);
        assertThat(jdbc.queryForObject("SELECT factor_to_base FROM wok.units WHERE code='FL_OZ'", BigDecimal.class))
                .isEqualByComparingTo("29.573530");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.inventory_balances b JOIN wok.items i ON i.id=b.item_id JOIN wok.item_types t ON t.id=i.item_type_id WHERE t.code='PRELIMINARY_INGREDIENT'", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.item_recipe_components rc JOIN wok.menu_items mi ON mi.item_id=rc.parent_item_id WHERE mi.slug IN ('matcha-latte','matcha-kiwi','matcha-maracuya','blue-matcha','carbonatada') AND mi.recipe_status='ACTIVE'", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.inventory_reservations reservation JOIN wok.items i ON i.id=reservation.item_id JOIN wok.item_types t ON t.id=i.item_type_id WHERE t.code='PRELIMINARY_INGREDIENT'", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.modifier_item_impacts impact JOIN wok.items i ON i.id=impact.item_id WHERE i.sku IN ('ING_KIWI_PULP','ING_PASSIONFRUIT_PULP') AND impact.quantity_delta=59.14706 AND impact.affects_availability=false", Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.modifier_item_impacts impact JOIN wok.items i ON i.id=impact.item_id JOIN wok.item_types t ON t.id=i.item_type_id WHERE t.code='PRELIMINARY_INGREDIENT' AND impact.affects_availability=true", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.menu_items mi JOIN wok.menu_item_modifier_groups link ON link.menu_item_id=mi.id JOIN wok.modifier_groups g ON g.id=link.group_id WHERE mi.slug IS NOT NULL AND g.name='Extras'",
                Integer.class)).isEqualTo(9);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.items i JOIN wok.menu_items mi ON mi.item_id=i.id WHERE mi.slug IS NOT NULL AND i.track_inventory",
                Integer.class)).isZero();
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM wok.modifier_item_impacts impact
                JOIN wok.menu_items menu ON menu.item_id=impact.item_id
                WHERE menu.slug IS NOT NULL
                """, Integer.class)).isZero();

        UUID onigiriId = jdbc.queryForObject("SELECT id FROM wok.menu_items WHERE slug='onigiris'", UUID.class);
        ModifierSelectionService service = new ModifierSelectionService(jdbc);
        UUID makiId = jdbc.queryForObject("SELECT id FROM wok.menu_items WHERE slug='maki-atun'", UUID.class);
        var makiOptions = service.groups(makiId).stream().flatMap(group -> group.options().stream()).toList();
        assertThat(makiOptions.stream().filter(option -> option.priceDelta().compareTo(BigDecimal.valueOf(5)) == 0)
                .map(ModifierSelectionService.ModifierOption::name))
                .containsExactlyInAnyOrder("Aguacate", "Mayonesa chipotle", "Mayonesa jalapeño", "Salsa de anguila");
        var options = service.groups(onigiriId).stream().flatMap(group -> group.options().stream()).toList();
        BigDecimal base = jdbc.queryForObject("SELECT price FROM wok.menu_items WHERE id=?", BigDecimal.class, onigiriId);
        assertThat(base.add(delta(options, "Ensalada de surimi")).add(delta(options, "Normal"))).isEqualByComparingTo("40");
        assertThat(base.add(delta(options, "Atún chipotle")).add(delta(options, "Normal"))).isEqualByComparingTo("45");
        assertThat(base.add(delta(options, "Ensalada de surimi")).add(delta(options, "Frito en panko"))).isEqualByComparingTo("45");
        assertThat(base.add(delta(options, "Atún chipotle")).add(delta(options, "Frito en panko"))).isEqualByComparingTo("50");

        JsonNode menu = json.readTree(get("/api/v1/public/menu", null).body());
        assertThat(menu.toString()).contains("Maki Atún", "maki-atun").doesNotContain("PENDING_DATA", "PRELIMINARY_RECIPE_HINT");
        JsonNode maki = menu.path("categories").findValues("items").stream()
                .flatMap(node -> java.util.stream.StreamSupport.stream(node.spliterator(), false))
                .filter(item -> item.path("slug").asText().equals("maki-atun")).findFirst().orElseThrow();
        assertThat(maki.path("price").decimalValue()).isEqualByComparingTo("70");
        JsonNode importedBeer = json.readTree(get("/api/v1/public/menu/products/cerveza-sapporo", null).body());
        assertThat(importedBeer.path("ageRestricted").asBoolean()).isTrue();
        assertThat(importedBeer.path("price").decimalValue()).isEqualByComparingTo("35");
        assertThat(get("/api/v1/public/menu/products/not-a-product", null).statusCode()).isEqualTo(404);
    }

    private BigDecimal delta(java.util.List<ModifierSelectionService.ModifierOption> options, String name) {
        return options.stream().filter(option -> option.name().equals(name)).findFirst().orElseThrow().priceDelta();
    }

    private BigDecimal recipeQuantity(String slug, String componentSku) {
        return jdbc.queryForObject("""
                SELECT rc.quantity FROM wok.item_recipe_components rc
                JOIN wok.menu_items product ON product.item_id=rc.parent_item_id
                JOIN wok.items component ON component.id=rc.component_item_id
                WHERE product.slug=? AND component.sku=?
                """, BigDecimal.class, slug, componentSku);
    }

    private void runSeed() throws Exception {
        Path seed = Path.of("../../database/seeds/menu_real_dev.sql").toAbsolutePath().normalize();
        try (Connection connection = DATABASE.createConnection("")) {
            ScriptUtils.executeSqlScript(connection, new FileSystemResource(seed));
        }
    }

    private void createLegacyPreparationAreasAndAttachExistingMenuItem() {
        jdbc.update("INSERT INTO wok.preparation_areas(code, name) VALUES ('SUSHI_BAR', 'Barra de sushi'), ('HOT_KITCHEN', 'Cocina caliente'), ('BAR', 'Barra de bebidas')");
        jdbc.update("UPDATE wok.menu_items SET preparation_area_id=(SELECT id FROM wok.preparation_areas WHERE code='HOT_KITCHEN') WHERE slug='pollo-naranja'");
    }
}

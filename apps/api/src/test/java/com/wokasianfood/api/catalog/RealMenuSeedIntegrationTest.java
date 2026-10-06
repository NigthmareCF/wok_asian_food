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
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

class RealMenuSeedIntegrationTest extends PostgresIntegrationTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void seedsTheCurrentMenuRepeatablyWithoutInventingRecipesOrStock() throws Exception {
        runSeed();
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
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.menu_items WHERE slug IS NOT NULL AND recipe_status='PENDING_DATA'",
                Integer.class)).isEqualTo(31);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.menu_items mi JOIN wok.menu_item_modifier_groups link ON link.menu_item_id=mi.id JOIN wok.modifier_groups g ON g.id=link.group_id WHERE mi.slug IS NOT NULL AND g.name='SUSHI_EXTRAS'",
                Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.items i JOIN wok.menu_items mi ON mi.item_id=i.id WHERE mi.slug IS NOT NULL AND i.track_inventory",
                Integer.class)).isZero();
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM wok.modifier_item_impacts impact
                JOIN wok.menu_items menu ON menu.item_id=impact.item_id
                WHERE menu.slug IS NOT NULL
                """, Integer.class)).isZero();

        UUID onigiriId = jdbc.queryForObject("SELECT id FROM wok.menu_items WHERE slug='onigiris'", UUID.class);
        ModifierSelectionService service = new ModifierSelectionService(jdbc);
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

    private void runSeed() throws Exception {
        Path seed = Path.of("../../database/seeds/menu_real_dev.sql").toAbsolutePath().normalize();
        try (Connection connection = DATABASE.createConnection("")) {
            ScriptUtils.executeSqlScript(connection, new FileSystemResource(seed));
        }
    }
}

package com.wokasianfood.api.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.net.http.HttpResponse;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AdminCatalogSetupIntegrationTest extends PostgresIntegrationTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void createsCatalogStructureAndUnpublishedProductIdempotently() throws Exception {
        UUID adminId = createUserWithRole("catalog-setup-" + UUID.randomUUID() + "@wok.test", "ADMIN");
        String admin = tokenFor(adminId);
        String categoryUrl = "/api/v1/admin/catalog/categories";
        String categoryBody = "{\"name\":\"Woks de prueba\",\"displayOrder\":2,\"reason\":\"alta inicial\"}";
        Map<String, String> categoryKey = Map.of("Idempotency-Key", UUID.randomUUID().toString());
        JsonNode category = body(post(categoryUrl, admin, categoryBody, categoryKey));
        JsonNode categoryReplay = body(post(categoryUrl, admin, categoryBody, categoryKey));
        assertThat(categoryReplay.path("id").asText()).isEqualTo(category.path("id").asText());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.audit_logs WHERE entity_id = ? AND action = 'MENU_CATEGORY_CREATED'",
                Integer.class, UUID.fromString(category.path("id").asText()))).isEqualTo(1);
        assertThat(post(categoryUrl, admin, categoryBody.replace("Woks", "Arroces"), categoryKey).statusCode()).isEqualTo(409);
        String updateCategoryBody = "{\"name\":\"Woks de prueba\",\"displayOrder\":3,\"active\":true,\"expectedVersion\":1,\"reason\":\"ordenar categorías\"}";
        Map<String, String> updateCategoryKey = Map.of("Idempotency-Key", UUID.randomUUID().toString());
        JsonNode updatedCategory = body(send("PUT", categoryUrl + "/" + category.path("id").asText(), admin,
                updateCategoryBody, updateCategoryKey));
        JsonNode categoryUpdateReplay = body(send("PUT", categoryUrl + "/" + category.path("id").asText(), admin,
                updateCategoryBody, updateCategoryKey));
        assertThat(updatedCategory.path("rowVersion").asInt()).isEqualTo(2);
        assertThat(categoryUpdateReplay.path("rowVersion").asInt()).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.audit_logs WHERE entity_id = ? AND action = 'MENU_CATEGORY_UPDATED'",
                Integer.class, UUID.fromString(category.path("id").asText()))).isEqualTo(1);

        String areasUrl = "/api/v1/admin/catalog/preparation-areas";
        Map<String, String> areaKey = Map.of("Idempotency-Key", UUID.randomUUID().toString());
        JsonNode area = body(post(areasUrl, admin,
                "{\"code\":\"hot_wok\",\"name\":\"Plancha y wok\",\"reason\":\"configurar cocina\"}", areaKey));
        assertThat(area.path("code").asText()).isEqualTo("HOT_WOK");
        assertThat(body(post(areasUrl, admin,
                "{\"code\":\"HOT_WOK\",\"name\":\"Plancha y wok\",\"reason\":\"configurar cocina\"}", areaKey))
                .path("id").asText()).isEqualTo(area.path("id").asText());
        String areaUpdateBody = "{\"name\":\"Wok y salteados\",\"active\":true,\"expectedVersion\":1,\"reason\":\"ajustar estación\"}";
        Map<String, String> updateAreaKey = Map.of("Idempotency-Key", UUID.randomUUID().toString());
        JsonNode updatedArea = body(send("PUT", areasUrl + "/" + area.path("id").asText(), admin,
                areaUpdateBody, updateAreaKey));
        assertThat(body(send("PUT", areasUrl + "/" + area.path("id").asText(), admin,
                areaUpdateBody, updateAreaKey)).path("rowVersion").asInt()).isEqualTo(2);
        assertThat(updatedArea.path("name").asText()).isEqualTo("Wok y salteados");

        String productUrl = "/api/v1/admin/catalog/menu-items";
        String productBody = """
            {"categoryId":"%s","preparationAreaId":"%s","name":"Wok de prueba","description":"Sin receta configurada",
             "price":65.00,"currency":"gtq","displayOrder":1,"estimatedPreparationSeconds":0,"reason":"cargar menú recibido"}
            """.formatted(category.path("id").asText(), area.path("id").asText());
        Map<String, String> productKey = Map.of("Idempotency-Key", UUID.randomUUID().toString());
        JsonNode product = body(post(productUrl, admin, productBody, productKey));
        JsonNode replay = body(post(productUrl, admin, productBody, productKey));
        assertThat(replay.path("menuItemId").asText()).isEqualTo(product.path("menuItemId").asText());
        assertThat(product.path("visibility").asText()).isEqualTo("HIDDEN");
        assertThat(product.path("status").asText()).isEqualTo("INACTIVE");
        assertThat(product.path("inventoryTracked").asBoolean()).isFalse();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.audit_logs WHERE entity_id = ? AND action = 'MENU_ITEM_CREATED'",
                Integer.class, UUID.fromString(product.path("menuItemId").asText()))).isEqualTo(1);

        JsonNode publicMenu = json.readTree(get("/api/v1/public/menu", null).body());
        assertThat(publicMenu.toString()).doesNotContain(product.path("menuItemId").asText());

        JsonNode published = body(send("PUT", productUrl + "/" + product.path("menuItemId").asText(), admin, """
            {"name":"Wok de prueba","description":"Sin receta configurada","price":65.00,"currency":"GTQ",
             "categoryId":"%s","preparationAreaId":"%s","visibility":"PUBLIC","status":"ACTIVE",
             "displayOrder":1,"estimatedPreparationSeconds":0,"expectedVersion":1,"reason":"revisar y publicar producto"}
            """.formatted(category.path("id").asText(), area.path("id").asText()), Map.of()));
        assertThat(published.path("categoryId").asText()).isEqualTo(category.path("id").asText());
        assertThat(published.path("preparationAreaId").asText()).isEqualTo(area.path("id").asText());
        JsonNode menuAfterPublish = json.readTree(get("/api/v1/public/menu", null).body());
        assertThat(menuAfterPublish.toString()).contains(product.path("menuItemId").asText());
        assertThat(get(categoryUrl, tokenForRole("CLIENT")).statusCode()).isEqualTo(403);
    }

    @Test
    void preventsDeactivatingCatalogResourcesUsedByActiveProductsAndChecksVersions() {
        UUID adminId = createUserWithRole("catalog-resource-" + UUID.randomUUID() + "@wok.test", "ADMIN");
        String admin = tokenFor(adminId);
        JsonNode category = body(post("/api/v1/admin/catalog/categories", admin,
                "{\"name\":\"Categoría protegida\",\"displayOrder\":0,\"reason\":\"alta inicial\"}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        JsonNode area = body(post("/api/v1/admin/catalog/preparation-areas", admin,
                "{\"code\":\"SAFE_AREA\",\"name\":\"Área protegida\",\"reason\":\"alta inicial\"}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        String productBody = """
            {"categoryId":"%s","preparationAreaId":"%s","name":"Producto protegido","price":12.00,
             "currency":"GTQ","displayOrder":0,"estimatedPreparationSeconds":0,"reason":"preparar alta"}
            """.formatted(category.path("id").asText(), area.path("id").asText());
        JsonNode product = body(post("/api/v1/admin/catalog/menu-items", admin, productBody,
                Map.of("Idempotency-Key", UUID.randomUUID().toString())));
        UUID menuItemId = UUID.fromString(product.path("menuItemId").asText());
        jdbc.update("UPDATE wok.menu_items SET status = 'ACTIVE' WHERE id = ?", menuItemId);

        HttpResponse<String> categoryConflict = send("PUT", "/api/v1/admin/catalog/categories/" + category.path("id").asText(), admin,
                "{\"name\":\"Categoría protegida\",\"displayOrder\":0,\"active\":false,\"expectedVersion\":1,\"reason\":\"desactivar\"}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(categoryConflict.statusCode()).isEqualTo(409);
        HttpResponse<String> areaConflict = send("PUT", "/api/v1/admin/catalog/preparation-areas/" + area.path("id").asText(), admin,
                "{\"name\":\"Área protegida\",\"active\":false,\"expectedVersion\":1,\"reason\":\"desactivar\"}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(areaConflict.statusCode()).isEqualTo(409);

        HttpResponse<String> stale = send("PUT", "/api/v1/admin/catalog/categories/" + category.path("id").asText(), admin,
                "{\"name\":\"Categoría protegida\",\"displayOrder\":1,\"active\":true,\"expectedVersion\":2,\"reason\":\"versión obsoleta\"}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(stale.statusCode()).isEqualTo(409);
    }

    private JsonNode body(java.net.http.HttpResponse<String> response) {
        assertThat(response.statusCode()).as(response.body()).isBetween(200, 299);
        try { return json.readTree(response.body()); }
        catch (Exception failure) { throw new IllegalStateException(failure); }
    }
}

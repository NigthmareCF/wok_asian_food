package com.wokasianfood.api.operational;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import com.wokasianfood.api.support.NodeRuntime;
import java.math.BigDecimal;
import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

// Opt-in: requiere una copia Web compilada sin .env y dependencias ya instaladas.
// La base de datos procede exclusivamente del Testcontainer de esta clase.
@EnabledIfSystemProperty(named = "wok.web.test.dir", matches = ".+")
class WebFindingBoundaryIntegrationTest extends PostgresIntegrationTest {
    private final ObjectMapper json = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build();
    private String web;

    @Test
    void verifiesRealProfileSerializationAndActorBoundCreationAndAppend() throws Exception {
        Path directory = Path.of(System.getProperty("wok.web.test.dir")).toAbsolutePath();
        int webPort;
        try (ServerSocket socket = new ServerSocket(0)) { webPort = socket.getLocalPort(); }
        web = "http://127.0.0.1:" + webPort;
        ProcessBuilder builder = new ProcessBuilder(NodeRuntime.executable(),
            System.getProperty("wok.web.next.bin"), "start", "-p", String.valueOf(webPort));
        builder.directory(directory.toFile());
        builder.environment().put("WOK_API_BASE_URL", baseUrl());
        builder.environment().put("NEXT_TELEMETRY_DISABLED", "1");
        builder.redirectErrorStream(true).redirectOutput(directory.resolve("boundary-next.log").toFile());
        Process next = builder.start();
        try {
            long deadline = System.nanoTime() + Duration.ofSeconds(40).toNanos();
            boolean ready = false;
            while (System.nanoTime() < deadline && next.isAlive()) {
                try {
                    ready = http.send(HttpRequest.newBuilder(URI.create(web + "/bff/auth/session"))
                        .timeout(Duration.ofSeconds(2)).GET().build(), HttpResponse.BodyHandlers.discarding()).statusCode() == 401;
                    if (ready) break;
                } catch (Exception ignored) { }
                Thread.sleep(200);
            }
            assertThat(ready).as("Next aislado disponible").isTrue();
            UUID client = createUserWithRole("profile-boundary-" + UUID.randomUUID() + "@wok.test", "CLIENT");
            jdbc.update("INSERT INTO wok.customer_profiles(user_id, full_name) VALUES (?, 'Cliente ficticio')", client);
            String customer = tokenFor(client);
            JsonNode raw = body(get("/api/v1/client/profile", customer));
            assertThat(raw.has("phone")).isFalse();
            JsonNode profile = body(bff("GET", "/bff/profile", customer, client, null, null));
            assertThat(profile.has("phone")).isTrue();
            assertThat(profile.path("phone").isNull()).isTrue();
            int version = profile.path("version").asInt();
            JsonNode withPhone = body(bff("PUT", "/bff/profile", customer, client,
                "{\"displayName\":\"Cliente ficticio\",\"phone\":\"12345678\",\"expectedVersion\":" + version + "}", null));
            assertThat(withPhone.path("phone").asText()).isEqualTo("12345678");
            JsonNode withoutPhone = body(bff("PUT", "/bff/profile", customer, client,
                "{\"displayName\":\"Cliente ficticio\",\"phone\":\"\",\"expectedVersion\":" + (version + 1) + "}", null));
            assertThat(withoutPhone.has("phone")).isTrue();
            assertThat(withoutPhone.path("phone").isNull()).isTrue();
            assertThat(jdbc.queryForObject("SELECT phone FROM wok.users WHERE id = ?", String.class, client)).isNull();
            assertThat(body(bff("GET", "/bff/profile", tokenFor(client), client, null, null)).path("phone").isNull()).isTrue();

            UUID owner = createUserWithRole("staff-owner-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
            UUID other = createUserWithRole("staff-other-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
            String staff = tokenFor(owner), otherStaff = tokenFor(other);
            UUID table = UUID.fromString(body(post("/api/v1/operational/tables", staff,
                "{\"name\":\"Mesa ficticia F2\",\"capacity\":4,\"zone\":\"SALON\"}")).path("id").asText());
            UUID account = UUID.fromString(body(post("/api/v1/operational/tables/" + table + "/open", staff, null)).path("accountId").asText());
            UUID item = seedItem();
            String items = "{\"items\":[{\"menuItemId\":\"" + item + "\",\"quantity\":1,\"fulfillment\":\"DINE_IN\"}]}";
            String creation = "{\"accountId\":\"" + account + "\",\"channel\":\"DINE_IN\",\"guestCount\":1," + items.substring(1);
            UUID key = UUID.randomUUID();
            assertThat(bff("POST", "/bff/operational/orders", otherStaff, owner, creation, key).statusCode()).isEqualTo(409);
            assertThat(bff("POST", "/bff/operational/orders", staff, null, creation, key).statusCode()).isEqualTo(409);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.orders WHERE account_id = ?", Integer.class, account)).isZero();
            JsonNode receipt = body(bff("POST", "/bff/operational/orders", staff, owner, creation, key));
            UUID order = UUID.fromString(receipt.path("orderId").asText());
            assertThat(body(bff("POST", "/bff/operational/orders", tokenFor(owner), owner, creation, key)).path("orderId").asText()).isEqualTo(order.toString());
            assertThat(jdbc.queryForObject("SELECT opened_by FROM wok.orders WHERE id = ?", UUID.class, order)).isEqualTo(owner);
            UUID appendKey = UUID.randomUUID();
            String appendPath = "/bff/operational/orders/" + order + "/items";
            assertThat(bff("POST", appendPath, otherStaff, owner, items, appendKey).statusCode()).isEqualTo(409);
            assertThat(bff("POST", appendPath, staff, null, items, appendKey).statusCode()).isEqualTo(409);
            body(bff("POST", appendPath, staff, owner, items, appendKey));
            body(bff("POST", appendPath, tokenFor(owner), owner, items, appendKey));
            assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.order_items WHERE order_id = ?", Integer.class, order)).isEqualTo(2);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM wok.orders WHERE account_id = ?", Integer.class, account)).isEqualTo(1);
            assertThat(bff("GET", "/bff/operational/orders/" + order, otherStaff, owner, null, null).statusCode()).isEqualTo(409);

            java.time.Instant requestedFor = java.time.Instant.now().plusSeconds(900);
            // Horario ficticio solo en el PostgreSQL nuevo para no depender de la hora de ejecuci?n.
            jdbc.update("UPDATE wok.business_hours SET opens_at = '00:00', closes_at = '23:59' WHERE service_type = 'RESTAURANT'");
            String pickup = "{\"requestedFor\":\"" + requestedFor + "\",\"items\":[{\"menuItemId\":\"" + item + "\",\"quantity\":1}]}";
            String requestId = body(post("/api/v1/client/order-requests", customer, pickup, Map.of("Idempotency-Key",UUID.randomUUID().toString()))).path("requestId").asText();
            body(post("/api/v1/operational/order-requests/" + requestId + "/decision", staff, "{\"action\":\"ACCEPT\"}"));
            String visual = System.getProperty("wok.web.visual.script");
            if (visual != null) {
                Process browser = new ProcessBuilder(NodeRuntime.executable(), visual).redirectErrorStream(true)
                    .redirectOutput(directory.resolve("visual.log").toFile()).start();
                try {
                    browser.getOutputStream().write(json.writeValueAsBytes(Map.of("web", web, "token", staff,
                        "output", directory.toString())));
                    browser.getOutputStream().close();
                    assertThat(browser.waitFor(120, TimeUnit.SECONDS)).isTrue();
                    assertThat(browser.exitValue()).as("comprobación visual aislada").isZero();
                } finally { browser.destroyForcibly(); }
            }
        } finally {
            next.destroy();
            if (!next.waitFor(10, TimeUnit.SECONDS)) next.destroyForcibly();
        }
    }

    private HttpResponse<String> bff(String method, String path, String token, UUID expected, String payload, UUID key) throws Exception {
        var request = HttpRequest.newBuilder(URI.create(web + path)).timeout(Duration.ofSeconds(20))
            .header("Cookie", "wok_access_token=" + token).header("Origin", web).header("Content-Type", "application/json");
        if (expected != null) request.header("X-Wok-Expected-Principal", expected.toString());
        if (key != null) request.header("Idempotency-Key", key.toString()).header("X-Request-Id", UUID.randomUUID().toString());
        return http.send(request.method(method, payload == null ? HttpRequest.BodyPublishers.noBody() :
            HttpRequest.BodyPublishers.ofString(payload)).build(), HttpResponse.BodyHandlers.ofString());
    }

    private JsonNode body(HttpResponse<String> response) throws Exception {
        assertThat(response.statusCode()).as("HTTP confirmado").isBetween(200, 299);
        return json.readTree(response.body());
    }

    private UUID seedItem() {
        jdbc.update("INSERT INTO wok.item_types(code,name) VALUES ('F2_DISH','Plato ficticio')");
        jdbc.update("INSERT INTO wok.units(code,name,dimension,factor_to_base) VALUES ('F2_UNIT','Unidad ficticia','COUNT',1)");
        jdbc.update("INSERT INTO wok.preparation_areas(code,name) VALUES ('F2_WOK','Estacion ficticia')");
        jdbc.update("INSERT INTO wok.menu_categories(name) VALUES ('Categoria ficticia F2')");
        UUID item = jdbc.queryForObject("INSERT INTO wok.items(sku,name,item_type_id,base_unit_id) SELECT 'F2_SKU','Producto ficticio',t.id,u.id FROM wok.item_types t,wok.units u WHERE t.code='F2_DISH' AND u.code='F2_UNIT' RETURNING id", UUID.class);
        return jdbc.queryForObject("INSERT INTO wok.menu_items(item_id,category_id,preparation_area_id,name,price,currency_id,visibility,status,estimated_preparation_seconds) SELECT ?,c.id,a.id,'Producto ficticio',?,m.id,'PUBLIC','ACTIVE',60 FROM wok.menu_categories c,wok.preparation_areas a,wok.currencies m WHERE c.name='Categoria ficticia F2' AND a.code='F2_WOK' AND m.code='GTQ' RETURNING id", UUID.class, item, new BigDecimal("20"));
    }
}

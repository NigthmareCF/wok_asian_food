package com.wokasianfood.api.payments;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.wokasianfood.api.support.PostgresIntegrationTest;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.awt.image.BufferedImage;
import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Base64;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

class PaymentEvidenceIntegrationTest extends PostgresIntegrationTest {
    private static final Path EVIDENCE_DIRECTORY = Path.of(System.getProperty("java.io.tmpdir"),
            "wok-payment-evidence-it-" + UUID.randomUUID());
    private static final byte[] PNG_1X1 = Base64.getDecoder().decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP8//8/AwMDEwMYAAAkBgMBXaJOiAAAAABJRU5ErkJggg==");
    private static final byte[] PNG_DIFFERENT = Base64.getDecoder().decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP8IMLFwMDAxAAGAA24ARLUywghAAAAAElFTkSuQmCC");
    private final ObjectMapper json = new ObjectMapper();

    @DynamicPropertySource
    static void evidenceProperties(DynamicPropertyRegistry properties) {
        properties.add("wok.payments.evidence-directory", EVIDENCE_DIRECTORY::toString);
    }

    @AfterAll
    static void deleteEvidenceDirectory() throws IOException {
        if (!Files.exists(EVIDENCE_DIRECTORY)) return;
        try (Stream<Path> files = Files.walk(EVIDENCE_DIRECTORY)) {
            for (Path file : files.sorted(java.util.Comparator.reverseOrder()).toList()) Files.deleteIfExists(file);
        }
    }

    @Test
    void pickupTransferEvidenceIsPrivateIdempotentAndNeverCapturesPaymentOnUpload() throws Exception {
        var request = createTransferPickup();
        UUID requestId = UUID.fromString(body(request).path("requestId").asText());
        UUID idempotencyKey = UUID.randomUUID();
        String client = requestClientToken;

        HttpResponse<String> submitted = upload(requestId, idempotencyKey, client, "image/png", PNG_1X1);
        assertThat(submitted.statusCode()).isEqualTo(200);
        JsonNode receipt = body(submitted);
        UUID evidenceId = UUID.fromString(receipt.path("id").asText());
        assertThat(receipt.path("status").asText()).isEqualTo("NEEDS_REVIEW");
        assertThat(count("SELECT count(*) FROM wok.payment_evidence WHERE id = ?", evidenceId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.payments WHERE account_id IN (SELECT account_id FROM wok.orders WHERE id = (SELECT order_id FROM wok.order_requests WHERE id = ?))", requestId)).isZero();

        JsonNode replay = body(upload(requestId, idempotencyKey, client, "image/png", PNG_1X1));
        assertThat(replay.path("id").asText()).isEqualTo(evidenceId.toString());
        assertThat(count("SELECT count(*) FROM wok.payment_evidence_events WHERE payment_evidence_id = ?", evidenceId)).isEqualTo(1);
        HttpResponse<String> secondPendingImage = upload(requestId, UUID.randomUUID(), client, "image/png", PNG_DIFFERENT);
        assertThat(secondPendingImage.statusCode()).isEqualTo(409);
        assertThat(secondPendingImage.body()).contains("pendiente de revisión");
        assertThat(count("SELECT count(*) FROM wok.payment_evidence WHERE order_request_id = ?", requestId)).isEqualTo(1);

        HttpResponse<String> otherCustomer = get("/api/v1/client/order-requests/" + requestId + "/payment-evidence", tokenForRole("CLIENT"));
        assertThat(otherCustomer.statusCode()).isEqualTo(404);
        HttpResponse<String> otherCustomerFile = get("/api/v1/client/order-requests/" + requestId
                + "/payment-evidence/" + evidenceId + "/content", tokenForRole("CLIENT"));
        assertThat(otherCustomerFile.statusCode()).isEqualTo(404);
        HttpResponse<String> image = get("/api/v1/client/order-requests/" + requestId + "/payment-evidence/" + evidenceId + "/content", client);
        assertThat(image.statusCode()).isEqualTo(200);
        assertThat(image.headers().firstValue("X-Content-Type-Options")).contains("nosniff");
        assertThat(image.headers().firstValue("Cache-Control")).hasValueSatisfying(value -> assertThat(value).contains("no-store"));
        HttpResponse<String> spoofed = upload(requestId, UUID.randomUUID(), client, "image/png",
                "<script>alert(1)</script>".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertThat(spoofed.statusCode()).isEqualTo(415);
        assertThat(count("SELECT count(*) FROM wok.payment_evidence WHERE order_request_id = ?", requestId)).isEqualTo(1);

        HttpResponse<String> staffList = get("/api/v1/operational/payment-evidence", tokenForRole("OPERATIONAL"));
        assertThat(staffList.statusCode()).isEqualTo(200);
        assertThat(json.readTree(staffList.body()).findValuesAsText("id")).contains(evidenceId.toString());

        HttpResponse<String> cannotVerifyPendingRequest = post("/api/v1/operational/payment-evidence/" + evidenceId + "/decision",
                tokenForRole("OPERATIONAL"), "{\"action\":\"VERIFY\",\"expectedVersion\":1,\"confirmedAmount\":10.00}",
                Map.of("Idempotency-Key", UUID.randomUUID().toString()));
        assertThat(cannotVerifyPendingRequest.statusCode()).isEqualTo(409);
        assertThat(jdbc.queryForObject("SELECT status FROM wok.payment_evidence WHERE id = ?", String.class, evidenceId)).isEqualTo("NEEDS_REVIEW");
        assertThat(count("SELECT count(*) FROM wok.payment_evidence WHERE id = ? AND payment_id IS NOT NULL", evidenceId)).isZero();

        UUID decisionKey = UUID.randomUUID();
        String reviewer = tokenForRole("OPERATIONAL");
        String rejectionBody = "{\"action\":\"REJECT\",\"expectedVersion\":1,\"reason\":\"Referencia no coincide\"}";
        HttpResponse<String> rejected = post("/api/v1/operational/payment-evidence/" + evidenceId + "/decision",
                reviewer, rejectionBody,
                Map.of("Idempotency-Key", decisionKey.toString()));
        assertThat(rejected.statusCode()).isEqualTo(200);
        assertThat(body(rejected).path("status").asText()).isEqualTo("REJECTED");
        assertThat(body(rejected).path("reviewReason").asText()).isEqualTo("Referencia no coincide");
        HttpResponse<String> replayedRejection = post("/api/v1/operational/payment-evidence/" + evidenceId + "/decision",
                reviewer, rejectionBody,
                Map.of("Idempotency-Key", decisionKey.toString()));
        assertThat(replayedRejection.statusCode()).isEqualTo(200);
        assertThat(body(replayedRejection).path("status").asText()).isEqualTo("REJECTED");
        assertThat(count("SELECT count(*) FROM wok.payment_evidence_events WHERE payment_evidence_id = ? AND event_type = 'REJECTED'", evidenceId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.idempotency_keys WHERE operation = 'PAYMENT_EVIDENCE_DECIDED' AND key = ?", decisionKey.toString())).isEqualTo(1);
        HttpResponse<String> mismatchedReplay = post("/api/v1/operational/payment-evidence/" + evidenceId + "/decision",
                reviewer, "{\"action\":\"REJECT\",\"expectedVersion\":1,\"reason\":\"Otro motivo distinto\"}",
                Map.of("Idempotency-Key", decisionKey.toString()));
        assertThat(mismatchedReplay.statusCode()).isEqualTo(409);
        HttpResponse<String> clientStatus = get("/api/v1/client/order-requests/" + requestId + "/payment-evidence", client);
        assertThat(body(clientStatus).get(0).path("reviewReason").asText()).isEqualTo("Referencia no coincide");
        HttpResponse<String> rejectedFileReplay = upload(requestId, UUID.randomUUID(), client, "image/png", PNG_1X1);
        assertThat(rejectedFileReplay.statusCode()).isEqualTo(409);
        assertThat(rejectedFileReplay.body()).contains("ya fue rechazado");
        assertThat(count("SELECT count(*) FROM wok.payment_evidence WHERE order_request_id = ?", requestId)).isEqualTo(1);
    }

    @Test
    void rejectsOversizedEvidenceAsPayloadTooLargeWithoutPersistingPaymentOrFile() throws Exception {
        var request = createTransferPickup();
        UUID requestId = UUID.fromString(body(request).path("requestId").asText());
        Set<String> filesBefore = storedFiles();

        HttpResponse<String> oversized = upload(requestId, UUID.randomUUID(), requestClientToken, "image/png",
                new byte[8 * 1024 * 1024 + 1]);

        assertThat(oversized.statusCode()).isEqualTo(413);
        assertThat(oversized.body()).contains("El archivo supera el tamaño máximo permitido.");
        assertThat(count("SELECT count(*) FROM wok.payment_evidence WHERE order_request_id = ?", requestId)).isZero();
        assertThat(count("SELECT count(*) FROM wok.payments WHERE account_id IN (SELECT account_id FROM wok.orders WHERE id = (SELECT order_id FROM wok.order_requests WHERE id = ?))", requestId)).isZero();
        assertThat(storedFiles()).isEqualTo(filesBefore);
    }

    @Test
    void onlyAnOperationalVerificationOfAnAcceptedAndClosedPickupCapturesTheTransfer() throws Exception {
        var requestResponse = createTransferPickup();
        UUID requestId = UUID.fromString(body(requestResponse).path("requestId").asText());
        UUID evidenceId = UUID.fromString(body(upload(requestId, UUID.randomUUID(), requestClientToken,
                "image/png", PNG_DIFFERENT)).path("id").asText());
        UUID operatorId = createUserWithRole("transfer-review-" + UUID.randomUUID() + "@wok.test", "OPERATIONAL");
        UUID accountId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        UUID currencyId = jdbc.queryForObject("SELECT id FROM wok.currencies WHERE code = 'GTQ'", UUID.class);
        jdbc.update("""
                INSERT INTO wok.order_accounts(id, dining_table_id, name, status, opened_by, created_by, updated_by)
                VALUES (?, NULL, 'Transfer review', 'OPEN', ?, ?, ?)
                """, accountId, operatorId, operatorId, operatorId);
        jdbc.update("""
                INSERT INTO wok.orders(id, code, account_id, dining_table_id, channel, status, subtotal, discount,
                    total, currency_id, guest_count, opened_by, closed_at)
                VALUES (?, ?, ?, NULL, 'PICKUP', 'CLOSED', 25.00, 0, 25.00, ?, 1, ?, now())
                """, orderId, "ORD-EVIDENCE-" + UUID.randomUUID(), accountId, currencyId, operatorId);
        jdbc.update("""
                UPDATE wok.order_requests SET status = 'ACCEPTED', decided_by = ?, decided_at = now(),
                    decision_reason = 'ACCEPTED', order_id = ? WHERE id = ?
                """, operatorId, orderId, requestId);

        UUID decisionKey = UUID.randomUUID();
        String verificationBody = "{\"action\":\"VERIFY\",\"expectedVersion\":1,\"confirmedAmount\":25.00,\"reference\":\"TRX-2026-01\"}";
        HttpResponse<String> verified = post("/api/v1/operational/payment-evidence/" + evidenceId + "/decision",
                tokenFor(operatorId), verificationBody,
                Map.of("Idempotency-Key", decisionKey.toString()));

        assertThat(verified.statusCode()).as("body %s", verified.body()).isEqualTo(200);
        assertThat(body(verified).path("status").asText()).isEqualTo("VERIFIED");
        UUID paymentId = jdbc.queryForObject("SELECT payment_id FROM wok.payment_evidence WHERE id = ?", UUID.class, evidenceId);
        assertThat(jdbc.queryForObject("SELECT method FROM wok.payments WHERE id = ?", String.class, paymentId)).isEqualTo("TRANSFER");
        assertThat(jdbc.queryForObject("SELECT amount FROM wok.payments WHERE id = ?", java.math.BigDecimal.class, paymentId))
                .isEqualByComparingTo("25.00");
        HttpResponse<String> replayed = post("/api/v1/operational/payment-evidence/" + evidenceId + "/decision",
                tokenFor(operatorId), verificationBody,
                Map.of("Idempotency-Key", decisionKey.toString()));
        assertThat(replayed.statusCode()).isEqualTo(200);
        assertThat(body(replayed).path("status").asText()).isEqualTo("VERIFIED");
        assertThat(count("SELECT count(*) FROM wok.payments WHERE account_id = ?", accountId)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM wok.payment_evidence_events WHERE payment_evidence_id = ? AND event_type = 'VERIFIED'", evidenceId)).isEqualTo(1);
    }

    @Test
    void removesStoredFileWhenEvidenceDatabaseTransactionRollsBack() throws Exception {
        var requestResponse = createTransferPickup();
        UUID requestId = UUID.fromString(body(requestResponse).path("requestId").asText());
        Set<String> filesBefore = storedFiles();
        jdbc.execute("""
                CREATE FUNCTION wok.fail_payment_evidence_event_test() RETURNS trigger
                LANGUAGE plpgsql AS $$ BEGIN
                    RAISE EXCEPTION 'forced evidence event failure' USING ERRCODE = 'XX000';
                END; $$
                """);
        jdbc.execute("""
                CREATE CONSTRAINT TRIGGER fail_payment_evidence_event_test
                AFTER INSERT ON wok.payment_evidence_events
                DEFERRABLE INITIALLY DEFERRED
                FOR EACH ROW EXECUTE FUNCTION wok.fail_payment_evidence_event_test()
                """);

        try {
            HttpResponse<String> response = upload(requestId, UUID.randomUUID(), requestClientToken,
                    "image/png", uniquePng());

            assertThat(response.statusCode()).as(response.body()).isGreaterThanOrEqualTo(500);
            assertThat(count("SELECT count(*) FROM wok.payment_evidence WHERE order_request_id = ?", requestId)).isZero();
            assertThat(storedFiles()).isEqualTo(filesBefore);
        } finally {
            jdbc.execute("DROP TRIGGER IF EXISTS fail_payment_evidence_event_test ON wok.payment_evidence_events");
            jdbc.execute("DROP FUNCTION IF EXISTS wok.fail_payment_evidence_event_test()");
        }
    }

    private Set<String> storedFiles() throws IOException {
        if (!Files.exists(EVIDENCE_DIRECTORY)) return Set.of();
        try (Stream<Path> files = Files.list(EVIDENCE_DIRECTORY)) {
            return files.map(path -> path.getFileName().toString()).collect(Collectors.toCollection(HashSet::new));
        }
    }

    private byte[] uniquePng() throws IOException {
        BufferedImage image = new BufferedImage(2, 2, BufferedImage.TYPE_INT_ARGB);
        int color = UUID.randomUUID().hashCode() | 0xff000000;
        image.setRGB(0, 0, color);
        image.setRGB(1, 0, ~color | 0xff000000);
        image.setRGB(0, 1, Integer.rotateLeft(color, 7));
        image.setRGB(1, 1, Integer.rotateLeft(color, 13));
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        javax.imageio.ImageIO.write(image, "png", output);
        return output.toByteArray();
    }

    private String requestClientToken;

    @BeforeEach
    void openPickupWindow() { allowRemoteRequestsAtAnyTimeToday(); }

    @AfterEach
    void restorePickupWindow() { restoreBaselineRemoteHoursToday(); }

    private HttpResponse<String> createTransferPickup() {
        UUID customer = createUserWithRole("transfer-evidence-" + UUID.randomUUID() + "@wok.test", "CLIENT");
        requestClientToken = tokenFor(customer);
        UUID product = seedMenuItem("Transfer evidence test", "25.00", "WOK_TRANSFER_EVIDENCE", 60);
        return post("/api/v1/client/order-requests", requestClientToken, """
                {"requestedFor":"%s","paymentPreference":"TRANSFER_AT_PICKUP","items":[{"menuItemId":"%s","quantity":1}]}
                """.formatted(Instant.now().plusSeconds(600), product),
                Map.of("Idempotency-Key", UUID.randomUUID().toString()));
    }

    private UUID seedMenuItem(String name, String price, String codePrefix, int prepSeconds) {
        String suffix = UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        jdbc.update("INSERT INTO wok.item_types (code, name) VALUES ('DISH', 'Plato') ON CONFLICT (code) DO NOTHING");
        jdbc.update("INSERT INTO wok.units (code, name, dimension, factor_to_base) VALUES ('UNIT', 'Unidad', 'COUNT', 1) ON CONFLICT (code) DO NOTHING");
        jdbc.update("INSERT INTO wok.preparation_areas (code, name) VALUES (?, ?) ON CONFLICT (code) DO NOTHING", codePrefix + "_" + suffix, "Área de prueba");
        jdbc.update("INSERT INTO wok.menu_categories (name) VALUES (?) ON CONFLICT (name) DO NOTHING", "Prueba transferencia " + suffix);
        UUID itemType = jdbc.queryForObject("SELECT id FROM wok.item_types WHERE code = 'DISH'", UUID.class);
        UUID unit = jdbc.queryForObject("SELECT id FROM wok.units WHERE code = 'UNIT'", UUID.class);
        UUID area = jdbc.queryForObject("SELECT id FROM wok.preparation_areas WHERE code = ?", UUID.class, codePrefix + "_" + suffix);
        UUID category = jdbc.queryForObject("SELECT id FROM wok.menu_categories WHERE name = ?", UUID.class, "Prueba transferencia " + suffix);
        UUID currency = jdbc.queryForObject("SELECT id FROM wok.currencies WHERE code = 'GTQ'", UUID.class);
        UUID item = jdbc.queryForObject("INSERT INTO wok.items (sku, name, item_type_id, base_unit_id) VALUES (?, ?, ?, ?) RETURNING id",
                UUID.class, codePrefix + "-" + suffix, name, itemType, unit);
        return jdbc.queryForObject("""
                INSERT INTO wok.menu_items (item_id, category_id, preparation_area_id, name, price, currency_id,
                    visibility, status, estimated_preparation_seconds)
                VALUES (?, ?, ?, ?, ?, ?, 'PUBLIC', 'ACTIVE', ?) RETURNING id
                """, UUID.class, item, category, area, name, new java.math.BigDecimal(price), currency, prepSeconds);
    }

    private HttpResponse<String> upload(UUID requestId, UUID idempotencyKey, String token,
                                        String mediaType, byte[] content) throws IOException, InterruptedException {
        String boundary = "wok-" + UUID.randomUUID();
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        body.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"receipt.png\"\r\n"
                + "Content-Type: " + mediaType + "\r\n\r\n").getBytes(java.nio.charset.StandardCharsets.UTF_8));
        body.write(content);
        body.write(("\r\n--" + boundary + "--\r\n").getBytes(java.nio.charset.StandardCharsets.UTF_8));
        HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl() + "/api/v1/client/order-requests/" + requestId + "/payment-evidence"))
                .header("Authorization", "Bearer " + token).header("Idempotency-Key", idempotencyKey.toString())
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray())).build();
        return java.net.http.HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
    }

    private JsonNode body(HttpResponse<String> response) {
        assertThat(response.statusCode()).as("body %s", response.body()).isBetween(200, 299);
        try { return json.readTree(response.body()); }
        catch (Exception failure) { throw new IllegalStateException(failure); }
    }

    private int count(String sql, Object... args) {
        Integer value = jdbc.queryForObject(sql, Integer.class, args);
        return value == null ? 0 : value;
    }
}

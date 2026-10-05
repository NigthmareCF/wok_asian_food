package com.wokasianfood.mobilebff;

import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;

@RestController
final class ClientApiController {
    private final CoreApiClient core;
    private final ClientRoutes routes;
    private final JsonMapper json;

    ClientApiController(CoreApiClient core, ClientRoutes routes, JsonMapper json) {
        this.core = core; this.routes = routes; this.json = json;
    }

    @RequestMapping("/api/v1/**")
    ResponseEntity<byte[]> forward(HttpServletRequest request) throws IOException {
        String path = request.getRequestURI();
        var route = routes.find(request.getMethod(), path);
        if (route == null) throw new BffFailure(404);
        byte[] body = request.getInputStream().readNBytes(65_537);
        if (body.length > 65_536) throw new BffFailure(413);
        if (body.length > 0) {
            try {
                if (request.getContentType() == null || !MediaType.APPLICATION_JSON.isCompatibleWith(
                        MediaType.parseMediaType(request.getContentType()))) throw new BffFailure(415);
                JsonNode parsed = json.readTree(body);
                if (parsed == null || !parsed.isObject()) throw new BffFailure(400);
                if (path.endsWith("/messages")) validateMessage(parsed);
            } catch (BffFailure failure) { throw failure; }
            catch (RuntimeException malformed) { throw new BffFailure(400); }
        } else if (request.getMethod().equals("PUT") || (request.getMethod().equals("POST")
                && !path.equals("/api/v1/auth/logout") && !path.equals("/api/v1/client/conversations"))) {
            throw new BffFailure(400);
        }
        String key = null;
        if (route.idempotent()) {
            try {
                String supplied = request.getHeader("Idempotency-Key");
                key = UUID.fromString(supplied == null ? "" : supplied).toString();
                if (!key.equalsIgnoreCase(supplied)) throw new IllegalArgumentException();
            } catch (IllegalArgumentException invalidKey) { throw new BffFailure(400); }
        }
        CoreApiClient.Reply reply;
        if (request.getMethod().equals("GET") && path.equals("/api/v1/client/profile")) {
            reply = (CoreApiClient.Reply) request.getAttribute("bff.profile");
        } else {
            if (path.startsWith("/api/v1/client/conversations/") && path.endsWith("/messages")) {
                requireHumanConversation(path, request);
            }
            reply = core.exchange(request.getMethod(), path, route.publicAccess() ? null : request.getHeader("Authorization"),
                    key, body, (String) request.getAttribute("bff.requestId"), request.getRemoteAddr());
        }
        byte[] result = reply.body();
        if (result.length > 0 && path.startsWith("/api/v1/client/conversations")) {
            result = humanOnly(path, json.readTree(result));
        }
        return ResponseEntity.status(reply.status()).contentType(MediaType.APPLICATION_JSON).body(result);
    }

    private void validateMessage(JsonNode node) {
        if (node.size() != 1 || !node.path("body").isString() || node.path("body").asString().isBlank()
                || node.path("body").asString().length() > 4000) throw new BffFailure(400);
    }

    private void requireHumanConversation(String path, HttpServletRequest request) {
        var owned = core.exchange("GET", "/api/v1/client/conversations", request.getHeader("Authorization"),
                null, new byte[0], (String) request.getAttribute("bff.requestId"), request.getRemoteAddr());
        JsonNode conversations = json.readTree(owned.body());
        if (!conversations.isArray()) throw new BffFailure(503);
        String id = path.substring("/api/v1/client/conversations/".length(), path.length() - "/messages".length());
        for (JsonNode item : conversations) {
            if (id.equalsIgnoreCase(item.path("conversationId").asString(""))
                    && "HUMAN".equals(item.path("handlingMode").asString(""))) return;
        }
        throw new BffFailure(404);
    }

    private byte[] humanOnly(String path, JsonNode node) {
        if (node.isArray()) {
            ArrayNode allowed = json.createArrayNode();
            for (JsonNode item : node) {
                boolean keep = path.endsWith("/messages")
                        ? Set.of("CUSTOMER", "HUMAN", "SYSTEM").contains(item.path("senderType").asString(""))
                        : "HUMAN".equals(item.path("handlingMode").asString(""));
                if (keep) allowed.add(item);
            }
            return json.writeValueAsBytes(allowed);
        }
        if (!path.endsWith("/messages") && !"HUMAN".equals(node.path("handlingMode").asString(""))) {
            throw new BffFailure(409);
        }
        return json.writeValueAsBytes(node);
    }
}

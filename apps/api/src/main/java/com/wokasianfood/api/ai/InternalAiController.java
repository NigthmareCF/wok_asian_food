package com.wokasianfood.api.ai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import io.swagger.v3.oas.annotations.Hidden;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Private service-to-service contract. Nginx does not route /internal; the API container is not public. */
@RestController
@RequestMapping("/internal/ai")
@Hidden
public class InternalAiController {
    private final AiGateway gateway;
    private final AiToolBroker tools;
    private final byte[] serviceToken;

    public InternalAiController(AiGateway gateway, AiToolBroker tools,
            @Value("${wok.ai.service-token:}") String serviceToken) {
        this.gateway = gateway;
        this.tools = tools;
        this.serviceToken = serviceToken.getBytes(StandardCharsets.UTF_8);
    }

    @PostMapping("/chat")
    public ChatReply chat(@RequestHeader(value = "X-WOK-AI-TOKEN", required = false) String token,
            @Valid @RequestBody ChatRequest request) {
        if (serviceToken.length < 32)
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "AI service is not configured.");
        if (token == null || !MessageDigest.isEqual(serviceToken, token.getBytes(StandardCharsets.UTF_8)))
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Service authentication failed.");
        AiProvider.Reply reply = gateway.reply(request.message());
        return new ChatReply(reply.text(), reply.needsHuman());
    }

    @PostMapping("/tools")
    public ToolReply tool(@RequestHeader(value = "X-WOK-AI-TOKEN", required = false) String token,
            @Valid @RequestBody ToolRequest request) {
        if (serviceToken.length < 32)
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "AI service is not configured.");
        if (token == null || !MessageDigest.isEqual(serviceToken, token.getBytes(StandardCharsets.UTF_8)))
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Service authentication failed.");
        return switch (request.name()) {
            case "getOpeningHours" -> new ToolReply(request.name(), tools.openingHours(), null);
            case "getCurrentServiceStatus" -> new ToolReply(request.name(), null, tools.currentServiceStatus());
            default -> throw new ResponseStatusException(HttpStatus.FORBIDDEN, "AI tool is not authorized.");
        };
    }

    public record ChatRequest(@NotBlank @Size(max = 2000) String message) {}
    public record ChatReply(String message, boolean needsHuman) {}
    public record ToolRequest(@NotBlank @Size(max = 64) String name) {}
    public record ToolReply(String name, List<AiToolBroker.OpeningHour> openingHours,
                            List<AiToolBroker.ServiceStatus> serviceStatus) {}
}

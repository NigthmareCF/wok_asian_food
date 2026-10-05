package com.wokasianfood.api.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class InternalAiControllerTest {
    private static final String TOKEN = "unit-test-service-token-with-at-least-32-chars";

    @Test
    void internalCallsRequireAConfiguredServiceSecret() {
        var controller = new InternalAiController(mock(AiGateway.class), mock(AiToolBroker.class), "");

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> controller.chat(TOKEN, new InternalAiController.ChatRequest("pedido de WOK")));

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, error.getStatusCode());
    }

    @Test
    void rejectsMissingOrIncorrectServiceSecret() {
        var controller = new InternalAiController(mock(AiGateway.class), mock(AiToolBroker.class), TOKEN);

        ResponseStatusException missing = assertThrows(ResponseStatusException.class,
                () -> controller.chat(null, new InternalAiController.ChatRequest("pedido de WOK")));
        ResponseStatusException wrong = assertThrows(ResponseStatusException.class,
                () -> controller.chat("wrong-token", new InternalAiController.ChatRequest("pedido de WOK")));

        assertEquals(HttpStatus.UNAUTHORIZED, missing.getStatusCode());
        assertEquals(HttpStatus.UNAUTHORIZED, wrong.getStatusCode());
    }

    @Test
    void rejectsToolsOutsideTheBackendAllowlist() {
        var controller = new InternalAiController(mock(AiGateway.class), mock(AiToolBroker.class), TOKEN);

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> controller.tool(TOKEN, new InternalAiController.ToolRequest("SELECT * FROM wok.users")));

        assertEquals(HttpStatus.FORBIDDEN, error.getStatusCode());
    }
}

package com.wokasianfood.api.ai;

import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** AI is optional and has no JDBC dependency or direct access to customer records. */
@Service
public class AiGateway {
    private final AiProvider provider;
    private final String mode;
    public AiGateway(AiProvider provider, @Value("${wok.ai.mode}") String mode) { this.provider = provider; this.mode = mode; }

    public AiProvider.Reply reply(String input) {
        if (input == null || input.isBlank() || input.length() > 2000) throw new IllegalArgumentException("invalid message");
        String normalized = input.toLowerCase(Locale.ROOT);
        if (!normalized.matches("(?s).*(wok|menú|menu|pedido|reserva|delivery|entrega|recoger|horario|pago|factura|platillo|ingrediente).*"))
            return new AiProvider.Reply("Puedo ayudarte con pedidos, menú, reservas y servicios de WOK Asian Food.", false);
        if (!"mock".equals(mode)) return new AiProvider.Reply("Te pondremos en contacto con nuestro equipo.", true);
        try { return provider.infer(input); }
        catch (RuntimeException error) { return new AiProvider.Reply("Te pondremos en contacto con nuestro equipo.", true); }
    }
}

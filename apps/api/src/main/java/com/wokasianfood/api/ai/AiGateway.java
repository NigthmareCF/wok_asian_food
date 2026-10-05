package com.wokasianfood.api.ai;

import java.time.DayOfWeek;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** AI is optional; deterministic rules/tools run first, and the inference port receives no database access. */
@Service
public class AiGateway {
    private static final Pattern WOK_DOMAIN = Pattern.compile(
            "(?iu).*(wok|men[uú]|pedido|orden|reserva|reservaci[oó]n|delivery|domicilio|entrega|recoger|pickup|"
                    + "horario|hora|pago|factura|platillo|ingrediente|restaurante|menu|order|booking|restaurant|"
                    + "opening|hours|invoice|dish).*", Pattern.DOTALL);
    private static final Pattern OUT_OF_SCOPE = Pattern.compile(
            "(?iu).*(matem[aá]tic|[aá]lgebra|programaci[oó]n|c[oó]digo fuente|pol[ií]tica|videojuego|"
                    + "homework|school assignment|write an essay|ignore (all )?(previous|safety|system) instructions|"
                    + "ignora (todas )?(las )?(instrucciones|reglas).*(anteriores|previas|del sistema)|"
                    + "revela (el )?(system prompt|prompt del sistema)).*",
            Pattern.DOTALL);
    private static final Pattern OPENING_HOURS = Pattern.compile("(?iu).*(horario|a qu[eé] hora|abren|cierran|opening hours).*", Pattern.DOTALL);
    private static final Pattern SERVICE_STATUS = Pattern.compile("(?iu).*(servicio|delivery|pickup|entrega|disponible|available).*", Pattern.DOTALL);

    private final AiProvider provider;
    private final AiToolBroker tools;
    private final String mode;

    public AiGateway(AiProvider provider, AiToolBroker tools, @Value("${wok.ai.mode:disabled}") String mode) {
        this.provider = provider;
        this.tools = tools;
        this.mode = mode.toLowerCase(Locale.ROOT);
    }

    public AiProvider.Reply reply(String input) {
        if (input == null || input.isBlank() || input.length() > 2000)
            throw new IllegalArgumentException("invalid message");
        String prompt = input.trim();
        if (OUT_OF_SCOPE.matcher(prompt).matches() || !WOK_DOMAIN.matcher(prompt).matches())
            return new AiProvider.Reply("Puedo ayudarte con el menú, pedidos, reservas y servicios de WOK Asian Food.", false);
        if (OPENING_HOURS.matcher(prompt).matches()) return openingHoursReply();
        if (SERVICE_STATUS.matcher(prompt).matches()) return serviceStatusReply();
        if (!"mock".equals(mode)) return humanFallback();
        try {
            AiProvider.Reply reply = provider.infer(prompt);
            if (reply == null || reply.text() == null || reply.text().isBlank()) return humanFallback();
            return reply;
        } catch (RuntimeException failure) {
            return humanFallback();
        }
    }

    private AiProvider.Reply openingHoursReply() {
        List<AiToolBroker.OpeningHour> hours = tools.openingHours();
        if (hours.isEmpty()) return humanFallback();
        String result = hours.stream().map(hour -> DayOfWeek.of(hour.weekday()).getDisplayName(
                        java.time.format.TextStyle.FULL, Locale.forLanguageTag("es-GT")) + ": "
                        + hour.opensAt() + "–" + hour.closesAt() + " (" + hour.timeZone() + ")")
                .reduce((first, next) -> first + ", " + next).orElse("");
        return new AiProvider.Reply("Horarios registrados del restaurante: " + result + ".", false);
    }

    private AiProvider.Reply serviceStatusReply() {
        List<AiToolBroker.ServiceStatus> services = tools.currentServiceStatus();
        if (services.isEmpty()) return humanFallback();
        String result = services.stream().map(service -> service.code().toLowerCase(Locale.ROOT)
                        + ": " + service.status().toLowerCase(Locale.ROOT))
                .reduce((first, next) -> first + ", " + next).orElse("");
        return new AiProvider.Reply("Estado publicado de los servicios: " + result + ".", false);
    }

    private AiProvider.Reply humanFallback() {
        return new AiProvider.Reply("Te pondremos en contacto con nuestro equipo.", true);
    }
}

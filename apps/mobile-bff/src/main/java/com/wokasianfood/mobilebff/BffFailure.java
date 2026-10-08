package com.wokasianfood.mobilebff;

import java.util.Map;

final class BffFailure extends RuntimeException {
    final int status;

    BffFailure(int status) {
        super("BFF request rejected");
        this.status = status;
    }

    Map<String, String> body(String requestId) {
        String message = switch (status) {
            case 400, 415 -> "Revisa los datos de la solicitud.";
            case 401 -> "La sesión no es válida. Inicia sesión nuevamente.";
            case 403 -> "Tu cuenta no tiene permiso para esta acción.";
            case 404 -> "El recurso no está disponible.";
            case 409 -> "La información cambió. Revisa los datos e inténtalo de nuevo.";
            case 413 -> "La solicitud supera el tamaño permitido.";
            case 422 -> "La solicitud no cumple las condiciones del servicio.";
            case 429 -> "Demasiadas solicitudes. Intenta más tarde.";
            default -> "No pudimos confirmar el resultado. Revisa el estado antes de reintentar.";
        };
        return Map.of("code", "BFF_" + status, "message", message, "requestId", requestId);
    }
}

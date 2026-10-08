package com.wokasianfood.mobilebff;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

@Component
final class ClientRoutes {
    private static final String ID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
    private final List<Route> routes = new ArrayList<>();

    ClientRoutes() {
        add("GET", "/api/v1/public/(menu|service-capabilities)", true, false);
        add("POST", "/api/v1/auth/(register|verify|verify/resend|login|refresh|reset/request|reset/complete)", true, false);
        add("GET", "/api/v1/auth/me", false, false);
        add("POST", "/api/v1/auth/logout", false, false);
        add("GET", "/api/v1/client/(profile|sessions|order-requests|reservations|conversations)", false, false);
        add("PUT", "/api/v1/client/profile", false, false);
        add("DELETE", "/api/v1/client/(sessions|order-requests|reservations)/" + ID, false, false);
        add("GET", "/api/v1/client/order-requests/" + ID, false, false);
        add("GET", "/api/v1/client/order-requests/" + ID + "/tracking", false, false);
        add("GET", "/api/v1/client/reservations/policy", false, false);
        add("POST", "/api/v1/client/(order-requests|reservations)", false, true);
        add("POST", "/api/v1/client/conversations", false, false);
        add("GET", "/api/v1/client/conversations/" + ID + "/messages", false, false);
        add("POST", "/api/v1/client/conversations/" + ID + "/messages", false, true);
    }

    Route find(String method, String path) {
        return routes.stream().filter(route -> route.method().equals(method)
                && route.path().matcher(path).matches()).findFirst().orElse(null);
    }

    private void add(String method, String path, boolean publicAccess, boolean idempotent) {
        routes.add(new Route(method, Pattern.compile(path), publicAccess, idempotent));
    }

    record Route(String method, Pattern path, boolean publicAccess, boolean idempotent) {}
}

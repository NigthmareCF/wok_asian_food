package com.wokasianfood.api.identity;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Resolves client literals across explicitly trusted peers only, without DNS. */
@Component
public final class ClientIpResolver {
    private final List<Network> trustedProxies;

    public ClientIpResolver(@Value("${wok.http.trusted-proxies:}") String configuredProxies) {
        trustedProxies = configuredProxies.isBlank() ? List.of()
                : Arrays.stream(configuredProxies.split(",", -1)).map(Network::parse).toList();
    }

    String resolve(HttpServletRequest request) {
        String remote = request.getRemoteAddr();
        if (!isTrusted(remote)) return ClientIpAddress.normalize(remote);
        var headers = request.getHeaders("X-Forwarded-For");
        return resolve(remote, headers == null ? null : String.join(",", Collections.list(headers)));
    }

    String resolve(String remote, String forwarded) {
        String fallback = ClientIpAddress.normalize(remote);
        if (!isTrusted(remote) || forwarded == null) return fallback;
        String[] hops = forwarded.split(",", -1);
        for (String hop : hops) {
            if (ClientIpAddress.bytes(hop) == null) return fallback;
        }
        // Discard trusted proxy hops from the right, never an untrusted client's prefix.
        for (int i = hops.length - 1; i >= 0; i--) {
            if (!isTrusted(hops[i]) || i == 0) return ClientIpAddress.normalize(hops[i]);
        }
        return fallback;
    }

    private boolean isTrusted(String value) {
        byte[] address = ClientIpAddress.bytes(value);
        return address != null && trustedProxies.stream().anyMatch(network -> network.contains(address));
    }

    private record Network(byte[] address, int prefix) {
        static Network parse(String value) {
            String[] parts = value.trim().split("/", -1);
            byte[] address = ClientIpAddress.bytes(parts[0]);
            if (address == null || parts.length > 2) throw invalidConfiguration();
            int prefix = address.length * 8;
            if (parts.length == 2) {
                if (!parts[1].matches("0|[1-9][0-9]{0,2}")) throw invalidConfiguration();
                prefix = Integer.parseInt(parts[1]);
                if (prefix > address.length * 8) throw invalidConfiguration();
            }
            return new Network(address, prefix);
        }

        boolean contains(byte[] candidate) {
            if (candidate.length != address.length) return false;
            for (int bit = 0; bit < prefix; bit++) {
                int mask = 1 << (7 - bit % 8);
                if ((candidate[bit / 8] & mask) != (address[bit / 8] & mask)) return false;
            }
            return true;
        }

        private static IllegalArgumentException invalidConfiguration() {
            return new IllegalArgumentException("wok.http.trusted-proxies must contain only literal IP addresses or valid CIDRs");
        }
    }
}

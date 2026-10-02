package com.wokasianfood.api.identity;

import java.util.Locale;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Canonical JWT issuer for the environment.
 *
 * <p>The RFC 2606 reserved name {@code .invalid} is syntactically a valid absolute HTTPS URL, so a
 * structural check alone lets a deployment boot and mint tokens that no other party can ever trust.
 * This component fails startup instead, matching the behaviour of {@link AuthSecrets} for secrets.
 */
@Component
public class AuthIssuer {
    private static final Set<String> RESERVED_HOSTS = Set.of("identity.wok.invalid", "wok.invalid");

    private final String issuer;

    public AuthIssuer(@Value("${wok.auth.issuer}") String issuer) {
        String candidate = issuer == null ? "" : issuer.trim();
        if (candidate.isEmpty())
            throw new IllegalStateException(
                    "WOK_AUTH_ISSUER must be set to the canonical WOK identity URL for this environment.");
        if (usesReservedDomain(candidate))
            throw new IllegalStateException("WOK_AUTH_ISSUER still points at the reserved placeholder '"
                    + candidate + "'. Override it with the canonical WOK identity URL before deploying.");
        this.issuer = candidate;
    }

    private boolean usesReservedDomain(String candidate) {
        String lower = candidate.toLowerCase(Locale.ROOT);
        return RESERVED_HOSTS.stream().anyMatch(host -> lower.contains(host));
    }

    public String value() {
        return issuer;
    }
}

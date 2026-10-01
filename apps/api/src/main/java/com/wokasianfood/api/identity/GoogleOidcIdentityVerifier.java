package com.wokasianfood.api.identity;

import java.util.Set;
import java.net.URL;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtValidationException;

/** Converts a cryptographically and claim-validated Google ID token into a minimal WOK identity. */
public final class GoogleOidcIdentityVerifier implements GoogleIdentityVerifier {
    private final String clientId;
    private final JwtDecoder decoder;

    public GoogleOidcIdentityVerifier(String clientId, JwtDecoder decoder) {
        this.clientId = clientId == null ? "" : clientId.trim();
        this.decoder = decoder;
    }

    @Override
    public VerifiedIdentity verify(String idToken, String expectedNonce) {
        if (clientId.isBlank()) throw unavailable();
        if (idToken == null || idToken.isBlank() || expectedNonce == null || expectedNonce.isBlank())
            throw new AuthException(401, "Identidad externa inválida.");

        Jwt jwt;
        try {
            jwt = decoder.decode(idToken);
        } catch (JwtValidationException error) {
            throw new AuthException(401, "Identidad externa inválida.");
        } catch (JwtException error) {
            if (hasTransportFailure(error)) throw unavailable();
            throw new AuthException(401, "Identidad externa inválida.");
        }

        Object issuerClaim = jwt.getClaims().get("iss");
        String issuer = issuerClaim instanceof URL url ? url.toString()
                : issuerClaim == null ? null : issuerClaim.toString();
        if (issuer == null || !Set.of("https://accounts.google.com", "accounts.google.com").contains(issuer)
                || !jwt.getAudience().contains(clientId)
                || !expectedNonce.equals(jwt.getClaimAsString("nonce"))
                || jwt.getSubject() == null || jwt.getSubject().isBlank()) {
            throw new AuthException(401, "Identidad externa inválida.");
        }

        Object verifiedClaim = jwt.getClaims().get("email_verified");
        boolean emailVerified = Boolean.TRUE.equals(verifiedClaim)
                || "true".equalsIgnoreCase(String.valueOf(verifiedClaim));
        return new VerifiedIdentity(jwt.getSubject(), jwt.getClaimAsString("email"), emailVerified);
    }

    private boolean hasTransportFailure(Throwable error) {
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof java.io.IOException
                    || cause instanceof org.springframework.web.client.ResourceAccessException) return true;
        }
        return false;
    }

    private AuthException unavailable() {
        return new AuthException(503, "El acceso con Google no está disponible por ahora.");
    }
}

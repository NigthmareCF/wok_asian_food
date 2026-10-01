package com.wokasianfood.api.identity;

import org.springframework.stereotype.Component;

/** Explicit disabled adapter until Google client configuration and OIDC validation are approved. */
@Component
public class UnavailableGoogleIdentityVerifier implements GoogleIdentityVerifier {
    @Override public VerifiedIdentity verify(String idToken) {
        throw new AuthException(503, "El acceso con Google no está disponible por ahora.");
    }
}

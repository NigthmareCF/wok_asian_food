package com.wokasianfood.api.identity;

/** Explicit disabled adapter until Google client configuration and OIDC validation are approved. */
public class UnavailableGoogleIdentityVerifier implements GoogleIdentityVerifier {
    @Override public VerifiedIdentity verify(String idToken, String expectedNonce) {
        throw new AuthException(503, "El acceso con Google no está disponible por ahora.");
    }
}

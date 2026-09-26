# Identidad y seguridad WOK

Estado: contrato objetivo, 2026-09-25. Consultar [brechas](../project/GAP_ANALYSIS.md) para evidencia ejecutable.

Una autoridad WOK emite sesiones para web, app y personal local. Registro público asigna exclusivamente `CLIENT`, queda `PENDING_VERIFICATION`, consume challenge de un uso y pasa a `ACTIVE`. Código criptográficamente aleatorio, TTL, intentos, cooldown, rate limit y hash HMAC/pepper; no plaintext. Reset responde neutralmente para no revelar cuentas, consume challenge y revoca sesiones según política auditada. Password con Argon2id o hash adaptativo aprobado; jamás SHA simple/MD5.

Access JWT firmado, 10–15 min configurable, claims mínimos; cada API comprueba estado, roles, permisos, restricciones y ownership contra autoridad WOK. Refresh opaco aleatorio se guarda sólo como hash con sesión/familia, vencimiento, rotación y revocación. Reuse revoca familia y emite evento de seguridad. Web usa cookie HttpOnly/Secure/SameSite con CSRF apropiado, sin refresh en localStorage; móvil guarda refresh en SecureStore y access en memoria. CORS limitado a orígenes aprobados, TLS en Nginx, rate limit, validación y audit de cambios sensibles. JWT válido no reemplaza permiso sobre el recurso.

Google OIDC verifica issuer/audience/nonce y `sub`; `AUTH_IDENTITY(provider, provider_subject, user_id)` une identidad externa con usuario interno. Correo coincidente no vincula cuentas automáticamente: exige sesión existente/challenge fuerte. Google no asigna permisos WOK. Personal crítico conserva método local para operar sin WAN. Apple queda `LATER / DECISION_REQUIRED`. MFA TOTP se evalúa para cuentas privilegiadas; WebAuthn después. Guest, si se habilita, recibe token opaco limitado a una operación; anonymous puede ver menú/horario y mantener carrito local.

Pruebas de aceptación: register/verify/código malo/expiry/resend, login, refresh rotación/reuse/revoke, Google linking, escalada de rol, usuario suspendido con JWT vigente, acceso de cliente A a recurso B, CSRF/cookie y sesión local durante corte WAN. Registrar requestId sin contraseñas, tokens ni datos privados en logs.

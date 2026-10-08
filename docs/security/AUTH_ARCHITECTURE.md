# Identidad y seguridad WOK

Estado: contrato objetivo, 2026-09-25. Consultar [brechas](../project/GAP_ANALYSIS.md) para evidencia ejecutable.

Una autoridad WOK emite sesiones para web, app y personal local. Registro público asigna exclusivamente `CLIENT`, queda `PENDING_VERIFICATION`, consume challenge de un uso y pasa a `ACTIVE`. Código criptográficamente aleatorio, TTL, intentos, cooldown, rate limit y hash HMAC/pepper; no plaintext. Reset responde neutralmente para no revelar cuentas, consume challenge y revoca sesiones según política auditada. Password con Argon2id o hash adaptativo aprobado; jamás SHA simple/MD5.

Access JWT firmado, 10–15 min configurable, claims mínimos; cada API comprueba estado, roles, permisos, restricciones y ownership contra autoridad WOK. Refresh opaco aleatorio se guarda sólo como hash con sesión/familia, vencimiento, rotación y revocación. Reuse revoca familia y emite evento de seguridad. Web usa cookie HttpOnly/Secure/SameSite con CSRF apropiado, sin refresh en localStorage; móvil guarda refresh en SecureStore y access en memoria. CORS limitado a orígenes aprobados, TLS en Nginx, rate limit, validación y audit de cambios sensibles. JWT válido no reemplaza permiso sobre el recurso.

Google OIDC verifica issuer/audience/nonce y `sub`; `AUTH_IDENTITY(provider, provider_subject, user_id)` une identidad externa con usuario interno. Correo coincidente no vincula cuentas automáticamente: exige sesión existente/challenge fuerte. Google no asigna permisos WOK. Personal crítico conserva método local para operar sin WAN. Apple queda `LATER / DECISION_REQUIRED`. MFA TOTP se evalúa para cuentas privilegiadas; WebAuthn después. Guest, si se habilita, recibe token opaco limitado a una operación; anonymous puede ver menú/horario y mantener carrito local.

Pruebas de aceptación: register/verify/código malo/expiry/resend, login, refresh rotación/reuse/revoke, Google linking, escalada de rol, usuario suspendido con JWT vigente, acceso de cliente A a recurso B, CSRF/cookie y sesión local durante corte WAN. Registrar requestId sin contraseñas, tokens ni datos privados en logs.

## Evidencia implementada — 2026-09-26

- `feature/backend-auth` implementa registro CLIENT pendiente de verificación, perfil Cliente inicial, challenges HMAC de un uso, password adaptativo, reset neutral, login con rate threshold, JWT de acceso, refresh opaco rotativo/reuse, logout/revocación y outbox cifrado para email.
- La verificación del JWT comprueba la sesión activa en PostgreSQL y convierte `iat` a `Timestamp` JDBC. El verificador Google permanece deshabilitado hasta configurar credenciales OIDC; no existe linking productivo.
- Evidencia HTTP en PostgreSQL efímero: registro 202, verify 200, login 200. Los escenarios de refresh reuse, ownership y privilege escalation continúan pendientes de pruebas automatizadas.
- `AdminUserController` agrega listado paginado/búsqueda de cuentas y concesión/revocación de roles `OPERATIONAL`/`ADMIN`. El cambio requiere versión esperada y motivo, actualiza la versión del usuario y escribe auditoría; el último ADMIN activo no puede revocarse. `CLIENT` se excluye del flujo de staff y queda reservado al registro público.
- Validación HTTP temporal: anonimato 401; búsqueda Admin 200; concesión/revocación con control de versión; versión obsoleta 409; no permitir retirar al último Admin 409; intento de asignar CLIENT por esta ruta 400. Sigue pendiente automatizar estos escenarios dentro de CI.

## IP del cliente y proxies confiables — A3.1

El backend usa `ClientIpResolver` antes del limitador de autenticación. `server.forward-headers-strategy=none` conserva el peer TCP en `remoteAddr`; no habilitar reinterpretación automática de `Forwarded`/XFF en Spring o Tomcat, pues eliminaría la frontera de confianza usada por el resolvedor.

`wok.http.trusted-proxies` se configura mediante `WOK_HTTP_TRUSTED_PROXIES`, una lista separada por comas de IP literales o CIDR IPv4/IPv6. Su valor predeterminado es vacío: ninguna IP, loopback, red privada ni `app_net` es confiable implícitamente. Ejemplo exclusivamente ilustrativo: `192.0.2.10/32,2001:db8::10/128`; no representa direcciones autorizadas de despliegue. Usar únicamente peers verificados, con el alcance mínimo necesario. Una entrada malformada impide iniciar la aplicación.

Solo se examina `X-Forwarded-For` cuando el `remoteAddr` inmediato pertenece a esa lista. Se validan todos sus saltos y se recorre la cadena de derecha a izquierda, retirando únicamente proxies confiables hasta el primer salto no confiable (o el extremo izquierdo si todos son confiables). Las cabeceras XFF repetidas se combinan en orden. El proxy autorizado debe sobrescribir XFF con el cliente observado o agregar el peer real al final; nunca reenviar sin control una cabecera suministrada por el cliente.

Sin peer confiable, XFF se ignora. XFF ausente o inválido usa `remoteAddr`; un peer inválido resulta en `UNKNOWN` para contadores y SQL `NULL` en eventos. Se aceptan solo literales estrictos, sin DNS, hostnames, puertos, zonas IPv6 ni CIDR dentro de la cabecera. `Forwarded` y `X-Real-IP` no intervienen. La comparación CIDR mantiene las familias separadas: una dirección IPv4 mapeada en IPv6 requiere una entrada IPv6 explícita; no hereda confianza de una entrada IPv4.

**Pendiente de Fernando:** revisar la topología y los peers inmediatos reales, aprobar la lista mínima y configurar/revisar Compose y BFF, incluida la construcción de XFF y la inaccesibilidad de rutas que permitan suplantar al proxy. A3.1 no modifica Nginx, Compose ni BFF y no autoriza confiar en toda `app_net`. Hasta esa revisión se conserva la lista vacía; detrás de un intermediario, los límites se aplicarán a su IP.

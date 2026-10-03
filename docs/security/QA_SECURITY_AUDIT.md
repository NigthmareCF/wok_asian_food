# Auditoría de estabilización: Web, móvil y seguridad

Fecha: 3 de octubre de 2026
Rama: `release/qa-security`
Alcance: navegación Web, sesiones, permisos de interfaz, calidad estática y preparación de entorno integrado.

## Resultado ejecutivo

La base Web y móvil compila y supera sus verificaciones estáticas. La navegación privada protege los contextos Cliente, Operación y Administración mediante cookie de sesión, validación de sesión en servidor y validación del rol de contexto. Se corrigió una inconsistencia en la navegación: ahora los enlaces visibles se calculan con los permisos recibidos en la sesión actual, no con permisos de demostración.

El sistema aún no debe presentarse como una integración completa de todos los módulos. Varias vistas operativas y administrativas indican expresamente que usan datos simulados y se reinician al recargar.

## Evidencia de verificaciones

| Verificación | Resultado | Evidencia |
| --- | --- | --- |
| Pruebas Web | Aprobada | 60 archivos, 389 pruebas aprobadas. |
| Tipado Web | Aprobado | `tsc --noEmit`. |
| Lint Web | Aprobado | `eslint .`. |
| Build Web | Aprobado | Next.js generó 94 rutas sin error. |
| Lint móvil | Aprobado | `eslint src app`. |
| Tipado móvil | Aprobado | `tsc --noEmit`. |
| API Spring Boot | Pendiente de entorno | El equipo local no tiene JDK/JAVA_HOME configurado. |
| Docker integrado | Pendiente de entorno | Docker Desktop no expuso el motor Linux durante la auditoría. |

## Hallazgo corregido

### QA-SEC-001: navegación mostraba permisos de demostración

- Severidad: media.
- Riesgo: un usuario autenticado podía ver enlaces de su canal aunque su sesión no incluyera el permiso asociado. La API debía rechazar la acción, pero la interfaz adelantaba información y generaba un flujo confuso.
- Corrección: `AppShell` utiliza `currentUser.permissions` para filtrar la navegación y la prueba cubre un usuario operativo con permiso limitado.
- Límite: ocultar enlaces mejora la interfaz, pero no sustituye la autorización del backend. Cada endpoint debe conservar su control de permisos.

### QA-SEC-002: identidad de IP confiable para rate limiting

- Severidad: alta.
- Riesgo: Nginx conservaba una cadena `X-Forwarded-For` suministrada por el cliente antes de añadir la IP observada. La API usa el primer valor para limitar intentos de autenticación; un cliente podía falsificarlo y evadir parte de ese control.
- Corrección: los proxies HTTP y TLS reemplazan `X-Forwarded-For` por `$remote_addr`, por lo que la API recibe una identidad asignada por Nginx y no una cadena controlada por el cliente.
- Pendiente de ejecución: al recuperar Docker, validar la configuración con `nginx -t` y comprobar que múltiples cabeceras enviadas por un cliente no alteran el límite.

## Estado de rutas y sesiones

| Capa | Estado | Observación |
| --- | --- | --- |
| Proxy Web | Implementado | Redirige rutas `/client`, `/operation` y `/admin` a login cuando falta cookie de acceso. |
| Layouts privados | Implementado | Verifican sesión y rol de contexto en servidor. |
| Destino posterior a login | Implementado | Rechaza destinos externos, rutas con barras dobles y caracteres de control. |
| BFF de operaciones | Implementado | Exige token; las escrituras validan origen y varios flujos usan claves de idempotencia. |
| Permisos de interfaz | Corregido | Se filtra la navegación con permisos de la sesión. |
| Permisos de página individual | Pendiente de prueba E2E | Debe comprobarse con usuarios de permisos parciales cuando la API esté levantada. |

## Controles observados en la API

La revisión estática del backend encontró controles que deben conservarse y validarse en ejecución:

- Contraseñas protegidas con BCrypt de coste 12.
- JWT con emisor configurado, expiración y validación contra una sesión activa, no revocada y asociada a un usuario activo.
- Roles y permisos cargados desde PostgreSQL para las autoridades de Spring Security.
- Controladores operativos críticos protegidos con `@PreAuthorize`, por ejemplo mesas, cuentas, pedidos, cocina, pagos, inventario, producción y caja.
- Rate limiting con ventana deslizante para registro, verificación, reenvío de código, inicio de sesión y restablecimiento de contraseña.
- CORS con lista explícita de orígenes y métodos; no se permite cualquier origen.

La evidencia anterior es estática. Antes de publicación debe repetirse con pruebas de integración que confirmen respuestas 401 y 403 para tokens ausentes, expirados, revocados o con permisos insuficientes.

## Integración real y datos simulados

Ya existen rutas BFF para menú, autenticación, solicitudes de pedido, reservaciones, mensajería, delivery y mesas operativas. Sin embargo, el código conserva módulos con fixtures o avisos de datos simulados, entre ellos pedidos operativos, cocina, delivery, caja, inventario, producción, mensajería operativa y varias pantallas administrativas.

Antes de la demo se debe etiquetar cada módulo como uno de estos estados:

1. Integrado: consulta API y persiste cambios.
2. Demostrativo: usa fixtures, sin prometer persistencia.
3. Pendiente: no debe figurar como funcionalidad terminada.

## Dependencias

La auditoría de dependencias de producción reportó 30 alertas transitivas: 19 altas y 11 moderadas, sin críticas. La mayoría deriva del árbol Expo/React Native, Metro, `micromatch`, `node-forge` y `decode-uri-component`.

No se ejecutó `npm audit fix --force`, porque puede cambiar Expo o React Native fuera de versiones compatibles. El siguiente trabajo debe actualizar el árbol móvil de forma controlada, ejecutar las pruebas y documentar cada excepción aceptada.

## Próximos pasos obligatorios

1. Instalar o configurar JDK 21 y `JAVA_HOME`; ejecutar `apps/api/mvnw verify`.
2. Recuperar Docker Desktop; levantar `docker compose --profile dev up --build -d` con un `.env` local ignorado.
3. Ejecutar pruebas E2E con cuentas Cliente, Operación y Administración:
   - Cliente crea solicitud o reserva.
   - Operación la visualiza y cambia el estado autorizado.
   - Cocina recibe el pedido y actualiza su avance.
   - Cliente consulta el estado actualizado.
4. Probar cada URL privada sin sesión, con rol equivocado y con permiso parcial.
5. Migrar o retirar de la demo los módulos que aún usan datos simulados.
6. Resolver las alertas de dependencias con una actualización compatible y volver a ejecutar esta auditoría.

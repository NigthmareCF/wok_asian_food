# Compatibilidad antes de commit/publicación

Fecha de cierre:8/oct/2026. **Smoke y checks Mobile resueltos; preparada para autorización de commit/PR hacia development9eab323, con CI remoto y gate de vulnerabilidades pendientes antes de merge.** V26/V27 compatibles e intactas. Los cortes anteriores se conservan como antecedentes, sin presentar sus bloqueos como resultados vigentes. Sin staging, publicación ni cambios de rama/demo.

## Cierre autorizado: fixture horario y checks Mobile (8/oct/2026)

**Preparada para solicitar autorización de commit/PR hacia development9eab323 en el alcance comprobado.** Los bloqueos locales de smoke y Mobile se resolvieron. CI remoto y gate actualizado de vulnerabilidades siguen pendientes antes de merge; Android y condiciones productivas no se consideran aprobados. No se publicó ni se ejecutó staging/commit/cambio de rama.

El smoke ya no usa `+2 hours`. Lee preparación del producto enviado (cantidad1), hora UTC de PostgreSQL y ventanas RESTAURANT activas. El selector SQL reproduce el día de semana America/Guatemala y la hora local de cada timezone_name, apertura inclusiva/cierre exclusivo, preparación mínima y máximo3h de PickupSchedulePolicy. Deja120s de transporte y60s antes del máximo, sin ampliar reglas. Si no encuentra una ventana utilizable, configura únicamente en el PostgreSQL nuevo del smoke siete ventanas ficticias00:00–23:59:59 America/Guatemala y vuelve a seleccionar. No hay fallback de datos de producción ni cambios al API. Un guard exige users/orders/payments vacíos antes de seed o cambio horario; la ejecución propia usó recursos nuevos identificados, no solo ese guard.

Caso negativo independiente: desactiva temporalmente esas ventanas en la base aislada, envía un timestamp que cumple preparación/máximo, exige422 por fuera de servicio y cero solicitudes persistidas con su clave; restaura las ventanas y recalcula la hora del caso válido. El caso válido mantiene202. No acepta422 como éxito ni omite pasos.

Prueba asociada `database/tests/smoke_pickup_window.sql`: siete casos en transacción con rollback (preparación/margen, apertura inclusiva, lunes cerrado, cierre exclusivo, segundo anterior al cierre cruzando fecha UTC, preparación que no cabe en3h y timezone de la ventana distinto de UTC local Guatemala). El smoke resuelve el include SQL desde el host y lo envía por stdin: queda comprobado por su mismo comando CI, sin mounts de fuentes en el contenedor db ni modificaciones de workflow.

### Resultado final y aislamiento

| Verificación | Resultado propio | Alcance |
|---|---|---|
| Bash syntax del smoke final | exit0 | Mismo comando que workflow |
| Siete casos SQL horarios | Todos aprobados | Incluidos automáticamente al ejecutar el smoke; rollback no altera horarios del recorrido |
| Smoke completo final | **exit0,44 comprobaciones HTTP aprobadas** | jq1.7.1 oficial ya verificado; login normal de3 fixtures, API actual/PG reales; no simulación de HTTP |
| Fixture sin ventana original | Comprobado | Se usó la configuración aislada nocturna; el selector de ventana original también está cubierto por casos SQL con reloj fijo |
| Flyway en PG nuevo |27 migraciones aprobadas | V26/V27 sin modificación; jar actual compilado offline en corte anterior, sin nuevos cambios productivos |
| npm ci autorizado | **exit0**,1032 paquetes restaurados | Node22.23.3/npm10.9.9 existentes; todas las workspaces de copia limpia como CI |
| Mobile lint | **exit0** | `npm run lint --workspace mobile` |
| Mobile typecheck | **exit0** | `npm run typecheck --workspace mobile` |
| Fuentes/manifiestos/lockfile tras instalar | Sin cambios | Cuatro manifiestos/lockfile y51 archivos Mobile comprobados contra9eab323 antes de instalar, hashes invariables después |

Comando real de instalación: `npm ci --no-audit --no-fund --cache /workspace/npm-cache`, desde la raíz de nueva copia Temp/wok-mobile-ci-ncPuyq en contenedor Linux existente. CI usa Node22 y `npm ci` raíz antes de lint/tipos; las opciones añadidas solo evitan audit/fund implícitos, no resuelven peers ni cambian versiones. Sin --force/--legacy-peer-deps. Contenedor no root, filesystem raíz read-only, sin capabilities/elevación/socket Docker ni configuración privada; HOME/TMPDIR/cache y escrituras en la copia. Scripts de instalación ejecutados dentro de ese límite; no pidieron secretos ni cambios externos. Contenedor eliminado al finalizar; copia y logs conservados, fuera de Git. Avisos de deprecación uuid/eslint registrados sin actualizar versiones; no equivalen a gate de vulnerabilidades aprobado.

### Dependencias Mobile y clasificación del fallo anterior

| Dependencia ausente en instalación anterior | Declaración Mobile9eab323 | Versión lockfile/restaurada |
|---|---|---|
| @tanstack/react-query |^5.104.1 |5.104.1 |
| expo-image |~57.0.5 |57.0.5 |
| expo-system-ui |~57.0.4 |57.0.4 |
| nativewind |4.2.7 |4.2.7 |
| react-hook-form |^7.89.0 |7.89.0 |
| tailwindcss (dev) |3.4.19 |3.4.19 |
| jiti (transitiva) |No directa; lockfile |1.21.7 |

Los seis directos no aparecen en package.json del workspace original antiguo; sí en el de development9eab323 que conservará la entrega final. La copia nueva usa los manifiestos raíz/Web/Mobile y package-lock.json de esa base, no los archivos antiguos locales. Búsqueda de instalaciones existentes en rutas legibles de proyectos/Temp y en imagen Web cacheada: sin hallazgo reutilizable; el recorrido de archivos reportó errores de acceso, por lo que no se afirma búsqueda exhaustiva. Los checks iniciales fallaron por **dependencias ausentes del entorno**, confirmadas al restaurar el lockfile y obtener lint/tipos verdes. No hay regresión Mobile atribuible a la entrega ni defecto previo reproducido con instalación completa. No se ejecutaron tests Node opcionales, build Mobile, emulador/dispositivo ni Android; no deducirlos de lint/tipos.

### Todos los pasos del smoke

Antes de HTTP: configuración Compose/red, guard de base vacía, siete casos SQL con rollback, seed ficticio y dos perfiles CLIENT. HTTP1–3: operativo, CLIENT dueño y otro CLIENT. Tras HTTP8: seleccionar horario, fallback aislado y negativo; entre HTTP9 y10: comprobar cero escrituras, restaurar horarios y recalcular fecha válida. Además de códigos, permanecen todas las aserciones JSON/SQL: propietario404, PENDING_REVIEW/ACCEPTED/SENT/READY, subtotal136, replay/id idéntico, un pedido/un ticket, versiones, SERVED, pago parcial50/saldo86, único pago en replay, pago restante86/PAID, total/paid136/saldo0/dos pagos, CLOSED y mesa CLEANING.

| Paso HTTP | Operación | Estado esperado/obtenido |
|---|---|---|
| 1 | `POST /api/v1/auth/login` | 200 |
| 2 | `POST /api/v1/auth/login` | 200 |
| 3 | `POST /api/v1/auth/login` | 200 |
| 4 | `GET /api/v1/operational/tables` | 401 |
| 5 | `GET /api/v1/operational/tables` | 403 |
| 6 | `GET /api/v1/operational/kitchen/tickets` | 403 |
| 7 | `GET /api/v1/client/order-requests` | 401 |
| 8 | `GET /api/v1/client/order-requests` | 403 |
| 9 | `POST /api/v1/client/order-requests` | 422 |
| 10 | `POST /api/v1/client/order-requests` | 403 |
| 11 | `POST /api/v1/client/order-requests` | 202 |
| 12 | `GET /api/v1/client/order-requests/{id}` | 200 |
| 13 | `GET /api/v1/client/order-requests/{id}` | 404 |
| 14 | `POST /api/v1/operational/order-requests/{id}/decision` | 200 |
| 15 | `GET /api/v1/client/order-requests/{id}` | 200 |
| 16 | `GET /api/v1/operational/kitchen/tickets` | 200 |
| 17 | `POST /api/v1/operational/kitchen/tickets/{id}/claim` | 200 |
| 18 | `PATCH /api/v1/operational/kitchen/tickets/{id}/status` | 200 |
| 19 | `GET /api/v1/client/order-requests/{id}` | 200 |
| 20 | `POST /api/v1/operational/tables/{id}/open` | 200 |
| 21 | `POST /api/v1/operational/orders` | 403 |
| 22 | `POST /api/v1/operational/orders` | 201 |
| 23 | `POST /api/v1/operational/orders` | 201 |
| 24 | `POST /api/v1/operational/orders` | 409 |
| 25 | `POST /api/v1/operational/tables/{id}/close` | 409 |
| 26 | `GET /api/v1/operational/kitchen/tickets` | 200 |
| 27 | `POST /api/v1/operational/kitchen/tickets/{id}/claim` | 200 |
| 28 | `PATCH /api/v1/operational/kitchen/tickets/{id}/status` | 200 |
| 29 | `GET /api/v1/operational/orders/{id}` | 200 |
| 30 | `PATCH /api/v1/operational/orders/{id}/status` | 200 |
| 31 | `PATCH /api/v1/operational/orders/{id}/status` | 409 |
| 32 | `POST /api/v1/operational/tables/{id}/close` | 409 |
| 33 | `POST /api/v1/operational/accounts/{id}/payments` | 401 |
| 34 | `POST /api/v1/operational/accounts/{id}/payments` | 403 |
| 35 | `POST /api/v1/operational/tables/{id}/close` | 401 |
| 36 | `POST /api/v1/operational/tables/{id}/close` | 403 |
| 37 | `POST /api/v1/operational/accounts/{id}/payments` | 201 |
| 38 | `POST /api/v1/operational/accounts/{id}/payments` | 201 |
| 39 | `PATCH /api/v1/operational/orders/{id}/status` | 409 |
| 40 | `POST /api/v1/operational/tables/{id}/close` | 409 |
| 41 | `POST /api/v1/operational/accounts/{id}/payments` | 201 |
| 42 | `GET /api/v1/operational/accounts/{id}` | 200 |
| 43 | `PATCH /api/v1/operational/orders/{id}/status` | 200 |
| 44 | `POST /api/v1/operational/tables/{id}/close` | 200 |

Estos son datos/ventas ficticios en PG tmpfs nuevo, no ventas reales ni pruebas UI completas. La finalización de los44 pasos y la línea final de éxito demuestra que no se cortó el smoke después del pickup. Recursos API/db/red propios retirados tras verificar sus etiquetas; ningún volumen existente se borró. Demo conserva IDs y sigue encendida.

Evidencia propia privada en Temp/wok-compatibility-20261007: scheduled-smoke-final.json (pasos/hashes), operational-smoke.log (ejecución final), operational-smoke-result.json, mobile-dependency-inventory.json, mobile-ci-copy.json, mobile-ci-result.json y scheduled-preservation-final.json. En la copia Mobile: mobile-install.log, mobile-lint.log, mobile-types.log, mobile-exits.txt. No incorporar estos logs, dependencias, cache ni configuración efímera al PR. La ejecución inicial fallida está registrada como antecedente en el informe; operational-smoke.log contiene ahora la ejecución final aprobada.

Manifiesto vigente: **239 candidatos (109 tracked modificados+130 untracked),242 dirty y3 excluidos**. Adiciones de este encargo: pickup-smoke-window.sql y smoke_pickup_window.sql; operational-flow-smoke.sh ya era candidato y se traslada con su contenido actualizado. Código productivo, Mobile original y V26/V27 intactos. No se repitieron786 Web/245 API ni auditoría completa: resultados previos conservados; se ejecutó únicamente verificación focalizada del cambio y checks Mobile autorizados.


## Antecedente: cierre de portabilidad y checks entonces pendientes

Cambios mínimos: `WebFindingBoundaryIntegrationTest` usa `NodeRuntime.executable()` en sus dos ProcessBuilder (Next y opción visual). El helper selecciona `node.exe` para Windows y `node` para Linux/macOS, siempre desde PATH, sin rutas de máquina ni override inseguro. `NodeRuntimeTest` conserva siete casos de plataforma, incluido Darwin y Windows en mayúsculas. No se cambió ninguna expectativa del opt-in ni configuración de autenticación, producto o Mobile. La opción visual sigue siendo opcional y no se ejecutó en este cierre.

| Verificación focalizada propia | Resultado | Evidencia/límite |
|---|---|---|
| Windows, `NodeRuntimeTest,WebFindingBoundaryIntegrationTest` | 8 aprobadas, 0 fallos/errores/omitidas | Copia aislada, Maven offline, Next/BFF/API reales y PostgreSQL Testcontainer nuevo |
| Linux, mismos dos tests y propiedades opt-in | 8 aprobadas, 0 fallos/errores/omitidas | Contenedor nuevo Maven/Java21; Node y SWC Linux 16.3.6 extraídos de imagen existente; no instalación de paquetes |
| Primer intento Linux | Falló disponibilidad Next | SWC Linux ausente en la copia Windows; el intento automático no pudo invocar npm. Se reutilizó SWC de igual versión ya cacheado, sin cambiar assertions, y se repitió con éxito |
| jq antes de ejecución | Arquitectura e integridad aprobadas | Host x86_64, binario ELF64 x86-64; versión1.7.1 oficial. SHA-256 `5942c9b0934e510ee61eb3e30273f1b3fe2590df93933a93d7c58b81d19c8ff5` coincide con sha256sum.txt de la misma release |
| `bash -n` del smoke | Aprobado | Script con LF como checkout Linux CI, contenido/assertions conservados |
| `operational-flow-smoke.sh` completo | **Falló, exit1** | Login normal de fixtures aprobado; primer POST pickup esperaba202 y recibió422 por horario. Pasos posteriores, incluido el flujo financiero del smoke, no alcanzados |
| Flyway de la API del smoke | 27 migraciones aplicadas correctamente | API jar actual compilado offline en el corte previo; PG18 nuevo tmpfs, sin puertos ni volumen persistente |
| `npm run lint --workspace mobile` | **Falló, exit1** | Módulos react-hook-form, expo-image y @tanstack/react-query declarados/lockeados pero no instalados |
| `npm run typecheck --workspace mobile` | **Falló, exit2** | Los anteriores, nativewind/tailwindcss y sus módulos ausentes; errores derivados de tipos. No presentar como aprobado |

Mobile: estos son los dos checks que exige el workflow, no una suite Android ni los tests Node opcionales del corte anterior. Los51 archivos tracked de Mobile en la copia coinciden con development9eab323 normalizando LF; la entrega no los modifica. **Dependencia ausente demostrada; ninguna regresión de Mobile atribuible a este delta ni defecto previo confirmado con dependencias completas.** Se reutilizaron dependencias existentes; no se instaló desde lockfile. Android, manejo de422 y composición mobile-bff permanecen sin validar.

Smoke: `.github/scripts/operational-flow-smoke.sh:98` usa `date -u -d '+2 hours'`. El nuevo `PickupSchedulePolicy` exige preparación mínima, máximo3 horas y ventana del restaurante en America/Guatemala. En esta ejecución la fecha quedó fuera del horario14:00–22:00; el API respondió422 correctamente y el smoke conservó su expectativa202. Es una **regresión de compatibilidad del smoke provocada por la validación de esta entrega**, no jq ausente ni un defecto demostrado del rechazo API. Dentro del horario podría pasar; eso no hace reproducible CI a cualquier hora. No se cambió el seed/horario para esconder el fallo y no se repitió la suite financiera completa.

Adaptación mínima pendiente, requiere autorización aparte: preparar una ventana ficticia válida exclusivamente en el PostgreSQL nuevo del smoke (con datos horarios controlados y un timestamp que cumpla preparación/máximo3 horas), conservando todas las expectativas de202, aislamiento, replay y pagos; añadir regresión para ejecución fuera de horario. No modificar las reglas API ni los datos de la demo. Esta propuesta **no se implementó** bajo la autorización limitada a Node.

Descarga autorizada: únicamente jq-linux-amd64 y checksum oficial desde [release jq1.7.1](https://github.com/jqlang/jq/releases/tag/jq-1.7.1); verificados antes de ejecutar. Docker/Compose Linux se copiaron de Docker Desktop existente; imágenes usadas con pull never. Logs/resultados propios en Temp/wok-compatibility-20261007: portability-windows-final.log, portability-linux.log, jq-verification.json, mobile-ci-lint.log, mobile-ci-typecheck.log, operational-smoke.log y operational-smoke-result.json. Estos artefactos privados no son candidatos Git. No compartir logs crudos ni smoke-compose.json, que contiene configuración ficticia efímera.

Recursos nuevos de smoke retirados después de comprobar su etiqueta de proyecto; PG tmpfs eliminado con su contenedor, sin tocar volúmenes existentes. Testcontainers retirados al finalizar. Demo encendida e intacta. Solo dos archivos nuevos de prueba se añaden al manifiesto: **237 candidatos (109 tracked modificados +128 untracked), 240 dirty y3 excluidos preservados**. No se repitieron las786 pruebas Web ni la suite245 API: sus resultados corresponden al corte previo; este cambio no altera código productivo.

## Base y traslado real

Remoto: github.com/NigthmareCF/wok_asian_food.git. `origin/development` tras fetch: **9eab32352b33adc0d4b6a77f6ebee21e9724ed98**, 6/oct/2026, integración PR33. HEAD conservado: fa6804117a3cbe00b85e42fa1ac7060b9305c4ad; rama integration/release-candidate. HEAD es ancestro de development vigente: 0 commits propios/4 ajenos. development local permanece antiguo y no se usa como base.

Los cambios remotos nuevos respecto al workspace corresponden a móvil/mobile-bff, progreso móvil y package-lock.json. Ninguno de los 234 candidatos iniciales se solapa directamente con esos cambios. La copia comprobada se construyó con archivos de la referencia remota vigente y overlay selectivo del manifiesto; **conserva el lockfile y los cambios móviles remotos**, sin trasladar archivos locales antiguos sobre ellos.

| Resultado de los 234 candidatos | Cantidad | Traslado propuesto |
|---|---|---|
| Ya integrados con el mismo contenido | 0 | Ninguno que omitir por duplicación |
| Archivos existentes modificados | 109 | Todos sus **340 hunks** frente a 9eab323; no se detectó un hunk ajeno que extraer |
| Archivos nuevos | 125 | Contenido completo, incluido núcleo financiero/pruebas/migraciones |
| Solapamiento con cambios nuevos de development | 0 | No se necesita resolución textual contra esa base |

La lista exacta sigue en [STAGING_MANIFEST.md](STAGING_MANIFEST.md). `transfer-hunks.json` en la carpeta de evidencia registra por archivo todos los rangos old/new de esos 340 hunks y los 125 archivos nuevos, sin secretos. No se aplica ni se stagea un patch. El corte inicial añadió este informe:235 candidatos y238 dirty. El cierre posterior añade los dos helpers y actualiza el test/documentación: **237 candidatos vigentes**,240 dirty (110 tracked +130 untracked), tres excluidos preservados. Las modificaciones posteriores al snapshot están identificadas y requieren revisión de su diff final; las migraciones y el código productivo mantienen sus hashes.

## Migraciones y colisiones de otras ramas

development vigente contiene V1–V25. Los 25 scripts coinciden con el workspace en contenido normalizando CRLF/LF; las diferencias de hash bruto se explican por finales de línea, no por SQL distinto. V26/V27 financieros no existen en development y el orden es V25 → V26__presential_payment_attempts.sql → V27__presential_payment_attempt_resolution.sql. V27 depende de la tabla/constraint/trigger de V26; no puede entregarse por separado ni intercambiarse su orden.

La aplicación real de Flyway en los tests API, la regresión de upgrade/constraints y las 27 migraciones SQL desde limpio pasaron en PostgreSQL nuevos. No se validó upgrade sobre datos productivos ni una copia representativa de ventas. Ninguna migración se modificó, renumeró o aplicó a la demo.

**Colisiones reales de números, todavía fuera de development:**

| Referencia tras fetch | Versiones incompatibles con las financieras |
|---|---|
| origin/feature/chan-order-contracts, 01f1143 | V26__cash_movement_payment_traceability.sql |
| origin/feature/backend-capacity-order-lifecycle, e75913e | V26__customer_tax_profiles.sql; V27__delivery_dispatch_lifecycle.sql |
| origin/feature/database-migrations, bf7c485 | Mismos V26/V27 de perfiles fiscales y dispatch |
| origin/integration/backend-system-candidate, a5480ea | V26__google_oidc_rate_limit_actions.sql |

No son scripts equivalentes ni duplicados que puedan omitirse. Flyway no puede aplicar dos versiones26 distintas; cambiar el nombre descriptivo no resuelve la colisión. Chan y Fernando deben fijar orden/reserva de números y considerar dónde ya se aplicaron los scripts. La demo ya tiene las V26/V27 financieras: **no proponer renumerarlas allí ni modificar su historial**. Si otros números se asignan en ramas aún no aplicadas, hacerlo mediante una tarea autorizada y repetir upgrade/regresión afectados; si ya se aplicaron en otros ambientes, acordar una estrategia de compatibilidad explícita.

También hay solapamientos de contenido futuros: Chan modifica smoke, controllers pickup/pedidos/decisiones/pagos/mesas y cuatro clases de regresión (10 candidatos). Capacity/lifecycle solapa 15; system-candidate12, incluidos cuentas/caja/pagos/pedidos y documentos. La adaptación mínima es resolver por función/contrato, conservando lock order, invariantes durables y checks de saldo; nunca sustituir un controller completo ni integrar esas ramas sin revisar. Esos cruces no se ejecutaron ni se comprobaron como una composición conjunta. Las referencias de Cliente/Admin del PR propuesto siguen siendo advertencias de canal, no conflictos presentes con development.

## Revisión de contenido de hunks y núcleo financiero

Además de nombres/hash/rangos, se revisaron los hunks de controllers y piezas de transporte/identidad, y contenido del núcleo financiero/SQL. La revisión es acotada a compatibilidad de entrega, no certificación financiera o de seguridad exhaustiva:

| Cambios revisados | Garantía/consecuencia comprobada en contenido y regresión |
|---|---|
| AccountFinancialTotalsService + cuentas | Agrega por moneda pedidos no cancelados y pagos CAPTURED, separa propinas; anomalía/multimoneda no inventa saldo. Lectura permite accounts:manage o payments:manage (ampliación previa explícita, no permiso nuevo de esta revisión) |
| PaymentController/PaymentService | Legacy delega al durable; candidato solo lee/bloquea antes de escrituras; importe/moneda/centavos/caja OPEN/saldo/servido se revalidan. Pago/movimientos/propina/PAID/claim/confirmación se coordinan transaccionalmente; recibo anómalo conserva evidencia |
| PaymentAttemptService | PREPARED→PENDING confirmado antes de captura; claim→intento→cuenta→caja; mutex FOR NO KEY UPDATE evita inversión con FK. Preparación/reemplazo compara campos normalizados, no solo fingerprint ambiguo. Sin retiro normal del PENDING ni captura automática por GET |
| ResolutionController/Service + V27 | Dos permisos, actor distinto del creador, versión/motivo/evidencia/NOT_RECEIVED; claims/confirmación bloquean resolución. Mantiene marcador e historial, no infiere ausencia de dinero por tiempo ni crea pago al resolver |
| Orders/Table/Cash controllers | Cierre con saldo cero agregado, cuenta bloqueada y transiciones/versiones; mesa no libera consumos pendientes. Caja bloquea/cuenta moneda y versión, no cobra desde UI |
| BFF financiero/provider/hook + páginas ADMIN | Mismo token leído/verificado/reenviado, actor y permisos actuales, DTO estricto; incertidumbre y lectura de recuperación. Storage es referencia, no autoridad; ADMIN queda en su contexto acotado |
| Endpoint shared/principal, builder/recurso privado | Principal esperado y token de transporte coinciden; propietario/clave/cuerpo persistidos antes del envío; generación/desmontaje descartan resultados tardíos sin navegar ni simular confirmación |
| Perfil, horarios y consultas operativas | phone ausente normalizado a null; lectura distinta de modificación incierta. Horarios existentes se validan también en API; cola con CAST de filtro opcional, tickets con líneas, sin estados inventados |
| Pruebas/smoke y UI restante del alcance | Se mantienen regresiones de rollback/concurrencia/idempotencia/propiedad/versión y expectativas audit-*; polling no reenvía mutaciones, permisos usan códigos reales y logout responsive |

No se encontró un defecto reproducible nuevo del código Web/API en estas comprobaciones. Permanecen H05/ambigüedad legacy residual y los límites financieros históricos. El API ahora rechaza pickup fuera de ventana/hora de negocio; el móvil remoto permite editar fecha libremente y debe verificar esa respuesta422 en dispositivo. No se declara validado Android por pruebas Web.

## Verificación propia del corte inicial en copia

Evidencia local: directorio temporal `wok-compatibility-20261007` (source, comparison.json, transfer-hunks.json, final-check.json y logs). Dependencias existentes reutilizadas; ninguna instalación/descarga. Maven offline. Configuración de secretos del anfitrión/.env* no leída/copied. Las bases de escritura fueron nuevas/Testcontainers o PostgreSQL tmpfs sin puertos.

| Check | Resultado propio | Clase/límite |
|---|---|---|
| Web build estándar Next16.3.6 | Aprobado, exit0 | Primer intento falló por junction fuera de root Turbopack; se copiaron físicamente paquetes ya instalados a Temp y se repitió sin cambiar config/código/compiler |
| Web lint/typecheck | Ambos aprobados | En copia sobre base remota; sin cambios a tests |
| Web suite completa | 93 archivos, **786 aprobadas** | Pruebas controladas; maxWorkers2/configLoader runner |
| API build actual | Aprobado offline, jar nuevo | No reutilización de API antiguo |
| API verify con opt-in explícito | **245 tests, 0 fallos/errores/omitidos** | PostgreSQL nuevos, incluye exactamente1 caso WebFindingBoundaryIntegrationTest, Next/BFF/API/SQL reales; sesiones sintéticas de helper, no login nuevo de navegador |
| Migraciones y SQL aislados | **27 migraciones + 12 archivos SQL**, todos aprobados | Otro PG18 tmpfs/network none, retirado después de verificar su ID; no Flyway manual sobre demo |
| Gate de dependencias: tests del script | **6 aprobados** | No equivale a npm audit de red ni gate remoto completo |
| Tests Node del móvil remoto | **Falló carga de2 archivos** por jiti y tailwindcss/loadConfig ausentes | Dependencias no presentes en root/Web/móvil instalado; no instaladas. No son dos casos de negocio aprobados/fallidos; suite no pudo arrancar |
| Smoke operational-flow-smoke.sh | No ejecutado: jq ausente | Curl/Maven/PG imágenes existen; no jq Bash disponible. Mantener requisito CI; no adaptar/reemplazar assertions para aparentar éxito |
| Mobile-bff remoto | Sin build independiente verificado | Solo fuentes src, sin pom/Gradle en esa ruta. Intento Maven rechazado por ausencia de pom, no por test fallido ni falta de caché. Debe aclararse composición con responsable móvil |

No se corrió nueva auditoría visual, Android, expiración exhaustiva, backup/restauración ni cortes físicos. CI remoto no ejecutado sin rama/commit/publicación autorizados. Los límites no invalidan los245/786 checks que sí pasaron, pero tampoco se cuentan como aprobados.

## Secretos y preservación

Análisis de patrones de los234 candidatos: ningún JWT literal, clave privada o token de proveedor identificado. Único candidato literal es falso positivo en WebFindingBoundaryIntegrationTest:128: prefijo Cookie unido a variable de sesión del fixture. No se imprimieron valores sensibles. Fixtures de correo/usuarios del smoke/tests son ficticios; no ventas/datos de clientes reales. Patrones no garantizan detectar cualquier secreto: revisión humana de diff final sigue siendo requisito.

Archivos .env* excluidos incluso de exportación remota, sin leerlos. Artefactos/dependencias fuera de Git; se preserva excepción preexistente de .env.example sin inspeccionarla. Index vacío y branch/HEAD iguales. **Los234 hashes del workspace antes de las actualizaciones documentales permanecieron idénticos**. Los contenedores de la demo siguieron activos; ningún restart/seed/escritura en su base. Recursos nuevos de SQL/Testcontainers cerrados al terminar; artefactos de evidencia conservados. No pull/merge/rebase/staging/commit/push/cambio de rama.

## Autorización siguiente tras el cierre

1. **Migraciones:** V26/V27 compatibles con 9eab323, sin bloqueo contra esa base y sin renumerar. Coordinar reserva/orden antes de integrar otras ramas que colisionan: origin/feature/chan-order-contracts (V26 cash_movement_payment_traceability), origin/feature/backend-capacity-order-lifecycle y origin/feature/database-migrations (V26 customer_tax_profiles/V27 delivery_dispatch_lifecycle), origin/integration/backend-system-candidate (V26 google_oidc_rate_limit_actions). No se comprobó una composición conjunta.
2. **Smoke:** adaptación autorizada implementada y smoke completo aprobado; no queda el bloqueo202/422. Trasladar juntos script/selector/test SQL y conservar expectativas.
3. **CI final:** Mobile lint/tipos ya aprobados con instalación autorizada del lockfile en copia nueva. Tras autorización de rama/commit, verificar CI remoto y gate de vulnerabilidades actualizado. CI actual no activa el opt-in: mantener propiedades explícitas o acordar su activación aparte; ya pasó en ambos sistemas. No presentar un verify que lo omita como ejecución de ese caso.
4. **Alcance de publicación:** aprobar límites financieros históricos y de móvil/entorno, revisar hunks/documentación final y adjuntar síntesis sanitizada de evidencia para revisores sin acceso a Temp. No hace falta reconstruir frontend ni cambiar protocolo para resolver estos requisitos.

Rama final propuesta: `feature/web-integrated-delivery-finance` desde 9eab323 o el development vigente al crearla, en checkout separado. Traslado selectivo de239 candidatos documentados, preservando cambios remotos de móvil/lockfile y los3 excluidos locales. Título/cuerpo en [PR_PROPOSAL.md](PR_PROPOSAL.md), destino development. Preparada para autorización de commit/PR; CI remoto y gate pendientes antes de merge; no se declara todo PLAN_TRABAJO terminado ni producción habilitada. Detenido para autorización.

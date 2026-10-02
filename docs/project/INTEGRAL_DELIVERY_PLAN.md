# Plan integral de entrega — WOK Asian Food

Fecha de revisión de evidencia: 2026-09-28. Propietario/PM: Edgar. SM: rotativo. Estado: **plan para sesión especializada de ejecución; no representa que los branches estén integrados ni que el producto esté al 90 %**.

## Propósito y objetivo verificable

Construir el producto funcional completo documentado en 21 épicas, manteniendo Web Cliente, Web Operativo, Web Administrativo y app Cliente sobre una API y un modelo de negocio comunes. El resultado incluye core local-first, identidad, operaciones, pagos, FEL, mensajería, email, IA y visión; lo que dependa de proveedor/dispositivo real utiliza port, adapter y mock con etiquetas claras hasta que se apruebe y configure la integración.

La meta solicitada de “90 % general” no significa 90 % de archivos, páginas, tablas, branches o tests. Se medirá por requisito aprobado que completa su recorrido end-to-end y por las superficies que realmente le aplican. Ningún módulo se declara completo por presencia de pantalla, entidad, controller, test unitario o guía.

**Definición del umbral objetivo:** al menos el 90 % de las HU aprobadas debe estar `IMPLEMENTED_VERIFIED` en todos los canales aplicables (web/app/operativo/admin), con datos persistidos, regla backend, permisos/ownership, historial y pruebas de aceptación reproducibles. Para cada regla crítica de seguridad, dinero, capacidad, inventario, identidad, integridad de cuenta y continuidad local, el umbral es 100 % antes del piloto. Al menos 90 % de los requisitos técnicos aplicables deben tener controles y evidencia. Mostrar por separado cobertura de API, DB, pruebas, interfaces y conectores productivos; el porcentaje total nunca puede esconder un área en 0 %.

El denominador inicial es 308 HU, 145 RN y 76 RT = 529 ítems originales. Agregar requisitos del mega prompt que no estén en esas fuentes como IDs nuevos aprobados (por ejemplo `MP-...`); no duplicar equivalentes ni retirarlos para mejorar porcentaje. Marcar `SUPERSEDED` sólo cuando el propietario cambió expresamente el comportamiento y anotar qué ID reemplaza. `BLOCKED_EXTERNAL` sigue visible en su propio tablero y no se cuenta como proveedor productivo; un mock demuestra el contrato/fallback, no la integración real.

Un plan de cumplimiento al 90 % requiere puntuar cada HU, no estimar porcentaje a partir de amplitud documental. Primer resultado de la sesión especializada: catálogo individual priorizado, responsables, dependencias, estimación basada en pruebas de capacidad del equipo y fecha objetivo acordada.

## Fuente de verdad y reglas de integración

Jerarquía vigente: instrucción maestra del propietario → decisiones recientes registradas → historias/reglas originales → `SYSTEM_MASTER` → decisiones técnicas → guías de canal → diseños candidatos → planes anteriores → código como evidencia. Si una regla nueva sustituye una antigua, documentar `SUPERSEDED`, motivo, identificador reemplazante e impacto en API/DB/UI/app/pruebas/diagramas.

Mantener `docs/project/GAP_ANALYSIS.md` como matriz del estado. Relacionar cada fila así:

`Requirement → Web → App → Backend → DB → Diagram → Tests → Status → Required Change`.

Estados permitidos: `IMPLEMENTED_VERIFIED`, `IMPLEMENTED_PARTIAL`, `MOCK_ONLY`, `DOCUMENTED_ONLY`, `MISSING`, `CONFLICT`, `BLOCKED_EXTERNAL`, `SUPERSEDED`. `IMPLEMENTED_VERIFIED` exige evidencia integrada y reproducible en la rama/entorno indicado. Un resultado histórico debe identificar branch, commit, fecha, entorno y comando; no equivale a verificación del checkout actual.

Fuentes originales completas están en `docs/database/requirements/`; desglose funcional y 529 filas en `docs/database/FUNCTIONAL_SCOPE.md` y `REQUIREMENTS_REVIEW.csv`. El diseño SQL/ERD no es contrato definitivo: el modelo declarativo debe ser fuente de artefactos candidatos y Flyway fuente ejecutable del esquema instalado. Toda divergencia modelo ↔ migración se registra y reconcilia; jamás regenerar/sobrescribir migraciones aplicadas.

## Arquitectura objetivo confirmada por el propietario

- Monolito modular con un core transaccional **Java 21 + Spring Boot + PostgreSQL**, una API `/api/v1`; confirmar versión exacta compatible con el código y dependencias existentes. No introducir microservicios por defecto.
- Servidor central on-premise en el restaurante. Nginx es el ingreso; Web/Spring/PostgreSQL/storage/outbox corren localmente. Spring y DB no se exponen directamente a Internet. Clientes LAN y externos, cuando WAN funcione, consumen la misma API.
- Web actual Next.js/React/TypeScript; app exclusiva Cliente con React Native/Expo/TypeScript. Sesión/permisos WOK son una autoridad compartida; Android/iOS no ejecutan servidor ni modelo IA.
- Spring Data JPA aparece como tecnología candidata en el pedido, pero los slices disponibles usan JDBC. La sesión de ejecución debe decidir explícitamente JDBC frente a JPA antes de añadir módulos, probar transacciones/versiones y mantener patrón consistente. No hacer migración ORM por moda.
- UUID; `BigDecimal` en Java y `NUMERIC` en DB para importes; `Instant`/`TIMESTAMPTZ` para instantes con zona restaurante `America/Guatemala`; DTO OpenAPI versionados; Bean Validation, Flyway, Actuator, JUnit, Testcontainers/Docker Compose, logs estructurados y adapters.
- Outbox PostgreSQL para efectos externos; idempotencia, versión optimista para edición y bloqueo corto apropiado para stock/mesa/caja. Integraciones de red nunca se llaman manteniendo abierta una transacción financiera.
- Puertos iniciales `PaymentGateway`, `FelGateway`, `MessagingProvider`, `EmailProvider`, `SpeechToTextProvider`, `AiProvider`, storage e impresión donde el driver lo exija. Cada mock simula timeout, error, resultado incierto, respuesta malformada y reintento cuando aplique.
- Módulos de dominio: `identity`, `customers`, `staff`, `tables`, `reservations`, `catalog`, `recipes`, `inventory`, `purchasing`, `production`, `availability`, `service`, `orders`, `kitchen`, `delivery`, `messaging`, `billing`, `payments`, `cash`, `invoicing`, `notifications`, `email`, `reports`, `settings`, `audit`, `integration`, `ai`, `vision`.

## Auditoría base encontrada y consecuencia para el plan

El checkout observado es `feature/frontend-admin` en `1b6f146`; el árbol estaba limpio al inicio. Hay 266 archivos TypeScript/TSX en `apps/web/src`, 23 archivos de fixtures y 6 handlers Next/BFF (`/api/session`, usuarios/roles y capacidades de servicio). Los canales web tienen numerosas rutas y navegación, pero la mayoría opera con fixtures/providers de memoria. Acciones conectadas observadas: login BFF a API configurada, cookie HttpOnly/SameSite, rotación de sesión mediante BFF; BFF de users/roles; lectura/cambio auditado de capacidades Admin. Los contextos Cliente/Operativo/Admin no son íntegramente transaccionales.

Este checkout no incluye `apps/api`, `apps/mobile`, `database/` ni `infra/` al inicio. Esas partes existen en ramas remotas diferentes. `feature/mobile-shell` tiene auth de cliente y solicitud de reserva parcial; `feature/backend-foundation` aporta base Spring/Compose/Nginx; `feature/backend-auth`, `availability`, `reservations`, `payments`, `ai`, `database-schema`, `database-migrations` aportan slices diferentes. Las ramas no conforman un árbol combinado probado aquí. Dos worktrees `/tmp` indicados en `git worktree list` quedaron prunable y sus directorios no existen. Incorporar por PR/merge revisado, no asumir integración.

Web: `npm run test` = 39 archivos / 228 pruebas aprobadas el 2026-09-28; `npm run typecheck`, `npm run lint` y `npm run build:web` pasaron en el mismo checkout. Next build creó un cambio en `apps/web/next-env.d.ts`; fue restaurado al contenido de HEAD. Estas verificaciones acreditan build/suite actual de web, no autenticación contra API, cross-browser ni flujo conectado completo.

Java 21 está disponible; Maven, psql nativo y conexión Docker no están disponibles en el entorno sandbox observado. Docker CLI existe, pero el daemon respondió permiso denegado. Los informes de ramas registran pruebas previas de Maven/JUnit, PostgreSQL efímero, Flyway V1–V6, HTTP y Expo; no se reejecutaron desde esta rama. Solicitud para permitir consulta del daemon está pendiente. No declarar DB o runtime actual levantados basándose sólo en el vault.

Conclusión: empezar la fase de ejecución con integración de artefactos y smoke reproducible desde `development`; mientras se habilita entorno, avanzar en requisitos, contratos y adapters. No volver a producir planes aislados como si la API ya estuviera integrada.

## Organización para equipo de seis sin doble conteo

Mantener la capacidad real de cada persona y las rotaciones acordadas: reparto inicial histórico 3 Web, 2 Backend y 1 app Cliente; una persona puede alternar Backend/app pero su semana se asigna a una sola tarea principal. No contarla completa en dos frentes a la vez. PM administra alcance y decisiones; SM rota para facilitar y registrar bloqueos; PM/SM no se consideran capacidad técnica completa cuando coordinan.

| Línea | Responsabilidad estable | Colaboración e interfaces |
|---|---|---|
| Web Cliente | Web 1–2; catálogo, carrito, solicitud/reserva, pagos/seguimiento/perfil según API | Contrato de estados y error con Backend; no fallback silencioso a fixture. |
| Web Operativo/Admin | Web 2–3; operación, mesas, KDS, caja, seguridad/reportes | Compartir componente/contrato sólo tras coordinación; permisos en backend. |
| Backend/core | Backend 1–2; reglas, endpoints, autorización, capacidad, integración | API como dueño de casos de uso y errores; pruebas desde cliente. |
| DB/infra/seguridad | Backend rotativo o persona asignada; ERD, migración, Compose, backups y despliegue | Cambios schema serializados por migración versionada; no editar entidad y SQL sin contrato. |
| App Cliente | App 1; navegación completa, SecureStore, API, borradores/cache y accesibilidad | Puede rotar a backend en una iteración acordada; contrato API el mismo. |
| Integración/QA | Rotación explícita semanal; pruebas cruzadas, smoke, accesibilidad y evidencia | Integra PR; no asume que tests unitarios ajenos pasan en la rama compuesta. |

Cada issue identifica requisito, branch base/propósito, dueño, revisor, archivos compartidos y dependencias. PR pequeños hacia `development`; primero migración/API de una capacidad, después superficies Cliente/Operativo/Admin/app. Ningún agente/colaborador hace push, merge ni altera ramas protegidas sin autorización de coordinación.

## Secuencia de trabajo por puertas de salida

### Puerta 0 — Inventario e integración de fuentes

**Trabajo:** fijar `origin/development` vigente y commits realmente presentes; leer cada branch/worktree sin confundirla con integración. Ejecutar diff por rama, compilar módulos y registrar conflictos de API/schema/versión. Confirmar workspace actual de Expo y Spring; traer archivos mediante PR revisable. Actualizar documento de estado, requisitos y decision log.

**Salida:** un mapa de ramas dependientes y un baseline ejecutable para web/API/DB/app. Cada artefacto heredado tiene source commit/hash y sus pruebas identificadas. Nada se pierde ni se copia desde notas privadas.

### Puerta 1 — Ingress local y foundation

**Trabajo:** Nginx 80/443 con routing, TLS cuando exista cert, headers, límites, timeouts, compresión, logs y WebSocket/SSE si el transporte elegido los requiere. Compose: nginx, web, API, PostgreSQL, volumen/storage, outbox/workers y servicio mock de desarrollo. Separar redes app/data/AI; DB sólo privada; Docker secrets y usuario de migración separados del usuario runtime. Health `/actuator/health` separa CORE de integraciones. Scripts de backup + restauración probada.

**Prueba de salida:** stack limpio aplica migraciones/seeds, Web y API responden por Nginx, DB no tiene puerto público, reinicio conserva datos y restaura backup. Dominio/certificado/public path siguen parametrizados.

### Puerta 2 — Identidad, autenticación y autorización común

**Flujo:** registro cliente → challenge email → verificación → sesión WOK; login local; access JWT firmado corto; refresh opaco almacenado hash y rotado por familia; detectar reuse/revocar; logout; recuperación neutral; roles/permisos; estado de cuenta/restricciones; ownership; auditoría.

**Google OIDC:** verificar issuer, audience, nonce y `sub`; `AUTH_IDENTITY(provider, subject, user)`; email coincidente nunca auto-fusiona. Google no otorga rol WOK. Web conserva HttpOnly/Secure/SameSite y CSRF apropiado; móvil access en memoria y refresh en SecureStore. Google necesita WAN para login nuevo; staff crítico tiene método local/sesión aceptada. Apple queda decisión futura.

**Pruebas:** casos de challenge expirado/reuso/cooldown, refresh/reuse, sesión suspendida, elevación de privilegio, Cliente A accediendo datos B, roles múltiples, cookie/CSRF, sesión LAN sin WAN. OAuth real y SMTP real son `BLOCKED_EXTERNAL` hasta credenciales, pero interfaz, mocks y casos de linking avanzan.

### Puerta 3 — Configuración, servicio y capacidad operacional

Crear capacidades independientes: local, reservations, dine-in-online, pickup, delivery, online orders, messaging, online payments, production. Estados `ENABLED`, `MANUAL_APPROVAL`, `PAUSED`, `DISABLED`; overrides con actor, motivo, expectedVersion e historial. Presencial/mesas tiene prioridad sobre remoto en alta carga. Thresholds/configuración no hardcodeados.

`OperationalCapacityService` consume modalidad, fecha/hora, tamaño de grupo, productos/complexidad, preorden, producción, carga por área, personal, reservas/pedidos, capacidad y estado de servicio. Devuelve `ACCEPT`, `ACCEPT_WITH_CONDITIONS`, `SUGGEST_OTHER_TIME`, `REQUIRES_HUMAN_APPROVAL`, `REJECT`, reason codes, ETA, alternativas, condiciones y mensaje público. Implementar por señales/propietarios de datos; si una fuente crítica no existe, respuesta conservadora o revisión humana, no inventar precisión.

`OccupancyEstimator` usa inicialmente rangos configurables del mega prompt, no multiplicación lineal por comensales; registra esperado y real y soporta calibración. Horario actual 14:00–22:00, cocina alrededor de 21:30, último ingreso mesa 21:15, delivery externo alrededor de 21:00. Cierre es condición operativa interna: interfaz recomienda puntualidad o preorden, nunca comunica retiro forzado a las 22:00.

### Puerta 4 — Reservas, mesas y disponibilidad

Formalización y solicitud de mesa web/app mismo día requieren ≥3 h; cumplir plazo es condición necesaria, nunca aceptación automática. Formulario: grupo, fecha, horas compatibles, preorden, solicitudes, contacto y política. Tolerancia normal 20 min. Proponer ventana/hora viable; grupos grandes a última hora requieren humano.

Asignaciones no solapadas según capacidad; sesiones de mesa modelan grupo, unión/separación y traslado preservando cuentas/pedidos. Liberar espacio por tolerancia mantiene reserva e historial. Crear/mantener `reservation evaluation` idempotente: mismo key/payload devuelve resultado; misma key/datos distintos da conflicto. La asignación física ocurre separada de mera aceptación si regla lo exige.

Pruebas de carrera sobre última mesa/recurso, 3 h exactas, menos de 3 h, grupo 20 a 21:15, 2 a esa hora con carga viable, vencimiento de 20 min, no solape y dos revisiones de la misma reserva.

### Puerta 5 — Menú, recursos, pedidos y operación

Menú real llega de coordinación: categorías, nombres, precios, modificadores/extras y áreas. Preparar schema/validadores/seed neutral antes; no inventar catálogo ni recetas. Recetario detallado llega después: versionado BOM y conversiones primero, cantidades sólo al recibir dato autorizado.

**Pickup:** cliente/pedido/hora/comentarios/pago/facturación/contacto opcional. Hora solicitada ≥ ETA. Carrito nunca reserva. **Delivery:** cliente/teléfono/productos/dirección/referencia/pago/facturación; direcciones frecuentes opcionales. Tras aceptación/comanda, cambios directos del cliente no permitidos: pasa a atención operativa autorizada.

Solicitud externa tiene estados propios y no es Order hasta aceptar/revalidar. Tras WAN recovery no se autoacepta. Al aceptar, precio, stock, horario, capacidad, ETA y límites se recalculan server-side; transacción/idempotencia reserve recursos y capture snapshots. Orden presencial prioritaria en alta carga.

Cada cambio guarda original, modificación, actor, motivo, hora, revisión, comanda, recurso afectado, ETA e impacto financiero. Material consumido no regresa al inventario por anulación económica. KDS/impresión separan negocio de entrega a dispositivo; conservar retries, resultado incierto, sustituciones, reimpresión visible y fallback KDS.

### Puerta 6 — Inventario, compras, recetas y producción

Modelar físico/reservado/comprometido/disponible como contrato sin doble resta; movimientos firmados y actor; conteos/ajustes auditados; lotes/caducidad/FEFO; transferencias si ubicaciones activas. Reservar en confirmación dentro de transacción y bloquear recursos en orden determinista. Cancelación libera lo no consumido; consumo no se revierte automáticamente.

Compra sugerida no es compra automática; compra no incrementa stock hasta recepción real. Permitir recepción parcial y varios proveedores/artículo. Producción explícitamente aprobada: versión receta, consumos reales, salida/rendimiento, merma, tiempo activo/pasivo y lote. Evitar ciclos BOM y doble conteo de preparados/ingredientes. Capacidad compartida y suspensión de producción crítica recalculan disponibilidad/ETA.

Pruebas de concurrencia para recurso último, cancelación pre/post consumo, compra solicitada/comprada/recibida, lote vencido, producción parcial y receta histórica inmutable.

### Puerta 7 — Cocina, entrega y tiempo real

KDS por área muestra horas/observaciones, revisión vigente y hora objetivo. Avance suficiente para informar listo; no exigir microestado innecesario. Cocina puede corregir ETA con motivo y reordenar. Componentes de un pedido pueden estar listos en momentos distintos.

Decidir SSE/WebSocket/polling mediante necesidades de LAN, reconnect, consumo y simplicidad. Eventos idempotentes, snapshot tras reconexión y sin perder pedidos por fallo de realtime/impresora. Delivery separa preparación del tiempo externo, costo/ingreso y entrega al repartidor de cobro recibido; autorización, ausente/reprogramación/devolución auditados.

### Puerta 8 — Cuentas, caja, pagos y facturación/FEL

Cuenta contiene consumo facturable; pagos son asignaciones de dinero; propina/comisión/delivery externo siguen separados. Permitir pool de consumo por sesión/atención y múltiples pagos/subcuentas sin asignar más que total. Pago físico/online separa gateway y terminal POS. Jamás almacenar PAN/CVV; Hosted Fields/Checkout del proveedor, 3DS, webhook firmado, dedup y reconciliación de estados `UNKNOWN`.

Caja: fondo inicial no es venta. Ledger espera efectivo inicial + ventas/tips efectivo + entradas − gastos − retiros; tarjeta/transferencia/tips/fees separados. Corregir mediante asiento/compensación auditada, no update destructivo.

FEL dominio independiente: draft(s) del pool facturable, emisión individual por documento con `FelGateway`, outbox sin SQL abierto, estados incluidos UNKNOWN/contingency/cancelación; status reconciliation antes de marcar. Guardar XML original/certificado, PDF, acknowledgement, UUID/serie/número/hashes mediante storage abstraído. Refund ≠ nota crédito. Resolver asignación de líneas, fiscales, taxes/propina y evidencia antes de proveedor productivo; no afirmar cumplimiento sin validación de proveedor/asesor. Mock permite preparar frontend y pruebas sin credenciales.

### Puerta 9 — Mensajería, email, IA, voz y visión

Mensajería con canales separados (Meta oficial cuando aprobada), verificación de webhook, persistir evento crudo limitado, deduplicar, normalizar, resolver identidad externa, conversación y mensaje. Email outbox evita bloquear transacción; challenge no llega hasta configurar SMTP/relay; mock en desarrollo, estado DEGRADED declarado sin entrega real.

IA central aislada detrás de Backend → AI Gateway → Tool Broker/API interna autenticada → runtime, sin credenciales/SQL/red directa DB. Allowlist de tools con DTO, auth, ownership, validation, timeout, rate limit y audit. Alcance sólo WOK; out-of-domain guard; prompt injection/adjuntos son datos, no instrucciones. Handoff humano, salida template ante caída y tool critical approval. Mock primero y perfiles `ai-disabled`/`ai-mock`/`ai-local`; runtime puede separarse a GPU sin reescribir dominio.

Comprobante: upload validate MIME/tamaño/checksum/retención → storage → OCR/extracción → comparación de monto/fecha/referencia/duplicado → NEEDS_REVIEW. OCR/visión jamás confirma pago. Speech-to-text tras puerto y política. Feedback puede marcarse `TRAINING_CANDIDATE`; nunca entrenamiento automático. Comparar Qwen3-VL-8B y alternativa con benchmark WOK (español/OCR/tool safety/VRAM/latencia/concurrencia) antes de seleccionar runtime/GPU.

### Puerta 10 — Canales web y aplicación Cliente

Web Cliente: anonymous (menú/horario/carrito local), guest token acotado si se aprueba y registered (reservas, compras, tracking, mensajes, direcciones, perfil y factura propia). Integrar catálogo/modifiers/capacity, request→revalidation/acceptance, pickup/delivery, checkout/payment/FEL, tracking, mensajes, sesión y degraded state.

Web Operativo: mesas/visitas/reservas/solicitudes pendientes, pedidos, KDS, delivery, cuentas/pagos/caja, inventario/producción, mensajería/handoff e indicadores de integración. Web Admin: usuarios/roles/sesiones/security, reglas de reservas, capacidades/overrides, menú/receta/compras/proveedores, reportes, fiscal/pagos, canales, IA/datasets, cámaras y auditoría.

App Expo completa el conjunto Cliente, no sólo pickup/reservas: auth Google/local/verification/reset, menú real/detalle/opciones, cart, reservation+dine-in request, pickup, delivery/direcciones, checkout, pagos seguros, FEL, estado/historial, chat/mensajes/notificaciones y perfil. Cache/borradores locales sí; confirmar offline pedido/reserva/pago nunca. Mobile consume misma API; API base por hostname con split-horizon DNS (interno privado, externo público) sin detectar Wi-Fi ni hardcodear IP. Pruebas en Android e iPhone físicos/emulador, export EAS/store si requisito aprobado; web bundle no equivale a móvil instalado.

En todos los portales: accesibilidad mouse/touch/teclado, responsive 390/768/1280/1440, estados normal/carga/vacío/error/sin permisos/degraded. Permiso visual nunca equivale a autorización real.

### Puerta 11 — Reportes, administración y cumplimiento

Consultas separan fecha de pedido/entrega/cobro/emisión, moneda, filtros, fuente y permisos. Auditoría reconstruye cambios sensibles sin filtrar secreto, tokens, tarjeta ni datos de otros clientes. Definir retención para PII, archivos, conversación, cámara y prompts. MFA TOTP para privilegiados se evalúa; backups cifrados fuera de servidor y restore obligatorio. Security headers, TLS, rate limits, CORS/CSRF, validación y secretos aprobados.

### Puerta 12 — Pruebas, despliegue y evidencia del 90 %

1. Test por módulo y contrato (`JUnit`, UI unit, schema); casos de negocio negativos.
2. Integration con PostgreSQL/Testcontainers o DB efímera PostgreSQL: Flyway vacío + upgrade; autorizaciones; outbox; idempotencia/reintentos; concurrencia; FK/constraints.
3. Contract test OpenAPI/BFF/app, errores y version compatibility.
4. E2E Web y mobile con API/DB real de test para todos los recorridos críticos.
5. Seguridad: ownership A/B, refresh reuse, privilege escalation, CSRF, prompt injection, tool authorization, upload, secret scan.
6. Integración externa simulada: webhook duplicado/firmas inválidas, timeout/UNKNOWN, retries sin duplicar.
7. Operación en server local: arranque/restart/backup/restore; corte WAN conservando LAN y completar local mesas/pedido/caja/KDS/print/inventory/admin; recuperar WAN y procesar outbox sin duplicados.
8. Prueba física LAN desde otra laptop/teléfono, impresora real y Android/iPhone para superficies móviles.
9. Reporte por ID: commit, entorno, versión, comando, pass/fail, evidencia; actualizar status individual y tablero de porcentaje.

## Dependencias de ramas y orden de incorporación

Las ramas especializadas se inspeccionaron como referencias, no se fusionaron. Lista de trabajo inicial desde `docs/project/BRANCH_HANDOFF.md`: schema/migrations → backend foundation → auth/API/reservations/availability/payments/AI → Web Client/Operative/Admin y Expo; docs de arquitectura/DB acompañan cada slice. Verificar la base `origin/development` actual antes de PR porque este informe no hizo pull/branch switching.

| Grupo de ramas observado | Trabajo que aporta | Condición antes de integrar |
|---|---|---|
| `feature/database-schema`, `feature/database-migrations`, `docs/database` | Modelo 128 tablas, DDL candidato, V1–V6, diccionario/ERD | Reconciliar esquema 128 con corte Flyway 35 tablas y fuente generadora; prueba DB vacía/upgrade. |
| `feature/backend-foundation`, `feature/backend-api` | Spring Java21, Compose/Nginx, health/OpenAPI/error response | Seleccionar JDBC/JPA; builds limpios; DB user least privilege; Nginx/config no secretos. |
| `feature/backend-auth`, `feature/reservations`, `feature/availability` | Auth parcial, OAuth stub, challenge, capacidad/reservas, service state | Migraciones compatibles; tests HTTP/DB automáticos; integrar ownership y concurrencia. |
| `feature/payments` | Caja real JDBC; ports/mocks Payments/FEL | Espera de V6; vincular pedidos/cuentas/tips y conciliación antes de completo. |
| `feature/ai` | gateway/broker/mock inicial | Corregir consultas del broker para que usen use cases autorizados (no bypass directo de dominio/ownership); runtime externo mock. |
| `feature/mobile-shell` | Expo auth/reserva parcial | API/sesión compartida; completar todos los casos de Cliente; builds físicos y pruebas. |
| `feature/frontend-client`, `feature/frontend-operational`, `feature/frontend-admin` | Canales; Admin integra BFF/capacidades/roles; Client estado servicio | E2E contra backend+DB compuesto; eliminar éxito de fixture donde API falla. |
| `docs/architecture`, `feature/project-foundation`, `docs/api` | Draw.io, matrices/decisiones, OpenAPI/docs | Regenerar/editar desde estado integrado; reconciliar hashes y estado actual. |

Ninguna tarea de otro branch se cuenta como disponible en el workspace hasta que un commit integrado en la base acordada sea verificable. Un PR aprobado en branch tampoco prueba despliegue. Reusar worktrees limpios; no cherry-pick/push/merge desde esta sesión.

## Estimación y seguimiento temporal

No fijar fecha de 90 % a partir del plan viejo de 5–6 semanas: esa ventana reservaba últimas 2–3 para estabilización y no prueba capacidad actual. La sesión especializada hace primero inventario de commits, ejecuta pipeline y obtiene throughput/capacidad real por miembro y disponibilidad PM/SM. Estima cada slice con riesgo de dependencia/integración; reserva capacidad explícita para QA y cortes LAN/WAN. El equipo confirma si su horizonte sigue siendo 5–6 semanas.

Tablero requerido: `NOW` (integración/base/auth/decisiones que desbloquean), `NEXT` (flujos de operación integrados), `LATER` (expansiones no críticas ordenadas), `BLOCKED_EXTERNAL` (proveedor/menú/GPU/cámaras/dominio). Toda épica conserva historias in scope y estimación, aunque no caiga en el próximo sprint. Liberar trabajo paralelo sólo cuando contrato y dependencia estén definidos.

Reportar por iteración: HU terminadas verificadas/total; web/app/backend/DB/tests por separado; reglas críticas abiertas; migraciones pendientes; conectores mock/real; defectos bloqueantes; riesgos de capacidad; decisiones del propietario. Para detener el trabajo rumbo a “90 %”, no se permite degradar seguridad, integridad financiera ni continuidad local.

## Decisiones externas reales, con trabajo paralelo

| Pendiente | Decisor | Sigue avanzado ahora |
|---|---|---|
| Exposición directa/NAT o túnel; CGNAT/IP | Propietario/infra | LAN, Nginx y hostname configurable; medir ISP sin publicar. |
| Dominio y DNS | Propietario | Configurar host por variable y split-horizon de prueba. |
| Relay/email productivo | Propietario | Outbox/provider/mock/Mailpit y templates. |
| Pasarela bancaria y terminal | Propietario/finanzas | interfaces/mock/3DS/webhook tests; nunca PAN/CVV. |
| Certificador FEL y política fiscal | Propietario/contabilidad | drafts/pool/port/outbox/mock; validar requisitos antes de producción. |
| Google OIDC credenciales | Coordinación/propietario | verifier stub, identity/linking y tests mock; no auto fusionar por email. |
| Menú real | Coordinación | esquema, admin UI/API/seed loader sin inventar producto/precio. |
| Recetas/cantidades | Coordinación/cocina | modelo versionado, BOM y validador sin rellenar cantidades. |
| Modelo, runtime y GPU | equipo/propietario tras benchmark | gateway/tools/mock/benchmark harness y perfiles disabled/mock. |
| Cámaras/dispositivo | propietario | interfaz de detección y señal mock; sin capturar imágenes reales. |
| Realtime final | equipo según requisitos/medición | eventos/versiones y polling snapshot; no acoplar negocio al transporte. |
| Uso de anónimo/guest | propietario | menú anónimo y diseño de token restringido sujeto a decisión; ownership siempre requerido. |
| Estancia/permanencia y multas/cancelación | propietario/operación | estimador configurable sin cobro automático. |

## Artefactos que la sesión de ejecución debe mantener

- `docs/project/GAP_ANALYSIS.md`: estados por requisito y por plataforma, evidencias.
- `docs/project/DECISIONS_REQUIRED.md`: sólo decisiones realmente abiertas; actualizar y cerrar sin borrar histórico.
- `docs/project/TECH_DECISIONS.md`, `CURRENT_STATE.md`, `INTEGRAL_DELIVERY_PLAN.md`, `IMPLEMENTATION_REPORT_*.md`, `BRANCH_HANDOFF.md`.
- `docs/backend/ARCHITECTURE.md`, `DEVELOPMENT_PLAN.md`, `BACKLOG.md`; separar stage integral de antiguos planes SUPERSEDED.
- `docs/mobile/CLIENT_APP_PLAN.md`; actualizar cobertura completa Cliente y no copiar viejo ETA parcial sin revisar.
- `docs/frontend/CHANNEL_GAPS.md`; matrices por web/app/portal.
- `docs/database/FUNCTIONAL_SCOPE.md`, `REQUIREMENTS_REVIEW.csv`, `BACKEND_MAPPING.md`, `REVIEW_FINDINGS.md`, diccionario, validación/manifest.
- `docs/ai/ARCHITECTURE.md`, `docs/security/AUTH_ARCHITECTURE.md`, `docs/email/DELIVERY_OPTIONS.md`, `infra/README.md`.
- `database/design/model.json` fuente, generadores, `database/schema/postgresql.sql` candidato, migraciones inmutables `database/migrations`, pruebas DB y diagramas regenerados.
- `docs/architecture/wok-system-architecture.drawio` (38 páginas referidas en reporte), `infra/diagrams/network.drawio`, `docs/database/erd/wok-complete-erd.drawio`; los documentos/diagramas se actualizan sólo desde la fuente integrada. Incluir vistas frontend, backend, LAN/WAN, auth, IA y flujos críticos.
- OpenAPI versionado, Compose Nginx, seeds neutros, mocks y suite de pruebas identificada.

## Criterio final de liberación del objetivo

1. Cobertura individual ≥90 % aprobada con matriz congelada; 100 % de reglas críticas sin excepción desconocida.
2. Para cada HU contada, flujo completo en todas sus plataformas asignadas, API/DB persistentes, errores y permisos comprobados, tests y evidencia anotada.
3. Proveedores no configurados se declaran bloqueados y la aplicación comunica degradación; no se etiqueta integración real.
4. Migraciones desde cero y actualización, backup/restore, seguridad y corte/recuperación WAN aprobados.
5. Aceptación explícita del PM/propietario y demo reproducible en hardware/dispositivos acordados.

Ningún cálculo de 90 % se publica hasta cumplir esos criterios; mostrar también trabajo restante y áreas bloqueadas.

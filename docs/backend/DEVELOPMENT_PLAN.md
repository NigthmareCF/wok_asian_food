# Plan de desarrollo backend — WOK Asian Food

> **Punto de entrada vigente para planificación integral:** [Plan integral de entrega](../project/INTEGRAL_DELIVERY_PLAN.md), [brechas por evidencia](../project/GAP_ANALYSIS.md) y [estado del checkout](../project/CURRENT_STATE.md). Esta guía técnica procede de otra rama especializada; antes de asignar trabajo, integrar/confirmar el commit y las dependencias. La ejecución se ordena por puertas de salida del plan integral.

> **Plan vigente desde 2026-09-25.** El plan de cinco o seis semanas conservado abajo queda `SUPERSEDED` como alcance total: era un corte académico de pickup. La arquitectura y backlog actuales cubren el producto integral, en slices verificables; no se declara terminado un módulo por existir una tabla o mock. Véanse [arquitectura](ARCHITECTURE.md), [brechas](../project/GAP_ANALYSIS.md) y [backlog vigente](BACKLOG.md).

## Secuencia vigente por dependencias

| Fase   | Resultado comprobable                                                                                                    | Dependencias                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| NOW-1  | API compila/arranca; PostgreSQL real con Flyway, seeds base sin menú inventado; Nginx local; health core e integraciones | JDK, Docker/DB disponible               |
| NOW-2  | Registro CLIENT, verificación, login, JWT, refresh rotativo/reuse, RBAC, ownership, auditoría, OpenAPI                   | NOW-1                                   |
| NOW-3  | Service capabilities; capacidad/ocupación; reserva formal y mesa digital con 3 h; catálogo real con disponibilidad backend | NOW-2; recetario sólo para consumo automático |
| NEXT-1 | Solicitud de pickup/delivery y aceptación, cocina/KDS, inventario/producción y precios desde backend                     | NOW-2/3, catálogo recibido; delivery productivo depende de políticas `CLIENT-DELIVERY-01` |
| NEXT-2 | Cuenta, pagos mixtos, propina, caja, FEL mock y outbox; luego adapters reales                                            | NEXT-1, proveedor para producción       |
| NEXT-3 | Meta/web/app chat, STT, handoff y AI Gateway mock aislado; visión de voucher sin autocertificar pago                     | NOW-2, almacenamiento seguro            |
| LATER  | Benchmarks IA/hardware, Apple, realtime definitivo y optimización de red                                                  | Evidencia de carga/proveedor; cámaras `FUTURE / DEFERRED` |

Cada slice incluye migración, endpoint, permiso/ownership, UI afectada, test y diagrama; las interfaces externas se desarrollan con port + mock + pruebas antes del proveedor. Reservar una pista de integración continua entre DB/API/web/app, no cuatro verdades por canal. Las semanas calendario antiguas son referencia histórica y no acotan el alcance del producto.

## Control de entrega

La base está terminada sólo si compila, arranca, conecta PostgreSQL, aplica Flyway, expone OpenAPI/health y pasa pruebas de auth/permissions/auditoría. Las operaciones internas deben probarse con WAN cortada y restauración; los workers no duplican efectos. Cualquier parte mock se identifica como tal en UI, API y reporte. No se publica una integración fiscal, bancaria, Meta o IA real por haber implementado su interfaz.

---

## Historial: plan anterior `SUPERSEDED`

| Campo                           | Valor                                                                                                            |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Fecha de revisión               | 2026-09-15                                                                                                       |
| Estado                          | PROPOSAL; pendiente de revisión del equipo y responsable del restaurante                                         |
| Equipo                          | Seis integrantes; reparto 3 web / 2 backend / 1 app con apoyo compartido                                         |
| Objetivo                        | Implementar una API transaccional compartida por Cliente, Operativo y Administrativo, preparada para web y móvil |
| Plazo confirmado por el usuario | 5–6 semanas; fecha exacta pendiente                                                                              |
| Supuesto de capacidad           | 12–15 horas por persona por semana; pendiente de confirmar y ajustar alcance                                     |
| Entrega de este documento       | Plan y backlog; sin instalar tecnologías, ejecutar DDL ni conectar proveedores                                   |

> Actualización de fuentes — 2026-09-17: se recuperaron y regeneraron el ERD y SQL externos. Consultar el [paquete de datos](../database/README.md) y los [hallazgos](../database/REVIEW_FINDINGS.md) antes de fijar migraciones. El diseño sí contiene `invoices` e `invoice_items`; eso no implica emisión implementada ni aprobación del alcance fiscal. Las observaciones de inaccesibilidad más abajo describen la revisión anterior.

## 1. Recomendación ejecutiva

Desarrollar un **monolito modular con Java, Spring Boot y PostgreSQL**, con API REST documentada mediante OpenAPI. El PM informa que el equipo conoce Java/Spring y que el ingeniero orienta a utilizarlos; ésta es la base de planificación, pendiente de fijar versiones y dependencias. La propuesta anterior de NestJS queda sustituida: aprender otro framework backend no aporta una ventaja clara en este plazo. [Guía oficial de API REST con Spring](https://spring.io/guides/gs/rest-service/).

El proyecto conserva Next.js/React/TypeScript en web y propone React Native + Expo exclusivamente para Cliente móvil. Java y TypeScript se conectan mediante JSON/OpenAPI; no necesitan compartir lenguaje ni entidades de persistencia.

**Restricción de calendario actualizada:** de las 5–6 semanas totales, las últimas 2–3 son para seguridad, integración y ajustes. Por tanto, el desarrollo de funciones nuevas dispone normalmente de 2–3 semanas, no de cinco. El PM sigue siendo Edgar y el SM rota. No se han presentado fallos de React Native: existen dudas preventivas, que se verifican con un experimento corto.

El core y la web Operativa deben poder ejecutarse en la LAN del restaurante. Un punto de entrada público permite acceso remoto mientras exista conectividad; ante una interrupción comunica indisponibilidad y, si se aprueba esa función, conserva solicitudes pendientes sin confirmarlas. Esto responde a RT-016 a RT-020: un despliegue exclusivamente en nube no cumpliría por sí solo la continuidad local exigida.

Para móvil, proponer **React Native con Expo**, exclusivamente para Cliente. Expo proporciona herramientas sobre React Native para Android e iOS. Conservar Next.js para los tres portales web y compartir contratos, cliente API y utilidades independientes de la interfaz. [Relación entre Expo y React Native](https://docs.expo.dev/faq/).

La principal mejora al proceso es entregar flujos completos desde temprano: migración + regla de negocio + endpoint + prueba + pantalla integrada. Posponer la base de datos hasta después de desarrollar todos los controladores trasladaría los problemas de concurrencia y consistencia al final.

## 2. Fuentes, evidencia y límites

### 2.1 Material consultado

| Fuente                                                                                                                                                   | Qué aporta                                                   | Estado de la revisión                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `epicas_historias_usuario.txt`                                                                                                                           | 21 épicas y sus historias                                    | Consultadas cabeceras e historias de dominios principales; alcance completo por refinar            |
| `reglas_negocio_requisitos_tecnicos.txt`                                                                                                                 | RN-001 a RN-145, RT-001 a RT-076 y criterios arquitectónicos | Base funcional principal consultada                                                                |
| `vistas_mockups_rgb.txt`                                                                                                                                 | Catálogo visual y acciones de portales                       | Revisión parcial del texto; complementada con las tres guías de canales del repositorio            |
| `docs/arquitectura_frontend.drawio` y JPG asociados, en documentación externa                                                                            | Diagramas de arquitectura frontend                           | Archivos identificados; no se pudo completar lectura estructural/visual por error de E/S del disco |
| [Contexto central](../WOK_ASIAN_FOOD_CONTEXTO_CENTRAL.md)                                                                                                | Alcance, módulos, fases y continuidad                        | Fotografía histórica; algunas afirmaciones de estado ya no representan el código actual            |
| [Guía del equipo](../frontend/TEAM_GUIDE.md), [canales](../frontend/channels/README.md), [arquitectura](../frontend/ARCHITECTURE.md) y avances por canal | Implementación web y organización del equipo                 | Consultados, junto con cliente HTTP, contrato realtime y muestras de modelos/fixtures              |
| [Decisiones técnicas](../project/TECH_DECISIONS.md)                                                                                                      | Decisiones confirmadas y pendientes                          | Las decisiones históricas no fijan versiones; el PM orienta ahora backend a Java/Spring            |
| Vault local: entrada y nota de decisiones                                                                                                                | Discrepancias entre versiones de contexto                    | Consulta de notas pertinentes; no se copian notas privadas ni se sincroniza el vault               |
| `DESARROLLO WEB/database/README.md` y `docs/database/{design-decisions,validation-report}.md` externos                                                   | Diseño PostgreSQL de 109 tablas y contratos R01–R13          | Documentación consultada; declara validación estática, sin ejecución del SQL                       |

Los tres TXT están en la carpeta externa `PROYECTO_WOK_DOCUMENTACION` indicada por el usuario. El diseño de datos adicional se localizó en la carpeta académica `DESARROLLO WEB`, fuera de aquella ruta. Su ERD candidato es `docs/database/erd/wok-complete-erd.drawio` y su DDL `database/schema/postgresql.sql`, relativos a esa carpeta externa.

**Límite de evidencia:** el dispositivo externo comenzó a devolver `Input/output error` durante lecturas posteriores. No se afirma haber renderizado los diagramas, auditado directamente todo el SQL ni verificado las 109 tablas contra PostgreSQL. Esa cifra y los 13 contratos provienen de la documentación leída. Recuperar acceso y revisar los artefactos es una tarea de semana 1, no un bloqueo para redactar este plan.

Estado local observado: rama `feature/frontend-admin`, HEAD `1690560`, con cambios previos en frontend y registros de progreso. No se verificó el remoto mediante fetch. La existencia de rutas y fixtures demuestra avance de interfaz, no autenticación, pagos, permisos ni persistencia reales.

### 2.2 Discrepancias que requieren decisión

| Tema                   | Diferencia encontrada                                                                                   | Tratamiento propuesto                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Repositorio            | Contexto central indica monorepo acordado; decisiones/frontend lo dejan pendiente                       | D-01 debe resolverlo; la estructura actual de workspaces facilita, pero no aprueba, un monorepo                                                 |
| Estado del proyecto    | Contexto central describe preparación documental; código y avances posteriores contienen portales       | Usar evidencia local reciente para estado y fuentes aprobadas para comportamiento                                                               |
| Reservas tardías       | RN-065/066 impiden ingreso posterior al límite; algunos avances de UI hablan de permitirlo con preorden | Propuesta conservadora: ofrecer última hora válida; preorden tardía aplica dentro de ventana válida. Confirmar con negocio antes de implementar |
| Datos de dinero/estado | Fixtures usan `number` y etiquetas españolas como estado                                                | Definir DTO canónicos y adaptadores; no convertir los fixtures directamente en esquema API                                                      |
| Ciclo backend/DB       | Contexto separa fases Backend y Database Integration                                                    | Proponer ejecución conjunta por flujo, sin declarar modificado el plan aprobado                                                                 |
| Diseño PostgreSQL      | Hay un diseño externo detallado, pero no una decisión de adopción en este repo                          | Revisar, registrar procedencia y transformar gradualmente en migraciones                                                                        |

Prioridad de fuentes: reglas/historias aprobadas → decisiones técnicas registradas → intención visual → catálogo textual → patrones actuales. Una nota más nueva no autoriza por sí sola cambiar reglas comerciales.

## 3. Alcance para cinco o seis semanas

**Compromiso propuesto: un MVP académico verificable, con backend real y una app Cliente pequeña.** El plazo indicado no permite comprometer responsablemente las 21 épicas, 109 tablas y todos los portales completos sin conocer capacidad y trabajo reutilizable. El ingeniero debe confirmar la rúbrica y el corte funcional durante los primeros dos días. Este P0 es el objetivo candidato; su viabilidad depende del avance backend ya existente y de las horas reales. No se promete construirlo desde cero con sólo dos personas parciales en dos semanas.

| Prioridad                          | Alcance                                                                                                                                                                                              | Criterio de salida                                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| P0 — Entrega mínima                | API/DB reproducible, login y permisos básicos, configuración mínima, menú/modificadores, inventario de recursos limitado, confirmación transaccional, KDS, cobro simple, auditoría e integración web | Un pedido real pasa por Cliente, aceptación Operativa, cocina y cobro; stock y auditoría consistentes |
| P0 — App Cliente pequeña           | Login, menú/detalle, carrito, envío de solicitud y seguimiento                                                                                                                                       | Flujo funcional sobre la misma API en Android e iPhone; distribución acordada con el ingeniero        |
| P0 — Operación y evidencia         | Corte de WAN con core/LAN disponibles, idempotencia, autorización, backup/restauración y guion de demostración                                                                                       | El equipo reproduce la entrega sin depender de datos en memoria                                       |
| P1 — Sólo con capacidad comprobada | Reserva sencilla con asignación sin solapes, ocupación básica de mesas y reporte diario                                                                                                              | Sólo si está terminado antes del congelamiento funcional                                              |
| P2 — Posterior a entrega (corte académico histórico) | Preorden avanzada, cuentas divididas, cobros mixtos/parciales, caja completa, compras/producción completa, chat/adjuntos, delivery, push, IA, visión y proveedores externos | `SUPERSEDED` como alcance integral: delivery y el resto del canal Cliente sí pertenecen al producto. Cámaras quedan diferidas. Ver [alcance Cliente](../project/CLIENT_SCOPE_DECISIONS.md). |

Para reducir alcance sin mentir sobre disponibilidad, limitar el menú de demostración a recursos/recetas sencillos y un stock inicial auditado. La confirmación sí debe reservar recursos atómicamente; recetas recursivas y producción desde cero no se habilitan hasta implementar sus invariantes. Productos no soportados quedan fuera del catálogo vendible del MVP.

Cobro MVP: un método por cuenta, importe completo, efectivo o registro autorizado de terminal/transferencia externa, sin procesar tarjeta en app. Deshabilitar divisiones, pagos parciales/mixtos, descuentos y reembolsos si no están implementados. Esto es un recorte explícito de historias, no cumplimiento de EP-17 completo. Confirmar aceptación académica del recorte.

Modalidad del corte académico histórico: **para recoger**, con solicitud Cliente que personal acepta después de revalidar. Está `SUPERSEDED` como alcance total: el producto integral incluye reservas, pickup, delivery y servicio en mesa. Para la demostración actual consultar [alcance Cliente](../project/CLIENT_SCOPE_DECISIONS.md), que separa flujos de UI, integración observada y políticas pendientes.

Móvil queda limitado a seis pantallas o grupos funcionales: acceso, menú, detalle, carrito, envío y seguimiento. Registro/verificación/recuperación, perfil, reservas, mensajería y notificaciones se difieren si no caben. Para una demo con cuentas de prueba preaprovisionadas, registrar esa limitación; no presentar registro público o recuperación como terminados.

Fuera de entrega: publicación en tiendas salvo exigencia confirmada, múltiples sucursales, contabilidad general, fiscalización electrónica, desktop dedicado y rastreo de repartidor. Las pantallas frontend existentes fuera del corte permanecen identificadas como demostración y separadas de los flujos reales.

## 4. Arquitectura propuesta

La arquitectura siguiente distingue la base del MVP y la evolución del producto. En cinco o seis semanas se implementa sólo lo necesario para P0; las capacidades P2 conservan este diseño como referencia.

### 4.1 Despliegue y continuidad

```text
Web Cliente / app Expo
          |
          v
Entrada pública HTTPS / relay
          | conexión autenticada hacia el restaurante
          v
LAN: proxy HTTPS -> API modular -> PostgreSQL
         |             |
   Next.js local       +-> outbox -> workers -> impresora / avisos
         |
Web Operativa / Administrativa / KDS
```

El relay es infraestructura de acceso remoto, no otro backend con una copia editable de stock o caja. En el MVP debe limitarse a informar indisponibilidad, sin bandeja durable remota durante cortes; una solicitud no enviada permanece como borrador del cliente. Si conserva solicitudes durante la desconexión, necesita almacén duradero propio de solicitudes, idempotencia, retención, cancelación y conciliación; esas solicitudes no representan ventas confirmadas.

| Fallo                                        | Comportamiento exigido                                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Internet externo caído, LAN y servidor sanos | Login operativo, mesas, pedidos, caja, inventario y KDS siguen funcionando; web local carga sin CDN o autenticación cloud obligatoria |
| Core local inaccesible desde fuera           | Canales remotos muestran estado degradado con fecha de actualización; ninguna respuesta de éxito de pedido se inventa desde caché     |
| Recuperación de Internet                     | Revalidar cada solicitud pendiente; conservar aceptación/cancelación y evitar duplicados                                              |
| Impresora caída                              | Pedido digital sigue confirmado y visible en KDS; trabajo se marca fallido o resultado incierto                                       |
| PostgreSQL o LAN caídos                      | Suspender confirmaciones y cobros digitales; protocolo manual del restaurante y conciliación posterior controlada                     |
| Proveedor externo caído                      | Timeout, reintentos limitados y aislamiento; core no espera al proveedor dentro de una transacción                                    |

La continuidad ante Internet caído no promete funcionamiento con servidor, energía o LAN caídos. Evaluar equipo local, UPS, respaldo externo cifrado, hostname estable, certificados y soporte antes del piloto. La web Operativa debe poder abrirse y volver a iniciar sesión durante la prueba de desconexión, no sólo seguir usando una pestaña previamente cargada.

### 4.2 Stack concreto y ambiente sencillo

| Componente       | Propuesta                                                                            | Criterio                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Lenguaje         | Java 21 si no existe ya una versión compatible fijada                                | Usar el JDK conocido y compatible; no cambiar uno válido sólo por esta recomendación                   |
| Aplicación       | Spring Boot, Spring Web MVC                                                          | Un proceso backend; elegir línea estable compatible con lo usado en clase y librerías                  |
| Build            | Maven Wrapper                                                                        | Mismo build en equipo y CI; si ya usan Gradle Wrapper, conservarlo para evitar migración               |
| Persistencia     | Spring Data JPA/Hibernate; SQL parametrizado para consultas críticas                 | Entidades internas separadas de DTO; bloqueos/índices probados en PostgreSQL                           |
| Migraciones      | Flyway con SQL versionado                                                            | Una herramienta dueña del esquema; Hibernate valida, no modifica automáticamente el esquema compartido |
| Seguridad        | Spring Security + validación de entrada                                              | Autenticación, roles, propiedad de objeto y sesiones desde la primera entrega                          |
| Base             | PostgreSQL; evaluar versión 18 del diseño externo                                    | Validar DDL y compatibilidad del driver/Flyway antes de fijar versión                                  |
| API              | REST `/api/v1`, OpenAPI versionado y DTO explícitos                                  | Generar/validar cliente TypeScript para web y Expo; herramienta OpenAPI compatible con Spring elegido  |
| Actualizaciones  | Polling REST mientras la vista está activa                                           | WebSocket/SSE posterior si aporta valor; refrescar al reconectar/volver a la app                       |
| Pruebas          | JUnit, Spring Boot Test, PostgreSQL de pruebas; Testcontainers si entorno lo permite | H2 no demuestra los locks/constraints específicos de PostgreSQL                                        |
| Móvil            | React Native + Expo + TypeScript                                                     | Un único cliente nativo para Android/iPhone, alcance sólo Cliente                                      |
| Desarrollo local | API en IDE, DB en Docker Compose, web/Expo con scripts existentes                    | Evitar contenedorización obligatoria de todo el frontend para el trabajo diario                        |

No fijar una versión de Spring por ser la más reciente. La documentación actual permite comprobar JDK/build compatibles; al inicio registrar la combinación usada por el equipo y el ingeniero, incluyendo compatibilidad con OpenAPI y migraciones. [Requisitos de Spring Boot](https://docs.spring.io/spring-boot/system-requirements.html).

Spring Initializr sirve para una base nueva; antes, revisar el backend en el que el equipo ya trabaja. En esta rama local no se encontraron `pom.xml`, archivos Gradle ni Java durante la revisión; esto no descarta trabajo en otras ramas/repositorios. Obtener su ubicación y conservar lo útil, sin crear un segundo backend por defecto.

Entorno recomendado: IDE habitual (IntelliJ, Eclipse/STS o VS Code), un JDK acordado, Maven Wrapper, PostgreSQL local reproducible y un único README. Web y Expo conservan su runtime Node y lockfile. El directorio candidato `apps/api` tiene `pom.xml` y no se convierte en paquete npm; CI ejecuta Maven por separado de npm. Si el backend ya está en otro repo, compartir OpenAPI versionado sin moverlo para esta entrega.

Usar `@Transactional` en el servicio de aplicación que coordina el caso completo; revisar rollback, llamadas internas y límites de transacción. Bloqueos pesimistas para reserva de recursos y versión optimista para edición; evitar llamadas externas dentro de la transacción. [Bloqueos en Spring Data JPA](https://docs.spring.io/spring-data/jpa/reference/jpa/locking.html).

Usar Flyway como único mecanismo de evolución y `ddl-auto=validate` en entornos compartidos. No mezclar generación automática de Hibernate y otro historial de migraciones. [Inicialización de datos en Spring Boot](https://docs.spring.io/spring-boot/how-to/data-initialization.html). Preparar tests sobre PostgreSQL con entorno efímero, usando [soporte Testcontainers](https://docs.spring.io/spring-boot/reference/testing/testcontainers.html) cuando sea viable.

Para autenticación usar las capacidades de [Spring Security](https://docs.spring.io/spring-security/reference/servlet/authentication/passwords/index.html); no inventar hash de contraseña ni emisión/validación criptográfica propia. El transporte web/móvil se congela en el contrato de la semana 1. Si ya existe una sesión segura, reutilizarla y probarla antes de introducir otro esquema de tokens.

Un solo backend y una sola DB son suficientes inicialmente. No añadir microservicios, Redis, broker, proveedor de identidad externo o servidor de autorización propio sin una necesidad del corte. Outbox/worker separado queda para tareas externas habilitadas; KDS por polling no lo requiere para consultar estado persistido.

### 4.3 Módulos y propiedad de datos

| Módulo                      | Responsabilidad                                                  | No debe hacer                                                                |
| --------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `identity`                  | Usuarios, sesiones, roles, permisos y restricciones              | Confiar en roles enviados por registro público                               |
| `catalog`                   | Categorías, menú, modificadores, áreas y precios                 | Prometer disponibilidad por sí solo                                          |
| `recipes`                   | Versiones, unidades y dependencias de recetas                    | Modificar retrospectivamente una receta usada                                |
| `inventory`                 | Lotes, movimientos, saldos y reservas de recursos                | Aumentar stock por compra todavía no recibida                                |
| `purchasing` / `production` | Recepciones y transformación de recursos                         | Descontar simultáneamente preparación e ingredientes de esa preparación      |
| `availability` / `service`  | Disponibilidad publicada, carga, ETA, horarios y cierres         | Sobrescribir un bloqueo manual con cálculo automático                        |
| `orders` / `kitchen`        | Solicitudes aceptadas, pedidos, artículos, comandas y revisiones | Borrar artículos ya comandados                                               |
| `tables` / `reservations`   | Ocupación, asignación, capacidad y preorden                      | Confundir reserva futura con ocupación física actual                         |
| `billing` / `cash`          | Cuentas, reparto, cobros, correcciones y cierres                 | Usar estado de cocina como prueba de pago                                    |
| `delivery` / `messaging`    | Logística manual y conversaciones aisladas                       | Garantizar tiempo de transporte externo o fusionar identidades sin verificar |
| `audit` / `reporting`       | Historial y consultas por permisos                               | Exponer notas internas al cliente                                            |
| `jobs` / `integrations`     | Outbox, impresión, proveedores y conciliación                    | Reprocesar un pedido para reimprimirlo                                       |

Cada módulo publica servicios de aplicación. Las operaciones críticas que cruzan módulos comparten **una transacción y la misma conexión** mediante un coordinador de caso de uso. No utilizar llamadas HTTP internas entre módulos del monolito ni actualizar tablas ajenas desde controladores. Mantener dependencias acíclicas.

Si se confirma monorepo, usar `apps/api` para Maven/Java, `apps/mobile` para Expo y paquetes de contratos/cliente TypeScript cuando realmente se compartan. `apps/worker` sólo se incorpora al habilitar trabajos externos. No crear carpetas vacías de todo el catálogo. Los paquetes de cliente no importan entidades ORM, acceso a DB ni módulos internos del servidor.

## 5. Persistencia, transacciones y reglas esenciales

### 5.1 Adopción del ERD

El diseño externo documenta 109 tablas, 14 dominios y contratos R01–R13. No obliga a exponer 109 recursos CRUD ni a implementar todo simultáneamente. Semana 1 debe comparar reglas, diccionario, SQL y ERD; registrar versión/procedencia; identificar dependencias de cada corte y probar migraciones en una base vacía. En el MVP seleccionar sólo el subconjunto P0 y sus FK necesarias; no importar las 109 tablas sin revisión.

Secuencia candidata: identidad/configuración/auditoría/idempotencia → menú/recetas/unidades/inventario → pedidos/comandas/mesas → cuentas/pagos/caja → reservas/compras/producción → solicitudes remotas/delivery/mensajes → reportes e integraciones. Las FK reales pueden exigir crear tablas soporte antes; su mera existencia no habilita una función.

Mantener migraciones inmutables tras integración, credencial de migración separada y pruebas de actualización sobre datos existentes. Usar cambios compatibles de expansión y posterior retirada. El DDL externo es inicial y no idempotente; no ejecutarlo en una base con información real. Las restricciones de fila no bastan para reglas entre documentos. [Restricciones PostgreSQL](https://www.postgresql.org/docs/18/ddl-constraints.html).

### 5.2 Confirmación de pedido

1. Autenticar, comprobar permiso/propiedad y validar formato; obtener clave idempotente vinculada a actor y operación.
2. Abrir transacción; reclamar clave con unicidad y comparar hash de contenido. Repetición idéntica devuelve el resultado previo; contenido distinto devuelve conflicto.
3. Leer y bloquear configuración/estado relevante o verificar su versión para evitar confirmar con un cierre concurrente no observado.
4. Bloquear recursos en orden determinista; recalcular disponibilidad material y capacidad. Validar modificadores, precios, restricciones, modalidad y horario en servidor.
5. Reservar recursos compartidos; guardar pedido, snapshots, artículos, versión y las comandas que correspondan. Si la solicitud exige aceptación humana, todavía no ejecutar esta confirmación.
6. Guardar historial, auditoría, resultado idempotente y eventos outbox en el mismo commit.
7. Responder confirmado únicamente tras el commit. Worker entrega eventos/impresión fuera de la transacción.

La disponibilidad mostrada en menú es orientativa; la garantía aparece al confirmar. El carrito no reserva por defecto. `READ COMMITTED` con bloqueos explícitos es candidato; evaluar `SERIALIZABLE` para invariantes sobre conjuntos. Probar deadlocks y reintentos acotados de toda la transacción. [Bloqueos PostgreSQL](https://www.postgresql.org/docs/18/explicit-locking.html).

### 5.3 Invariantes que bloquean entrega

| Área              | Regla verificable                                                                                                  | Referencias                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| Stock             | Nunca vender dos veces el último recurso; físico, reservado y comprometido definidos sin doble resta               | RN-089–097, RT-004–009, RT-026–030       |
| Cancelación       | Liberar sólo recursos no consumidos; anulación económica no repone stock consumido                                 | RN-056–064, RN-093–094                   |
| Recetas           | Versiones históricas inmutables, sin ciclos, conversión válida de unidades y recursos compartidos contados una vez | RN-087, RT-029–030, contrato externo R03 |
| Comandas          | Área correcta, revisión trazable y relación original/reemplazo                                                     | RN-058–062, RN-071–074                   |
| Caja              | Suma de asignaciones no supera importe cobrable; cobros mixtos/parciales conservan saldo                           | RN-022, RN-046–049, RT-047               |
| Correcciones      | Compensaciones auditadas; sin editar silenciosamente cobros ni movimientos contabilizados                          | RT-042–046                               |
| Desglose          | Venta, propina opcional, comisión y delivery externo separados                                                     | RN-019, RN-077–079, RN-131–138           |
| Reservas          | Sin solape de asignaciones activas ni exceso de capacidad; no liberar mesa con deuda sin autorización              | RN-009–016, RN-048, RN-065–069           |
| Compras           | Sólo recepción física aceptada genera stock, con responsable y cantidades parciales                                | RN-083–084, RN-139–141                   |
| Remoto            | Solicitud pendiente no es pedido confirmado; reconexión exige revalidación                                         | RN-088, RN-098–112                       |
| Overrides         | Disponibilidad publicada respeta suspensión manual; actor, motivo y vigencia auditados                             | RN-117–124                               |
| Identidad         | Registro público sólo Cliente, unión de permisos por roles y acceso por objeto                                     | RN-025–026, RT-033–035                   |
| Borrado de cuenta | Revocar sesiones; histórico según política, sin reactivar perfil viejo al registrarse otra vez                     | RN-113–116, RT-066–070                   |

Dinero: usar decimal exacto en DB y strings decimales en JSON; moneda explícita y redondeo acordado. Cantidades usan unidad base y precisión definida. Instantes viajan con zona/UTC; horarios operativos se interpretan con zona IANA configurada. No usar reloj, subtotal ni precio del navegador como autoridad.

ETA inicial: reglas deterministas basadas en carga por área, producción requerida, personal disponible y tamaño del pedido; mostrar rango, fecha de cálculo y motivo del ajuste humano. Calibrar con operación observada. No presentar el ETA de cocina como garantía de llegada del delivery.

## 6. Contrato API y transición del frontend

### 6.1 Recursos y operaciones candidatas

Rutas propuestas para diseñar OpenAPI; no son endpoints existentes. Toda mutación sensible requiere permiso y auditoría; las operaciones críticas además exigen idempotencia.

| Flujo            | Rutas orientativas                                                                        | Regla de acceso                                                  |
| ---------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Sesión           | `POST /auth/login`, `/auth/refresh`, `/auth/logout`; `GET /me`                            | Sesión revocable; no devolver secretos ni restricciones internas |
| Catálogo         | `GET /menu`, `/menu/items/{id}`, `/service-status`                                        | Proyección pública simplificada                                  |
| Solicitud online | `POST /order-requests`; `POST /order-requests/{id}/accept`                                | Cliente crea propia solicitud; personal acepta con revalidación  |
| Pedido           | `POST /orders`; `POST /orders/{id}/submit`, `/changes`; `GET /orders/{id}`                | Personal por permiso; cliente sólo proyección de su pedido       |
| Cocina           | `GET /kitchen/tickets`; `POST /kitchen/tickets/{id}/ready`; `POST /orders/{id}/eta`       | Permiso y área habilitada                                        |
| Mesas/reservas   | `POST /tables/{id}/occupy`, `/release`; `POST /reservations`, `/reservations/{id}/assign` | Cliente solicita; asignación física autorizada                   |
| Cuentas/caja     | `POST /bills/{id}/split`, `/payments`; `POST /cash-sessions/{id}/close`                   | Permisos financieros y sesión de caja válida                     |
| Recursos         | `POST /goods-receipts/{id}/post`; `POST /production-batches/{id}/complete`                | Transacciones con movimientos de inventario                      |
| Administración   | `PATCH /settings`; `POST /users/{id}/roles`; `GET /audit-events`                          | Permisos granulares; versionado para edición                     |
| Mensajería       | `GET/POST /conversations/{id}/messages`                                                   | Pertenencia/asignación y restricciones del canal                 |

`/api/v1` prefija todas las rutas. `PATCH` general no debe permitir saltar estados de negocio; transiciones se exponen mediante comandos explícitos. Documentar paginación, filtros permitidos, límites, esquemas de respuesta y permisos por operación.

Errores con `code`, `message` en español, `fieldErrors`, `requestId` y, cuando corresponda, `currentVersion`. Usar 401/403 para acceso, 409 para conflicto de stock/versión/idempotencia, 422 para regla de negocio y 503 para indisponibilidad transitoria. `202` significa solicitud recibida pendiente, nunca pedido confirmado. La semántica final se congela en semana 1.

Estados propuestos separados: solicitud `pending/accepted/rejected/cancelled/expired`; pedido `draft/confirmed/preparing/ready/fulfilled/cancelled`; pago `unpaid/partially_paid/paid/partially_refunded/refunded`. Son vocabulario candidato a reconciliar con ERD. Un retraso puede ser una condición derivada del ETA, no una transición que sustituya todo estado operativo.

Eventos incluyen `eventId`, `type`, `aggregateId`, `aggregateVersion`, `occurredAt`, `schemaVersion` y carga mínima. Autorizar cada suscripción; deduplicar, detectar versiones atrasadas y recargar snapshot REST al reconectar. No prometer entrega exactamente una vez. Push móvil avisa; la API conserva la verdad del estado.

### 6.2 Cambios necesarios en la web existente

El cliente actual `shared/lib/api-client.ts` sólo expone GET/POST y devuelve errores genéricos. Planificar cabeceras de idempotencia/versión, autenticación, timeouts, cancelación, respuestas sin cuerpo y errores estructurados. Los tipos genéricos de TypeScript no validan por sí solos el JSON recibido.

`shared/lib/realtime-client.ts` define una interfaz, pero no acredita un transporte implementado. Los providers de pedidos, mesas, pagos y administración mantienen estado de demostración. `admin-workspace/models.ts` usa etiquetas españolas y precios numéricos; requiere mapeo, no reutilización directa como entidad de servidor.

Pasos por flujo:

1. Congelar DTO, permisos y estados con el responsable de la pantalla.
2. Crear adaptador DTO → modelo de vista y sustituir fixtures detrás de una interfaz explícita.
3. Mantener modo demo claramente separado del modo API. Un error real nunca debe caer silenciosamente a datos simulados.
4. Integrar lectura y mutación juntas; verificar persistencia tras recarga y en segundo dispositivo.
5. Incorporar errores de conflicto, sesión vencida, servicio degradado y reconexión.
6. Retirar controles demo del flujo habilitado y actualizar progreso con evidencia.

Los tres canales conservan interfaces y permisos distintos, pero comparten datos del backend: una recepción Administrativa debe cambiar inventario Operativo y disponibilidad Cliente. La separación temporal de fixtures por canal no se convierte en tres bases de datos de negocio.

## 7. Organización real de seis personas y rotación

**Confirmado por el PM:** tres personas terminan frontend, dos trabajan backend y una app; una persona apoyará backend/app. Edgar sigue como PM y el Scrum Master rota. No se asignan nombres nuevos a esos puestos sin conocer el reparto vigente.

| Puesto temporal | Trabajo inicial         | Responsabilidad que conserva                                    |
| --------------- | ----------------------- | --------------------------------------------------------------- |
| F1              | Web Cliente             | Integrar contrato de solicitud/seguimiento y estados de error   |
| F2              | Web Operativo           | Bandeja de solicitudes, aceptación y cocina                     |
| F3              | Web Administrativo      | Catálogo/configuración/auditoría del corte                      |
| B1              | Backend principal       | Modelo, migraciones, pedidos/stock y reglas transaccionales     |
| B2              | Backend con apoyo a app | Identidad, permisos, contratos y cobro; apoyo móvil planificado |
| M1              | App Cliente principal   | Expo, navegación, API y validación Android/iPhone               |

PM y SM son funciones de estas seis personas, no plazas adicionales. Descontar coordinación de su capacidad. Que B2 y M1 colaboren no convierte el equipo en dos desarrolladores completos de backend y dos de app mientras tres siguen en frontend: serían siete plazas.

Ejemplo de reparto equivalente inicial, si B2 divide tiempo por mitades: **3 web + 1.5 backend + 1.5 app = 6**. Para llegar a **2 web + 2 backend + 2 app = 6**, una persona de frontend debe liberar realmente su tarea y cambiar de frente. El PM confirma ese traspaso; no se presupone desde el día 1.

Rotar al cerrar una tarea o al inicio de semana, no todos diariamente. Cada componente mantiene dueño técnico y revisor hasta su aceptación. Entregar antes de rotar: issue/PR, rama, contrato, migración pendiente, pruebas ejecutadas, límite conocido y siguiente acción. Rotar conocimiento mediante revisión en pareja evita seis implementaciones distintas de login o cliente API.

SM semanal: mantener tablero/bloqueos, coordinar revisión y dejar handoff. PM: conservar alcance/rúbrica y decidir recortes con el ingeniero. Ninguno concentra todas las aprobaciones técnicas; un compañero revisa cada PR y una persona del área valida la regla.

## 8. Calendario con 2–3 semanas finales protegidas

El PM fija **5–6 semanas totales**, reservando las **últimas 2–3** a seguridad y mejoras. Fecha académica exacta pendiente. Estas combinaciones son distintas y deben elegirse explícitamente:

| Total                | Construcción/integración funcional inicial | Seguridad, estabilización y entrega | Congelamiento de funciones nuevas                        |
| -------------------- | ------------------------------------------ | ----------------------------------- | -------------------------------------------------------- |
| 5 semanas, reserva 3 | Semanas 1–2                                | Semanas 3–5                         | Fin de semana 2                                          |
| 5 semanas, reserva 2 | Semanas 1–3                                | Semanas 4–5                         | Fin de semana 3                                          |
| 6 semanas, reserva 3 | Semanas 1–3                                | Semanas 4–6                         | Fin de semana 3                                          |
| 6 semanas, reserva 2 | Semanas 1–4                                | Semanas 5–6                         | Fin de semana 4; sólo usar si PM confirma este escenario |

**Base prudente:** preparar el núcleo al final de semana 2; semana 3 puede completar el corte sólo si el escenario elegido lo permite. Proteger las semanas finales: corregir fallos y reforzar controles sí; nuevas reservas, chat, proveedores o rediseño tecnológico no. La seguridad básica forma parte de cada historia desde el inicio; el bloque final es revisión y endurecimiento.

| Momento                             | Backend                                                          | App Cliente                                                 | Frontend / coordinación                                                                      |
| ----------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Días 1–2                            | Inventariar avance real; Spring/JDK/build; contrato y DB mínimos | Expo en Android/iPhone; ruta de distribución; cliente API   | Fijar P0/rúbrica y quién ocupa F1–M1; PM elige escenario                                     |
| Semana 1                            | Login/permisos, catálogo, migraciones y solicitud persistente    | Acceso, menú/detalle, carrito con contrato mock sustituible | Terminar vistas del corte y adaptar DTO; demo conjunta al cierre                             |
| Semana 2                            | Aceptación atómica, estados/KDS y auditoría; cobro si capacidad  | Solicitud/seguimiento real, sesión y estados de error       | Recorrido completo, prueba de último recurso y dos dispositivos; congelar en escenario corto |
| Semana 3, si es funcional           | Cerrar sólo lo ya comprometido y sus pruebas                     | Completar pantallas del corte y build reproducible          | No abrir P1; congelar alcance al cierre como máximo en base recomendada                      |
| Primera semana protegida            | Auditoría de acceso/validación, concurrencia y logs              | Sesión, reconexión, manipulación de IDs y limpieza de caché | Pruebas cruzadas, solucionar defectos; revisar secretos/configuración                        |
| Segunda semana protegida            | TLS/despliegue LAN, restauración, reinicios y carga acotada      | Dispositivos reales, firma/distribución y regresión         | Ensayo desde cero, evidencia y documentación                                                 |
| Tercera semana protegida, si existe | Correcciones y repetición de criterios fallidos                  | Regresión y entrega del build probado                       | Ensayo final y revisión con ingeniero, sin añadir funciones                                  |

### Capacidad y viabilidad

Las 12–15 h/persona/semana del borrador eran un supuesto, no información confirmada. Con ese supuesto y 30% de margen, el equipo tiene 50–63 h planificables semanales, **incluyendo frontend pendiente**, no sólo backend/app.

| Reparto                       | Capacidad por frente en 2 semanas         | En 3 semanas                              |
| ----------------------------- | ----------------------------------------- | ----------------------------------------- |
| 3 web + 1.5 backend + 1.5 app | Web 50–63 h; backend 25–32 h; app 25–32 h | Web 76–95 h; backend 38–47 h; app 38–47 h |
| 2 web + 2 backend + 2 app     | Cada frente 34–42 h                       | Cada frente 50–63 h                       |

El backlog anterior de 236–332 h y la revisión actual de 250–354 h, al separar el trabajo móvil, **no caben como trabajo nuevo en esta ventana** bajo esos supuestos; además no presupuestan terminar todo el frontend. Mantenerlo como estimación candidata, restar avance probado y reestimar con quienes implementarán. No consumir las semanas de seguridad para esconder esta diferencia.

Cálculo semanal: `capacidad del frente = suma(horas disponibles × fracción asignada) × 0.70`. Cada persona tiene fracciones que suman como máximo 1. Restar tareas ya aprobadas únicamente con evidencia; no descontar trabajo por el nombre de una rama o porque la UI ya tenga fixtures.

**Puerta de alcance al día 2:** inventariar código/contratos/pruebas existentes, estimar restante y compararlo por frente. Si no cabe, PM e ingeniero eligen recorte o más disponibilidad explícita. Preferir retirar funciones completas: cobro, reservas, chat, perfil ampliado y registro/recuperación pueden diferirse según rúbrica; no quitar autorización, integridad o idempotencia a funciones habilitadas.

Como alternativa académica aún menor puede entregarse catálogo + sesión + solicitud persistente + revisión del personal, **sin confirmación de venta** hasta implementar disponibilidad/reserva. Debe rotularse como gestión de solicitudes, no como restaurante operativo completo. Requiere aceptar ese recorte con el ingeniero; no sustituye silenciosamente P0.

## 9. React Native y Expo

La planificación ejecutable de pantallas, tareas, contratos y pruebas está en el [plan de la app Cliente](../mobile/CLIENT_APP_PLAN.md). Este apartado conserva la justificación técnica compartida.

### 9.1 Decisión recomendada

Usar React Native + Expo para la primera app Cliente. Expo no sustituye la API y no convierte automáticamente las pantallas HTML/CSS de Next.js en componentes nativos. Compartir contratos, validadores de entrada reutilizables, formatos y lógica pura; construir navegación, controles y almacenamiento específicos de móvil.

| Alternativa                                  | Encaje en WOK                                                                                            | Recomendación                                                                                               |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Web responsive actual; PWA opcional          | Acceso rápido en teléfonos y tablets; menor alcance adicional                                            | Mantener como primera superficie integrada; evaluar PWA como tarea propia                                   |
| React Native + Expo                          | App Android/iOS con ecosistema común y acceso nativo                                                     | Opción preferida propuesta para Cliente                                                                     |
| React Native con configuración nativa manual | Más configuración propia; útil ante restricciones nativas comprobadas                                    | Evitar para este plazo salvo experiencia previa y motivo concreto                                           |
| Flutter                                      | Alternativa multiplataforma con Dart y widgets propios; misma API REST, sin compartir módulos TypeScript | Considerar si al menos dos integrantes ya entregaron apps Flutter y resuelven Android/iOS en el experimento |

**Expo es una forma de desarrollar React Native, no un tercer motor competidor.** La comparación correcta es React Native con Expo, React Native sin framework y Flutter. La documentación de React Native recomienda un framework como Expo para proyectos nuevos. [Inicio oficial de React Native](https://reactnative.dev/docs/environment-setup).

Flutter también permite apps multiplataforma, pero incorpora Dart, widgets y herramientas distintas; el equipo puede compartir el contrato OpenAPI, no el código TypeScript de cliente. No resuelve automáticamente configuración/firma de iOS: su guía requiere Xcode para el entorno local. [Instalación de Flutter](https://docs.flutter.dev/install), [Flutter en iOS](https://docs.flutter.dev/platform-integration/ios/setup).

El PM confirmó que **no han tenido fallos de React Native**. Las dudas vienen de investigaciones del equipo; se registran como riesgos preventivos, no como incidencias. Si el experimento revela un problema, registrar error exacto, sistema/dispositivo, versiones, librería y paso que falla. Distinguir compilación Android, dependencias nativas, firma iOS, diferencias de UI y conexión API: Expo simplifica herramientas, pero no garantiza eliminar cada error de plataforma.

**Experimento de dos días, antes de decidir definitivamente:** arrancar app mínima con Expo, consumir `/health` y un listado, abrir en Android e iPhone, ejecutar navegación/teclado, cerrar/reabrir y probar acceso a la API desde red real. Desde un teléfono, `localhost` es el teléfono, no la computadora del backend. Probar HTTPS, hostname y credenciales. Luego generar la distribución exigida por el curso; registrar fallo y solución. La prueba debe respetar versiones compatibles del SDK y lockfile compartido.

Si hay una app Flutter ya avanzada, revisar lo reutilizable antes de abandonarla. Cambiar de framework sólo por un rumor de compatibilidad añade riesgo. Si ambos parten de cero y el equipo conoce React/TypeScript, la recomendación para este plazo sigue siendo **React Native + Expo**.

Usar development builds para el proyecto real; Expo Go sirve para exploración y tiene límites en bibliotecas nativas. [Guía oficial de development builds](https://docs.expo.dev/develop/development-builds/introduction/).

EAS Build puede generar binarios de Android/iOS en infraestructura alojada. Validar cuentas, firma y distribución con el responsable; no incluye automáticamente publicación ni aprobación de tiendas. Desde Linux se puede trabajar con compilación iOS remota; para depuración/simulador iOS local hace falta entorno Apple. Reservar un iPhone físico para pruebas. La distribución interna iOS ad hoc mediante EAS requiere cuenta Apple Developer de pago y registro de dispositivos; validar esto al inicio. Si el ingeniero acepta una demo con Expo Go, documentar que no equivale a entregar una app independiente. [Distribución interna Expo](https://docs.expo.dev/build/internal-distribution/). [EAS Build](https://docs.expo.dev/build/introduction/), [FAQ de Expo](https://docs.expo.dev/faq/).

### 9.2 Contrato móvil

- Misma API, permisos, estados e idempotencia que web; ninguna clave de servidor dentro de la app.
- Token de acceso de corta duración en memoria; refresh token revocable en almacenamiento seguro. Evaluar `expo-secure-store`, cuyo almacenamiento debe acompañarse de manejo de sesión perdida y reinstalación. [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/).
- Catálogo almacenado localmente puede mostrarse como desactualizado. Carrito es borrador; disponibilidad y precio se revalidan antes de enviar.
- Si se pierde respuesta de una operación, consultar su resultado/reintentar con la misma clave. No generar automáticamente una operación nueva.
- Al volver de segundo plano, recuperar snapshot actual. Las notificaciones no garantizan que el usuario vio el cambio ni que un pedido fue aceptado.
- Verificación/recuperación de cuenta requieren enlaces de apertura y vencimiento coordinados con backend.
- Push y proveedores móviles se incorporan con contratos y permisos aprobados. Para el piloto, seguimiento dentro de la app puede preceder a push.

Mantener Operativo/Administrativo en web responsive para esta entrega. Impresoras, KDS y caja local tienen requisitos de dispositivos y red que deben probarse antes de prometer una app nativa universal para todo el personal.

## 10. Seguridad y operación desde el inicio

Diseño propuesto: sesiones revocables y permisos comprobados en cada endpoint y suscripción. En web, preferir despliegue del mismo origen con cookies `HttpOnly`, `Secure`, política `SameSite` y protección CSRF para mutaciones. Si hay orígenes separados, configurar CORS y envío de credenciales explícitamente. Evitar tokens persistentes en almacenamiento web accesible a scripts.

Registro público ignora/rechaza roles privilegiados. Comprobar propiedad además del rol: un cliente no consulta pedidos, comprobantes o conversaciones de otro cambiando un UUID. Reset, eliminación y suspensión revocan sesiones según política; el core valida revocación, no sólo firma de token.

Separar credencial de migración y aplicación; secretos fuera del repo y de logs. Aplicar validación de entrada, límites de tamaño/tasa y redacción de datos sensibles. Para adjuntos: tipos permitidos comprobados por contenido, tamaño máximo, almacenamiento privado, acceso autorizado y eliminación de archivos rechazados/huérfanos.

Outbox y tareas tienen identificador, intentos, backoff, lease y cola de fallos revisable. Si una impresora no confirma recepción, registrar resultado incierto y ofrecer reimpresión marcada/auditada: no afirmar que una impresora genérica permite garantizar exactamente una copia física.

Medir latencia p95, errores, conflictos de stock, fallos de sesión, profundidad/antigüedad de cola, impresiones y discrepancias libro/saldo. Distinguir `/health/live` de `/health/ready`; caída de proveedor externo no debe hacer inutilizable el core local. Identificadores de correlación permiten seguir solicitud, transacción y trabajo sin guardar secretos.

Respaldos cifrados y restauración ensayada en entorno separado. Para demostración académica, respaldar antes del ensayo y demostrar restauración; no prometer recuperación de operación real. Como objetivo posterior de piloto de restaurante, evaluar RPO ≤ 15 min y RTO ≤ 2 h, sujetos a equipo y presupuesto; registrar objetivos realistas antes de operación. Documentar responsable, alertas, rotación y procedimiento de recuperación, no sólo existencia de backup.

## 11. Validación y definición de terminado

### 11.1 Escenarios de aceptación de sistema

Para entrega de 5–6 semanas son obligatorios los escenarios aplicables a P0: último recurso, reintentos/reinicio, cobro simple, permisos, suspensión de servicio, corte WAN y restauración. División de cuentas, producción y reservas sólo son exigibles si se habilita ese alcance; permanecen como criterios de evolución, no como capacidades prometidas del MVP.

| Escenario                                                  | Resultado observable                                                                   |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Dos pedidos usan el último ingrediente común               | Sólo la transacción ganadora confirma; el otro recibe conflicto sin stock negativo     |
| Doble clic/reintento de creación y cobro                   | Un pedido, un cobro y un conjunto de movimientos; misma respuesta para misma operación |
| Reinicio después de commit, antes de HTTP/evento           | Consulta/reintento recupera resultado; worker continúa sin repetir efectos             |
| Cambio de artículo ya comandado entre áreas                | Anulación origen + adición destino, revisión e historial; merma separada del cobro     |
| Cuenta dividida, pago mixto y propina rechazada            | Líneas/modificadores no duplicados; suma exacta, saldo correcto y propina opcional     |
| Dos reservas concurrentes / cliente llega con mesa ocupada | Sin asignación incompatible ni sobrecapacidad; intervención operativa explícita        |
| Compra parcial y producción con subreceta                  | Entrada sólo al recibir; sin doble consumo; receta y lotes históricos preservados      |
| Suspensión manual durante checkout                         | Confirmación revalida y rechaza aunque caché diga disponible                           |
| Internet cae y vuelve                                      | Operación LAN y login siguen; solicitudes remotas no se aceptan automáticamente        |
| Cliente cambia ID o canal de conversación                  | Acceso denegado, sin fuga de notas internas/adjuntos                                   |
| Cuenta eliminada/suspendida                                | Sesiones revocadas y nueva cuenta sin recuperar perfil anterior automáticamente        |
| Nueva instalación desde backup                             | Datos, saldos y pendientes recuperados; conciliación documentada                       |

Pruebas por nivel: unidades para reglas puras; integración con PostgreSQL real para locks, restricciones y rollback; contratos API para esquemas/errores/permisos; E2E para tres portales y app; simulación de fallos y carga para operación. No reemplazar pruebas PostgreSQL por SQLite o repositorios mock cuando se verifica concurrencia.

Objetivos iniciales para calibrar con hardware: 20 operadores concurrentes y 100 sesiones Cliente simuladas; ráfaga de 10 confirmaciones/s durante 60 s; lecturas p95 < 500 ms y mutaciones locales p95 < 1 s sin proveedores externos. Son objetivos de ensayo propuestos, no capacidad demostrada. Registrar dataset, máquina, tasa real, conflictos esperados y errores no esperados; ninguna sobreventa/cobro duplicado es aceptable.

### 11.2 Terminado por historia

Debe existir: HU/RN/RT y vista vinculadas, criterios demostrados, migración y rollback/recuperación documentados cuando aplique, contrato OpenAPI, validación de permisos y propiedad, pruebas relevantes, auditoría, estados UI de error/carga, ausencia de secretos y revisión por otra persona. Un endpoint probado manualmente sin persistencia/permisos no está terminado.

CI futura: backend Maven compila, verifica estilo y ejecuta pruebas unitarias/integración sobre PostgreSQL; web/app ejecutan sus checks TypeScript, lint y pruebas. Luego verificar OpenAPI, builds y E2E del corte. En esta rama no se verificaron comandos backend; revisar los del backend ya iniciado y completar los faltantes como parte de BE-01. Los scripts actuales de raíz apuntan principalmente a web, por lo que no validarán el backend automáticamente.

Piloto aprobado sólo cuando los flujos habilitados superan estos criterios, el restaurante valida operación y los pendientes quedan explícitos. IA, visión o pantallas fuera del corte deben aparecer deshabilitadas o como demostración claramente identificada.

## 12. Decisiones necesarias y riesgos

| ID   | Decisión                                                                                              | Responsable propuesto                  | Momento límite                                             |
| ---- | ----------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------- |
| D-01 | Monorepo, versiones Java/Spring, persistencia y PostgreSQL candidato                                  | Equipo + coordinación académica        | Días 1–2                                                   |
| D-02 | Fecha exacta dentro de 5–6 semanas, horas/fracciones reales, bloque final de 2–3 semanas y rúbrica/P0 | PM + seis integrantes + ingeniero      | Días 1–2                                                   |
| D-03 | Acceso al ERD/DDL externo, procedencia, versión y política de adopción                                | Responsables de datos + técnico        | Semana 1                                                   |
| D-04 | Equipo LAN, dominio/TLS, relay, energía y responsable de soporte                                      | Restaurante + coordinación             | Días 1–2                                                   |
| D-05 | Moneda/impuestos comerciales, horarios, reserva tardía, recepción/merma y políticas de pago           | Restaurante                            | Antes de implementar cada regla; principales en semana 1   |
| D-06 | Acceso invitado online, política de verificación, retención y restricciones                           | Restaurante + responsable de identidad | Semana 1                                                   |
| D-07 | Parámetros de capacidad/ETA, empaques y override positivo                                             | Cocina + inventario                    | Semana 2 para lo incluido; resto posterior                 |
| D-08 | Pasarela, correo, WhatsApp/Instagram, impresión y almacenamiento de archivos                          | PM + responsables de integración       | Antes de contratar/conectar cada proveedor                 |
| D-09 | Android/iOS objetivo, dispositivos, cuentas de firma y distribución                                   | PM + responsable móvil                 | Días 1–2                                                   |
| D-10 | Criterios de carga, respaldo, retención, RPO/RTO y entrega                                            | Restaurante + técnico                  | Inicio del bloque final; objetivos productivos posteriores |

| Riesgo                                    | Mitigación / señal de revisión                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| Alcance de 21 épicas superior a capacidad | Priorizar cortes; estimar de nuevo tras semana 1 y no llamar producto completo al piloto   |
| DDL extenso no probado                    | Validar en DB desechable, introducir por dependencias y cubrir R01–R13                     |
| Dependencia de una persona                | Revisor secundario, sesiones de transferencia y runbooks                                   |
| Doble fuente de verdad LAN/nube           | Un core escritor; relay sólo recepción pendiente y proyecciones identificadas              |
| Contratos cambiantes entre canales        | OpenAPI versionado, adaptadores y revisión de compatibilidad                               |
| Infraestructura local insuficiente        | Experimento temprano, hardware y ensayo de apagado/restauración                            |
| Entrega móvil consume backend             | App mínima desde semana 1 con un responsable y apoyo; separar hito si capacidad no alcanza |
| Datos/archivos externos inaccesibles      | Inventario de fuentes y recuperación de acceso antes de congelar migraciones               |

## 13. Flujo Git y siguiente paso

Aplicar las reglas existentes: tareas en ramas pequeñas desde `development`, PR hacia `development`, revisión y publicación autorizadas. Ramas orientativas `feature/backend-order-confirmation`, `feature/backend-inventory-reservations`, `docs/backend-plan`; no desarrollar seis personas sobre una sola rama compartida. Coordinar numeración de migraciones y probarlas sobre el conjunto integrado antes del merge.

Este plan se preparó como archivos nuevos sin cambiar la rama activa ni tocar cambios previos. Para publicarlo, una persona responsable debe trasladar únicamente estos documentos a una rama documental nacida de `development` actualizado, revisarlos y abrir el PR. No mezclar el trabajo frontend pendiente ni hacer stash/reset sobre él para publicar el plan.

Siguiente reunión: revisar D-01 a D-05, confirmar seis responsables y horas, aprobar el corte P0 de 5–6 semanas y refinar [BE-01 a BE-05](BACKLOG.md). Cada paquete debe descomponerse en issues de aproximadamente 1–3 jornadas disponibles, con criterios observables. No iniciar todas las épicas al mismo tiempo.

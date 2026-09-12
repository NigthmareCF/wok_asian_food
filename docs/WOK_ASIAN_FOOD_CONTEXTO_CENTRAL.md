# WOK ASIAN FOOD — Contexto central del proyecto

Este documento es una fuente de contexto obligatoria para colaboradores humanos y agentes IA antes de realizar modificaciones importantes en el proyecto.

| Metadata | Valor |
| --- | --- |
| context_version | 1 |
| last_updated_at | 2026-09-09 |
| updated_by | Codex; colaborador pendiente de identificación |
| branch | development, observada localmente durante la consulta |
| last_sync_commit | null: no se ha realizado sincronización Repo/Vault |
| inspected_commit | de63ba4 |
| status | Documento consolidado; pendiente de incorporación autorizada |

Este archivo reúne el contexto funcional y las reglas de continuidad aportados por el equipo. Es documentación de referencia, no un prompt ni una afirmación de que el sistema descrito esté implementado. Su creación fuera del repositorio no instala herramientas, activa hooks ni configura un Vault.

## 1. Propósito y lectura inicial

WOK debe poder entenderse sin depender de una persona ni de conversaciones anteriores. Esta documentación permite incorporar colaboradores, distribuir tareas, transferir semanalmente la responsabilidad de Scrum Master, conservar decisiones y continuar trabajo entre sesiones y branches.

Para incorporarse: leer la descripción, el estado observado, el alcance, la arquitectura, el catálogo de módulos y el flujo de trabajo. Antes de una tarea concreta, consultar además el contexto de la branch y la documentación del módulo cuando existan. El Scrum Master de cada sprint asigna responsables; este documento no asigna personas.

La documentación se escribe en español; nombres técnicos, código y branches, en inglés. Los comentarios de código y los mensajes de commit se escriben en español. Los commits siguen Conventional Commits.

## 2. Evidencia y estado actual

### 2.1 Estado comprobado en el repositorio local

Consulta realizada el 2026-09-09 en la branch `development`, con HEAD `de63ba4` (`chore: configura estrategia inicial de branches`). El working tree estaba limpio.

Los archivos versionados observados son `README.md`, `CONTRIBUTING.md`, `.gitignore`, `docs/git/BRANCHING.md`, `docs/git/BRANCH_CATALOG.md` y plantillas de issues y pull requests en `.github/`.

La base inspeccionada contiene preparación y documentación Git. No contiene implementación funcional, ERD versionado, pruebas ejecutables, frameworks configurados, scripts de contexto ni documentación de módulos. Esto describe únicamente la copia consultada; no permite concluir qué trabajo existe fuera de ella.

La documentación Git registra `production` como línea estable y `development` como integración. El catálogo inicial reserva branches por área, pero sus nombres no prueban implementación ni trabajo activo. Las referencias a publicación pendiente son históricas: no se verificó el remoto mediante fetch y no se afirma su estado actual.

### 2.2 Prioridad declarada por el equipo

La prioridad de implementación es frontend. El ERD se diseña en paralelo según el contexto proporcionado; su avance no se verificó en esta copia. Backend e integración de persistencia llegarán posteriormente.

La situación observable corresponde a Foundation documental, con Frontend Foundation como siguiente prioridad. No debe declararse una fase terminada por la sola existencia de una branch.

| Campo de seguimiento | Estado inicial |
| --- | --- |
| Current Phase | Foundation documental; prioridad siguiente: Frontend Foundation |
| Last Updated | 2026-09-09 |
| Current Sprint | Pendiente de informar |
| Current Scrum Master | Pendiente de informar; responsabilidad rotativa |
| Stable Branch | production, según estrategia documentada |
| Integration Branch | development, según estrategia documentada |
| Active Areas | Contexto y preparación; frontend prioritario y ERD paralelo declarados |
| Blocked Areas | No informadas; no equivale a ausencia de bloqueos |
| Latest Relevant Decisions | Monorepo y flujo Git documentados; consolidación de contexto solicitada |
| Next Milestone | Validar contexto y preparar la base frontend con decisiones pendientes explícitas |

Este seguimiento debe trasladarse a `CURRENT_STATE.md` al distribuir la documentación. El contexto estable del producto no necesita reescribirse ante cada avance semanal.

## 3. Producto y principio operativo

WOK ASIAN FOOD es un sistema integral de gestión para un restaurante asiático/sushi, basado en necesidades de un restaurante real y utilizado también como proyecto académico.

Su alcance contempla clientes, usuarios, empleados, roles, permisos, mesas, reservaciones, pedidos, comandas, cocina, menú, recetas, inventario, producción, compras, proveedores, delivery, mensajería, cuentas, pagos, caja, reportes, estado operativo, configuración, IA, visión computacional y auditoría.

> El sistema informa, recomienda y anticipa. El personal autorizado decide.

Las operaciones sensibles necesitan control humano y permisos adecuados. Esto incluye producción, cierres, suspensión de servicios, disponibilidad manual, descuentos, promociones y decisiones sugeridas por IA. Las sugerencias no constituyen autorización para ejecutar operaciones.

## 4. Alcance y límites

### 4.1 Dentro del alcance del producto

Los 27 módulos del catálogo, las plataformas previstas y las reglas funcionales de este documento forman el alcance conceptual. Su inclusión no implica entrega simultánea ni implementación completa en la fase frontend.

La fase frontend aborda navegación, vistas, estados, validación de interacción y flujos con mocks/fixtures cuando corresponda. La autenticación, autorización y persistencia simuladas no sustituyen garantías de servidor.

### 4.2 Desarrollo posterior

Backend/API, persistencia real, integración de base de datos, comunicación realtime, integraciones externas, capacidades de IA y visión, revisión específica de seguridad y estabilización pertenecen a etapas posteriores. Mobile y Desktop son plataformas previstas; su calendario y tecnología no están confirmados.

### 4.3 Fuera de alcance o no confirmado

No están confirmados frameworks, motor de base de datos, proveedores de hosting, SDKs, transporte realtime concreto, plataforma de IA, modelos de visión, pasarelas de pago ni cronograma de entrega. No se presupone integración fiscal, contabilidad completa, operación multisucursal o funcionamiento offline.

No se permite acceso directo a la DB desde frontend o IA; registro público de roles operativos; ejecución ciega de decisiones sensibles; eliminación sin trazabilidad de items enviados; repositorios separados por plataforma; ni decisiones de dominio basadas únicamente en visión computacional.

La incorporación de nuevas funciones requiere registrar necesidad, impacto, dependencias y decisión. El catálogo no autoriza ampliar silenciosamente el alcance de una tarea.

## 5. Arquitectura conceptual

```text
WOK SYSTEM                         Un único repositorio
├── Web          ─┐
├── Mobile       ─┼── Backend/API ── Database
├── Desktop      ─┘
├── Backend          Servicios, permisos e integraciones
├── Database         Persistencia central
└── Security         Responsabilidad transversal y fase específica
```

Web, Mobile y Desktop consumen un backend central futuro. El frontend nunca accede directamente a la DB. Security representa una responsabilidad transversal, no necesariamente un servicio o directorio independiente.

La separación del monorepo ocurre mediante directorios, módulos y packages cuando se definan; las branches organizan trabajo temporal, no son límites de ejecución. No se usan submodules ni repositorios Git anidados.

La arquitectura debe separar UI, domain, transport, validation y configuration para facilitar evolución sin rehacer el sistema. No se fija una estructura física o framework por describir estas responsabilidades.

### 5.1 Capas frontend

| Capa | Responsabilidad |
| --- | --- |
| GLOBAL | Infraestructura común del cliente y configuración transversal |
| AUTH | Flujos de autenticación, sesión e integración del acceso |
| PUBLIC | Rutas disponibles sin sesión |
| PRIVATE | Rutas que requieren sesión y permisos correspondientes |
| MODULAR | Dominios funcionales organizados por responsabilidad |
| SHARED | Código y componentes reutilizables sin acoplamiento innecesario |
| DATA | Mocks y fixtures durante la fase frontend; no conexión directa a DB |

El equipo atribuye esta organización conceptual a clase. No existe evidencia de clase adjunta en la copia inspeccionada; no se atribuyen tecnologías concretas al profesor.

### 5.2 Contextos de interfaz y canales

`CLIENT`, `OPERATIONAL` y `ADMIN` son contextos de navegación/interfaz: describen para quién y cómo se presenta el sistema. No son roles ni módulos.

`PUBLIC` y `PRIVATE` describen condiciones de acceso. `CLIENT` puede contener vistas públicas, como menú y ubicación, y vistas autenticadas, como perfil o historial. Las vistas operativas y administrativas requieren sesión y permisos. Una sesión por sí sola no concede acceso a todas sus funciones.

| Contexto | Funciones previstas |
| --- | --- |
| CLIENT | home, menu, dish detail, cart, checkout, reservations, order tracking, location, messages, profile/history |
| OPERATIONAL | dashboard operativo, tables/table detail, orders/modification, kitchen/KDS, reservations, messages, online requests, delivery, bills/accounts, prebill, payments, cash, inventory, production, availability, operational status |
| ADMIN | dashboard administrativo, users, roles/permissions, staff schedules, menu management, recipes, suppliers, purchases, production planning, reports, cash history, clients/incidents, settings, AI/messaging, computer vision, audit/logs |

Se reservan términos separados para contextos de interfaz, canales de pedido y canales de mensajería. Web/WhatsApp/Instagram son ejemplos de canales de mensajería; no roles. Un módulo como `orders` puede aparecer en los tres contextos con capacidades distintas.

## 6. Catálogo funcional

Las dependencias siguientes son relaciones conceptuales que deberán validarse al definir contratos; no indican dependencias técnicas ya implementadas. C = CLIENT, O = OPERATIONAL, A = ADMIN. El acceso efectivo siempre depende de permisos.

| Name | Responsibility | Contexts | Dependencies conceptuales |
| --- | --- | --- | --- |
| auth | Identidad, autenticación y sesiones | C/O/A | users, roles, settings, audit |
| users | Cuentas y administración de usuarios | A; perfil propio C/O | auth, roles, audit |
| roles | Roles múltiples y permisos granulares | A; aplicación transversal | users, audit |
| clients | Datos, historial e incidencias de clientes | C/O/A | users, orders, reservations |
| staff | Empleados y horarios de trabajo | O/A | users, roles |
| tables | Mesas, capacidad y estado | O/A | reservations, orders, billing |
| reservations | Reservas y gestión de asistencia | C/O/A | tables, clients, settings |
| menu | Oferta, categorías, platillos y modificadores | C/O/A | recipes, availability |
| recipes | Composición y versiones de recetas | O/A | inventory, production |
| inventory | Existencias, lotes y movimientos | O/A | purchases, production, recipes |
| suppliers | Proveedores | A | purchases |
| purchases | Compras y recepción efectiva | O/A | suppliers, inventory |
| production | Producción y sugerencias sujetas a decisión | O/A | recipes, inventory, availability |
| availability | Disponibilidad calculada y manual | C consulta; O/A gestión | inventory, recipes, production, operations |
| orders | Pedidos, items, cambios y anulaciones | C/O/A | menu, clients, tables, kitchen, billing |
| kitchen | Comandas por área y preparación | O/A | orders, production |
| delivery | Entregas internas y externas | C seguimiento; O/A gestión | orders, clients, operations |
| messaging | Conversaciones, agentes y derivación | C/O/A | clients, ai, auth |
| billing | Cuentas, división y precuenta | O/A; C según flujo aprobado | orders, payments |
| payments | Registro de pagos y pagos parciales | C/O/A según flujo | billing, cash, audit |
| cash | Apertura, movimientos y cierre de caja | O/A | payments, audit |
| operations | Estado operativo y servicios habilitados | C consulta; O/A gestión | settings, audit |
| reports | Reportes administrativos y operativos | O/A | Dominios autorizados y audit |
| settings | Reglas y parámetros configurables | A; aplicación transversal | roles, audit |
| ai | Asistencia mediante tools/API autorizadas | C/O/A según caso aprobado | messaging, API, roles, audit |
| vision | Señales visuales con validación humana | O/A | operations, audit; integración pendiente |
| audit | Registro de operaciones sensibles | A y personal autorizado | Todos los dominios sensibles |

### 6.1 Contrato de documentación por módulo

Cada ficha de módulo debe contener `Name`, `Responsibility`, `Contexts`, `Dependencies`, `Frontend`, `Backend`, `Database`, `Permissions`, `Realtime`, `Testing`, `Status` y `Notes`.

Estado inicial común: no hay implementación comprobada en la copia consultada. Frontend es la prioridad; Backend y Database son posteriores, con diseño de ERD paralelo declarado. Los permisos concretos, contratos, tablas y estados de entrega requieren especificación por módulo. No deben rellenarse como terminados ni deducirse de nombres de branches.

## 7. Reglas funcionales detalladas

### 7.1 Auth, users y roles

Auth contempla register, login, email verification, PIN verification, forgot password, reset password, change password, login lockout, sessions, multiple devices y session revocation. El propósito y vigencia del PIN quedan pendientes de definición.

El registro público crea exclusivamente un perfil `CLIENT`. No existe selector público de roles operativos. Administración asigna esos roles mediante permisos adecuados.

Un usuario puede tener múltiples roles, por ejemplo Mesero + Cajero + Mensajería. No se presupone que “Empleado” tenga acceso total. Los permisos son granulares; `order.*`, `payment.*`, `cash.*`, `service.*`, `menu.*`, `inventory.*`, `purchase.*` y `user.*` son familias ilustrativas, no concesiones globales automáticas.

Login lockout debe registrar intentos fallidos, límite, bloqueo temporal, desbloqueo y trazabilidad. La política exacta será configurable. Los guards de interfaz mejoran navegación; el backend deberá aplicar autorización efectiva.

### 7.2 Tables y reservations

Se administran mesas, capacidad y estado. Las reservas contemplan party size, fecha/hora, tolerancia, preorden, cancelaciones y no-show. El cliente no necesita seleccionar una mesa física; la asignación puede corresponder a operación según política aprobada.

### 7.3 Menu y recipes

Menu administra categorías, platillos, fotos, precio, descripción, preparation area, visibility, availability, modifier groups, modifiers y extras.

Recipes utiliza BOM recursiva y versiones. Un item puede representar raw material, purchased product, preparation, semiprocessed, finished product, packaging, consumable o cleaning. Esta clasificación no significa que todo item sea un platillo vendible. Las reglas de unidades, rendimientos y validación de composición requieren especificación al desarrollar el módulo.

### 7.4 Inventory y purchases

Inventory contempla locations, lots, expiry, balances, movements y thresholds. Tipos de movimiento previstos: `PURCHASE`, `PRODUCTION`, `CONSUMPTION`, `SALE`, `WASTE`, `ADJUSTMENT`, `RETURN`, `TRANSFER` e `INTERNAL_USE`.

**PURCHASED != RECEIVED.** Registrar o aprobar una compra no aumenta inventario. El ingreso depende de una recepción real, con trazabilidad. Los eventos exactos de consumo y venta deberán definirse para evitar descuentos duplicados.

### 7.5 Production y availability

El sistema puede sugerir producción; el personal autorizado puede `Accept`, `Modify` o `Reject`. Una sugerencia no ejecuta automáticamente producción.

Availability puede derivarse de inventory, recipe, production y operational capacity. El manual override requiere reason, user, timestamp y expiry/revocation. Debe distinguirse visibilidad de un platillo de su disponibilidad operativa.

### 7.6 Orders y kitchen

Orders contempla customer, table, channel, type, items, modifiers, notes, ETA, states, changes y cancellations. Los items ya enviados no se borran sin trazabilidad: sus modificaciones y anulaciones deben conservar historia.

Un order puede generar múltiples kitchen tickets por preparation area, por ejemplo Sushi, Cocina y Barra. Pedido y comanda no son necesariamente la misma entidad ni comparten obligatoriamente un único estado.

### 7.7 Delivery y messaging

Delivery soporta modalidad internal y external, address, status, partner y tracking. Los proveedores concretos y contratos de integración están pendientes.

Messaging contempla Web, WhatsApp, Instagram y Other; human agent, AI, handoff, templates e history. Contemplar un canal no significa que exista una integración activa con su proveedor.

### 7.8 Billing, payments y cash

Una mesa puede tener varias bills; una bill puede recibir múltiples payments. Se contemplan cuentas dividibles y pagos parciales. Los mecanismos precisos de división, reasignación y conciliación deberán especificarse antes de implementarlos.

Cash contempla opening, sales, income, expenses, withdrawals, closing, expected cash, counted cash y difference. Las diferencias y operaciones sensibles necesitan permisos y auditoría.

### 7.9 Operations y settings

El restaurante no se representa únicamente como OPEN/CLOSED. Se contemplan estados independientes: `restaurant_open`, `dine_in_enabled`, `pickup_enabled`, `delivery_enabled`, `online_orders_enabled`, `high_demand` y `production_in_progress`. Las combinaciones válidas se definirán con reglas explícitas.

Settings evita hardcodear reglas modificables: horarios, propina, delivery, tolerancia, servicios activos, thresholds y reservation policy. Los cambios sensibles deben restringirse por permisos y quedar registrados.

### 7.10 AI, vision y audit

La IA consulta información autorizada mediante tools/API limitadas, nunca accede directamente a DB y no crea automáticamente promociones, descuentos ni combos. Los permisos y validaciones se aplican fuera del modelo.

Computer vision es una señal complementaria, no una fuente absoluta de verdad. Sus resultados requieren confidence y capacidad de human confirm/reject.

Audit debe permitir identificar Who, What, When, Entity, Before, After, Reason y Result en operaciones sensibles. La auditoría no debe exponer secretos; retención y tratamiento de datos quedan pendientes de definición.

## 8. Calidad, interacción y evolución

La UI debe funcionar con mouse, trackpad, touch y keyboard. No puede depender exclusivamente de hover o gestures; toda acción importante mediante gesto necesita una alternativa visible. La web será responsive y Desktop debe contemplar pantallas táctiles.

La trazabilidad futura debe permitir seguir `user action → frontend → API → service → database/event`, utilizando conceptos como `request_id`, `correlation_id` y `client_action_id`. Su formato y propagación se definirán con los contratos.

Son candidatos a realtime: orders, kitchen, availability, inventory, production, delivery, messages y operational status. La arquitectura debe permitir incorporar WebSocket/SSE; todavía no se selecciona uno ni se promete entrega realtime en la fase actual.

Las pruebas previstas incluyen unit, integration, E2E, responsive, accessibility, touch, cross-module, realtime, regression, API, database y security. Cada tarea debe ejecutar las pertinentes y registrar resultados o motivo de no aplicación.

La fase específica de Security concentra revisión y endurecimiento. Desde Foundation deben respetarse secretos, límites de confianza, permisos previstos y separación frontend/API/DB.

## 9. Plan de trabajo por fases

Las fases expresan dependencias y objetivos, no fechas ni asignaciones. El ERD se diseña desde el inicio; su integración real llega posteriormente. Una fase puede producir correcciones a trabajo previo sin perder su historial.

| Fase | Objective | Inputs | Deliverables | Dependencies | Tests | Definition of Done | Suggested branch types |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 Foundation | Establecer contexto y acuerdos | Necesidades reales, requisitos, repo | Alcance, decisiones, plan, catálogo y base documental | Validación del equipo | Coherencia, enlaces y trazabilidad | Contexto comprensible y pendientes visibles | docs/*, chore/* |
| 1 Frontend Foundation | Preparar estructura del cliente | Contexto, capas y decisiones técnicas aprobadas | Base frontend, navegación y convenciones | Fase 0; selección técnica confirmada | Arranque, navegación y verificaciones disponibles | Base reproducible y documentada | feature/frontend-*, test/frontend-*, docs/frontend |
| 2 Functional Frontend | Desarrollar flujos por módulo | Base frontend, reglas, mocks | Vistas, estados y flujos funcionales simulados | Fase 1 y dependencias del módulo | Unit, interacción, responsive, accessibility, touch | Criterios de cada flujo cumplidos y simulaciones identificadas | feature/frontend-*, test/frontend-* |
| 3 Frontend Integration / Testing | Integrar experiencia entre módulos | Flujos implementados | Navegación integrada y correcciones | Fase 2 | Integration, E2E, cross-module, regression | Flujos prioritarios integrados y resultados registrados | test/*, fix/* |
| 4 Backend | Implementar API y reglas de servidor | Contratos aprobados, reglas y ERD | Servicios, autenticación, autorización y API | Contexto y contratos validados | Unit, API, integration y controles de acceso | Contratos y reglas verificables; persistencia real según fase 5 | feature/backend-*, test/api, docs/api |
| 5 Database Integration | Conectar persistencia real | ERD validado y backend | Esquema, migraciones e integración | Fase 4 y diseño de datos | Database, integration y consistencia | Flujos persisten correctamente y migraciones están verificadas | feature/database-*, test/database |
| 6 Integral Testing | Validar sistema completo | Clientes, API y DB integrados | Evidencia de flujos completos y correcciones | Fases 3–5 | E2E, cross-module, regression y realtime si existe | Criterios integrales cumplidos y bloqueos registrados | test/*, fix/* |
| 7 Security | Revisar y endurecer | Sistema integrado y controles previos | Hallazgos, correcciones y validación | Fase 6; seguridad básica desde fase 0 | Security, sesiones, permisos, API y DB | Hallazgos evaluados y bloqueos de entrega resueltos | security/*, test/* |
| 8 Stabilization / Production | Preparar entrega estable | Validación integral y de seguridad | Documentación operativa y entrega validada | Fases 6–7 | Regression, smoke y comprobaciones de entrega | Entrega aprobada y pendientes visibles | fix/*, docs/*, chore/* |

## 10. Decisiones técnicas

Estados permitidos: `CONFIRMED_CLASS`, `TEAM_DECISION`, `PROPOSAL`, `PENDING_CONFIRMATION` y `REJECTED`. Una afirmación del equipo sobre clase se distingue de evidencia de clase. No se inventan frameworks ni se atribuyen al profesor sin respaldo.

| Decision | Status | Origin | Description | Reason | Notes |
| --- | --- | --- | --- | --- | --- |
| Monorepo | TEAM_DECISION | README y contexto aportado | Un repositorio sin Git anidado ni submodules | Contexto e integración comunes | Ya documentado en repo |
| Flujo production/development | TEAM_DECISION | docs/git/BRANCHING.md | Trabajo por PR e integración | Mantener línea estable | Estado remoto no verificado |
| Capas frontend | TEAM_DECISION | Requisitos del equipo | GLOBAL/AUTH/PUBLIC/PRIVATE/MODULAR/SHARED/DATA | Organizar responsabilidades | Atribución a clase pendiente de evidencia |
| Plataformas Web/Mobile/Desktop | TEAM_DECISION | Ambos requisitos | Clientes de una API central futura | Alcance multiplataforma | Tecnologías y calendario pendientes |
| Control humano de decisiones sensibles | TEAM_DECISION | Ambos requisitos | Sugerir sin ejecutar ciegamente | Control operativo | Transversal |
| Contextos distintos de roles y módulos | TEAM_DECISION | Consolidación aceptada | Separar interfaz, acceso y dominio | Evitar permisos implícitos | CLIENT admite vistas públicas y privadas |
| Frameworks, DB y proveedores | PENDING_CONFIRMATION | Sin evidencia técnica en repo | Selección posterior | Evitar decisiones inventadas | Requiere acuerdo registrado |
| WebSocket/SSE | PROPOSAL | Alcance futuro | Permitir realtime | Actualización operativa | Transporte sin seleccionar |
| Vault externo y sincronización sin última escritura gana | TEAM_DECISION | Requisitos de continuidad | Espejo local de documentación compartible | Preservar contexto | Pendiente de implementación y configuración |
| Base común y hashes para sync | PROPOSAL | Corrección técnica de la consolidación | Detectar cambios reales de ambos lados | Las versiones por sí solas no bastan | Algoritmo descrito abajo |
| Push de agente con informe y aprobación | TEAM_DECISION | Requisito actualizado | Aprobación explícita para el push propuesto | Revisión del envío | Una branch docs/* no elimina el requisito |
| Acceso directo a DB desde frontend o IA | REJECTED | Ambos requisitos | Acceso mediante API autorizada | Separación de responsabilidades | No implementar |

## 11. Organización documental objetivo

Esta es la estructura prevista para una incorporación posterior. Los nombres siguientes no implican que esos archivos se hayan creado con esta entrega.

| Archivo | Responsabilidad |
| --- | --- |
| README.md | Entrada general breve, válida para cualquier branch |
| AGENTS.md | Reglas operativas para agentes |
| CONTRIBUTING.md | Flujo de contribución y revisión |
| docs/project/PROJECT_CONTEXT.md | Contexto estable, producto y principios |
| docs/project/PROJECT_SCOPE.md | Dentro de alcance, futuro y no confirmado |
| docs/project/CURRENT_STATE.md | Fase, sprint, estado y siguiente hito |
| docs/project/WORK_PLAN.md | Fases, dependencias y criterios de finalización |
| docs/project/TECH_DECISIONS.md | Decisiones, estado y evidencia |
| docs/project/MODULE_CATALOG.md | Fichas de los 27 módulos |
| docs/project/CHANGELOG_INTERNAL.md | Cambios relevantes para continuidad |
| docs/project/SPRINT_HANDOFF.md | Transferencia de sprint y Scrum Master |
| docs/project/ARCHITECTURE_OVERVIEW.md | Relaciones conceptuales y límites |
| BRANCH_CONTEXT.md | Propósito y estado de la branch activa |

El README resume producto, alcance, estado global, fase, arquitectura, plataformas, contextos, módulos, convenciones y flujo. Enlaza todos los documentos anteriores y las instrucciones iniciales para humanos y agentes. El quick start se incorpora cuando exista un procedimiento reproducible; no se inventan comandos de arranque.

El detalle temporal pertenece a CURRENT_STATE, SPRINT_HANDOFF y BRANCH_CONTEXT. Las decisiones pertenecen a TECH_DECISIONS. La documentación por módulo complementa MODULE_CATALOG, evitando duplicar estados contradictorios.

## 12. Contexto de branch e historial

BRANCH_CONTEXT describe exclusivamente la branch activa. Metadata mínima:

```yaml
context_version: 1
branch: feature/frontend-auth
base_branch: development
collaborator: null
agent: Codex
last_updated_at: null
last_sync_commit: null
status: PENDING_CONFIGURATION
```

El ejemplo no describe la branch observada. Secciones obligatorias: Propósito, Alcance permitido, Fuera de alcance, Estado actual, Dependencias, Tareas pendientes, Tareas completadas, Archivos principales, Decisiones tomadas, Decisiones pendientes, Riesgos, Tests necesarios, Último remoto verificado, Último commit conocido e Historial interno.

| Patrón ilustrativo | Alcance orientativo |
| --- | --- |
| feature/frontend-auth | Autenticación frontend; no autoriza cambios libres de backend o DB |
| feature/database-auth | Modelo/persistencia de autenticación |
| feature/backend-auth | Servicios y API de autenticación |
| test/frontend-auth | Pruebas frontend de Auth |
| docs/frontend | Documentación frontend |

El nombre permite sugerir una plantilla; el alcance real se valida contra tarea y decisiones. Una discrepancia entre branch actual y metadata se reporta antes de continuar con operaciones dependientes. No se inventa automáticamente el colaborador, base o autorización.

Al integrar una branch, se conserva la historia válida y se adapta el estado a la branch de destino. El archivo activo no debe seguir describiendo una feature ya integrada. Las decisiones relevantes permanecen en TECH_DECISIONS y el resumen de integración en CHANGELOG_INTERNAL; Git conserva el historial detallado. No se borra información anterior solamente porque hubo merge.

El changelog utiliza Version, Fecha, Branch, Colaborador, Agente, Tipo, Resumen e Impacto. Registra cambios relevantes de alcance, contratos, decisiones, bloqueos resueltos o entregas; no copia cada entrada de git log.

## 13. Vault local y configuración

Cada colaborador debe disponer de un Vault local de Obsidian fuera del repositorio Git, en una ruta configurable. Puede trabajar con Markdown sin que este documento implique instalar Obsidian o plugins.

La configuración compartible prevista es `.wok-context.example.json`:

```json
{
  "collaborator": "",
  "vaultPath": "",
  "agent": ""
}
```

La configuración real `.wok-context.local.json` debe estar ignorada por Git. Si no existe al iniciar el flujo de trabajo del proyecto, el agente solicita: “¿Cuál es tu nombre como colaborador dentro del proyecto?”. También obtiene la ruta del Vault y completa los datos faltantes; no deduce identidad de Git ni guarda una ruta inventada.

Nunca se modifica globalmente `git user.name` o `git user.email` sin autorización explícita. Los informes identifican Colaborador y Agente; si un dato se desconoce, se marca pendiente.

```text
WOK-ASIAN-FOOD-Vault/
├── 00-Project/
├── 01-Branch/
├── 02-Sprints/
├── 03-Decisions/
├── 04-Changes/
├── 05-Agent-Reports/
└── 06-Local-Notes/
```

El Vault, `.workspace`, `.obsidian/workspace*`, cache, plugins privados, notas personales y secretos no se versionan en el repositorio del proyecto. La sincronización se limita a documentos compartibles definidos en un manifiesto. `06-Local-Notes` queda excluido, y los informes se revisan antes de compartir datos personales o rutas locales.

## 14. Protocolo de sincronización Repo/Vault

La fuente de verdad compartida es el contexto sincronizado. No existe una regla silenciosa de “última escritura gana”. Cuando difieren, hay una divergencia que debe clasificarse antes de copiar.

Cada informe sincronizable incluye `context_version`, `last_updated_at`, `last_sync_commit`, `updated_by` y `branch`. Una modificación relevante incrementa su versión; una lectura o sincronización sin cambios no lo hace. La copia al espejo conserva la misma versión. Las fechas no deciden qué contenido gana.

### 14.1 Base de comparación

La implementación propuesta mantiene un manifiesto local, fuera del versionado compartido, con la base común por documento y por branch: identificador estable, rutas, contenido o snapshot base, hashes y commit del repositorio al sincronizar. Un commit por sí solo no representa cambios locales sin commit; por eso se compara también contenido.

`last_sync_commit` referencia un commit conocido durante la sincronización, no el hash del futuro commit que contenga el propio documento. No se altera metadata en cada comprobación, evitando modificaciones perpetuas.

### 14.2 Resolución por caso

| Situación frente a la base común | Acción |
| --- | --- |
| Ningún lado cambió | No escribir ni incrementar versiones |
| Solo cambió Repo | Sincronizar Repo → Vault si no hay cambio significativo pendiente de revisión |
| Solo cambió Vault | Proponer el diff Vault → Repo; aplicar tras aceptación de la propuesta |
| Ambos cambiaron y el contenido final coincide | Registrar convergencia y actualizar la base, sin duplicar cambios |
| Ambos cambiaron y el contenido difiere | Generar conflicto; conservar ambos; solicitar revisión manual |
| No existe base y solo un lado tiene contenido | Proponer inicialización; no tratarlo como eliminación del otro lado |
| No existe base y ambos tienen contenido diferente | Revisión manual antes de la primera sincronización |
| Falta un documento anteriormente sincronizado | Tratar como posible eliminación; no propagar borrado silencioso |

La resolución manual conserva evidencia de las diferencias y registra la decisión. La base común se actualiza solamente cuando la sincronización correspondiente termina correctamente.

El cambio de branch debe seleccionar su propio estado de sincronización; no se reutiliza ciegamente la base de otra feature. Las escrituras deben ser atómicas, proteger trabajo existente y evitar resultados parciales o ejecuciones concurrentes incompatibles.

### 14.3 Cambios significativos

Si se detecta un cambio en arquitectura, scope, framework, modelo de dominio, seguridad, contratos, estructura de módulos o estrategia Git, el informe muestra:

```text
CAMBIO SIGNIFICATIVO DETECTADO
Antes:
Después:
Impacto:
Archivos afectados:
Revisión manual requerida:
```

Estos cambios no se resuelven silenciosamente aunque solo uno de los espejos haya cambiado. Las herramientas pueden señalar archivos o indicadores; no garantizan comprender automáticamente todo cambio semántico. La revisión humana y del agente sigue siendo necesaria.

## 15. Automatizaciones previstas

No están implementadas ni activadas en la copia inspeccionada. Deben ser seguras, idempotentes y limitarse al contexto compartible.

| Archivo previsto | Comportamiento requerido |
| --- | --- |
| scripts/context/setup.sh | Validar configuración, solicitar datos faltantes, comprobar que el Vault sea externo, crear estructura si corresponde y realizar primera sincronización segura |
| scripts/context/sync.sh | Comparar contra base común, mostrar diferencias, aplicar solo direcciones permitidas y reportar conflictos |
| scripts/context/check.sh | Comprobación sin escrituras: metadata, branch, base, divergencias, rutas y estado de sincronización |
| scripts/context/report.sh | Generar reporte contextual y datos para revisión pre-push, identificando datos no verificados |
| .githooks/post-merge | Comprobar después del merge; sincronizar solo casos permitidos y reportar incidencias |
| .githooks/pre-push | Comprobar contexto, branch, conflictos y working tree esperado; nunca realizar push |

Setup solo instala/configura hooks locales con aprobación del usuario. Debe inspeccionar hooks existentes y `core.hooksPath` para no reemplazar trabajo previo. Ningún script ejecuta contenido del Vault como código, realiza push o incorpora notas privadas automáticamente.

`post-merge` se ejecuta cuando el merge ya ocurrió: puede reportar y dejar bloqueada una sincronización posterior, pero no deshacer ni impedir retroactivamente ese merge. No cubre por sí solo `git pull --rebase`. Se debe ejecutar `check.sh` tras cualquier pull/merge, y al cambiar de branch; la cobertura adicional mediante hooks o wrappers se decidirá al implementar.

Pre-push puede bloquear el envío ante fallos objetivos. No puede demostrar por sí solo que hubo aprobación humana en una conversación; esa aprobación es una regla del agente. El “working tree esperado” debe definirse para la tarea y reportar cambios no incluidos, sin descartarlos automáticamente.

Pruebas mínimas de estas herramientas: primera ejecución, repetición sin cambios, Repo modificado, Vault modificado, ambos modificados, convergencia, eliminación, cambio de branch, rutas con espacios, configuración incompleta, Vault dentro del repo, conflicto significativo y hooks preexistentes. Deben probarse en directorios y repositorios temporales.

## 16. Flujo de colaboración y reglas para agentes

Antes de trabajar en el proyecto se leen README, AGENTS, PROJECT_CONTEXT, TECH_DECISIONS y MODULE_CATALOG cuando existan, además de la documentación del módulo. La ausencia de un documento se registra; no se presume que fue leído o creado.

Las reglas de AGENTS deben recoger identidad del colaborador, lectura previa, sincronización del Vault, verificación remota, versionado, actualización de BRANCH_CONTEXT, contexto, pruebas e informe pre-push.

Reglas permanentes: respetar decisiones confirmadas, justificar dependencias nuevas, no inventar frameworks, no acceder directamente a DB desde frontend, no exponer secretos, no alterar otros módulos innecesariamente, documentar cambios arquitectónicos, mantener pruebas y trazabilidad, respetar UX multi-input, no force push, no borrar trabajo ajeno y no resolver cambios significativos sin revisión.

La estrategia Git existente establece PR hacia `development` y entrega hacia `production`. Las ramas de trabajo nacen de `development`, salvo `hotfix/*` desde `production`; el hotfix se incorpora también a `development`. El trabajo directo en `development` requiere integración autorizada. La consolidación documental no modifica esa estrategia ni crea branches.

### 16.1 Antes de un commit relevante

Realizar `git fetch origin`, comprobar `git status`, branch actual y diferencias entre HEAD, `origin/<current-branch>` y `origin/development`. Si una referencia no existe, informarlo en vez de sustituirla silenciosamente. Si fetch falla, el remoto no se considera verificado.

La diferencia con development es información de integración; no implica por sí sola conflicto. Si el remoto avanzó o hay divergencia, evaluar e informar antes de continuar. No ejecutar automáticamente reset, rebase destructivo ni descartar cambios para “limpiar”.

### 16.2 Antes de cualquier push del agente

Realizar nuevamente `git fetch origin` y verificar destino remoto, branch, ahead/behind, working tree, conflictos, pruebas aplicables y sincronización de contexto. Preparar un informe con:

```text
BRANCH:
COLABORADOR:
AGENTE:
COMMITS PREPARADOS:
ARCHIVOS MODIFICADOS:
CAMBIOS FUNCIONALES:
CAMBIOS ARQUITECTÓNICOS:
CAMBIOS DOCUMENTALES:
TESTS EJECUTADOS:
RESULTADOS:
ESTADO DEL REMOTO:
RIESGOS:
PENDIENTES:
CAMBIOS EN CONTEXTO/VAULT:
PUSH PROPUESTO:
```

Después preguntar: “¿Apruebas realizar el push?”. Sin aprobación explícita del envío propuesto no hay push, tampoco en `docs/*`. La aprobación corresponde al contenido y destino revisados; si cambian materialmente se actualiza el informe y se solicita aprobación del nuevo envío.

## 17. Transferencia de sprint

SPRINT_HANDOFF debe permitir que una persona que no participó esa semana comprenda qué ocurrió y qué sigue. No existe un Scrum Master permanente.

```text
SPRINT/WEEK:
SCRUM MASTER:
OBJECTIVE:
COMPLETED:
IN PROGRESS:
BLOCKERS:
OPEN PRs:
ACTIVE BRANCHES:
AVAILABLE TASKS:
TESTING STATUS:
DECISIONS:
PENDING DECISIONS:
RISKS:
NEXT PRIORITIES:
NOTES FOR NEXT SCRUM MASTER:
```

Las tareas disponibles incluyen alcance, dependencias y criterios de aceptación. Los avances se respaldan con documentos, PRs o resultados cuando existan. No se confunde trabajo iniciado con completado ni una rama reservada con una tarea activa.

## 18. Validación y próximos pasos

Un colaborador debe poder responder con esta documentación qué hace WOK, qué plataformas se prevén, cuáles son sus módulos y responsabilidades, qué está confirmado o pendiente, cómo se organiza el desarrollo, qué sigue, quién distribuye tareas y dónde buscar contexto.

Antes de incorporar el sistema documental completo se debe verificar: README general y enlaces existentes; contexto estable separado del estado temporal; catálogo completo; decisiones con evidencia; handoff utilizable; branch coherente; historial preservado; configuración local ignorada; Vault externo y no trackeado; sincronización sin sobrescritura silenciosa; hooks probados; informe pre-push y revisión manual de cambios significativos.

Pendientes concretos:

1. Revisar y autorizar la incorporación de este documento al proyecto y su eventual distribución en los archivos especializados.
2. Identificar colaborador, sprint y Scrum Master actuales cuando se configure el flujo de trabajo.
3. Validar el estado real de frontend y ERD con sus fuentes y registrar evidencia de decisiones de clase.
4. Confirmar tecnologías y contratos mediante decisiones explícitas, sin elegirlos desde documentación.
5. Definir el manifiesto de archivos compartibles, configurar el Vault externo e implementar y probar las herramientas de contexto.
6. Aprobar por separado la instalación local de hooks si se desea activarlos.

Esta entrega es un único Markdown externo al repositorio. No acredita configuración de Vault, instalación de hooks, sincronización, implementación funcional, cambios de arquitectura, commits o publicación remota.

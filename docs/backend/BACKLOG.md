# Backlog backend Spring e integración

> **Backlog vigente desde 2026-09-25.** La tabla de cinco o seis semanas preservada debajo es `SUPERSEDED` como alcance total. Los estados `NOW`, `NEXT`, `LATER` y `BLOCKED` expresan dependencia, no promesa de fecha. Ver [arquitectura](ARCHITECTURE.md) y [matriz de brechas](../project/GAP_ANALYSIS.md).

| ID      | Estado | Entrega y criterio observable                                                                   | Requisito / dependencias                  |
| ------- | ------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------- |
| CORE-01 | NOW    | Spring, Flyway, Postgres, Nginx, health y OpenAPI arrancan desde entorno limpio                 | TD-01–03; DB y Docker                     |
| IAM-01  | NOW    | register CLIENT, challenge, verify, login, JWT y refresh rotativo/reuse probados                | RN-025/026; CORE-01                       |
| IAM-02  | NOW    | RBAC y ownership A/B; Google OIDC por `sub` y linking seguro                                    | IAM-01; Google real requiere credenciales |
| OPS-01  | NOW    | service capability individual, override auditado y salud externa separada                       | CORE-01                                   |
| CAP-01  | NOW    | motor de capacidad y estimador de ocupación con reason codes/alternativas                       | OPS-01, mesas/turnos                      |
| RES-01  | NOW    | reserva y mesa digital: 3 h, horarios, 20 min, preorden/condiciones y autorización humana       | CAP-01, IAM-01                            |
| CAT-01  | NEXT   | menú real, opciones, precios y disponibilidad calculados por backend                            | Menú real `BLOCKED` para seed             |
| ORD-01  | NEXT   | pickup/delivery/local: solicitud idempotente, aceptación, cambios con revisión y KDS            | CAT-01, CAP-01, inventario                |
| FIN-01  | NOW    | Caja interna: apertura/ledger/arqueo/cierre persistentes; conectar ventas desde ORD-01           | V6; `feature/payments` cash slice parcial |
| FIN-02  | NEXT   | Pagos mixtos, propina y conciliación; `PaymentGateway` mock                                      | ORD-01; proveedor real `BLOCKED`          |
| FEL-01  | NEXT   | pool por atención, múltiples drafts, emisión individual, outbox y mock                          | FIN-01; certificador real `BLOCKED`       |
| MSG-01  | NEXT   | conversaciones por canal, webhooks dedup, identidad externa, STT y handoff                      | IAM-01; Meta real `BLOCKED`               |
| AI-01   | NOW    | Gateway/tool broker, mock, scope guard, fallback y aislamiento sin DB                           | CORE-01; GPU/modelo real `BLOCKED`        |
| MOB-01  | NEXT   | App Cliente completa por slices, misma API y sesión WOK                                         | IAM-01, contratos; ver plan móvil         |
| QA-01   | NOW    | auth, ownership, concurrencia, voucher, prompt injection, LAN/WAN y recuperación sin duplicados | Ejecutar junto a cada slice               |

`BLOCKED` se usa sólo para el adapter productivo o seed que realmente requiere insumo externo; el resto continúa. Cada issue registra decisión → RN/HU → entidad/migración → caso de uso → endpoint → UI → test → diagrama.

---

## Historial: backlog anterior `SUPERSEDED`

Estado: propuesta del 2026-09-15. Leer primero el [plan](DEVELOPMENT_PLAN.md). No son issues ya creados ni asignaciones aceptadas.

Las horas son de esfuerzo conjunto de implementación, pruebas y revisión técnica, no duración calendario. Los paquetes se dividen en issues pequeños antes de comenzar. La integración móvil forma parte de la capacidad de las mismas seis personas.

## 1. Paquetes candidatos y capacidad

**Actualización:** backend Java/Spring; construcción funcional en las primeras 2–3 semanas y últimas 2–3 protegidas para seguridad/estabilización. Reparto inicial: F1/F2/F3 web, B1/B2 backend, M1 app. B2 comparte tiempo con app; no son cuatro personas completas en esos dos frentes. PM Edgar y SM rotativo.

Las estimaciones de backend del borrador se conservan como referencia de **trabajo desde cero por reestimar**, no como carga aprobada para dos personas en dos semanas. Inventariar primero lo que el equipo ya desarrolla en otra rama/repositorio. Descontar sólo resultados verificados y reservar capacidad de frontend existente fuera de estos paquetes.

| ID     | Paquete                                           | Responsable / revisor por puesto | Dependencias                  | Momento objetivo                 | Horas candidatas |
| ------ | ------------------------------------------------- | -------------------------------- | ----------------------------- | -------------------------------- | ---------------- |
| BE-01  | Base Spring Boot, entorno y CI Maven              | B1 / B2                          | Versiones/rúbrica/avance real | Semana 1                         | 12–16            |
| BE-02  | Subconjunto ERD, JPA/Flyway y datos sintéticos    | B1 / B2                          | BE-01, fuentes                | Semana 1                         | 12–18            |
| BE-03  | Spring Security, sesión y permisos por recurso    | B2 / B1                          | BE-01/02                      | Semana 1                         | 20–28            |
| BE-04  | Menú, opciones y configuración mínima             | B1 / F3                          | BE-02/03                      | Semanas 1–2                      | 16–22            |
| BE-05  | OpenAPI y adaptadores web TypeScript              | F1/F2/F3 / B2                    | Contratos BE-03/04/07         | Semanas 1–2                      | 12–18            |
| BE-06  | Stock y confirmación transaccional                | B1 / B2                          | BE-02/03/04 + BE-07           | Antes de congelar                | 28–38            |
| BE-07  | Solicitud, aceptación y estados                   | B1 / B2; M1 valida contrato      | BE-03/04/05/06                | Antes de congelar                | 20–28            |
| BE-08  | KDS/seguimiento vía REST                          | F2 + B1 / M1                     | BE-07                         | Antes de congelar                | 14–20            |
| BE-09  | Cobro simple, si queda incluido                   | B2 / B1                          | BE-03/07                      | Antes de congelar                | 16–22            |
| BE-10  | Auditoría e idempotencia común                    | B1/B2 / revisor de integración   | BE-01/02; cada transacción    | Desde semana 1                   | 16–22            |
| QA-01  | Revisión de seguridad, concurrencia, acceso y WAN | Equipo / revisor rotativo        | Corte funcional ya integrado  | Primera semana protegida         | 24–32            |
| REL-01 | Backup/restauración, instalación y ensayo         | Equipo / SM de esa semana        | QA-01                         | Segunda/tercera semana protegida | 10–16            |

Referencia total backend/web/QA de esta tabla: **200–280 h**; de ellas **166–232 h** corresponden a construcción BE-01–10 y **34–48 h** a revisión/entrega. No incluye terminar todas las vistas web ajenas al corte. QA-01/REL-01 presupuestan API/web/operación; APP-05/06 presupuestan regresión y build móviles. El ensayo compartido se registra una sola vez por persona/hora, aunque tenga evidencias en ambos planes. Las tareas propias de móvil se trasladan al [plan Cliente APP-01–06](../mobile/CLIENT_APP_PLAN.md): **36–52 h de construcción + 14–22 h finales = 50–74 h**. Total combinado candidato: **250–354 h**, sin doble conteo de los antiguos MB-01/MB-02.

Con 12–15 h semanales/persona aún no confirmadas, backend tendría sólo 25–32 h de construcción en dos semanas con 1.5 personas equivalentes, o 38–47 h en tres. Esto **no sostiene el alcance desde cero**. La familiaridad con Java ayuda, pero no demuestra que todo quepa. Día 2: convertir la tabla en esfuerzo restante real, priorizar flujo mínimo, reasignar tiempo liberado de web o acordar un corte menor con el ingeniero. Las semanas protegidas no son capacidad para terminar módulos nuevos atrasados.

BE-06/07 se diseñan juntos; sin reserva real no se confirma venta. BE-10 empieza con la base, no durante endurecimiento. Para seguimiento usar polling REST; WebSocket y workers externos se difieren salvo necesidad demostrada.

Los antiguos MB-01/MB-02 quedan sustituidos por APP-01–06. No abrir tickets duplicados en dos tableros ni sumar sus estimaciones antiguas al plan móvil nuevo.

## 2. Criterios de aceptación por paquete

### BE-01 — Base

- Registrar D-01/D-02/D-04: Java/Spring/JDK/build acordados, repositorios, horas/fracciones, fecha de congelamiento, LAN y alcance rubricado. Revisar el backend ya iniciado antes de generar base nueva.
- Entorno reproducible con API y PostgreSQL aislados, health checks y configuración sin secretos versionados.
- CI ejecuta compilación, estilo y pruebas Java mediante Maven Wrapper (o wrapper existente); los scripts npm de web no validan Spring.
- Documentar arranque desde cero y versión compatible fijada; no instalar varias alternativas para mantenerlas en paralelo.

### BE-02 — Datos

- Recuperar acceso al ERD/DDL; comparar sólo entidades del corte y sus dependencias; registrar discrepancias.
- Ejecutar migraciones Flyway en PostgreSQL desechable, incluyendo índices/constraints usados por el MVP; Hibernate valida esquema sin `ddl-auto=update` en entorno compartido.
- Seeds sintéticos de menú, recursos y roles; no publicar contraseñas/secretos de cuentas de prueba. Provisionarlas por procedimiento local seguro.
- Importes decimales, IDs y timestamps definidos; stock inicial mediante movimiento auditado.

### BE-03 — Identidad

- Spring Security: login/logout y vencimiento/revocación verificables; passwords protegidas; errores neutrales e intentos limitados. Implementar al comienzo, no en las semanas finales.
- Personal tiene permisos explícitos; Cliente sólo lee/modifica sus objetos autorizados.
- Cambiar ID de pedido no revela información ajena; denegación probada por API, no sólo por menú oculto.
- Si registro público se incluye, asigna únicamente Cliente. Si se difiere, pantalla deshabilitada y limitación documentada.
- Definir transportes de sesión web/móvil; no incrustar credenciales de servicio en app.

### BE-04 — Catálogo y servicio

- Menú real con categorías, área y modificadores válidos, límites min/max y cálculo de precio en servidor.
- Administración realiza al menos una modificación persistente y autorizada visible en Cliente.
- Horario/servicio y suspensión manual configurables; precios/stock de fixtures no pasan por datos reales.
- Menú acotado a recetas/recursos soportados; sin prometer producción recursiva todavía no implementada.

### BE-05 — Contrato y web

- OpenAPI describe solicitudes, respuestas, errores, permisos, idempotencia y estados de P0.
- Cliente API maneja timeout, sesión vencida, conflicto y JSON inesperado; admite claves idempotentes.
- Adaptadores convierten estados técnicos a textos españoles y importes a presentación; no usar etiqueta UI como estado API.
- Una caída API muestra error real; no retorna silenciosamente a fixtures.

### BE-06 — Stock y confirmación

- Reserva atómica de recursos compartidos bajo bloqueo, con orden estable y transacción corta.
- Dos solicitudes sobre stock insuficiente producen una aceptación posible y un conflicto controlado; nunca stock negativo.
- Se conserva versión/precio/ingredientes usados; carrito no reserva por sí solo.
- Cancelación habilitada sólo antes de consumo libera reserva. Consumo confirmado genera movimiento una vez; no habilitar cancelación tardía sin merma/compensación implementada.
- Commit de pedido, reservas, historial y resultado idempotente es indivisible; no se confirma antes de commit.

### BE-07 — Solicitudes y pedidos

- Cliente envía solicitud para recoger y ve estado pendiente. Personal autorizado acepta o rechaza con motivo.
- Aceptación revalida servicio, restricciones, horario, recursos y ETA/capacidad del corte.
- Doble aceptación concurrente o reintento de la misma acción no crea dos pedidos.
- Transiciones permitidas quedan documentadas; el cliente no puede marcar su pedido como listo/pagado.
- Una modificación posterior al envío se deshabilita en MVP si todavía no tiene revisión/anulación trazable.

### BE-08 — Cocina y seguimiento

- KDS muestra pedido, área, modificadores y estado actual después de recarga.
- Cocina marca preparación/listo con permiso; cliente observa el estado confirmado y ETA orientativo.
- Dos dispositivos recuperan el mismo estado; volver de desconexión realiza resincronización.
- Si se usa polling, fijar intervalo y criterio de actualización aceptado; si eventos, deduplicar y recuperar snapshot.
- Impresión física no es requisito de P0; el registro/KDS es la evidencia digital. No añadir impresora sin tarea aprobada.

### BE-09 — Cobro

- Un cobro autorizado por cuenta, con método habilitado e importe calculado por servidor; doble clic no duplica ingreso.
- Pedido operativo y pago tienen estados independientes; una cuenta cobrada no altera retrospectivamente artículos/precio.
- Propina no se agrega automáticamente en modalidad para recoger; cobro completo concilia con importe cobrable.
- Si se registra tarjeta/transferencia externa, se identifica como registro verificado por personal, sin simular pasarela.
- Controles de parcial/mixto/división/descuento/reembolso se deshabilitan mientras no exista implementación.

### BE-10 — Trazabilidad y recuperación

- Acciones sensibles guardan actor, hora, entidad, motivo requerido e identificador de operación.
- Clave idempotente identifica actor/operación; mismo contenido retorna resultado y contenido diferente da conflicto.
- Reinicio posterior al commit recupera la operación sin repetir efectos.
- Si se usan eventos/tareas, outbox comparte commit y consumidor deduplica. El MVP sin tareas externas puede priorizar auditoría/consulta sobre un worker no utilizado.
- Logs no contienen contraseñas, tokens ni datos internos del cliente innecesarios.

### App Cliente

Criterios y tareas en [APP-01–06](../mobile/CLIENT_APP_PLAN.md). Incluye experimento preventivo en Android/iPhone: el PM aclaró que no existen fallos móviles observados. No hay una incidencia de React Native que diagnosticar actualmente.

### QA-01 y REL-01 — Cierre

- Pruebas de permisos, último recurso, doble cobro, commit con respuesta perdida y cambios de servicio.
- Recorrido completo entre app Cliente, Operativo/KDS y Administración con misma base de datos.
- WAN desconectada: web/core local cargan y login funciona; remoto no confirma ventas ficticias.
- Restaurar backup en base separada y contrastar pedidos, stock y cobros.
- Preparar README de ejecución, datos de demostración, matriz implementado/simulado/pendiente y guion de 10–15 minutos.
- Ensayar entrega desde instalación limpia y repetir en los dos sistemas móviles; no afirmar publicación en tiendas si sólo existe build de prueba.

## 3. P1: evolución o intercambio de alcance antes de congelar

| ID    | Corte opcional                        | Estimación adicional | Criterio                                                                         |
| ----- | ------------------------------------- | -------------------- | -------------------------------------------------------------------------------- |
| BE-15 | Reserva sencilla y asignación de mesa | 18–28 h              | Sin solapes/capacidad inválida, horario permitido y tolerancia configurada       |
| BE-16 | Ocupación básica de mesa y cuenta     | 12–20 h              | Ocupación consistente; liberar sólo sin saldo o con autorización auditada        |
| BE-17 | Resumen diario de ventas              | 8–12 h               | Sólo cobros reales del corte, período explícito, permisos y totales conciliables |

No sumar automáticamente los tres ni iniciarlos durante las últimas 2–3 semanas. Sólo considerar antes del congelamiento si P0 está probado y existe capacidad. Si una función es obligatoria según rúbrica, decidir su intercambio por esfuerzo equivalente durante los primeros dos días.

## 4. Trazabilidad del catálogo completo

Esta tabla evita interpretar la exclusión temporal como eliminación de requisitos.

| Épica                    | Cobertura de entrega                                            | Referencias de control / evolución                |
| ------------------------ | --------------------------------------------------------------- | ------------------------------------------------- |
| EP-01 Mesas y sala       | P1 BE-16; resto posterior                                       | RN-015/016/048; O-02/03                           |
| EP-02 Reservaciones      | P1 BE-15; preorden avanzada posterior                           | RN-009–016, RN-042/043/065–069; C-07/08, O-07/08  |
| EP-03 Pedidos y comandas | P0 BE-06/07/08, sin cambios tardíos habilitados                 | RN-039–045, RN-056–064; C-09/10, O-04/05          |
| EP-04 Enrutamiento       | P0 KDS por área; revisión/impresión posterior                   | RN-071–074, RT-048–053; O-06                      |
| EP-05 Delivery           | Posterior                                                       | RN-017–020, RN-137/138; O-11                      |
| EP-06 Comunicación       | Posterior; seguimiento de pedido sí P0                          | RN-030–036; C-12, O-09                            |
| EP-07 Clientes           | P0 sesión/propiedad; perfil/restricciones completas posteriores | RN-037/038/113–116; C-13, A-12                    |
| EP-08 Usuarios/roles     | P0 BE-03; editor avanzado posterior                             | RN-025/026, RT-033–035; C-01, A-02/03             |
| EP-09 Personal/turnos    | Posterior; capacidad piloto configurada por encargado           | RN-027/028; A-04                                  |
| EP-10 Menú               | P0 BE-04, menú acotado                                          | RN-070/071/074/119–124; C-03/04, A-05             |
| EP-11 Recetas            | Referencias/snapshots mínimos P0; editor recursivo posterior    | RN-087, RT-029/045; A-06                          |
| EP-12 Inventario         | P0 saldos/reservas/consumo; gestión completa posterior          | RN-029/089–095, RT-027/028; O-15                  |
| EP-13 Compras            | Posterior; stock inicial auditado en MVP                        | RN-083/084/139–142; A-07/08                       |
| EP-14 Producción         | Posterior                                                       | RN-085–087/101–107/143; O-16, A-09                |
| EP-15 Disponibilidad     | P0 para recursos soportados                                     | RN-089–097/119–124; C-03, O-17                    |
| EP-16 Cocina/ETA         | KDS P0; ETA manual orientativo, motor avanzado posterior        | RN-040/041/081/082; O-06                          |
| EP-17 Pagos/caja         | P0 cobro simple; parcial/mixto/caja completa posterior          | RN-021/022/046–049/077–079; O-12/14, A-11         |
| EP-18 Consumos internos  | Posterior; no habilitar clasificación financiera sin soporte    | RN-064/076; inventario/caja                       |
| EP-19 IA                 | Posterior                                                       | RN-024/033/034/070; A-14                          |
| EP-20 Visión             | Posterior                                                       | RN-024; A-15                                      |
| EP-21 Administración     | Configuración/auditoría P0; reporte P1; avanzado posterior      | RN-117–124, RT-016–020/042/075/076; A-13/16, O-18 |

Las historias dentro de cada épica no quedan todas terminadas porque exista cobertura parcial. Para cada issue registrar HU exacta, RN/RT, vista, contrato y evidencia; no marcar una épica completa por cerrar un paquete.

## 5. Plantilla de issue

```text
ID / título:
Prioridad: P0 | P1 | posterior
Responsable / revisor:
Semana / estimación:
HU, RN, RT y vistas:
Resultado observable:
Incluye / excluye:
Dependencias:
Operaciones API y permisos:
Entidades y migraciones:
Criterios de aceptación:
Pruebas y datos sintéticos:
Riesgos / decisiones pendientes:
Evidencia / PR:
```

No crear tickets “hacer backend de Cliente/Operativo/Admin” ni repartir únicamente por tablas. El trabajo se divide por casos de uso, con contrato común y revisión transversal de las transacciones.

# Estado actual

## Corte de entrega — 2026-10-07

La entrega local integrada, incluidas sus dependencias financieras y F1–F6, está preparada para compartir y autorizar commit/PR; no se ha publicado. La revisión independiente acepta F1–F6 para pruebas cruzadas. Javier confirmó exclusivamente Perfil, mensajes, envío de reservas, flujo de mesa hasta limpieza y diseño móvil.

Consultar [alcance, evidencia y pendientes vigentes](../delivery/WEB_INTEGRATED_HANDOFF.md), [arranque](../delivery/RUNBOOK.md) y [staging propuesto](../delivery/STAGING_MANIFEST.md). No se declara completo PLAN_TRABAJO ni producción habilitada. La demo conserva sus recursos y datos.

## Corte histórico — 2026-10-04

- Fecha: 2026-10-04.
- Fase: integracion funcional, endurecimiento y preparacion de entrega.
- Rama estable: `development`.
- Rama de validacion acumulativa: `integration/release-candidate`, apilada temporalmente sobre `release/qa-security` hasta que esta ultima llegue a `development`.
- Base ejecutable: Next.js web, Spring Boot API, PostgreSQL/Flyway, Nginx y Mailpit mediante Docker Compose.
- Controles disponibles: sesiones JWT, autorizacion por permisos, limites de intentos de acceso, validacion BFF, idempotencia en operaciones criticas y auditoria backend.
- Flujo integrado en progreso: cliente solicita pedido, Operaciones lo acepta, Cocina consulta la comanda y actualiza su estado, y el Cliente visualiza ese progreso con persistencia real.
- Riesgo principal: varias vistas administrativas y operativas aun conservan fixtures o estado local aunque la interfaz este terminada.
- Siguiente hito: cerrar pedidos operativos y Cocina de extremo a extremo; despues migrar pagos/caja e inventario sin presentar mocks como datos reales.

La clasificación vigente por módulo/responsable se mantiene en la entrega enlazada arriba. Las matrices y auditorías locales del 4/oct son históricas y no forman parte del staging propuesto.

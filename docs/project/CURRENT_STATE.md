# Estado actual verificado

**Corte:** 2026-10-08. Este documento describe evidencia revisada en esta fecha; no declara terminado el sistema integrado.

**Actualización de trabajo:** en las ramas especializadas se implementaron solicitudes Cliente de cambio de modificadores en una línea aún en cola, sujetas a aprobación Operativa. Se conservan los cambios previos de cantidad. Backend: suite completa de 333 pruebas con PostgreSQL 18/Testcontainers y Flyway V1–V55, cero fallos/errores/omisiones. App: Vitest 125/125, lint, TypeScript y exportación Expo Web de 17 rutas correctos. Estos cambios aún deben publicarse desde sus ramas; el APK existente no incluye el selector de opciones y no se ha probado físicamente.

## Ramas y revisión

- Backend: `feature/backend-capacity-order-lifecycle`. Incluye cuenta/roles, sesiones, autenticación, reservas/capacidad, catálogo, solicitudes/cotizaciones, pagos/caja, FEL mock, mensajería/IA mock, inventario/producción parcial y el nuevo flujo de modificadores de líneas en cola. Suite completa verificada: **75 suites / 333 pruebas**, cero fallos, errores u omitidas, en PostgreSQL 18/Testcontainers con Flyway V1–V55. Se probaron ownership HTTP, idempotencia, cambios de cantidad y modificadores/inventario, capacidad de reservas, CORS y comprobantes delivery.
- App Cliente: `feature/mobile-shell`. Expo Router y sesión WOK con catálogo, reservas, pickup, delivery con transferencia anticipada/evidencia, solicitudes revisables de cancelación/cantidad/modificadores, mensajes, perfil/direcciones, facturas y seguimiento. Vitest **125/125**, lint y TypeScript pasan; export web genera 17 rutas. APK ARM64 local anterior (SHA-256 `963137e4f553c84858942217aa176632c224e41f4a90071a99006076eb551009`) no incluye esta última función, no trae URL API y no se probó en teléfono.
- Web: se trabaja en una rama/check-out aparte. Este corte no vuelve a auditar sus rutas o fixtures. La web respondió HTTP 200 en `localhost:3000`; ese smoke sólo prueba que el servidor levantó, no que el sistema esté conectado a backend.
- Las ramas anteriores están especializadas: revisar su base, HEAD y estado antes de integrar. No se realizó merge a `development` como parte de este corte.

## Datos y catálogo

- `database/migrations/` contiene 55 migraciones ejecutables; la suite actual aplicó V1–V55 desde DB vacía.
- `database/seeds/menu_real_dev.sql` es un seed repetible de desarrollo posterior a Flyway. Incorpora 31 productos y opciones de catálogo; ahora incluye 15 componentes preliminares medidos para matcha y carbonatada. Volúmenes se almacenan en ML, `FL_OZ` convierte a `29.573530 ML`, masas usan G y la lata mineral usa UNIT.
- La unidad y cantidades preliminares están cubiertas por `RealMenuSeedIntegrationTest`. Recetas permanecen `PENDING_DATA`; el motor de inventario sólo reserva/consume BOM de menú `ACTIVE`. El seed no crea saldos ni reservas para esos insumos.
- Pendientes de receta: medida inequívoca del endulzante de 2 oz, cantidad de hielo, rendimiento del jarabe simple y recetas de los demás productos. No inventar cantidades ni activar consumo hasta su revisión.

## Capacidades funcionales backend verificadas

- Identidad WOK con register/verify/login, access token, refresh rotativo/revocación, recuperación de cuenta y rol; base Google OIDC preparada, cliente OAuth real sin configurar.
- Catálogo público y administración auditada; solicitudes de reserva, pickup y delivery sujetas a validación de horario/capacidad y revisión del personal; quotes de pickup/delivery con precio y ETA de servidor; holds temporales por estación.
- Operación de mesas, comandas/cocina, inventario/producción parcial, caja, pagos mock, liquidación de efectivo de repartidor y workspace/outbox FEL mock.
- Mensajería persistida y broker IA mock presentes; proveedores de Meta, pago bancario, FEL, email de producción, runtime IA y storage externo no están conectados productivamente.

La existencia de un endpoint o pantalla no demuestra la aceptación operativa integral. La evaluación de reservas aún no conecta snapshots de mesas/asignaciones a capacidad ni fuentes de personal, cocina, producción y carga; solicitudes siguen requiriendo aprobación humana. Checkout/3DS real, conciliación con proveedor, LAN sin WAN, recuperación física e instalación de la app aún requieren integración o pruebas específicas.

## Bloqueos externos y siguientes dependencias

- Confirmar proveedores/credenciales productivos de pagos, certificador FEL, email y APIs oficiales Meta; configurar dominio y exposición pública.
- Vincular EAS y configurar su entorno antes de generar un APK de preview. Aún falta instalación y prueba en dispositivos reales.
- Completar y validar el recetario, midiendo el rendimiento real de jarabe, antes de activar BOM y consumo de stock.
- Mantener revisión de ownership, autorización y concurrencia en cada slice; ejecutar pruebas LAN/WAN y restauración de backups en la topología física.
- Conciliar el ERD/modelo candidato con las 55 migraciones y actualizar diagramas desde una fuente de verdad acordada antes de declarar la base de datos definitiva.

## Evidencia primaria

- [Backend backlog](../backend/BACKLOG.md), [arquitectura backend](../backend/ARCHITECTURE.md) y [progreso backend](../progress/BACKEND.md).
- [Plan app Cliente](../mobile/CLIENT_APP_PLAN.md) y [progreso móvil](../progress/MOBILE.md).
- [Catálogo](../backend/CATALOG_MENU.md), seed y prueba de integración `RealMenuSeedIntegrationTest`.
- Salidas base de la auditoría preservadas arriba: backend 75 suites / 327 pruebas, Flyway V1–V52; app 121/121. Verificación posterior de estos cambios: backend 75 suites / 330 pruebas, Flyway V1–V54; app Vitest 124/124, lint y TypeScript.

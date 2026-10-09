# Estado actual verificado

**Corte:** 2026-10-08. Este documento describe evidencia revisada en esta fecha; no declara terminado el sistema integrado.

**Trabajo posterior al corte:** el flujo de transferencia anticipada para delivery está publicado en sus ramas backend/app; backend añade carga de comprobante sujeta a revisión Operativa y modalidad/preferencia en la cola de evidencias. Suite backend: 75 suites / 328 pruebas con PostgreSQL 18 y Flyway V1–V53. App: Vitest 123/123, lint y TypeScript correctos.

## Ramas y revisión

- Backend: `feature/backend-capacity-order-lifecycle` (`9fe204a`). Incluye cuenta/roles, sesiones, autenticación, reservas/capacidad, catálogo, solicitudes/cotizaciones, pagos/caja, FEL mock, mensajería/IA mock e inventario/producción parcial. Suite completa verificada: **75 suites / 328 pruebas**, cero fallos, errores u omitidas, en PostgreSQL 18/Testcontainers con Flyway V1–V53. Se probaron ownership HTTP, idempotencia, capacidad de reservas, CORS y comprobante de transferencia anticipada para delivery sin registrar pago hasta revisión Operativa.
- App Cliente: `feature/mobile-shell` (`0c93faf`). Expo Router y sesión WOK con catálogo, reservas, pickup, delivery con transferencia anticipada/evidencia, mensajes, perfil/direcciones, facturas y seguimiento conectados a contratos API según los slices de [plan móvil](../mobile/CLIENT_APP_PLAN.md). En este corte Vitest pasó (**123/123**), al igual que lint y TypeScript. Existe un APK ARM64 de revisión (43 MiB, SHA-256 `6468a8744298dc01003352f8354c3a0bf1fdeb29283340d5754ef140413dc235`), pero se compiló sin `EXPO_PUBLIC_API_BASE_URL` y no se instaló ni probó en teléfono; no puede comunicarse con el backend hasta reconstruirse con una URL alcanzable.
- Web: se trabaja en una rama/check-out aparte. Este corte no vuelve a auditar sus rutas o fixtures. La web respondió HTTP 200 en `localhost:3000`; ese smoke sólo prueba que el servidor levantó, no que el sistema esté conectado a backend.
- Las ramas anteriores están especializadas: revisar su base, HEAD y estado antes de integrar. No se realizó merge a `development` como parte de este corte.

## Datos y catálogo

- `database/migrations/` contiene 53 migraciones ejecutables; la suite de este corte aplicó V1–V53 desde DB vacía.
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
- Conciliar el ERD/modelo candidato con las 52 migraciones y actualizar diagramas desde una fuente de verdad acordada antes de declarar la base de datos definitiva.

## Evidencia primaria

- [Backend backlog](../backend/BACKLOG.md), [arquitectura backend](../backend/ARCHITECTURE.md) y [progreso backend](../progress/BACKEND.md).
- [Plan app Cliente](../mobile/CLIENT_APP_PLAN.md) y [progreso móvil](../progress/MOBILE.md).
- [Catálogo](../backend/CATALOG_MENU.md), seed y prueba de integración `RealMenuSeedIntegrationTest`.
- Salidas de validación del corte: `sh mvnw -q test` en `apps/api` (backend: 75 suites / 327 pruebas, PostgreSQL 18/Testcontainers, Flyway V1–V52); app: `npm run lint`, `npm run typecheck` y `npm run test` (Vitest 121/121). La APK ARM64 indicada arriba es revisión interna firmada con llave debug, no se ha probado en hardware y aún requiere reconstrucción con una URL de API accesible.

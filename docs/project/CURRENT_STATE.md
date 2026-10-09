# Estado actual verificado

**Corte:** 2026-10-09. Este documento describe evidencia revisada en esta fecha; no declara terminado el sistema integrado.

**Actualización de trabajo:** las ramas especializadas publicaron los cambios de pedidos con revisión Operativa y la app Cliente mantiene solicitudes de cancelación/cantidad/modificadores. Backend añade confirmación de reserva con selección explícita de mesas; valida zona, estado, capacidad y traslapes y guarda asignación/confirmación atómicamente. La confirmación concurrente sobre la misma mesa deja una sola reserva confirmada. Backend: suite completa de 349 pruebas con PostgreSQL 18/Testcontainers y Flyway V1–V55, cero fallos/errores/omisiones. App: Vitest 134/134, lint, TypeScript y exports Expo Android/Web correctos. Las ramas backend y móvil están publicadas; APK ARM64 local coincide con SHA-256 `1e18488863ed74aefe4c2f2ac679fa7b1e3751adfbc5aea65a9e5b55656e6f4d`. No se ha probado en teléfono ni se ha hecho merge a `development`.

## Ramas y revisión

- Backend: `feature/backend-capacity-order-lifecycle`, publicado hasta `40f36a6`. Incluye cuenta/roles, sesiones, autenticación, reservas/capacidad, catálogo, solicitudes/cotizaciones, pagos/caja, FEL mock, mensajería/IA mock e inventario/producción parcial. Suite completa verificada: **349 pruebas**, cero fallos, errores u omitidas, en PostgreSQL 18/Testcontainers con Flyway V1–V55. Se probaron ownership HTTP, idempotencia, cambios de cantidad/modificadores/inventario, horarios, capacidad y confirmación concurrente de mesas.
- App Cliente: `feature/mobile-shell`, publicada hasta `5b37922`. Expo Router y sesión WOK con catálogo, reservas, pickup, delivery con transferencia anticipada/evidencia, solicitudes revisables de cancelación/cantidad/modificadores, mensajes, perfil/direcciones, facturas y seguimiento. Vitest **134/134**, lint, TypeScript y exports Expo Android/Web pasan. El APK ARM64 local mide 44,333,211 bytes, SHA-256 `1e18488863ed74aefe4c2f2ac679fa7b1e3751adfbc5aea65a9e5b55656e6f4d`; no se instaló ni probó en teléfono.
- Web: se trabaja en una rama/check-out aparte. Este corte no vuelve a auditar sus rutas o fixtures. La web respondió HTTP 200 en `localhost:3000`; ese smoke sólo prueba que el servidor levantó, no que el sistema esté conectado a backend.
- Las ramas anteriores están especializadas: revisar su base, HEAD y estado antes de integrar. No se realizó merge a `development` como parte de este corte.

## Datos y catálogo

- `database/migrations/` contiene 55 migraciones ejecutables; la suite actual aplicó V1–V55 desde DB vacía.
- `database/seeds/menu_real_dev.sql` es un seed repetible de desarrollo posterior a Flyway. Incorpora 31 productos y opciones de catálogo; ahora incluye 15 componentes preliminares medidos para matcha y carbonatada. Volúmenes se almacenan en ML, `FL_OZ` convierte a `29.573530 ML`, masas usan G y la lata mineral usa UNIT.
- La unidad y cantidades preliminares están cubiertas por `RealMenuSeedIntegrationTest`. Recetas permanecen `PENDING_DATA`; el motor de inventario sólo reserva/consume BOM de menú `ACTIVE`. El seed no crea saldos ni reservas para esos insumos.
- Pendientes de receta: medida inequívoca del endulzante de 2 oz, cantidad de hielo, rendimiento del jarabe simple y recetas de los demás productos. No inventar cantidades ni activar consumo hasta su revisión.

## Capacidades funcionales backend verificadas

- Identidad WOK con register/verify/login, access token, refresh rotativo/revocación, recuperación de cuenta y rol; base Google OIDC preparada, cliente OAuth real sin configurar.
- Catálogo público y administración auditada; solicitudes de reserva, pickup y delivery sujetas a validación de horario/capacidad y revisión del personal; la confirmación operativa de reserva requiere una selección explícita de mesas y persiste asignación/estado/auditoría en una transacción. Quotes de pickup/delivery con precio y ETA de servidor; holds temporales por estación.
- Operación de mesas, comandas/cocina, inventario/producción parcial, caja, pagos mock, liquidación de efectivo de repartidor y workspace/outbox FEL mock.
- Mensajería persistida y broker IA mock presentes; proveedores de Meta, pago bancario, FEL, email de producción, runtime IA y storage externo no están conectados productivamente.

La existencia de un endpoint o pantalla no demuestra la aceptación operativa integral. La evaluación de reservas aún no conecta snapshots de mesas/asignaciones a capacidad ni fuentes de personal, cocina, producción y carga; las solicitudes siguen requiriendo aprobación humana, y Operativo debe integrar el nuevo envío de `tableIds` al confirmar. Checkout/3DS real, conciliación con proveedor, LAN sin WAN, recuperación física e instalación de la app aún requieren integración o pruebas específicas.

## Bloqueos externos y siguientes dependencias

- Confirmar proveedores/credenciales productivos de pagos, certificador FEL, email y APIs oficiales Meta; configurar dominio y exposición pública.
- Vincular EAS y configurar su entorno si se necesita build remoto; el APK ARM64 local de revisión ya existe. Aún falta instalarlo y probar conectividad/recorridos en dispositivos reales.
- Completar y validar el recetario, midiendo el rendimiento real de jarabe, antes de activar BOM y consumo de stock.
- Mantener revisión de ownership, autorización y concurrencia en cada slice; ejecutar pruebas LAN/WAN y restauración de backups en la topología física.
- Conciliar el ERD/modelo candidato con las 55 migraciones y actualizar diagramas desde una fuente de verdad acordada antes de declarar la base de datos definitiva.

## Evidencia primaria

- [Backend backlog](../backend/BACKLOG.md), [arquitectura backend](../backend/ARCHITECTURE.md) y [progreso backend](../progress/BACKEND.md).
- [Plan app Cliente](../mobile/CLIENT_APP_PLAN.md) y [progreso móvil](../progress/MOBILE.md).
- [Catálogo](../backend/CATALOG_MENU.md), seed y prueba de integración `RealMenuSeedIntegrationTest`.
- Salidas base de la auditoría preservadas arriba: backend 75 suites / 327 pruebas, Flyway V1–V52; app 121/121. Verificación posterior de estos cambios: backend 75 suites / 330 pruebas, Flyway V1–V54; app Vitest 124/124, lint y TypeScript.

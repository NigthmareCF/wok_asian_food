# Estado actual verificado

**Corte:** 2026-10-08. Este documento describe evidencia revisada en esta fecha; no declara terminado el sistema integrado.

## Ramas y revisión

- Backend: `feature/backend-capacity-order-lifecycle`; actualiza cuenta/roles, autenticación, reservas/capacidad, catálogo, solicitudes y cotizaciones de pedidos, pagos/caja, facturación mock, mensajería/IA mock e inventario/producción parcial. Última verificación en este corte: 69 suites / 299 pruebas aprobadas en PostgreSQL 18/Testcontainers y Flyway V1–V51; incluye suspensión/reactivación auditada con revocación de sesión.
- App Cliente: `feature/mobile-shell`. Expo Router, sesión WOK y flujos de catálogo, reservas, pickup, delivery, mensajes, perfil/direcciones, facturas y seguimiento están conectados a contratos de API en los slices indicados en [plan móvil](../mobile/CLIENT_APP_PLAN.md). Última verificación: 107 pruebas, ESLint, TypeScript y exports Android/Web; un APK Android debug firmado localmente fue compilado, pero es Development Client que requiere Metro y no se probó en teléfono.
- Web: se trabaja en una rama/check-out aparte. Este corte no vuelve a auditar sus rutas o fixtures. La web respondió HTTP 200 en `localhost:3000`; ese smoke sólo prueba que el servidor levantó, no que el sistema esté conectado a backend.
- Las ramas anteriores están especializadas: revisar su base, HEAD y estado antes de integrar. No se realizó merge a `development` como parte de este corte.

## Datos y catálogo

- `database/migrations/` contiene 51 migraciones ejecutables; las pruebas de este corte aplicaron V1–V51 desde DB vacía.
- `database/seeds/menu_real_dev.sql` es un seed repetible de desarrollo posterior a Flyway. Incorpora 31 productos y opciones de catálogo; ahora incluye 15 componentes preliminares medidos para matcha y carbonatada. Volúmenes se almacenan en ML, `FL_OZ` convierte a `29.573530 ML`, masas usan G y la lata mineral usa UNIT.
- La unidad y cantidades preliminares están cubiertas por `RealMenuSeedIntegrationTest`. Recetas permanecen `PENDING_DATA`; el motor de inventario sólo reserva/consume BOM de menú `ACTIVE`. El seed no crea saldos ni reservas para esos insumos.
- Pendientes de receta: medida inequívoca del endulzante de 2 oz, cantidad de hielo, rendimiento del jarabe simple y recetas de los demás productos. No inventar cantidades ni activar consumo hasta su revisión.

## Capacidades funcionales backend verificadas

- Identidad WOK con register/verify/login, access token, refresh rotativo/revocación, recuperación de cuenta y rol; base Google OIDC preparada, cliente OAuth real sin configurar.
- Catálogo público y administración auditada; solicitudes de reserva, pickup y delivery sujetas a validación de horario/capacidad y revisión del personal; quotes de pickup/delivery con precio y ETA de servidor; holds temporales por estación.
- Operación de mesas, comandas/cocina, inventario/producción parcial, caja, pagos mock, liquidación de efectivo de repartidor y workspace/outbox FEL mock.
- Mensajería persistida y broker IA mock presentes; proveedores de Meta, pago bancario, FEL, email de producción, runtime IA y storage externo no están conectados productivamente.

La existencia de un endpoint o pantalla no demuestra la aceptación operativa integral. Capacidad basada en personal/recetas, reservas físicas concurrentes, checkout/3DS real, conciliación financiera, LAN sin WAN, recuperación física e instalación de la app aún requieren pruebas específicas.

## Bloqueos externos y siguientes dependencias

- Confirmar proveedores/credenciales productivos de pagos, certificador FEL, email y APIs oficiales Meta; configurar dominio y exposición pública.
- Vincular EAS y configurar su entorno antes de generar un APK de preview. Aún falta instalación y prueba en dispositivos reales.
- Completar y validar el recetario, midiendo el rendimiento real de jarabe, antes de activar BOM y consumo de stock.
- Mantener revisión de ownership, autorización y concurrencia en cada slice; ejecutar pruebas LAN/WAN y restauración de backups en la topología física.
- Conciliar el ERD/modelo candidato con las 51 migraciones y actualizar diagramas desde una fuente de verdad acordada antes de declarar la base de datos definitiva.

## Evidencia primaria

- [Backend backlog](../backend/BACKLOG.md), [arquitectura backend](../backend/ARCHITECTURE.md) y [progreso backend](../progress/BACKEND.md).
- [Plan app Cliente](../mobile/CLIENT_APP_PLAN.md) y [progreso móvil](../progress/MOBILE.md).
- [Catálogo](../backend/CATALOG_MENU.md), seed y prueba de integración `RealMenuSeedIntegrationTest`.
- Salidas de validación del corte: `bash ./mvnw test` en `apps/api` (backend: 69 suites / 299 pruebas, PostgreSQL 18/Testcontainers); app: Vitest 107/107, ESLint, TypeScript y exports Expo Android/Web; `./gradlew assembleDebug` generó APK Android firmado (no instalado ni probado en hardware).

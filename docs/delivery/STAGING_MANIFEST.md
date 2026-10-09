# Inventario y staging propuesto

Corte inicial: 7/oct/2026. Lista explícita, **no ejecutada**. Inventario inicial: 110 tracked modificados +123 untracked (233), cero staged. La preparación inicial agregó cuatro documentos de entrega y actualizó CURRENT_STATE.md ya modificado:237 dirty/234 candidatos entonces. El inventario vigente tras compatibilidad y portabilidad figura en el párrafo siguiente; tres excluidos se conservan. Confirmar nuevamente antes de staging si aparece cualquier cambio nuevo.

Actualización posterior: [compatibilidad y cierre de portabilidad](COMPATIBILITY_CHECK.md). Se verificaron los234 iniciales:109 modificados/340 hunks,125 nuevos y0 ya integrados contra development9eab323. Se añadió COMPATIBILITY_CHECK.md y, bajo autorización posterior, dos helpers de prueba Node. **239 candidatos finales (109 tracked +130 untracked)**,242 dirty y3 excluidos. WebFindingBoundaryIntegrationTest cambia únicamente sus dos invocaciones Node al selector portable; se conservan expectativas. V26/V27 intactas. Cierre8/oct autorizado: fixture horario y caso negativo implementados; smoke completo44 HTTP/siete SQL aprobado. Mobile npm ci/lint/tipos aprobados en copia nueva sin cambios de versiones/fuentes. CI remoto/gate pendientes antes de merge.

No usar `git add .`, `git add -A` ni globs de directorio. Una futura autorización debe abarcar esta lista y sus hunks completos, incluido financiero anterior. Cada candidato se revisa por dependencia/alcance; la lista no autoriza commit ni publicación. No copiar secretos, dependencias, informes/configuración de Temp ni artefactos. Los tests audit-* son código de regresión conservando expectativas originales, no la auditoría temporal.

## Clasificación y justificación

API/migraciones: reglas de totales, cobro durable, resolución, contratos operativos/horarios y sus regresiones; necesarios para Web y financial. Web: páginas/BFF/módulos/pruebas de Cliente, Operativo, Administración y shared directamente asociados. CI smoke: regresión del contrato operativo existente. Documentación: progreso acumulado/estado actualizado y estos cuatro archivos. No se afirma autoría única del acumulado; la documentación histórica financiera acredita sus dependencias. Ver [alcance y revisión de riesgos](WEB_INTEGRATED_HANDOFF.md).

## Excluidos del staging, preservados

| Archivo | Estado Git | Grupo | Clasificación |
|---|---|---|---|
| `apps/web/next-env.d.ts` | tracked modified | Web | temporal |
| `docs/project/INTEGRATION_STATUS.md` | untracked | documentación | origen incierto; histórico desactualizado |
| `docs/project/QA_AUDIT_2026-10-04.md` | untracked | documentación | ajeno histórico |

next-env es generado por Next (rutas dev/build) y ya está tracked: excluir solo su delta, sin borrar ni revertir. QA_AUDIT del 4/oct es ajeno al paquete vigente e histórico; no presentarlo como revisión actual. INTEGRATION_STATUS tiene procedencia exacta no acreditada y estados anteriores a esta entrega: dejarlo fuera, sin eliminarlo. CURRENT_STATE ya referencia el informe vigente y no depende de esa matriz excluida. Configuración/artefactos de la demo quedan fuera del checkout y del staging. No hay otros archivos ajenos demostrados en este inventario.

## Archivos necesarios propuestos para staging

| Archivo exacto | Estado Git | Grupo | Clasificación |
|---|---|---|---|
| `.github/scripts/operational-flow-smoke.sh` | tracked modified | CI smoke | necesario |
| `apps/api/src/main/java/com/wokasianfood/api/accounts/AccountFinancialTotalsService.java` | untracked | API/migraciones | necesario |
| `apps/api/src/main/java/com/wokasianfood/api/accounts/OperationalAccountController.java` | tracked modified | API/migraciones | necesario |
| `apps/api/src/main/java/com/wokasianfood/api/cash/CashSessionController.java` | tracked modified | API/migraciones | necesario |
| `apps/api/src/main/java/com/wokasianfood/api/kitchen/KitchenController.java` | tracked modified | API/migraciones | necesario |
| `apps/api/src/main/java/com/wokasianfood/api/orders/ClientPickupRequestController.java` | tracked modified | API/migraciones | necesario |
| `apps/api/src/main/java/com/wokasianfood/api/orders/OperationalOrderController.java` | tracked modified | API/migraciones | necesario |
| `apps/api/src/main/java/com/wokasianfood/api/orders/OperationalOrderRequestController.java` | tracked modified | API/migraciones | necesario |
| `apps/api/src/main/java/com/wokasianfood/api/orders/PickupSchedulePolicy.java` | untracked | API/migraciones | necesario |
| `apps/api/src/main/java/com/wokasianfood/api/payments/PaymentAttemptController.java` | untracked | API/migraciones | necesario |
| `apps/api/src/main/java/com/wokasianfood/api/payments/PaymentAttemptResolutionController.java` | untracked | API/migraciones | necesario |
| `apps/api/src/main/java/com/wokasianfood/api/payments/PaymentAttemptResolutionService.java` | untracked | API/migraciones | necesario |
| `apps/api/src/main/java/com/wokasianfood/api/payments/PaymentAttemptService.java` | untracked | API/migraciones | necesario |
| `apps/api/src/main/java/com/wokasianfood/api/payments/PaymentController.java` | tracked modified | API/migraciones | necesario |
| `apps/api/src/main/java/com/wokasianfood/api/tables/OperationalTableController.java` | tracked modified | API/migraciones | necesario |
| `apps/api/src/test/java/com/wokasianfood/api/accounts/AccountFinancialTotalsServiceTest.java` | untracked | API/migraciones | necesario |
| `apps/api/src/test/java/com/wokasianfood/api/accounts/FinancialAccountIntegrationTest.java` | untracked | API/migraciones | necesario |
| `apps/api/src/test/java/com/wokasianfood/api/cash/CashSessionIntegrationTest.java` | tracked modified | API/migraciones | necesario |
| `apps/api/src/test/java/com/wokasianfood/api/kitchen/KitchenServiceTest.java` | tracked modified | API/migraciones | necesario |
| `apps/api/src/test/java/com/wokasianfood/api/operational/ClientWebPersistenceIntegrationTest.java` | untracked | API/migraciones | necesario |
| `apps/api/src/test/java/com/wokasianfood/api/operational/OperationalFlowIntegrationTest.java` | tracked modified | API/migraciones | necesario |
| `apps/api/src/test/java/com/wokasianfood/api/operational/OrderRequestDecisionIntegrationTest.java` | tracked modified | API/migraciones | necesario |
| `apps/api/src/test/java/com/wokasianfood/api/operational/WebFindingBoundaryIntegrationTest.java` | untracked | API/migraciones | necesario |
| `apps/api/src/test/java/com/wokasianfood/api/orders/ClientPickupRequestControllerTest.java` | tracked modified | API/migraciones | necesario |
| `apps/api/src/test/java/com/wokasianfood/api/orders/OrderServiceTest.java` | tracked modified | API/migraciones | necesario |
| `apps/api/src/test/java/com/wokasianfood/api/orders/PickupSchedulePolicyTest.java` | untracked | API/migraciones | necesario |
| `apps/api/src/test/java/com/wokasianfood/api/payments/FinancialLifecycleIntegrationTest.java` | untracked | API/migraciones | necesario |
| `apps/api/src/test/java/com/wokasianfood/api/payments/PaymentAttemptCompatibilityIntegrationTest.java` | untracked | API/migraciones | necesario |
| `apps/api/src/test/java/com/wokasianfood/api/payments/PaymentAttemptIntegrationTest.java` | untracked | API/migraciones | necesario |
| `apps/api/src/test/java/com/wokasianfood/api/payments/PaymentAttemptResolutionIntegrationTest.java` | untracked | API/migraciones | necesario |
| `apps/api/src/test/java/com/wokasianfood/api/payments/PaymentAttemptResolutionMigrationIntegrationTest.java` | untracked | API/migraciones | necesario |
| `apps/api/src/test/java/com/wokasianfood/api/tables/TableServiceTest.java` | tracked modified | API/migraciones | necesario |
| `apps/web/src/app/(private)/(admin)/admin/menu/page.tsx` | tracked modified | Web | necesario |
| `apps/web/src/app/(private)/(admin)/admin/payment-attempts/[accountId]/page.tsx` | untracked | Web | necesario |
| `apps/web/src/app/(private)/(admin)/admin/payment-attempts/page.tsx` | untracked | Web | necesario |
| `apps/web/src/app/(private)/(admin)/admin/roles/page.tsx` | tracked modified | Web | necesario |
| `apps/web/src/app/(private)/(admin)/admin/users/page.tsx` | tracked modified | Web | necesario |
| `apps/web/src/app/(private)/(client)/client/menu/[productId]/page.tsx` | untracked | Web | necesario |
| `apps/web/src/app/(private)/(client)/client/menu/page.tsx` | untracked | Web | necesario |
| `apps/web/src/app/(private)/(client)/client/orders/[orderId]/page.tsx` | tracked modified | Web | necesario |
| `apps/web/src/app/(private)/(client)/client/orders/page.tsx` | tracked modified | Web | necesario |
| `apps/web/src/app/(private)/(client)/client/profile/page.tsx` | untracked | Web | necesario |
| `apps/web/src/app/(private)/(operational)/operation/cash/page.tsx` | tracked modified | Web | necesario |
| `apps/web/src/app/(private)/(operational)/operation/kitchen/page.tsx` | tracked modified | Web | necesario |
| `apps/web/src/app/(private)/(operational)/operation/layout.tsx` | tracked modified | Web | necesario |
| `apps/web/src/app/(private)/(operational)/operation/online-requests/page.tsx` | tracked modified | Web | necesario |
| `apps/web/src/app/(private)/(operational)/operation/orders/[orderId]/page.tsx` | tracked modified | Web | necesario |
| `apps/web/src/app/(private)/(operational)/operation/orders/new/page.tsx` | tracked modified | Web | necesario |
| `apps/web/src/app/(private)/(operational)/operation/orders/page.tsx` | tracked modified | Web | necesario |
| `apps/web/src/app/(private)/(operational)/operation/payments/[recordId]/page.tsx` | tracked modified | Web | necesario |
| `apps/web/src/app/(private)/(operational)/operation/payments/[recordId]/prebill/page.tsx` | tracked modified | Web | necesario |
| `apps/web/src/app/(private)/(operational)/operation/payments/page.tsx` | tracked modified | Web | necesario |
| `apps/web/src/app/bff/admin/users/[userId]/roles/[roleCode]/route.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/admin/users/route.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/delivery-requests/[requestId]/route.ts` | tracked modified | Web | necesario |
| `apps/web/src/app/bff/delivery-requests/route.ts` | tracked modified | Web | necesario |
| `apps/web/src/app/bff/operational/accounts/[accountId]/payment-attempts/[attemptId]/capture/route.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/accounts/[accountId]/payment-attempts/[attemptId]/replacement/route.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/accounts/[accountId]/payment-attempts/[attemptId]/resolution/route.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/accounts/[accountId]/payment-attempts/[attemptId]/retire/route.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/accounts/[accountId]/payment-attempts/[attemptId]/route.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/accounts/[accountId]/payment-attempts/by-legacy-key/[key]/route.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/accounts/[accountId]/payment-attempts/context/route.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/accounts/[accountId]/payment-attempts/route.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/accounts/[accountId]/payments/by-idempotency-key/[key]/route.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/accounts/[accountId]/payments/route.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/accounts/[accountId]/route.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/accounts/route.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/cash-sessions/[sessionId]/close/route.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/cash-sessions/[sessionId]/movements/route.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/cash-sessions/[sessionId]/route.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/cash-sessions/current/route.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/cash-sessions/route.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/financial.test.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/kitchen/tickets/[ticketId]/claim/route.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/kitchen/tickets/[ticketId]/status/route.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/kitchen/tickets/operational-kitchen.test.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/kitchen/tickets/route.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/order-requests/[requestId]/decision/route.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/order-requests/operational-order-requests.test.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/order-requests/route.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/orders/[orderId]/items/route.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/orders/[orderId]/route.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/orders/[orderId]/status/route.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/orders/operational-orders.test.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/orders/route.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/payment-attempt-resolutions/route.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/payment-attempts/route.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/operational/reservations/operational-reservations.test.ts` | tracked modified | Web | necesario |
| `apps/web/src/app/bff/operational/reservations/pending/route.ts` | tracked modified | Web | necesario |
| `apps/web/src/app/bff/operational/tables/operational-tables.test.ts` | tracked modified | Web | necesario |
| `apps/web/src/app/bff/operational/tables/route.ts` | tracked modified | Web | necesario |
| `apps/web/src/app/bff/order-requests/[requestId]/route.ts` | tracked modified | Web | necesario |
| `apps/web/src/app/bff/order-requests/history.test.ts` | tracked modified | Web | necesario |
| `apps/web/src/app/bff/order-requests/route.test.ts` | tracked modified | Web | necesario |
| `apps/web/src/app/bff/order-requests/route.ts` | tracked modified | Web | necesario |
| `apps/web/src/app/bff/profile/route.ts` | untracked | Web | necesario |
| `apps/web/src/app/bff/reservations/[reservationId]/route.ts` | tracked modified | Web | necesario |
| `apps/web/src/app/bff/reservations/route.ts` | tracked modified | Web | necesario |
| `apps/web/src/app/globals.css` | tracked modified | Web | necesario |
| `apps/web/src/config/navigation.ts` | tracked modified | Web | necesario |
| `apps/web/src/modules/cart/components/cart-view.test.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/cart/components/cart-view.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/cart/components/live-cart-view.test.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/cart/components/live-cart-view.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/cart/components/pending-request-view.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/cart/live-cart-provider.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/cart/live-cart-storage.test.ts` | untracked | Web | necesario |
| `apps/web/src/modules/cart/live-cart-storage.ts` | tracked modified | Web | necesario |
| `apps/web/src/modules/cash/components/cash-view.test.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/cash/components/cash-view.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/cash/live-contract.test.ts` | untracked | Web | necesario |
| `apps/web/src/modules/cash/live-contract.ts` | untracked | Web | necesario |
| `apps/web/src/modules/cash/use-live-cash-session.test.tsx` | untracked | Web | necesario |
| `apps/web/src/modules/cash/use-live-cash-session.ts` | untracked | Web | necesario |
| `apps/web/src/modules/checkout/components/checkout.module.css` | tracked modified | Web | necesario |
| `apps/web/src/modules/checkout/components/client-checkout.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/checkout/components/pickup-checkout.test.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/checkout/components/pickup-checkout.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/checkout/pickup-attempt.ts` | tracked modified | Web | necesario |
| `apps/web/src/modules/checkout/pickup-contract.test.ts` | untracked | Web | necesario |
| `apps/web/src/modules/checkout/pickup-contract.ts` | tracked modified | Web | necesario |
| `apps/web/src/modules/checkout/pickup-window.test.ts` | untracked | Web | necesario |
| `apps/web/src/modules/checkout/pickup-window.ts` | untracked | Web | necesario |
| `apps/web/src/modules/client-order-tracking/audit-resource.test.tsx` | untracked | Web | necesario |
| `apps/web/src/modules/client-order-tracking/components/client-order-list-view.test.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/client-order-tracking/components/client-order-list-view.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/client-order-tracking/components/pickup-history.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/client-order-tracking/components/pickup-request-detail.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/client-order-tracking/components/pickup-requests.test.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/client-order-tracking/pickup-details.ts` | tracked modified | Web | necesario |
| `apps/web/src/modules/client-order-tracking/use-client-pickup-resource.test.tsx` | untracked | Web | necesario |
| `apps/web/src/modules/client-order-tracking/use-client-pickup-resource.ts` | untracked | Web | necesario |
| `apps/web/src/modules/client-order-tracking/use-pickup-resource.ts` | tracked modified | Web | necesario |
| `apps/web/src/modules/client-workflows/attempt-store.ts` | tracked modified | Web | necesario |
| `apps/web/src/modules/client-workflows/live-workflows.test.tsx` | untracked | Web | necesario |
| `apps/web/src/modules/client-workflows/server/client-principal.test.ts` | untracked | Web | necesario |
| `apps/web/src/modules/client-workflows/server/endpoint.test.ts` | tracked modified | Web | necesario |
| `apps/web/src/modules/client-workflows/server/endpoint.ts` | tracked modified | Web | necesario |
| `apps/web/src/modules/client-workflows/use-automatic-refresh.test.tsx` | untracked | Web | necesario |
| `apps/web/src/modules/client-workflows/use-automatic-refresh.ts` | untracked | Web | necesario |
| `apps/web/src/modules/client-workflows/use-submission.test.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/client-workflows/use-submission.ts` | tracked modified | Web | necesario |
| `apps/web/src/modules/clients/audit-profile-contract.test.ts` | untracked | Web | necesario |
| `apps/web/src/modules/clients/client-identity-store.test.ts` | untracked | Web | necesario |
| `apps/web/src/modules/clients/client-identity-store.ts` | untracked | Web | necesario |
| `apps/web/src/modules/clients/components/client-home.module.css` | tracked modified | Web | necesario |
| `apps/web/src/modules/clients/components/client-home.test.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/clients/components/client-home.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/clients/components/live-profile.test.tsx` | untracked | Web | necesario |
| `apps/web/src/modules/clients/components/live-profile.tsx` | untracked | Web | necesario |
| `apps/web/src/modules/clients/profile-contract.ts` | untracked | Web | necesario |
| `apps/web/src/modules/clients/server/expected-client-principal.ts` | untracked | Web | necesario |
| `apps/web/src/modules/clients/use-client-identity.test.tsx` | untracked | Web | necesario |
| `apps/web/src/modules/clients/use-client-identity.ts` | untracked | Web | necesario |
| `apps/web/src/modules/delivery/components/client-delivery-history.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/delivery/components/delivery-checkout.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/delivery/delivery-window.ts` | untracked | Web | necesario |
| `apps/web/src/modules/kitchen/components/kitchen-board.module.css` | tracked modified | Web | necesario |
| `apps/web/src/modules/kitchen/components/operational-kitchen-view.tsx` | untracked | Web | necesario |
| `apps/web/src/modules/kitchen/index.ts` | tracked modified | Web | necesario |
| `apps/web/src/modules/kitchen/live-contract.test.ts` | untracked | Web | necesario |
| `apps/web/src/modules/kitchen/live-contract.ts` | untracked | Web | necesario |
| `apps/web/src/modules/menu/components/live-catalog-management.tsx` | untracked | Web | necesario |
| `apps/web/src/modules/menu/components/live-menu-catalog.test.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/menu/components/live-menu-catalog.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/menu/components/live-product-detail.tsx` | untracked | Web | necesario |
| `apps/web/src/modules/messaging/components/live-messaging.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/messaging/server/live-endpoint.ts` | tracked modified | Web | necesario |
| `apps/web/src/modules/orders/components/audit-requests.test.tsx` | untracked | Web | necesario |
| `apps/web/src/modules/orders/components/operational-order-builder.test.tsx` | untracked | Web | necesario |
| `apps/web/src/modules/orders/components/operational-order-builder.tsx` | untracked | Web | necesario |
| `apps/web/src/modules/orders/components/operational-order-detail-view.test.tsx` | untracked | Web | necesario |
| `apps/web/src/modules/orders/components/operational-order-detail-view.tsx` | untracked | Web | necesario |
| `apps/web/src/modules/orders/components/operational-order-list-view.tsx` | untracked | Web | necesario |
| `apps/web/src/modules/orders/components/operational-order-requests-view.tsx` | untracked | Web | necesario |
| `apps/web/src/modules/orders/components/operational-order-requests.module.css` | untracked | Web | necesario |
| `apps/web/src/modules/orders/index.ts` | tracked modified | Web | necesario |
| `apps/web/src/modules/orders/live-contract.test.ts` | untracked | Web | necesario |
| `apps/web/src/modules/orders/live-contract.ts` | untracked | Web | necesario |
| `apps/web/src/modules/orders/order-attempt-store.test.ts` | untracked | Web | necesario |
| `apps/web/src/modules/orders/order-attempt-store.ts` | untracked | Web | necesario |
| `apps/web/src/modules/orders/order-request-contract.test.ts` | untracked | Web | necesario |
| `apps/web/src/modules/orders/order-request-contract.ts` | untracked | Web | necesario |
| `apps/web/src/modules/payments/attempt-contract.test.ts` | untracked | Web | necesario |
| `apps/web/src/modules/payments/attempt-contract.ts` | untracked | Web | necesario |
| `apps/web/src/modules/payments/components/payment-detail-view.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/payments/components/payments-list-view.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/payments/components/payments-views.test.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/payments/components/prebill-view.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/payments/financial-attempt-provider.test.tsx` | untracked | Web | necesario |
| `apps/web/src/modules/payments/financial-attempt-provider.tsx` | untracked | Web | necesario |
| `apps/web/src/modules/payments/live-contract.test.ts` | untracked | Web | necesario |
| `apps/web/src/modules/payments/live-contract.ts` | untracked | Web | necesario |
| `apps/web/src/modules/payments/server/attempt-endpoint.test.ts` | untracked | Web | necesario |
| `apps/web/src/modules/payments/server/attempt-endpoint.ts` | untracked | Web | necesario |
| `apps/web/src/modules/payments/use-account-finance.test.tsx` | untracked | Web | necesario |
| `apps/web/src/modules/payments/use-account-finance.ts` | untracked | Web | necesario |
| `apps/web/src/modules/reservations/components/client-reservation.test.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/reservations/components/live-reservations.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/reservations/components/operational-reservation-queue.test.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/reservations/components/operational-reservation-queue.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/reservations/components/reservation-form-view.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/reservations/components/reservation-views.test.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/reservations/reservation-window.test.ts` | untracked | Web | necesario |
| `apps/web/src/modules/reservations/reservation-window.ts` | untracked | Web | necesario |
| `apps/web/src/modules/tables/components/operational-table-detail-view.test.tsx` | untracked | Web | necesario |
| `apps/web/src/modules/tables/components/operational-table-detail-view.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/tables/components/operational-tables-view.test.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/tables/live-contract.test.ts` | tracked modified | Web | necesario |
| `apps/web/src/modules/tables/live-contract.ts` | tracked modified | Web | necesario |
| `apps/web/src/modules/users/components/live-user-management.test.tsx` | untracked | Web | necesario |
| `apps/web/src/modules/users/components/live-user-management.tsx` | untracked | Web | necesario |
| `apps/web/src/modules/users/components/user-management.module.css` | tracked modified | Web | necesario |
| `apps/web/src/modules/users/components/user-management.test.tsx` | tracked modified | Web | necesario |
| `apps/web/src/modules/users/live-contract.ts` | untracked | Web | necesario |
| `apps/web/src/shared/components/app-shell.test.tsx` | tracked modified | Web | necesario |
| `apps/web/src/shared/components/app-shell.tsx` | tracked modified | Web | necesario |
| `apps/web/src/shared/lib/permissions.test.ts` | tracked modified | Web | necesario |
| `apps/web/src/shared/lib/permissions.ts` | tracked modified | Web | necesario |
| `apps/web/src/test/private-session-fixture.ts` | untracked | Web | necesario |
| `database/migrations/V26__presential_payment_attempts.sql` | untracked | API/migraciones | necesario |
| `database/migrations/V27__presential_payment_attempt_resolution.sql` | untracked | API/migraciones | necesario |
| `docs/delivery/PR_PROPOSAL.md` | untracked | documentación de entrega | necesario |
| `docs/delivery/RUNBOOK.md` | untracked | documentación de entrega | necesario |
| `docs/delivery/STAGING_MANIFEST.md` | untracked | documentación de entrega | necesario |
| `docs/delivery/WEB_INTEGRATED_HANDOFF.md` | untracked | documentación de entrega | necesario |
| `docs/progress/ADMIN.md` | tracked modified | documentación | necesario |
| `docs/progress/BACKEND.md` | tracked modified | documentación | necesario |
| `docs/progress/CLIENT.md` | tracked modified | documentación | necesario |
| `docs/progress/OPERATIONAL.md` | tracked modified | documentación | necesario |
| `docs/progress/WEB_INTEGRATED_DELIVERY.md` | untracked | documentación | necesario |
| `docs/progress/WEB_INTEGRATED_F1_F6.md` | untracked | documentación | necesario |
| `docs/project/CURRENT_STATE.md` | tracked modified | documentación | necesario |

## Revisión antes de ejecutar

La lista anterior conserva los234 originales para contrastar el corte verificado. Adiciones explícitas reales:

| Archivo exacto | Estado Git | Grupo | Clasificación |
|---|---|---|---|
| `docs/delivery/COMPATIBILITY_CHECK.md` | untracked | documentación | necesario |
| `apps/api/src/test/java/com/wokasianfood/api/support/NodeRuntime.java` | untracked | API/pruebas | necesario; selector Node portable |
| `apps/api/src/test/java/com/wokasianfood/api/support/NodeRuntimeTest.java` | untracked | API/pruebas | necesario; siete casos Windows/Linux/macOS |
| `.github/scripts/pickup-smoke-window.sql` | untracked | CI smoke | necesario; selector por horario/zona/preparación/máximo reales |
| `database/tests/smoke_pickup_window.sql` | untracked | CI smoke/pruebas | necesario; siete límites con rollback, ejecutados por el smoke |

`WebFindingBoundaryIntegrationTest.java` ya está en los234: trasladar su contenido actualizado, incluido import y ambos ProcessBuilder. No agregar herramientas jq, SWC, Docker/Compose ni harness/logs/compose de Temp. El cierre horario posterior modifica operational-flow-smoke.sh (ya listado) y añade los dos SQL anteriores: trasladar juntos, incluida resolución del include por stdin. Sin cambios Mobile, workflow ni migraciones. npm ci descargó dependencias únicamente a otra copia de Temp; no son candidatos.

Comparar lista final/staged con esta propuesta, inspeccionar diff por hunks y análisis de secretos sin imprimir valores. Confirmar base remota vigente y V26/V27 disponibles; las colisiones conocidas se documentan en [propuesta de PR](PR_PROPOSAL.md). Las exclusiones nuevas de Git o cambios de código se proponen antes de realizarlos. No se ejecutó staging.

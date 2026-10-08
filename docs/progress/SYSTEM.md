# Progreso del sistema

## 2026-10-07 — Evidencia de transferencia Cliente y revisión Operativa

- Backend branch `feature/backend-capacity-order-lifecycle`: `V51__customer_transfer_payment_evidence.sql` agrega evidencia privada y eventos auditables; hashes globales evitan reutilizar la misma imagen. Upload sólo acepta comprobantes pickup con `TRANSFER_AT_PICKUP`, ownership del cliente, JPG/PNG por firma, hasta 8 MB e idempotencia.
- API Cliente: `POST/GET /api/v1/client/order-requests/{requestId}/payment-evidence` y descarga autenticada de contenido. API Operativo con `payments:manage`: cola, contenido y decisión `VERIFY/REJECT` con versión esperada y motivo para rechazo.
- Subir imagen nunca crea un pago. `VERIFY` exige solicitud pickup aceptada, una cuenta asociada y monto confirmado por personal; registra transferencia mediante `PaymentService` dentro de la transacción. Proveedor/OCR no confirma el pago.
- Storage fuera del web root, volumen persistente en Compose, permisos POSIX privados, validación de decodificación, tamaño multipart limitado y `nosniff`/no-store en lectura. Suite backend completa con Docker/PostgreSQL 18: 67 suites, 282 pruebas, 0 fallos, errores u omitidas; V1–V51 aplicadas durante la ejecución.
- Mismo V51 en `feature/database-migrations`; `bash database/validate.sh` pasó 51 migraciones, 15 checks SQL y seed idempotente (31 productos) en PostgreSQL 18.
- App Cliente branch `feature/mobile-shell`: selector Expo ImagePicker, envío multipart con la sesión/refresco existentes, idempotency key estable durante retry, estados de revisión en Pedidos. `expo-image-picker ~57.0.20`, compatible con SDK 57; permite galería Android/iOS/Web, sin permisos de cámara o micrófono.
- Se evita fijar `Content-Type` en solicitudes FormData para que fetch agregue el boundary. Lint, TypeScript y Vitest pasaron (24 archivos, 98 tests); Expo exportó Web (17 rutas estáticas) y el bundle Android. No es APK ni prueba física.
- Recibos sólo son evidencia y quedan pendientes hasta confirmación financiera autorizada; una imagen/OCR nunca marca dinero recibido.

## 2026-10-07 — Alcance operativo Web Cliente

- Nueva fuente canónica: `docs/project/CLIENT_SCOPE_DECISIONS.md`, con decisiones, límites de implementación observada, guion propuesto de viernes y pendientes.
- Alineados `DECISIONS_REQUIRED.md`, `TECH_DECISIONS.md`, `backend/DEVELOPMENT_PLAN.md`, `backend/BACKLOG.md` y `project/CURRENT_STATE.md`.
- Delivery permanece en alcance integral; pickup no hereda el mínimo de 3 h; reservas/mesa digital sí. Zonas/costo/courier, sustitución y ventanas de cancelación siguen como decisiones abiertas, no valores inventados.
- Las rutas/código citados deben confirmarse contra el SHA que se integre al build de demo.

## 2026-09-28 — Auditoría y planificación integral

- Rama inspeccionada: `feature/frontend-admin` (`1b6f146`), limpia al inicio. Sin cambio de rama ni operaciones Git de publicación.
- Web verificó: Vitest 39 archivos/228 tests, typecheck, lint y build aprobados. La mayoría de flujos sigue en fixtures. Backend Spring/DB/infra y Expo viven en refs separados, no integrados en esta rama.
- Revisadas read-only las refs especializadas de foundation/auth/API/reservas/availability/payments/schema/migrations/Expo/AI/arquitectura. Se registraron rutas, commits, evidencia y límites en `docs/project/GAP_ANALYSIS.md` y `IMPLEMENTATION_REPORT_2026-09-28.md`.
- Recuperado material documental de esas refs para que el siguiente ciclo tenga fuentes locales: `docs/project/SYSTEM_MASTER.*`, docs database/backend/mobile/AI/security/email/infra, modelo PostgreSQL 128-table candidato y Flyway V1–V6. Esto incorpora documentación/artefactos, no integra sus servicios.
- Creado `docs/project/INTEGRAL_DELIVERY_PLAN.md`: secuencia por dependencias para producto completo, definición de 90 % verificable, workstreams de seis personas y límites de mocks/proveedores.
- `TECH_DECISIONS.md`, `CURRENT_STATE.md`, `DECISIONS_REQUIRED.md`, `BRANCH_HANDOFF.md`, `GAP_ANALYSIS.md`, README y enlaces backend/móvil/DB actualizados con snapshot actual.
- No se ejecutaron JUnit/Flyway/SQL/Expo/Nginx/Compose por Docker daemon inaccesible y ausencia de Maven/psql. El acceso Docker fue solicitado por escalación; pendiente respuesta. Reportes 25–26 Sep son históricos.
- Próximo: integrar los branches vía PR ordenado desde `development`, recuperar Docker/PostgreSQL de prueba, resolver JDBC/JPA, ejecutar V1–V6 y automatizar auth/ownership/refresh, luego avanzar flujos Cliente/Operativo/Admin/app. Sin afirmar cobertura 90 % todavía.

# Propuesta de rama y PR

Propuesta para después de autorización, no comandos ejecutados. Destino: `development`. Rama nueva sugerida: `feature/web-integrated-delivery-finance` en un checkout/worktree separado, preservando este workspace dirty. No reutilizar ramas de canal antiguas ni hacer merge indiscriminado del acumulado.

## Base local y solapamientos

- Workspace: `integration/release-candidate`, HEAD `fa6804117a3cbe00b85e42fa1ac7060b9305c4ad`.
- Fetch autorizado ejecutado: remoto github.com/NigthmareCF/wok_asian_food.git. `refs/remotes/origin/development` = `9eab32352b33adc0d4b6a77f6ebee21e9724ed98`, commit de 6/oct/2026. Sustituye la referencia3611002 de la preparación inicial; volver a comprobar vigencia al crear rama.
- `development` local = `3bbd0ed3bca3954c11d4748bbdf326eac9b82164`; no usar como base actual. HEAD es ancestro de origin/development, 0 commits propios/4 ajenos. El remoto incorpora cambios de móvil/mobile-bff y lockfile; no sobrescribirlos con las copias antiguas del workspace. La integración histórica release/qa-security ya está contenida; no reintroducir sus commits.
- [Comparación por contenido](COMPATIBILITY_CHECK.md): 0 candidatos ya integrados, 109 modificados/340 hunks y125 nuevos iniciales, sin solapamiento directo con development vigente. Traslado selectivo de los234 iniciales, informe documental, dos helpers Node y dos SQL de smoke:239 candidatos, únicamente después de autorización. Los bloqueos de smoke/Mobile ya se resolvieron localmente; CI remoto/gate pendientes antes de merge. No ejecutar Git de integración en esta preparación.

Comparación por nombres de archivos modificados desde merge-base de referencias locales, no simulación de merge ni garantía de conflicto textual:

| Referencia local | Solapamiento potencial con acumulado |
|---|---|
| origin/feature/frontend-client, 2f7ee1a | client-home.tsx/CSS, reservation-form-view.tsx, reservation-views.test.tsx, docs/progress/CLIENT.md (5) |
| origin/feature/frontend-admin, 1b6f146 | admin/users/page.tsx, user-management.test.tsx, docs/progress/ADMIN.md (3) |
| origin/feature/frontend-operational, 248df38 | 0 nombres solapados en esa comparación; todavía necesita revisión semántica de navegación/providers |
| origin/feature/mixed-payments-tips, 0b60d77; origin/feature/cash-simple-closing, a070c61 | Ancestros ya contenidos en HEAD; se reutilizan, no se integran otra vez |
| origin/fix/operational-request-safety, a1b05b9; origin/fix/web-navigation-session, bac8805 | Ancestros contenidos en HEAD; conservar garantías al resolver diferencias |
| origin/pr-32-review, 9997cf0; origin/pr-33-review, ac5ad7f | Referencias móviles divergentes, sin nombres solapados; no incluir ni declarar Android revisado |

Coordinar editor único para endpoint.ts, identidad/hook privado, navigation.ts/app-shell, mesa/cuenta y pago, y revisión de migraciones por Chan. Las referencias pueden cambiar después de esta lectura.

Fetch identifica además colisiones de V26/V27 en Chan, capacity/lifecycle, database-migrations y system-candidate. Chan solapa10 archivos del acumulado; capacity15 y system12. Son riesgos de PR paralelos, no conflictos contra development actual. No fusionar/renumerar ahora; acordar orden antes de integrar esas otras ramas, según COMPATIBILITY_CHECK.md. El opt-in ya usa Node portable, comprobado Windows/Linux; su activación CI explícita continúa pendiente, no se modificó el workflow.

## Título propuesto

Integrar recorridos Web persistentes y dependencias financieras; corregir F1–F6

## Cuerpo propuesto

La Web acumulada conecta Cliente, Operativo y Administración con los contratos existentes y conserva el núcleo financiero necesario para mesa → pedido → cocina → servido → pago → cierre. Incluye API/BFF, totales, caja, intentos durables, resolución ADMIN, migraciones V26/V27 y pruebas; no es únicamente el delta F1–F6.

Perfil normaliza phone ausente a null. Creación/ampliación y lecturas privadas comprueban principal, generación y propietario; respuestas obsoletas se descartan y los intentos inciertos conservan clave/contenido. Solicitudes corrige filtros/cancelación y responsive 768/820. Consultas automáticas son lecturas; no se fabrican éxitos ni se reenvían mutaciones automáticamente.

Validación previa: entrega Web 766 pruebas/244 API; F1–F6 786 Web, lint/tipos/build y caso compuesto Next/BFF/API/PostgreSQL aislado. Revisión independiente acepta F1–F6 para pruebas cruzadas con 151 pruebas y 14 comprobaciones reales. La evidencia financiera previa y sus conteos pertenecen a otro corte. Javier confirmó exclusivamente Perfil, mensajes, envío de reservas, flujo de mesa hasta limpieza y diseño móvil. La demo se actualizó y compiló Web; su API no se recompiló porque las fuentes productivas coinciden.

Verificación de compatibilidad sobre development9eab323 del corte previo: build Web estándar, lint/tipos y786 tests; API compilado offline y245 tests, cero omisiones, incluido1 opt-in Next/BFF/API/PG;27 migraciones+12 archivos SQL y6 tests del gate aprobados. Cierre focalizado posterior: selector Node y opt-in real,8 tests aprobados tanto Windows como Linux. No se repitieron suites completas por cambios solo en pruebas.

Cierre autorizado8/oct: smoke reemplaza `+2 hours` por selección SQL según preparación, máximo3h, horario y zona; si no hay ventana utilizable prepara configuración ficticia solo en PG nuevo. Conserva202 válido y exige422 fuera de servicio sin persistencia. Smoke completo aprobado:44 HTTP y siete casos SQL, incluido mesa→pedido→cocina→servido→parcial50/replay/restante86→saldo0→CLOSED/CLEANING. jq oficial ya verificado y recursos nuevos retirados. Mobile npm ci/lint/tipos aprobados con Node22 y lockfile9eab323 en copia nueva aislada;51 archivos/manifiestos/lockfile sin cambios. Fallos previos eran dependencias ausentes del entorno. CI remoto, Android y vulnerabilidades actualizadas no se presentan como aprobados.

V26/V27 requieren revisión/ensayo de upgrade y despliegue coordinado; no se modifican migraciones anteriores ni se garantiza rollback de datos al revertir código. Persisten límites financieros legacy y requisitos de producción. Mantenimiento administrativo sin endpoint, módulos demostrativos ajenos, Android y decisiones externas no se consideran terminados. No contiene secretos ni configuración de la demo; fixtures son datos de prueba.

Documentación: docs/delivery/WEB_INTEGRATED_HANDOFF.md, RUNBOOK.md, STAGING_MANIFEST.md y COMPATIBILITY_CHECK.md. Antes de publicar: autorizar lista/hunks y confirmar base vigente. Antes de merge: verificar CI remoto/gate final sin omisiones inadvertidas. Smoke y Mobile ya aprobados localmente con sus límites documentados. V26/V27 disponibles y compatibles con development9eab323; coordinar antes de integrar PR paralelos que usan esas versiones. Sin publicación, staging o cambios de rama en este cierre. No autoriza despliegue productivo ni declara completo PLAN_TRABAJO.

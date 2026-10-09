# Corrección F1–F6 — entrega para revisión independiente

Fecha: 2026-10-07. Alcance exclusivo de los seis hallazgos de `INFORME_REVISION_INDEPENDIENTE.md` y sus consumidores/BFF/pruebas directamente afectados. Cambios anteriores conservados; rama `integration/release-candidate` sin commits, publicación ni cambios de rama. Sin instalaciones, lectura de `.env*` ni modificaciones a bases/servicios existentes.

## Resultado por hallazgo

| Hallazgo                      | Corrección                                                                                                                                                                                                                                                                                                                          | Evidencia propia y límites                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 Perfil                     | La forma JSON del API puede omitir `phone`; el contrato la admite y el BFF normaliza a `phone: null` en GET y PUT. Error de lectura indica que no se pudieron consultar datos; una modificación no confirmada mantiene el mensaje de resultado incierto.                                                                            | Expectativa original del auditor aprobada. BFF controlado para GET/PUT sin campo y error GET. Next/BFF → API → PostgreSQL real nuevo: cliente inicialmente sin teléfono, agregar teléfono, eliminarlo, SQL null y GET en nueva sesión.                                                                                                                                                                           |
| F2 Principal operativo        | El formulario captura su propietario inicial. Revalida identidad antes de enviar y antes de confirmar/navegar. POST creación/ampliación exige principal esperado y el BFF comprueba ese principal con el mismo token que reenvía al API. El intento incluye propietario, cuerpo y clave; cambiar usuario no lo reasigna ni elimina. | Expectativas originales de header y cambio de usuario aprobadas; regresión de cambio externo antes de POST y formulario antiguo sin propietario. Integración real: sesión B autorizada no puede ejecutar el intento de A; falta de header tampoco ejecuta; SQL confirma `opened_by=A`. Replays del mismo actor conservan una orden y una ampliación lógica.                                                      |
| F3 Constructor desmontado     | Controlador de operación existente vinculado a identidad/generación y ciclo de vida. Desmontaje o cambio de contexto dispone/aborta el transporte. Respuestas obsoletas no confirman almacenamiento ni navegan. La incertidumbre se guarda **antes** del transporte, no después de un timeout.                                      | Expectativa original de abort/navegación aprobada. Regresión controlada para creación y ampliación: resolver éxito después de desmontar deja exactamente el mismo intento incierto, con propietario/cuerpo/clave. Abortar no demuestra que el servidor no escribió.                                                                                                                                              |
| F4 Bandeja de solicitudes     | Reutiliza el recurso privado con cancelación y generación. Cambio de filtro desmonta la carga anterior; una respuesta vieja queda fuera del scope actual. Las consultas automáticas usan el mismo camino.                                                                                                                           | Ambas expectativas originales del auditor aprobadas: señal abortada al salir y respuesta del filtro anterior ignorada. Regresión compartida prueba además orden de consultas automáticas y descarte aunque el mock ignore abort.                                                                                                                                                                                 |
| F5 Recurso privado compartido | `usePickupResource` delega al recurso privado existente. Identidad verificada, propietario esperado y generación vinculan cargas/resultados. Eventos conocidos de logout/cambio de identidad ocultan inmediatamente datos; las operaciones antiguas se invalidan. BFF de lecturas directamente consumidas comprueba el principal.   | Expectativas de logout y abort aprobadas; pruebas controladas de cambio A/B durante lectura y refresco automático fuera de orden. Se revisaron consumidores de mesas/cuentas, pedidos, cocina, reservas, precuenta y lista financiera. Cuentas preserva el header financiero existente con verificación del actor cuando se usa ese camino. No se promete detectar al instante una cookie cambiada externamente. |
| F6 Responsive                 | Columnas con mínimo cero; una columna hasta 1100 px; cabecera puede envolver, bloques admiten encogimiento y textos largos se parten. No se ocultaron datos o acciones. Se retiró también la altura accidental que el flex-basis introducía en la cabecera apilada.                                                                 | Chrome headless real, Next/API/PostgreSQL nuevos y solicitud ficticia aceptada con detalle: 390/768/820/1280/1440 px. Documento sin overflow; Actualizar y detalle dentro del viewport; contenido preservado. Capturas 768 y 820 inspeccionadas. Es emulación, no dispositivo físico.                                                                                                                            |

## Reproducción y expectativas

Se creó la copia aislada `C:/Users/avill/AppData/Local/Temp/wok-f1-f6-20261007/apps/web` antes de implementar, sin `.env*`, reutilizando dependencias instaladas mediante junction y caché de Vitest en Temp. Se ejecutaron los tests originales del auditor: **40 casos, 7 fallidos y 33 aprobados**. Fallaron Perfil, logout del recurso, las dos carreras de Solicitudes y los tres checks del constructor. El check original de abort del recurso ya pasaba; no se le atribuye ese defecto.

Las expectativas del auditor permanecen en los tests `AUDIT`. El harness corregido incorpora un contrato de sesión separado del transporte de dominio, tipos de promesas y espera de verificación inicial. No se disminuyeron timeouts ni se relajaron assertions. Una expectativa histórica del builder que permitía confirmar tras cambiar cuenta se sustituyó por conservar incertidumbre y bloquear el contexto ajeno, conforme a F3; las expectativas independientes no se cambiaron.

Para F6 se conservó la copia inicial con la regla defectuosa y se contrastó el mínimo de columnas con el espacio del sidebar. El baseline visual de 903 px a viewport 768 es evidencia **del auditor**, no una captura propia anterior al arreglo. La comprobación visual propia corresponde al último build corregido.

## Compatibilidad

- Formularios antiguos sin `userId` no pueden enviar. POST sin `X-Wok-Expected-Principal` recibe 409 (`CLIENT_UPDATE_REQUIRED`); identidad malformada recibe 400; principal distinto recibe 409; sesión no verificable no llega a la operación upstream. No se adopta silenciosamente el usuario de la cookie.
- Intentos antiguos con almacenamiento separado `wok.order.attempt.v1:<userId>:<accountId>:<orderId|new>` recuperan el propietario de **ese slot original**, si el campo todavía no existía. Un propietario explícito distinto invalida la recuperación. Cuerpo/clave no cambian; el BFF exige verificar el dueño antes de reintentar. Un formulario sin ese propietario no puede migrar el intento a otro usuario.
- `usePickupResource` conserva sus primeros tres argumentos y añade un cuarto `userId` opcional. Sus consultas ahora requieren sesión verificada; los tests antiguos que devolvían datos de dominio para `/bff/auth/session` se adaptaron con mocks de sesión explícitos, manteniendo controles de saldo, permisos y cierre.
- Lecturas de cuentas con `X-Financial-Actor` mantienen ese contrato y comprueban el actor con el token reenviado. Lecturas con principal esperado utilizan el control reutilizado; si se mandan ambos, se comprueban ambos. No se modificó el protocolo de captura, reemplazo, resolución, pagos ni caja.
- Cookies cambiadas fuera de la aplicación no son un evento observable inmediato. Se revalida antes/después de operaciones y en las consultas existentes; el BFF además rechaza un principal esperado incompatible con la cookie recibida. No se garantiza detección instantánea ni se rediseñó autenticación.

## Archivos intervenidos

Bajo `apps/web/src`:

- `modules/clients/profile-contract.ts`; `app/bff/profile/route.ts`.
- `modules/client-workflows/server/endpoint.ts`, `client-principal.test.ts`.
- `modules/orders/order-attempt-store.ts`, `order-attempt-store.test.ts`.
- `modules/orders/components/operational-order-builder.tsx`, `operational-order-builder.test.tsx`.
- `modules/orders/components/operational-order-requests-view.tsx`, `operational-order-requests.module.css`, `audit-requests.test.tsx`.
- `modules/client-order-tracking/use-pickup-resource.ts`, `audit-resource.test.tsx`; `modules/clients/audit-profile-contract.test.ts`.
- `app/bff/operational/orders/route.ts`, `orders/[orderId]/route.ts`, `orders/[orderId]/items/route.ts`.
- Lecturas `app/bff/operational/accounts/route.ts`, `accounts/[accountId]/route.ts`, `tables/route.ts`, `kitchen/tickets/route.ts`, `order-requests/route.ts`, `reservations/pending/route.ts`.
- Tests BFF existentes de orders, tables, kitchen, order-requests, reservations y `financial.test.ts`, con principal/sesión explícitos.
- Tests consumidores `operational-reservation-queue.test.tsx`, `operational-tables-view.test.tsx`, `operational-table-detail-view.test.tsx`, `operational-order-detail-view.test.tsx`.
- Helper exclusivo de pruebas `test/private-session-fixture.ts`.

También `apps/api/src/test/java/com/wokasianfood/api/operational/WebFindingBoundaryIntegrationTest.java`, este informe y avances CLIENT/OPERATIONAL. No se cambió código productivo del API, migraciones, permisos, stack o protocolo financiero.

## Verificación final

- **Regresión Web compartida:** 93 archivos / **786 pruebas aprobadas**, cero fallos. Comando `npm.cmd run test --workspace @wok/web -- --maxWorkers=2`. Incluye pruebas controladas de F1–F5 y consumidores/finanzas. La primera corrida detectó diez mocks antiguos sin sesión; se corrigió el contrato de esos mocks, conservando sus expectativas financieras.
- **Lint, TypeScript, build y diff-check:** aprobados. Build del último UI usado en la integración real. No se ejecutó nuevamente la auditoría de 78 tareas ni sus 52 capturas.
- **Integración real:** `WebFindingBoundaryIntegrationTest`, **1 caso compuesto aprobado, cero omisiones**, HTTP Next/BFF y API reales + SQL en PostgreSQL 18 nuevo de Testcontainers. Comprobó JSON real de Perfil, persistencia/eliminación, principal de creación/ampliación, headers ausentes, rechazo de identidad distinta y replays. No es un mock del API.
- Ese test es opt-in por `-Dwok.web.test.dir=<copia Web compilada sin .env>`, `-Dwok.web.next.bin=<CLI Next instalada>` y opcional `-Dwok.web.visual.script=<harness local>`. Sin la propiedad no pretende levantar Next en CI. La ejecución propia suministró todas las propiedades y Maven `-o`; no descargó dependencias.
- **Visual real:** cinco capturas con perfil Chrome temporal. Datos de usuario/producto/solicitud ficticios. El horario del restaurante se amplió únicamente como fixture en la nueva BD de prueba para hacer la comprobación independiente de la hora del día; no se cambió el API ni un horario existente. Sesiones sintéticas emitidas por el helper de pruebas; no se verificó el login normal por contraseña.

| Viewport | scrollWidth | Actualizar y detalle |
| -------- | ----------- | -------------------- |
| 390      | 375         | Dentro del viewport  |
| 768      | 768         | Dentro del viewport  |
| 820      | 820         | Dentro del viewport  |
| 1280     | 1280        | Dentro del viewport  |
| 1440     | 1440        | Dentro del viewport  |

Artefactos propios en `C:/Users/avill/AppData/Local/Temp/wok-f1-f6-20261007`:

- `reproduction.log`, `focused-first.log`, `focused-second.log`, `focused-third.log`, `focused-final.log` preservan reproducciones y correcciones intermedias; no son todos resultados verdes finales.
- `regression-final.log`, `lint-final.log`, `types-final.log`, `build-final.log`, `real-boundary-final.log` son evidencia final.
- `apps/web/visual-measurements.json`, `visual.log`, `requests-390.png`, `requests-768.png`, `requests-820.png`, `requests-1280.png`, `requests-1440.png`; harness `visual.mjs`.
- Next y Chrome fueron procesos propios temporales; se cerraron al terminar. PostgreSQL nuevo fue administrado por Testcontainers. No se actuó sobre los servicios del auditor ni otros servicios/bases existentes.

La herramienta CUA no inició por error `windows sandbox failed: helper_unknown_error`; tras consultar las instrucciones de computer-use se usó Chrome instalado/CDP con Node nativo. No se instaló Playwright u otra dependencia ni se usó un perfil personal.

## Límites y nueva revisión

F1–F6 quedan implementados y con la evidencia indicada, para **revisión independiente**. F3/F4/F5 se verifican mediante carreras controladas; no se presentan como inyección de todas esas carreras en navegador real. La integración real de F1/F2 y la visual de F6 están diferenciadas arriba.

Permanecen fuera: login/rotación completos, dispositivos físicos, auditoría exhaustiva de seguridad, otros formularios y funciones del plan, Android, contratos administrativos ausentes y decisiones externas. No se declara terminado todo PLAN_TRABAJO ni se cierran por inferencia hallazgos financieros previos. Sin publicación ni activación productiva; el trabajo se detiene para revisión independiente.

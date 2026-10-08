# Entrega integrada para pruebas cruzadas

Fecha: 7 de octubre de 2026. Estado: preparada para revisión y autorización de commit/PR; no publicada. Incluye el acumulado financiero del que dependen los recorridos Web, no solamente F1–F6. No acepta todo PLAN_TRABAJO ni habilita producción.

Actualización posterior: [compatibilidad contra development 9eab323 y cierre de portabilidad](COMPATIBILITY_CHECK.md). Opt-in portable comprobado:8 tests Windows y8 Linux, Next/BFF/API/PG reales. **Cierre8/oct resuelto:** smoke completo aprobado (44 HTTP/siete SQL), incluida configuración horaria aislada y negativo422; Mobile npm ci/lint/tipos aprobados con lockfile remoto en copia nueva. Preparada para autorización de commit/PR; CI remoto/gate pendientes antes de merge. V26/V27 compatibles con development actual, sin cambios; coordinar antes de integrar otras ramas que colisionan. El manifiesto vigente contiene239 candidatos. Este corte sustituye los puntos pendientes iniciales, sin cerrar límites de negocio/piloto ni atribuir más comprobaciones a Javier.

Lectura del equipo: este informe → [arranque y pruebas cruzadas](RUNBOOK.md) → [inventario y staging propuesto](STAGING_MANIFEST.md) → [propuesta de PR](PR_PROPOSAL.md). Fuentes funcionales: [entrega Web](../progress/WEB_INTEGRATED_DELIVERY.md), [correcciones F1–F6](../progress/WEB_INTEGRATED_F1_F6.md), [backend financiero](../progress/BACKEND.md) y [operación/finanzas](../progress/OPERATIONAL.md). Los estados históricos de estos registros no sustituyen este corte.

## Alcance y dependencias inseparables

- Cliente: catálogo/detalle real, carrito local por usuario, checkout, historial/detalle persistente, reservas/cancelación, conversaciones y Perfil GET/PUT. Polling de lectura, principal esperado e intentos inciertos conservados. No hay cobro online externo.
- Personal: mesas/cuentas, creación/ampliación, tickets de cocina, servido, solicitudes y decisiones de reservas. Builder conserva clave/cuerpo/propietario, aborta transporte al desmontar y descarta respuestas obsoletas; abortar no demuestra ausencia de escritura.
- Administración: consulta real de usuarios y asignación/retirada de roles soportados; consulta de catálogo publicado. Mantenimiento de productos/precios/disponibilidad y CRUD general de usuarios/roles/permisos carecen de contrato autorizado y quedan bloqueados explícitamente.
- Financiero previo: totales/saldo calculados por API, caja, pagos parciales/completos, intentos durables y revisión ADMIN acotada. Preparación, captura, consulta, retiro/reemplazo y resolución excepcional son operaciones distintas. No hay POST legacy automático para recuperar incertidumbre.
- Shared/BFF: métodos y headers limitados, controles de origen y principal, identidad/generación de recursos privados y navegación responsive con Cerrar sesión. No se rediseña autenticación ni se cambian permisos para abrir pantallas.

La Web financiera depende de `AccountFinancialTotalsService`, controllers/services de PaymentAttempt, correcciones de controllers existentes y **V26 + V27**, además de sus pruebas. V26 crea identidad durable y fencing; V27 añade resolución con separación de funciones y permiso inicial ADMIN. Ambas dependen de V1–V25 y se entregan juntas, sin renumerar ni modificar migraciones aplicadas. El control de cuentas admite X-Financial-Actor existente y comprueba también principal esperado cuando se envían ambos. Formularios antiguos sin principal comprobable reciben 409 CLIENT_UPDATE_REQUIRED; sus intentos inciertos no se reasignan ni borran. No se garantiza compatibilidad financiera total con consumidores legacy externos.

`PickupSchedulePolicy` y sus pruebas respaldan horarios/serialización de checkout; los controllers operativos y el smoke HTTP deben permanecer con su regresión. Los helpers y pruebas audit-* untracked son pruebas controladas reproducibles, no informes temporales ni fixtures de producción. `WebFindingBoundaryIntegrationTest` es opt-in y debe ejecutarse expresamente; una suite verde que lo omita no prueba Next→BFF→API.

## Evidencia y atribución

| Fuente | Comprobación | Límite |
|---|---|---|
| Entrega Web, 7/oct | 766 pruebas Web controladas; lint/tipos/build; 244 API contra PostgreSQL nuevo, cuatro casos nuevos de persistencia Cliente | No constituye guion completo de navegador ni todas las pruebas históricas financieras |
| F1–F6, implementación | 786 Web en 93 archivos; lint/tipos/build; un caso compuesto real Next/BFF/API/PG; cinco tamaños emulados | Sesiones del helper sintéticas; F3/F4/carreras F5 controladas |
| Revisión independiente, 7/oct | Acepta F1–F6 para pruebas cruzadas: 151 pruebas Web y 14 comprobaciones de trazas; login normal, Perfil, identidad/replay, fronteras privadas, responsive 768/820 | Reutilizó jar de fuentes productivas idénticas; su build API offline quedó bloqueado. No certifica toda la aplicación |
| Financiero previo F04-B/ADMIN, 6/oct | Registros documentan 569 Web, 274 API y navegador real aislado: pérdidas de respuesta, parciales, resolución/permiso y cierre | Evidencia histórica de otro corte; no se suman conteos a la suite actual ni se cierran H05/ambigüedad legacy por inferencia |
| Demo actualizada, 7/oct | 624 archivos comparados, 84 sincronizados; build Web nuevo, cuatro logins normales HTTP y lecturas mínimas; asset servido coincide; DB conserva V1–V27 | API no recompilado: fuentes productivas iguales. No nuevas ventas ni auditoría visual |
| Javier, confirmación comunicada por responsable | **Perfil, mensajes, envío de reservas, flujo de mesa hasta limpieza y diseño móvil** | No atribuir checkout, aislamiento A/B, decisiones de reservas, pago parcial/mixto, conciliación, carreras, Android ni otras comprobaciones específicas |

Los conteos API de distintos cortes no son comparables sin sus opciones, pruebas externas y omisiones. Los logs/capturas/harness permanecen en Temp, fuera del paquete Git. La revisión independiente y el informe de actualización se consultaron en sus directorios autorizados `wok-f1-f6-independent-20261007-193815` y `wok-manual-20261007-100804`; no se copian configuración ni credenciales locales al repositorio. La confirmación de Javier es el alcance comunicado, no una traza nueva inventada. No se ejecutaron suites ni escrituras durante esta preparación documental.

## Contraste con PLAN_TRABAJO por integrante

Responsabilidades del plan del 5/oct (base 3611002); no atribución de autoría de este acumulado. Referencias numéricas: tareas de §8A. Implementación y verificación se separan: «pendiente de prueba» no significa «sin implementar».

| Responsable / tareas | Implementación | Verificación y estado pendiente |
|---|---|---|
| Chan 1–2, 12: inventario/contratos/ausencias | Contratos usados documentados por recorridos; bloqueos administrativos identificados | Parcial: falta matriz exhaustiva de todos los dominios y decisión de operaciones nuevas |
| Chan 3, 9: sesión/permisos/traza | Mecanismos existentes y controles de identidad/permisos reales; auditoría financiera | Parcialmente verificado: login/ownership/negativos sí; rotación concurrente, revocación multi-dispositivo y auditoría exhaustiva pendientes |
| Chan 4–8: estados, transacciones, claves y validaciones | Integrados en contratos existentes y núcleo financiero acumulado | Verificado en pruebas reales/controladas del alcance; fallos físicos, legacy residual y otros dominios pendientes |
| Chan 10–11: migraciones/regresión | V26/V27 y pruebas de migración/rollback presentes | Pruebas históricas aisladas desde limpio/upgrade; falta CI del paquete final y ensayo sobre copia representativa de datos antes de despliegue |
| Barrera 1–7: mesas→cuenta→pedido→cocina→servicio | UI/BFF/API integrados, ampliación e intentos conservados | Javier confirma flujo hasta limpieza; detalle de concurrencia/reintento respaldado por otras pruebas, no atribuido a Javier |
| Barrera 8–9: solicitudes/reservas | Bandeja real, filtros, polling, decisiones/versiones | API/BFF y revisión focalizada verificados; guion cruzado completo de decisiones en demo pendiente |
| Barrera 10–12: errores, accesibilidad, pruebas | Carga/error/conflicto/identidad y pruebas presentes | F1–F6 aceptados; carreras de desmontaje/filtros verificadas controladamente. Teclado/lector/touch completos pendientes |
| Antony 1–6: catálogo/carrito/checkout/seguimiento | API real y aislamiento; borrador local distinto de solicitud persistente | Pruebas controladas/reales parciales; guion completo de checkout y doble usuario en demo pendiente |
| Antony 7–9: reservas/mensajes/perfil | Operaciones existentes conectadas, teléfono ausente normalizado, polling | Javier confirma Perfil/mensajes/envío de reservas; API real y revisión prueban otros casos. No atribuir cancelación/decisión a su prueba |
| Antony 10–12: sesión, UX/pruebas | Infraestructura existente, identidad/generación y logout estrecho | Diseño móvil confirmado por Javier; responsive emulado y tests aprobados. Expiración exhaustiva y accesibilidad completa pendientes |
| Tomy 1–14: Cliente nativo | App Expo preexistente; ningún cambio móvil en esta entrega | Pendiente revisar/completar lo existente y probar Android físico, SecureStore/rotación, incertidumbre, suspensión, paquete y distribución. No se afirma ausencia de implementación previa |
| Beto 1, 3–4: administración | Usuarios/roles soportados y catálogo consultable | Parcialmente verificado; mantenimiento catálogo y CRUD general bloqueados por contratos ausentes |
| Beto 5–9, 14: pagos/caja | Totales/saldo, intentos durables, cobro/caja/resolución ADMIN integrados | Pruebas históricas reales y regresión focalizada disponibles; conciliación/pagos mixtos completos y revisión financiera de publicación aún necesarios |
| Beto 2, 10–13: datos/reportes/inventario/fiscal | Datos ficticios, capacidades previas y módulos fuera de alcance conservados | Pendientes datos aprobados/importación, reportes persistentes, alcance inventario y certificación fiscal externa; no inventar operaciones |
| Fernando 2, 4–6, 9, 12–13: configuración/transporte/integración | BFF limitado, controles shared, entorno aislado y matriz actual de entrega | Verificado en alcance; guías nominales antiguas requieren coordinación. Renovación completa/compatibilidad remota no demostradas |
| Fernando 1, 3, 7–8: reproducibilidad/CI/browser | CI y herramientas existentes, builds previos y demo actualizada | Parcialmente verificado: CI remoto del acumulado y automatización explícita del test opt-in pendientes; no se instalaron dependencias en esta preparación |
| Fernando 10–11, 14: respaldo/despliegue/soporte | Instrucciones y límites del arranque documentados | Pendiente backup/restauración demostrada, reversión compatible con V26/V27, soporte y aceptación de piloto; no autoriza producción |

Android, pasarela online, facturación fiscal, procedimiento de reparto, inventario del piloto, datos aprobados, dispositivos/distribución y fecha de piloto siguen sujetos al plan/decisiones externas. IA/cámaras quedan fuera. No se sustituyen módulos demostrativos ajenos ni se usa fixture como fallback productivo.

## Riesgos de publicación y condiciones de salida

Inventario inicial: 110 tracked modificados + 123 untracked; index vacío. Clasificación individual en manifiesto: 230 candidatos necesarios, un generado temporal, un informe histórico ajeno y una matriz histórica de origen incierto. El financiero previo es necesario aunque no sea autoría del último encargo. La procedencia exacta de cada línea preexistente no se inventa; su inclusión se justifica por dependencia/alcance, no solo por estar dirty.

Análisis de patrones sobre los 233 archivos sin abrir .env*: ningún patrón de token/clave privada encontrado. La única coincidencia de posible credencial literal en WebFindingBoundaryIntegrationTest:128 es un falso positivo: construcción del header Cookie con un prefijo y la variable de sesión emitida por el helper, no un token incrustado. Las 35 coincidencias de correo están en tests/smoke con identidades ficticias; no se encontraron coincidencias de correo en código productivo del delta. Diez referencias de rutas locales aparecen en registros de progreso: referencias de evidencia no portable, no archivos a adjuntar. Este análisis de patrones no garantiza detectar cualquier secreto. No copiar logs, dumps, capturas ni harness de Temp al PR.

`.gitignore` excluye .env/.env.*, claves/certificados, dependencias, .next, dist/build, cobertura y logs; `apps/api/.gitignore` excluye target. Verificado mediante check-ignore. Dos .env.example preexistentes están tracked por excepción explícita; no se leyeron ni entran en staging. `next-env.d.ts` está tracked y su delta solo cambia rutas dev/build generadas: dejarlo fuera, sin revertirlo. `*.dump` no tiene exclusión general comprobada; no hay dumps candidatos. Si se desea excluir dumps o dejar de trackear next-env, proponer y autorizar aparte; no se modificó Git ni .gitignore.

Antes de autorizar publicación:

1. Revisar la lista exacta y los hunks, en especial núcleo financiero/smoke/migraciones; comprobar que solo contiene fixtures ficticios y ninguna configuración personal. Autorizar expresamente el acumulado, no un add global.
2. Actualizar referencias remotas mediante una operación Git autorizada futura; comprobar de nuevo colisiones y número disponible V26/V27. No alterar scripts ya aplicados para resolver conflictos. Ver [estrategia](PR_PROPOSAL.md).
3. Ejecutar CI sobre la rama final: Web tests/lint/tipos/build, API verify, migraciones/SQL y smoke aislados. Revisar omisiones de Docker y ejecutar explícitamente WebFindingBoundaryIntegrationTest. Repetir solo lo afectado por conflictos o cambios nuevos; esta tarea documental no justifica otra auditoría completa.
4. Revisar aceptación financiera histórica y hallazgos pendientes (H05/ambigüedad legacy y demás no cerrados). F1–F6 no son autorización financiera productiva. Acordar si son límites aceptados del PR de pruebas o bloqueos de uso general.
5. Adjuntar una síntesis sanitizada y accesible de evidencia independiente/financiera si los revisores no tienen acceso al equipo local; no adjuntar Temp entero. Completar checkout/decisiones/caja cruzados no confirmados por Javier para ampliar la aceptación, sin atribuciones retroactivas.

Para despliegue/piloto se requieren además datos aprobados, backup restaurado, ensayo de migración/reversión y decisiones externas. Las carreras browser F3/F4 y una pestaña de build antiguo son ampliaciones de evidencia recomendadas por el revisor, no bloqueos nuevos para pruebas cruzadas. Servicios, bases y demo permanecieron intactos. No se hizo staging, commit, push, merge ni cambio de rama; el trabajo termina para autorización.

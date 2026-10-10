> Historical review: see COMBINED_CANDIDATE_STATUS.md and COMBINED_TEST_RESULTS.json for the newer combined candidate and verification.

# Revisión actual de integración PR32–PR50

Consulta GitHub realizada en esta sesión, después de `git fetch origin`. Los estados remotos pueden cambiar: verificar de nuevo estos SHA antes de ejecutar la integración. Este documento propone el siguiente candidato; no declara integrado ni probado ese conjunto nuevo.

## Bases y preservación

- development actual: `1339d740320741050b1131dd9880491d1adffefc`, contiene PR33 y PR36.
- Candidato local: rama `codex/integration-pr32-40`, HEAD `bbcb773b7f19804d54d04e69bc2d2410e46364a2` de PR39, con correcciones sin commit. Sus 62 archivos registrados conservaron exactamente sus SHA256 al iniciar esta revisión.
- Ancestro común entre development y PR39: `9eab32352b33adc0d4b6a77f6ebee21e9724ed98`. Divergencia: 7 commits exclusivos de PR39 y 18 de development.
- No mover ni sobrescribir el candidato probado. Materializar el siguiente candidato en otra rama `codex/` y checkout separado desde development, preservando previamente la identificación de cada delta local mediante el manifiesto existente. Mantener la copia original, stash y despliegue persistente intactos.

## Selección por funcionalidad

| PR | SHA actual | Estado / tratamiento propuesto |
|---|---|---|
| 32 | 9997cf0e5bc9d7be1607c00a1581c27da9bd5e36 | Cerrado sin merge. Inventariar únicamente cambios exclusivos solicitados; no reabrir automáticamente. |
| 33 | 4b25f3be9c6c9158af998b321f60f319a1580ca6 | Fusionado; base existente. |
| 34 | c55e07c9ee5ee89afe9d7e317241f2cb43bf42e0 | Cerrado sin merge; rollback excluido del candidato compatible. |
| 35 | 01f1143545f0f9b73658cbb7d0000d912a6056ff | Consultar sucesor 47 y correcciones locales; no importar V26 alternativa. |
| 36 | fb243d68f208122bd3c8ce4588cf00ec37327d23 | Fusionado en development; conservar implementación móvil y adaptar contratos canónicos. |
| 37 | 6df0ed4cebf1f20617796a47908959635f7488e6 | Ancestro confirmado de 39; no integrar nuevamente. |
| 38 | 2768be3f39394ad8d6b55dc6e37c816a89c95f35 | Consultar sucesor 48; aceptación DELIVERY todavía requiere completar reglas. |
| 39 | bbcb773b7f19804d54d04e69bc2d2410e46364a2 | Fuente funcional principal web y financiera; reconciliar con development actual. |
| 40 | b39fb08719cef235bc087dfef87fadfaabdc264d | Preferir sucesor 49 y adaptación local protegida, sin segundo perfil. |
| 41 | bfffad537a952c0758925b05bbaa51d1ce8eba72 | Incorporar capacidades administrativas y aportes exclusivos, reconciliando BFF de usuarios ya existente en 39. |
| 42 | cdea8b363f34a8b96ea3a00017a94a77b1bab4c5 | Documentación de bloqueo del menú; no representa implementación funcional. |
| 43 | 7a9189e5497c178cb54d5c80f5ce6329f84e57ed | No sustituir caja/pagos de 39. Extraer aportes exclusivos comprobados contra sus contratos financieros. |
| 44 | 3d3c70ab8975d5afe1ba1dda4772067de266340d | Inventario/producción: candidato a incorporación después de validar API, permisos e historial de recetas. |
| 45 | 5b9c80fd160f5f0f215814d5665232f2fdf752f1 | Incorporar dashboards y capacidades; conservar BFF de pedidos de 39. Páginas pendientes siguen pendientes; no ampliar IA/Visión. |
| 46 | ba6187e23111274ec2aac4eaffef9734bc0f04b2 | Next 16.3.8 ya está en 39, junto con eslint-config-next 16.3.8. Lockfiles no idénticos: revisar diferencias residuales y auditoría del conjunto, sin reemplazar el lock. |
| 47 | 786a807f3a820c7c6555c2f16d9d1244f31c3759 | Reconciliación 35; parte ya adaptada localmente. Su V28 requiere inventario de despliegues/reservas, no aprobación implícita de versión. |
| 48 | 00ad174ae0149d7acb2ca68e4bf3ef4d8163096f | Contiene íntegramente 47 por ascendencia. Extraer delta delivery; no aplicar 47 y 48 completos por separado. |
| 49 | e96780cbf9e0fac9ebaa861bc09142b9cffe0927 | Parte de 39, dos commits nuevos. Direcciones/sesiones y selector de dirección delivery; mantener bloqueos de concurrencia y aislamiento de identidad del candidato local. |
| 50 | 1164f2cccc61dcc64832d5fc82bd58fb0a2edd7b | Parte de development actual, dos commits nuevos. Aislamiento de formulario por propietario/sesión, cola de almacenamiento nativo y reintentos exactos. Adaptar política de minutos del candidato a la UI móvil 36/50. |

## Conflictos comprobados

`evidence/CURRENT_MERGE_TREE_REVIEW.json` registra pruebas textuales de tres vías entre commits, sin cambiar ramas ni archivos de código. No incluye el delta local sin commit ni demuestra compatibilidad semántica del conjunto.

- PR39 + development: conflictos en `apps/web/package.json` y `package-lock.json`. Resolver manifests de cada workspace primero y generar un lock coherente; conservar las correcciones de seguridad de 39 y dependencias Expo de 36.
- PR39 + 47/48: conflictos en controlador de solicitudes, cierre de mesas y pruebas. Mantener un único mapping y controles financieros de 39; adaptar detalle/filtros, reservas e idempotencia ya corregidos localmente.
- PR39 + 41: rutas BFF de usuarios/roles y prueba de gestión; integrar capacidades sin duplicar gestión de usuarios.
- PR39 + 43: 11 archivos de código/pruebas de caja/pagos más documentación. Una resolución textual no basta: conservar intentos de pago, reemplazo/resolución, saldo y prohibición de cierre con intentos pendientes.
- PR39 + 44: único conflicto textual en documentación. Esto permite priorizarlo, pero no demuestra permisos, historial de recetas o compatibilidad de API.
- PR39 + 45: BFF de pedidos, inicio cliente y documentación. Conservar las mutaciones existentes; añadir lectura de dashboard sin convertir el BFF de pedidos en una implementación alternativa.
- PR49 modifica el mismo perfil y endpoint compartido que el candidato; portar selectivamente selector de direcciones y pruebas. Su código utiliza estado `busy` para mutaciones: conservar los locks síncronos y reinicio por generación que ya están probados localmente.

## Contratos que preceden las escrituras

1. Bandeja: un solo `GET /api/v1/operational/order-requests`, permiso `orders:manage`, intersección de filtros `status` y `fulfillmentType`, enums exactos y 400 para inválidos, máximo 50, orden estable. Mantener DTO completo de 39 y detalle `GET /{id}` de 35. No duplicar controller/mapping ni perder líneas, moneda, contacto, referencia o preferencia de pago.
2. Perfil: LiveProfile protegido de 37/39 como única base. Campos opcionales normalizados, propietario validado en BFF/API, aislamiento por identidad antes/después de cada respuesta, versiones de dirección y DELETE 204. Direcciones guardadas no acreditan teléfono verificado ni sustituyen autorización logística.
3. Migraciones: V26 financiera y V27 existentes permanecen inmutables y dependientes. La base local consultada tiene V1–27 y checksums coincidentes. No se conoce inventario completo de despliegues ni reservas: asignación definitiva y despliegue de trazabilidad siguen bloqueados. SQL propuesto fuera de Flyway permite revisar funcionalidad sin inventar V28 libre.
4. Reservas/PICKUP: configurar zona, ventanas y anticipación en servidor; preservar minutos exactos (120 + 15 por pareja adicional sobre cuatro en mismo día), replay histórico y cancelación PICKUP limitada por propietario/tipo. PR50 debe consumir el contrato de minutos, sin reintroducir redondeo de horas ni revalidar como nueva una solicitud incierta.
5. DELIVERY: PR48 verifica capacidad ENABLED, pero eso no acredita teléfono, tarifa humana, ETA de traslado, anticipación máxima o permiso de override tras cutoff. Separar preparación PICKUP de traslado DELIVERY. Completar configuración/permiso y autorización auditada antes de certificar delivery; no fijar valores arbitrarios en vistas.
6. Finanzas: abrir cuenta/pedido → enviar cocina → preparar → registrar y resolver pagos reales → verificar saldo cero e inexistencia de intentos pendientes → cerrar pedido/mesa → conciliar y cerrar caja. Incluir rechazo de cierre prematuro y replay sin doble cobro. Cobro por mensajero es cuenta por cobrar hasta liquidación.

## Responsables propuestos y orden

Estas responsabilidades son una propuesta técnica, no una aceptación ni un mensaje enviado al equipo. Barrezzi12 integra el candidato; Chuansi232 mantiene contratos API, capacidades, inventario y perfil; AVillatoroG17 revisa base web y finanzas; TomyAnva mantiene móvil, BFF y PR50. Migraciones necesitan además responsable del despliegue con acceso autorizado.

Un solo escritor en la rama candidata: Barrezzi/integrador. Los demás preparan parches en ramas distintas, con SHA congelado; no escriben simultáneamente sobre la misma rama ni sobre el checkout compartido. Rutas/controllers, manifests/lockfile y documentación común se reconcilian secuencialmente por el integrador.

Orden: development actual → delta exclusivo 39 y correcciones locales → PR50 adaptado → aportes exclusivos 49 → reconciliación 47/48 sin migración activa → capacidades 41 → inventario/producción 44 → dashboards 45 → residuos útiles 43 y auditoría 46. Consolidar documentación 42 y estados finales al cerrar cada etapa. No ejecutar merge de ramas antiguas como sustituto de esta reconciliación.

## Comprobaciones obligatorias

- Congelar commit base, commits fuente y manifiesto del candidato combinado; verificar diff sin secretos ni cambios al despliegue persistente.
- Instalar con lock único; verificar auditoría de producción, lint, types, build web y pruebas de todos los workspaces afectados.
- API/BFF reales: multirol como unión, registro sin roles operativos, permisos negativos y propiedad; único mapping, filtros/detalle; replay entre cuentas; reservas vencidas/capacidad y reintentos inciertos; sesiones cruzadas, revocación, direcciones/versiones/204 y auditoría.
- Finanzas y smoke sobre el mismo candidato: cocina, pago parcial/total, transferencias, intentos pendientes/reemplazados, replay, cierre de cuenta/mesa/caja. DELIVERY requiere smoke adicional con política y autorización completas.
- Inventario: compra no equivale a entrada; recetas conservan versiones; producción y movimientos auditados. Capacidades/dashboards deben representar bloqueos reales y no aparentar IA/Visión implementada.
- Flyway fresco y actualización con historias autorizadas; no alterar checksum de V26/V27 ni aplicar trazabilidad hasta resolver versión y despliegues.
- Pruebas móviles de cambio de sesión durante I/O, doble envío, respuesta inválida, timeout/retry y almacenamiento nativo; verificación visual/nativa adicional cuando se incorpore la UI 36/50.

Las 268 pruebas API, 26 BFF, 863 web y 20 móvil del informe previo corresponden al candidato local anterior. No certifican todavía PR41–50 combinados con development actual. Esta revisión solo añade documentación y evidencia; no fusiona, publica ni cierra PR.

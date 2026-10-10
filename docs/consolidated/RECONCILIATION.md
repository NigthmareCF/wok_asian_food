# Reconciliación del candidato para revisión

Development fijo: `1339d740320741050b1131dd9880491d1adffefc`. PR39: `bbcb773b7f19804d54d04e69bc2d2410e46364a2`. Ancestro común: `9eab32352b33adc0d4b6a77f6ebee21e9724ed98`. #37 `6df0ed4cebf1f20617796a47908959635f7488e6` está contenido en #39. El árbol final acumula las fuentes de #39, delta aceptado y core sobre development; no reproduce commits originales ni fusiona ramas.

| Conflicto | Resolución por comportamiento/contrato |
|---|---|
| OperationalCapacityService.java | Fórmula y evaluación del core; conserva el endpoint policy de #36, ampliado con minutos, incremento por grupo y frontera de preorden. La ventana desde00:00 admite solicitudes sujetas a revisión fuera de apertura; no declara una nueva hora de apertura. |
| account.tsx | Conserva formulario, navegación y estado de identidad #36; inserta OTP para el número exacto guardado y admite código internacional explícito. |
| orders.tsx | Conserva historial/detalle y navegación #36; acceso a consentimiento/documentos. |
| reservations.tsx | Conserva selector y borrador #36; añade quote/preorden del carrito y recuperación de clave/cuerpo ligada a sesión. Fallo de recuperación bloquea escrituras nuevas. |
| addresses.tsx | Conserva edición, borrado y versión #36; formato internacional explícito sin agregar país automáticamente. |
| cart.tsx | Conserva lista virtualizada, imágenes, selector, nota de navegación y recuperación #36; payload formal con quote/modificadores, sin enviar automáticamente. |
| delivery.tsx | Conserva diseño e historial/direcciones #36; quote, número internacional, OTP, hora Guatemala y hold formal. |
| features.test.cjs | Conserva pruebas de identidad/transporte/recuperación #36; ajusta expectativa de formato internacional aprobado. |
| apps/web/package.json | Pareja alineada Next/eslint-config-next16.3.8 existente en candidato; resto compatible conservado. |
| package-lock.json | Regenerado con npm, sin edición manual. Todas las versiones/integridades proceden de las dos fuentes. Se usa semilla del candidato para resolver correctamente Next/ESLint en el monorepo. |

Los hunks combinables de pickup, ClientReservationController y pruebas de capacidad se revisaron junto al contrato. La allowlist del BFF admite rutas Cliente concretas para quotes, OTP, delivery, direcciones, sustituciones, solicitudes de cambio y documentos PREBILL/RECEIPT. No admite Operativo/Admin, COMMAND, un proxy arbitrario ni métodos ajenos al contrato. Se conserva BffSecurity y su autorización mediante perfil Core, límites, origen, cookies y errores sanitizados.

El core móvil usa el tema #36, valida vigencia/owner/contenido del quote y conserva cuerpo/clave inciertos. Documentos incluyen solicitudes pickup y delivery aceptadas. La preorden no se convierte automáticamente en pedido.

Cadena local: V1–V27 y V56 preservadas, seguidas de V57–V60 provisionales. No V36 equivalente, renumeración, repair, baseline ni out-of-order. Development Git no acredita historial de despliegue; promoción compartida requiere coordinación.

Pruebas del reconciliado: API322 sin omisiones (incluidas migraciones limpio/upgrade, financiero/F1–F4 y procesos reales Web/móvil/BFF), BFF32, Web902, móvil73; tipos/lint, build Web y export Android. No acreditan auditoría independiente, revisión visual ni Android físico. OTP real, resolución de diferencias pagadas y promoción de migraciones siguen bloqueados. P1 permanece separado. Sin commits/publicación.

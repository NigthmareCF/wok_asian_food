# Plan de conexiones pendientes: frontend y backend

Fecha de referencia: 2026-10-02.
Repositorio: https://github.com/NigthmareCF/wok_asian_food.git
Rama de trabajo: `feature/frontend-backend-integration`.
PR existente hacia `development`: https://github.com/NigthmareCF/wok_asian_food/pull/23
Commit de referencia de la integración inicial: `639ff8c`.

## 1. Objetivo y alcance

Continúa la integración del frontend web con el backend existente, partiendo de la versión más reciente de la rama indicada. Conserva las pantallas, diseño, navegación, reglas de negocio y funcionalidades que ya existen.

Trabaja una sección a la vez. Termina su integración, comprueba su funcionamiento y presenta resultados antes de pasar a la siguiente. No ejecutes todas las etapas en una sola entrega.

Este documento autoriza el trabajo de conexión cuando el usuario lo invoque para ejecutarlo; su creación no significa que las etapas pendientes se hayan implementado.

### Qué significa conservar lo creado

- No rediseñar pantallas ni reemplazar módulos completos.
- Reutilizar componentes, estilos, formularios y arquitectura existentes.
- Permitir únicamente el cableado mínimo del frontend: apuntar llamadas a endpoints existentes y asignar sus datos a los componentes y acciones actuales. No cambiar diseño, estructura, navegación ni lógica funcional.
- Mantener el comportamiento de las integraciones que ya funcionan.
- No hacer refactorizaciones generales, actualizaciones de dependencias o cambios de nombres ajenos a la integración.
- No cambiar esquemas, migraciones, contratos del backend, estados comerciales, precios o permisos para conseguir que una pantalla parezca funcionar.
- Está prohibido crear APIs, endpoints, rutas BFF nuevas, servicios de backend o migraciones. Tampoco modificar el backend existente. Si el contrato no permite conectar una acción tal como está diseñada, reportarla como bloqueada y no implementar una alternativa.
- No simular éxito, pagos, disponibilidad, confirmaciones ni transiciones que el servidor no haya persistido.

Conectar implica modificar únicamente las referencias de llamadas y el enlace de datos del frontend. Esto no autoriza reescribir componentes ni cambiar su lógica. Si la instrucción se interpreta como no editar absolutamente ningún archivo, limitarse a auditar: una conexión que no existe no puede implementarse sin algún cambio de cableado.

## 2. Actualizar y trabajar desde la rama creada

Ejecutar los comandos desde la raíz real de `wok_asian_food`, no desde su carpeta contenedora.

1. Leer `AGENTS.md`, `apps/web/AGENTS.md`, `docs/frontend/TEAM_GUIDE.md`, las guías del canal y sus documentos de progreso.
2. Verificar repositorio, remoto, rama, cambios locales y operaciones Git pendientes:

   ```powershell
   git rev-parse --show-toplevel
   git remote -v
   git status --short --branch
   git branch -vv
   git fetch origin
   ```

3. Confirmar que `origin` corresponde al repositorio indicado.
4. Con el árbol limpio, seleccionar la rama existente:

   ```powershell
   git switch feature/frontend-backend-integration
   ```

   Si no existe localmente y sí existe en remoto:

   ```powershell
   git switch --track origin/feature/frontend-backend-integration
   ```

5. Comparar antes de actualizar:

   ```powershell
   git log --oneline HEAD..origin/feature/frontend-backend-integration
   git diff --stat HEAD...origin/feature/frontend-backend-integration
   git rev-list --left-right --count HEAD...origin/feature/frontend-backend-integration
   ```

6. Si la actualización es un avance directo y el árbol está limpio:

   ```powershell
   git pull --ff-only origin feature/frontend-backend-integration
   ```

7. Si hay cambios locales, divergencia o conflictos, conservarlos y explicar el estado antes de hacer una operación que los mueva o reescriba. No ejecutar reset, clean, descarte de archivos, force-push ni rebase automático.
8. Continuar en `feature/frontend-backend-integration`. No partir de `production`, no crear una rama paralela y no sustituir esta base por `development`.
9. Revisar diferencias relevantes con `origin/development` sin integrarlas automáticamente. La rama remota `feature/operational-flow-tables-orders-kitchen` también debe revisarse antes de implementar esas áreas para detectar trabajo existente; su incorporación requiere resolver explícitamente el alcance.
10. No hacer commit, push, merge ni cerrar el PR por ejecutar este plan sin una instrucción explícita de publicación para los cambios nuevos.

Nota: al crear este documento había un cambio local generado en `apps/web/next-env.d.ts`, excluido del commit anterior. Verificar su estado actual y no descartarlo automáticamente. Tampoco aplicar ni eliminar stashes previos.

## 3. Integraciones existentes que deben preservarse

| Área | Comportamiento ya conectado |
| --- | --- |
| Acceso | Inicio de sesión, sesión del usuario y acceso por rol. |
| Menú | Catálogo, categorías y precios desde la API pública. |
| Carrito | Productos del catálogo real y consulta de precios; borrador guardado en la pestaña, no carrito persistido en backend. |
| Solicitudes para recoger | Creación idempotente, historial, detalle y cancelación de pendientes. |
| Delivery cliente | Solicitud con dirección, teléfono y preferencia de pago; historial y detalle. |
| Reservas cliente | Solicitud, historial y cancelación de pendientes. |
| Mensajes cliente | Apertura de conversación, consulta y envío persistido. |
| Mensajes operativo | Bandeja compartida, lectura y respuesta del personal. |

La integración anterior registró 368 pruebas aprobadas en 55 archivos, lint, TypeScript y build Docker correctos. Es una referencia histórica: verificar el estado actual al iniciar.

Las solicitudes pickup/delivery no son pedidos aceptados ni pagos. Las reservas requieren revisión. Los mensajes se actualizan manualmente. No afirmar que estas capacidades ya completan todo el ciclo operativo.

## 4. Inventario obligatorio antes de cada sección

Revisar rutas activas, componentes, hooks, proveedores, fixtures utilizados en producción, controladores, DTO, servicios y pruebas del backend.

Preparar una matriz breve:

| Pantalla / acción | Fuente actual | Endpoint y método | Rol | Contrato y estados | Trabajo necesario | Prueba |
| --- | --- | --- | --- | --- | --- | --- |
| Completar con evidencia del código | API / fixture / estado local | Ruta verificada o ausente | Rol real | Campos, límites, versión e idempotencia | Adaptación mínima o bloqueo | Resultado observable |

No considerar pendiente una integración solo porque existe un archivo de fixtures: comprobar si la ruta activa realmente lo utiliza. Tampoco asumir cobertura completa porque exista un controlador con nombre parecido.

## 5. Orden de ejecución

### Etapa 1 — Reservas operativas

- Conectar la vista existente con `GET /api/v1/operational/reservations/pending`.
- Conectar confirmar/rechazar con `PUT /api/v1/operational/reservations/{reservationId}/decision`.
- Respetar motivo, decisión y `expectedVersion` exigidos por el contrato.
- Refrescar ante conflictos; no sobrescribir una decisión tomada por otro operador.
- Probar: cliente solicita → operativo revisa → cliente consulta el resultado.
- Revisar por separado agenda, detalle, creación operativa y recepción: la API de pendientes/decisión no demuestra que todas esas acciones estén disponibles.

### Etapa 2 — Mesas

- Conectar listado, creación y apertura/cierre mediante `/api/v1/operational/tables`.
- Relacionar correctamente mesa, atención y cuenta según el contrato real.
- Verificar disponibilidad de endpoints para agrupación, traslado y otras acciones visibles.
- Probar persistencia tras recargar y conflictos cuando dos operadores actúan sobre la misma mesa.

### Etapa 3 — Pedidos y cocina

- Conectar listado, detalle, creación y cambios de estado con `/api/v1/operational/orders`.
- Conectar tickets, carga, toma de ticket y cambios de estado con `/api/v1/operational/kitchen`.
- Respetar cuenta requerida, identificadores, importes calculados por servidor, versiones y transiciones.
- Probar: abrir atención → crear pedido → aparece en cocina → preparar → listo → estado visible para operación.
- No inventar una relación entre solicitud online y pedido: conectar únicamente la relación que ya exponga una API existente. Si falta, documentar el bloqueo sin desarrollar backend.

### Etapa 4 — Solicitudes online y delivery operativo

- Auditar la bandeja existente de solicitudes y las vistas de delivery.
- Verificar soporte para listar solicitudes pickup/delivery, aceptarlas, rechazarlas y convertirlas en pedidos.
- Verificar asignación, despacho, entrega, costos, cobertura y cancelación de delivery.
- Conectar el seguimiento del cliente con los estados reales disponibles.
- En la revisión inicial no se encontró el flujo completo de aceptación/conversión/entrega. Confirmarlo en la rama actual.
- Si faltan endpoints, documentar las acciones sin soporte y detener las acciones dependientes; no crear endpoints. No reutilizar rutas de pickup para atribuir a delivery capacidades no definidas.
- Prueba final de esta etapa, cuando exista soporte: cliente solicita → operativo acepta/rechaza → pedido o rechazo persistido → cliente ve el resultado.

### Etapa 5 — Perfil, direcciones y sesiones del cliente

- Revisar y conectar `/api/v1/client/profile`, `/api/v1/client/addresses` y `/api/v1/client/sessions`.
- Integrar selección de dirección guardada con el formulario de delivery sin romper la entrada manual.
- Sustituir datos simulados del inicio del cliente por información real cuando haya contrato.
- Revisar rutas de detalle/configuración de productos que sigan activas: conectar opciones solo si el catálogo/API las soportan.
- Probar aislamiento entre dos clientes, validaciones, persistencia y revocación de una sesión de prueba.

### Etapa 6 — Usuarios, roles y servicios

- Conectar capacidades disponibles de `/api/v1/admin/users`, incluida asignación de roles.
- Conectar lectura/actualización de `/api/v1/admin/service-capabilities` y lectura pública de `/api/v1/public/service-capabilities`.
- Revisar edición de usuarios, administración de permisos, personal, horarios y ajustes: el backend actual solo cubre parte de las pantallas.
- No convertir controles visuales en autorización; el servidor debe comprobar cada acción.
- Probar con cuentas demo de roles distintos. No cambiar permisos de usuarios reales para probar.

### Etapa 7 — Administración del menú

- Revisar endpoints de categorías, productos, precios, publicación, disponibilidad y opciones.
- La lectura del menú público ya existe; no equivale a una API administrativa.
- Conectar las acciones que tengan soporte. Documentar las demás.
- Prueba: modificación autorizada sobre producto de prueba → catálogo público refleja el cambio → carrito valida el precio vigente.

### Etapa 8 — Caja y pagos

- Inventariar contratos de precuenta, cobro, saldo, cierre y devolución.
- No confundir una preferencia de pago con una transacción.
- En la revisión inicial no se encontraron controladores suficientes para estos procesos.
- Si se requiere una pasarela, separar la decisión de proveedor/configuración del trabajo de conexión. Usar exclusivamente sandbox para pruebas.
- Prueba futura: cobro de prueba → saldo actualizado → cierre consistente → reintento sin cobro duplicado.

### Etapa 9 — Inventario, compras y producción

- Revisar existencias, movimientos, recetas, proveedores, compras, lotes y consumo relacionado con pedidos.
- Conectar únicamente contratos existentes; registrar como bloqueada cualquier acción que necesite backend nuevo.
- Probar con datos identificados de prueba y verificar consistencia de cantidades y movimientos después de recargar.

### Etapa 10 — Reportes y funciones restantes

- Inventariar dashboards, reportes, clientes administrativos, auditoría, ubicación/horarios, IA y cámaras.
- Los resúmenes deben derivarse de información persistida, no de contadores inventados.
- No tratar IA, cámaras, servicios externos ni realtime como una simple conexión si no existe implementación.
- Dejar cada capacidad clasificada: integrada, parcialmente integrada o bloqueada por contrato/servicio ausente.

## 6. Forma de implementar

- Rutas de App Router para composición; lógica de negocio dentro del módulo correspondiente.
- Reutilizar exclusivamente los BFF, validadores y patrones de sesión existentes. No crear rutas BFF nuevas ni modificar contratos de APIs. Si no existe un transporte seguro para una acción, reportar el bloqueo.
- Tokens y credenciales solo en servidor; no guardarlos en localStorage ni exponerlos al cliente.
- Conservar las validaciones existentes de origen, parámetros, cuerpo y respuesta; no omitir controles para forzar una conexión. Usar solo endpoints y métodos existentes y verificados.
- Mantener al backend como autoridad sobre propiedad, permisos, precios, disponibilidad y estados.
- Conservar claves y cuerpo para reintentos idempotentes; evitar doble envío.
- Respetar versiones o bloqueos de concurrencia exigidos por la API.
- Reutilizar los estados existentes de carga, vacío, error y recuperación de sesión sin eliminar el trabajo del usuario. Si falta un comportamiento necesario y requiere modificar la lógica, registrarlo como limitación.
- Sustituir datos simulados solo en las rutas integradas. No borrar fixtures todavía usados por pruebas o pantallas fuera de la sección.
- No cambiar archivos sensibles, .env, credenciales ni configuración de infraestructura sin explicar previamente el cambio necesario.
- No usar escrituras directas en base de datos para sustituir endpoints durante la integración o demostrar que una acción del frontend funciona.

## 7. Criterios de aceptación por sección

Una sección se considera terminada solo cuando:

- [ ] Sus acciones acordadas utilizan las APIs reales y el servidor persiste el resultado.
- [ ] La pantalla conserva diseño, navegación y acciones existentes dentro del alcance.
- [ ] Los cambios siguen visibles tras recargar y desde el otro rol involucrado.
- [ ] Se comprueban permisos, acceso a registros ajenos y sesión expirada.
- [ ] Se prueban validaciones, errores y reintentos; concurrencia cuando aplique.
- [ ] Se comprueba que las integraciones anteriores afectadas siguen funcionando.
- [ ] Se revisan 390, 768, 1280 y 1440 px, teclado y controles táctiles.
- [ ] Pasan lint, TypeScript, pruebas pertinentes y build. Si hay fallos previos, se documentan sin ocultarlos ni atribuirlos al cambio.
- [ ] Docker ejecuta la versión probada y se verifica el recorrido real en navegador.
- [ ] Se registran resultados en `docs/progress/<CHANNEL>.md`.

Comandos habituales desde la raíz; confirmar scripts y archivos en la versión actual:

```powershell
npm run lint
npm run typecheck
npm run test
npm run build:web
docker compose -f docker-compose.yml -f infra/compose.dev.yml --profile dev up -d --build web
```

No ejecutar cobros, despachos ni mensajes a destinatarios externos reales como prueba. Usar cuentas y registros demo identificados. Registrar qué datos quedaron y su estado final; cancelar mediante la API cuando exista soporte.

## 8. Si falta backend

No declarar completada la sección ni crear una simulación nueva. Entregar:

1. Pantalla y acción afectadas.
2. Evidencia del contrato ausente o insuficiente.
3. Endpoint existente revisado, incompatibilidad concreta o ausencia de soporte. No implementar un contrato nuevo.
4. Reglas de negocio o decisiones que requieren definición.
5. Qué parte sí se pudo conectar y probar.

No crear servicios, APIs, rutas BFF, migraciones ni reglas nuevas. No modificar el backend ni resolver incompatibilidades cambiando la lógica o el diseño del frontend. Dejar documentado el bloqueo y continuar únicamente con conexiones independientes dentro de la sección que sí sean posibles con lo existente. Cualquier ampliación exige una instrucción posterior y explícita del usuario.

## 9. Entrega al terminar cada sección

Informar brevemente:

- Rama y commit remoto usados como base.
- Sección conectada y comportamiento verificado.
- Archivos modificados y motivo de cada grupo de cambios.
- Endpoints utilizados.
- Pruebas ejecutadas y resultados reales.
- Estado de datos de prueba.
- Limitaciones o bloqueos.
- Siguiente sección propuesta.

No declarar “todo conectado” mientras existan rutas activas dependientes de fixtures o acciones sin backend. Las funciones sin soporte existente quedarán pendientes: este documento no autoriza desarrollar ni modificar APIs para completarlas.

**Primera ejecución: actualizar de forma segura desde `origin/feature/frontend-backend-integration`, auditar y completar únicamente Reservas operativas. Entregar sus resultados antes de continuar.**

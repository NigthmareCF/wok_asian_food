# Navegacion y sesion Web

## Entrega

- Rama de correcciones: `fix/web-navigation-session`.
- Base local: `integration/security-e2e-preview`, commit `8895c81`.
- Esta base combina cambios de Cliente, Administrativo, backend operativo, dependencias y acceso Web por roles que aun no estan todos en `development`. Un PR hacia `development` incluye esos antecedentes; actualizarlo cuando se integren las ramas pendientes antes de aprobar su merge.

## Comportamiento corregido

- Login respeta el destino privado solicitado, siempre que los roles obtenidos de la API permitan abrirlo. Destinos externos o de otro canal se sustituyen por el inicio autorizado.
- El login completa la cookie del servidor antes de cargar la pantalla privada. Las paginas publicas reconocen la sesion y muestran acceso a Mi espacio.
- El carrito valida los datos al recuperarlos y conserva productos, opciones y servicio en `sessionStorage` de la pestana. Se elimina al cerrar la sesion correctamente.
- Registro, verificacion, reenvio y recuperacion de clave usan endpoints existentes de Spring por un BFF del mismo origen. No se devuelve exito local cuando falla la API.
- Al llegar a login con un acceso vencido, se intenta renovar mediante una cookie HttpOnly. Se conserva la preferencia Recordar sesion. Web Locks serializa la renovacion entre pestanas y se evita duplicarla con React StrictMode.
- Logout elimina la cookie de renovacion con su ruta original. Si falla el BFF, informa el error y permite reintentar.
- Reservas, Mensajes y Ubicacion abren sus pantallas directamente desde Inicio de Cliente.
- Spring valida la fecha de creacion de la sesion frente a la fecha de invalidacion de la cuenta, conservando precision de BD. Esto permite iniciar sesion inmediatamente tras recuperar la clave y mantiene invalidadas las sesiones anteriores.

## Verificacion

- Suite Web: 279 pruebas aprobadas en 44 archivos; lint, TypeScript y compilacion de produccion aprobados.
- Suite Maven con 88 pruebas, incluidas sesiones nuevas en el mismo segundo de un cambio de clave y rechazo de sesiones anteriores.
- HTTP real contra BFF, API, PostgreSQL y Mailpit: registro, correo, verificacion, login, renovacion con acceso expirado, recuperacion y login inmediato, logout y eliminacion de cookies.
- Renderizado HTTP con sesion del rol correspondiente: 14 rutas operativas y 16 administrativas responden 200 y contienen su encabezado principal. Esto no verifica todas las interacciones de cada pantalla.
- Navegador: visitante agrega producto, carrito exige login, login vuelve al carrito, navegar al menu conserva sesion, recargar conserva carrito y acceder a `/admin` como Cliente devuelve al canal Cliente.
- Reserva local: elegir preorden, visitar menu y volver conserva el borrador; Revisar solicitud permite editar de nuevo.
- Revision de pantallas modificadas en telefono y tablet. No equivale a una auditoria exhaustiva de todas las vistas o dispositivos.

## Pendientes de integracion

- Menu y precios siguen siendo fixtures Web; no deben confirmarse importes sin revalidarlos con el backend.
- Checkout, seguimiento, reservas y mensajes del Cliente siguen usando estado local. No crean pedidos ni reservas en PostgreSQL.
- No se implemento una nueva vinculacion de preorden con reserva.
- Perfil y cambio de clave dentro de una sesion conservan su alcance demostrativo. La recuperacion por correo si modifica la clave real.
- Los controles granulares de cocinero, mesero y administrador requieren acordar permisos y enlazar sus vistas a endpoints autorizados. Las pruebas de esta entrega verifican acceso por canal, no todos los permisos de negocio.
- El contenido de una sesion Cliente local se reinicia con una recarga. El carrito persiste solo en su pestana, no entre dispositivos ni al cerrar el navegador.

## Reproduccion local

Con API y Mailpit del entorno aislado ya levantados, ejecutar la Web con `WOK_API_BASE_URL` apuntando al proxy de la API y `WOK_COOKIE_SECURE=false` solamente en localhost. La revision uso la Web en `http://localhost:3001` y API en `http://localhost:8088`.

No guardar contrasenas, codigos, tokens ni archivos `.env` en el PR. Usar cuentas de prueba en una base desechable.

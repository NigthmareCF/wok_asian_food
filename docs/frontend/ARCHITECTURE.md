# Base del frontend web

## Estructura

```text
apps/web/src/
  app/        Rutas, layouts y paginas de Next.js.
  modules/    Funcionalidad por dominio.
  shared/     Componentes, hooks, tipos y utilidades reutilizables.
  data/       Mocks y fixtures temporales.
  providers/  Contextos globales cuando sean necesarios.
  config/     Entorno y navegacion.
```

La decision entre monorepo y repositorios separados sigue pendiente. Web se mantiene autocontenida para admitir ambas opciones.

## Sistema visual

La interfaz usa fondo `#121214`, navegacion `#0F1115`, superficie `#1E1E22`, superficie elevada `#2A2A30`, borde `#343A46`, texto principal `#F5F5F5` y accion principal `#E85930`.

Los estados son: exito verde, advertencia amarilla, informacion azul y error rojo. Todo estado debe incluir texto y no depender unicamente del color.

## Rutas iniciales

- `/login`: acceso.
- `/menu`: catalogo publico.
- `/client`: entrada autenticada de Cliente.
- `/operation`: portal Operativo.
- `/admin`: portal Administrativo.

Las rutas adicionales se agregan en los grupos correspondientes sin duplicar componentes de dominio.

# Flujo Git

## Ramas principales

- `production`: línea estable; no se trabaja directamente en ella.
- `development`: integración mediante PR; no usar para trabajo individual salvo integración autorizada.
- Ramas de trabajo: nacen de `development`, excepto `hotfix/*`, que nace de `production`.

Flujo: rama de trabajo → PR → development → PR de entrega → production.

Este repositorio estaba vacío al prepararlo. Se creó un único commit inicial en
`master`, conservando esa rama; `production` nace de ese punto y
`development` de `production`. Todas las ramas iniciales comparten el commit.
No se eliminan `main` ni `master` si existen.

## Nombres y commits

Código y nombres de ramas en inglés. Usar nombres descriptivos separados por guiones.

Tipos permitidos: `feature/*`, `test/*`, `fix/*`, `refactor/*`, `docs/*`,
`chore/*`, `security/*` y `hotfix/*`.
No crear ramas fix, refactor o hotfix sin una incidencia o tarea concreta.

Commits en español con Conventional Commits, por ejemplo:

- `chore: configura estrategia inicial de branches`
- `docs: documenta flujo de integración`
- `fix: corrige configuración de gitignore`

## Pull requests e integración

1. Actualizar development con `git pull --ff-only origin development`.
2. Crear una rama de trabajo desde development.
3. Hacer commits pequeños y ejecutar lint/tests cuando existan.
4. Publicar la rama y abrir PR hacia development usando la plantilla.
5. Revisar cambios, dependencias y pruebas; resolver conflictos en la rama de trabajo.
6. Integrar tras revisión. Para entregar una versión estable, abrir PR de development hacia production.

No usar reset --hard, clean -fd, pushes forzados, rebase destructivo ni borrado indiscriminado de ramas.
No sobrescribir trabajo existente. Este documento no configura protecciones remotas ni CI.

## Hotfix

Ante una incidencia concreta en producción:

```bash
git checkout production
git pull --ff-only origin production
git checkout -b hotfix/issue-description
# Corregir, verificar, hacer commit y publicar.
git push -u origin hotfix/issue-description
```

Abrir PR hacia production. Después, abrir un PR de production hacia development
para incorporar la corrección a integración. Eliminar la rama temporal solo cuando
esté integrada y no tenga trabajo pendiente.

## Ciclo de vida

Las ramas genéricas iniciales son un mapa para facilitar delegación, no ramas
individuales permanentes. Una rama debe ser preferentemente temporal.

Ejemplo: development → feature/orders-create → PR → development → eliminar rama
tras verificar su integración. Una tarea posterior nace del development actualizado
como `feature/orders-cancel-flow`.

El Scrum Master puede reemplazar ramas genéricas por ramas más específicas cuando
el módulo entre en trabajo activo. Su retirada debe ser selectiva y sin perder trabajo.

## Publicación inicial

Al preparar este repositorio no existía origin: las ramas quedan locales y pendientes
de publicación. El destino indicado es
`https://github.com/NigthmareCF/wok_asian_food.git`; no se configura automáticamente
en esta ejecución. Antes de publicar, configurar y verificar origin e inspeccionar
su historial para no sobrescribir ramas existentes. Publicar production, development
y las ramas del catálogo con seguimiento remoto, sin commits vacíos por rama.

# Contribuir mediante Git

Consultar [el flujo Git](docs/git/BRANCHING.md) y [el catálogo](docs/git/BRANCH_CATALOG.md).
Los comandos con origin requieren que el remoto esté configurado y las ramas publicadas.

```bash
git checkout development
git pull --ff-only origin development
git checkout -b feature/example

# Realizar el trabajo y ejecutar lint/tests cuando existan.
git status
# Revisar archivos y evitar incluir secretos o cambios ajenos.
git add .
git diff --cached
git commit -m "feat: agrega cambio de ejemplo"
git push -u origin feature/example
```

Abrir PR: `feature/example → development`. Completar la plantilla y solicitar revisión.
No trabajar directamente en production. Development se reserva para integración autorizada.
Usar nombres de ramas/código en inglés y Conventional Commits en español.
Las ramas de trabajo son temporales; eliminarlas solo tras comprobar su integración.
Los hotfix nacen en production y se incorporan también a development mediante PR.

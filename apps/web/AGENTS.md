# Reglas de la aplicacion Web

- App Router vive en `src/app` y se usa solo para composicion de rutas y layouts.
- La logica de dominio vive en `src/modules/<module>`.
- `src/shared` no importa modulos de negocio.
- Los datos de desarrollo viven en `src/data/fixtures` y los transportes simulados en `src/data/mocks`.
- Codigo e identificadores en ingles; interfaz y comentarios explicativos en espanol.
- Toda accion principal debe funcionar con mouse, touch y teclado.
- PRIVATE aplica permisos visuales; no representa autorizacion real del backend.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

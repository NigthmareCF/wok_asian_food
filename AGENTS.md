# Contexto del proyecto

WOK Asian Food es un sistema para restaurante. La fase activa implementa el frontend web en `apps/web` para tres contextos: Cliente, Operativo y Administrativo.

## Reglas de trabajo

- Codigo, carpetas, tipos y nombres tecnicos en ingles.
- Textos visibles para usuarios en espanol.
- Para cambios Web, leer tambien `apps/web/AGENTS.md`.
- Usar datos temporales claramente identificados; no integrar APIs ni credenciales sin una tarea aprobada.
- No incorporar secretos, `.env`, claves, certificados ni archivos locales al repositorio.
- Mantener la interfaz responsive para telefono, tablet y escritorio.

## Contextos de interfaz

- Cliente: menu, carrito, checkout, pedidos, reservas, mensajes y perfil.
- Operativo: mesas, pedidos, cocina, reservas, delivery, caja e inventario.
- Administrativo: usuarios, roles, configuracion, reportes y auditoria.

## Git

Trabajar en una rama de tarea, abrir PR hacia `development` y no hacer commits directos en `production` o `development`.

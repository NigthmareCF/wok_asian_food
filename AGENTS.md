# Contexto del proyecto

WOK Asian Food es un sistema para restaurante. La fase activa implementa el frontend web en `apps/web` para tres contextos: Cliente, Operativo y Administrativo.

## Reglas de trabajo

- Codigo, carpetas, tipos y nombres tecnicos en ingles.
- Textos visibles para usuarios en espanol.
- Para cambios Web, leer tambien `apps/web/AGENTS.md`.
- Usar `docs/frontend/TEAM_GUIDE.md` como punto de entrada para el trabajo colaborativo.
- Para trabajo de un canal, leer `docs/frontend/channels/README.md` y la guía específica de Cliente, Operativo o Administrativo.
- Usar datos temporales claramente identificados; no integrar APIs ni credenciales sin una tarea aprobada.
- No incorporar secretos, `.env`, claves, certificados ni archivos locales al repositorio.
- Mantener la interfaz responsive para telefono, tablet y escritorio.

## Contextos de interfaz

- Cliente: menu, carrito, checkout, pedidos, reservas, mensajes y perfil.
- Operativo: mesas, pedidos, cocina, reservas, delivery, caja e inventario.
- Administrativo: usuarios, roles, configuracion, reportes y auditoria.

## Git

Trabajar en una rama de tarea, abrir PR hacia `development` y no hacer commits directos en `production` o `development`.
Los asistentes de IA no deben hacer commit, push o merge sin autorización explícita de la persona responsable.
Los avances relevantes se resumen en `docs/progress/<CHANNEL>.md`; no guardar chats, prompts completos ni razonamientos internos.

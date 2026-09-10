# Guía del equipo frontend

Este documento es la puerta de entrada para colaboradores y asistentes de IA. Resume cómo iniciar, dónde encontrar la fuente de verdad y cómo entregar cambios sin duplicar la documentación especializada.

## Inicio rápido

```bash
npm install
npm run dev:web
```

Abrir `http://localhost:3000`.

Antes de editar:

1. Confirmar la rama activa y que nace de `development` actualizado.
2. Leer `AGENTS.md` y `apps/web/AGENTS.md`.
3. Leer la [guía común](channels/README.md) y la guía del canal asignado.
4. Confirmar con coordinación los IDs de vistas que entran en la tarea.
5. Revisar el mockup y las reglas asociadas; no inferir requisitos faltantes.

## Fuentes de verdad

| Tema                      | Documento                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------- |
| Inicio y comandos         | [`README.md`](../../README.md)                                                     |
| Reglas para personas e IA | [`AGENTS.md`](../../AGENTS.md) y [`apps/web/AGENTS.md`](../../apps/web/AGENTS.md)  |
| Arquitectura              | [`ARCHITECTURE.md`](ARCHITECTURE.md)                                               |
| Responsables              | [`WORKSTREAMS.md`](WORKSTREAMS.md)                                                 |
| Vistas y criterios        | [`channels/`](channels/README.md)                                                  |
| Flujo Git                 | [`BRANCHING.md`](../git/BRANCHING.md) y [`CONTRIBUTING.md`](../../CONTRIBUTING.md) |
| Decisiones y estado       | [`docs/project/`](../project/CURRENT_STATE.md)                                     |
| Avances por canal         | [`docs/progress/`](../progress/README.md)                                          |

Si dos fuentes se contradicen, usar el orden indicado en la guía común de canales y elevar a coordinación cualquier decisión que cambie comportamiento.

## Estado actual

- La fundación Web fue integrada en `development` mediante el PR #2.
- Las vistas actuales usan datos simulados; no prueban correo, autenticación, pagos, persistencia ni permisos reales.
- Existen implementaciones iniciales de `auth` y `menu`. Los demás módulos documentados se crean únicamente al iniciar una tarea concreta.
- Mobile, Desktop, contratos backend y repositorio único frente a repositorios separados continúan pendientes de decisión.

## Estructura de trabajo

```text
apps/web/src/
  app/                         rutas y layouts
    (auth)/                    autenticación visual
    (public)/                  vistas sin sesión
    (private)/(client)/        Cliente
    (private)/(operational)/   Operativo
    (private)/(admin)/         Administrativo
  modules/<domain>/            lógica y componentes de negocio
  shared/                      componentes realmente compartidos
  data/fixtures/               datos simulados tipados
  data/mocks/                  transportes simulados cuando se agreguen
  providers/                   contextos globales
  config/                      navegación y configuración
```

`app` compone páginas y layouts. La lógica vive en `modules`. `shared` nunca importa desde módulos de negocio. No crear de antemano carpetas vacías para todo el catálogo.

## Canales

| Canal          | Responsables          | Rama disponible                | Guía                                      | Progreso                                     |
| -------------- | --------------------- | ------------------------------ | ----------------------------------------- | -------------------------------------------- |
| Cliente        | Barrera y Carlos Chan | `feature/frontend-client`      | [CLIENT.md](channels/CLIENT.md)           | [CLIENT.md](../progress/CLIENT.md)           |
| Operativo      | Antony y Tomy         | `feature/frontend-operational` | [OPERATIONAL.md](channels/OPERATIONAL.md) | [OPERATIONAL.md](../progress/OPERATIONAL.md) |
| Administrativo | Edgar y Beto          | `feature/frontend-admin`       | [ADMIN.md](channels/ADMIN.md)             | [ADMIN.md](../progress/ADMIN.md)             |

El catálogo completo no es el alcance automático del sprint. Coordinación selecciona vistas concretas y puede preferir ramas temporales por tarea cuando dos personas necesiten trabajar en paralelo.

## Convenciones verificadas

- TypeScript estricto y App Router.
- Server Components por defecto; usar `"use client"` sólo por interacción, hooks o APIs del navegador.
- Código e identificadores en inglés; interfaz y explicaciones en español.
- Componentes de dominio exportados mediante `index.ts` cuando exista API pública del módulo.
- Estilos mediante clases y tokens de `globals.css`; no introducir colores aislados sin decisión.
- Acciones disponibles con mouse, touch y teclado; objetivo táctil mínimo de 44 px.
- Estados críticos combinan texto o icono con color.
- Permisos del frontend sólo controlan visibilidad; backend deberá autorizar operaciones reales.

Componentes base existentes:

- `Button`: variantes `primary` y `secondary`, con opción `fullWidth`.
- `StatusBadge`: tonos `success`, `info` y `warning`.
- `FormField`: label obligatorio y ayuda opcional.
- `AppShell`: navegación por contexto y permisos visuales simulados.

Reutilizar estos componentes antes de crear equivalentes. Una variante nueva debe responder a una necesidad real y revisarse si afecta más de un canal.

## Trabajo con IA

La IA debe comenzar leyendo los documentos obligatorios y revisando el código existente. Puede editar archivos y ejecutar verificaciones dentro de la tarea autorizada, pero no debe hacer commit, push, merge, cambiar de rama ni introducir dependencias sin autorización explícita.

No guardar chats, prompts completos ni razonamientos internos. Al terminar un avance relevante, registrar únicamente resultado, archivos, pruebas, decisiones y pendientes en el archivo de progreso del canal.

## Flujo de entrega

```bash
git switch development
git pull --ff-only origin development
git switch -c tipo/nombre-descriptivo

# trabajar y verificar
git status
git add <archivos revisados>
git diff --cached
git commit -m "tipo: descripcion en español"
git push -u origin tipo/nombre-descriptivo
```

Abrir PR hacia `development`, completar la plantilla, adjuntar rutas y capturas, solicitar revisión y esperar aprobación. Sólo coordinación integra. `production` recibe cambios mediante un PR posterior de entrega.

## Verificación previa al PR

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build:web
```

Además, probar a 390, 768, 1280 y 1440 px; navegación con teclado; touch; foco visible; y estados normal, carga, vacío y error. Si una prueba no aplica, documentar el motivo.

## Escalación

- Coordinación frontend: alcance transversal, `shared`, tokens y navegación.
- Responsable del canal: decisiones internas de sus vistas.
- Scrum Master: prioridad y bloqueos.
- Ingeniero/backend: contratos API, autenticación, realtime, seguridad y decisión de repositorios.

No resolver por cuenta propia una contradicción que altere pagos, disponibilidad, horarios, permisos o estados del negocio.

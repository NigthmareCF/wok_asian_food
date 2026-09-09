# Guías de canales frontend

Estas guías convierten el catálogo funcional en trabajo ejecutable. Definen qué vistas pertenecen a cada canal, dónde debe vivir el código, qué acciones mínimas requiere cada pantalla y cómo se valida antes de abrir un pull request.

- [Cliente](CLIENT.md)
- [Operativo](OPERATIONAL.md)
- [Administrativo](ADMIN.md)

El catálogo completo representa alcance del producto, no compromiso de terminar todas las vistas en un solo sprint. La coordinación debe indicar qué IDs entran en cada entrega antes de comenzar.

## Fuentes y prioridad

Cuando dos fuentes difieran, usar este orden y registrar la decisión:

1. Reglas de negocio e historias de usuario aprobadas: comportamiento.
2. Decisiones registradas en `docs/project`: límites técnicos.
3. Mockup de Figma identificado: composición e interacción visual.
4. Catálogo textual de vistas: estructura provisional.
5. Implementación actual: patrones reutilizables, no requisitos nuevos.

No inventar horarios, precios, permisos, promociones, datos del restaurante ni transiciones de negocio. Una duda que cambie comportamiento se eleva a coordinación antes de programar.

## Referencias visuales conocidas

| Referencia                                                                                                                 | Uso previsto                                                      | Estado                                              |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------- |
| [Cliente 1-3](https://www.figma.com/design/JyRiqGH1WwRgKjQWF52ufQ/MAKUPS-CLIENTE-1-3?node-id=2-6)                          | Acceso e inicio de Cliente                                        | Identificada                                        |
| [Cliente 4-6](https://www.figma.com/design/CdxvIftlgsjx1gGfUl33pz/MAKUPS-CLIENTE-4-6?node-id=1-2)                          | Menú, detalle, carrito y estados relacionados                     | Identificada                                        |
| [Portal 2](https://www.figma.com/design/pa1cE0Mep8RH16cOUycLlB/dise%C3%B1o-portal-2?node-id=10-2)                          | Canal Operativo                                                   | Pendiente de validar nodo por nodo                  |
| [Reservaciones](https://www.figma.com/make/gBcZiXxJvX99UHxBeSdO0L/Create-Reservation-Views)                                | Reserva de Cliente y creación/edición Operativa                   | Identificada                                        |
| [Roles y permisos](https://www.figma.com/make/LkyX09v8NvSDyDH61OMHmL/Roles-y-permisos-interface)                           | Administración de roles y permisos                                | Identificada                                        |
| [Prototipo administrativo A-11 a A-16](https://www.figma.com/proto/KrN3PSudQXxQsbtc4coyOg/Sin-t%C3%ADtulo?node-id=16-1875) | Cierres de caja, clientes, configuración, IA, cámaras y auditoría | Canal confirmado; revisión parcial de sus 26 marcos |

Figma define intención visual, no autoriza reglas comerciales nuevas. Si un enlace no abre o no identifica claramente la pantalla, adjuntar una captura al issue o PR y solicitar confirmación.

## Ubicación del código

```text
apps/web/src/
  app/                         rutas y composición
    (public)/                  vistas sin sesión
    (auth)/                    acceso y recuperación
    (private)/(client)/        rutas privadas de Cliente
    (private)/(operational)/   rutas Operativas
    (private)/(admin)/         rutas Administrativas
  modules/<domain>/            lógica y componentes del dominio
  shared/                      componentes realmente compartidos
  data/fixtures/               datos simulados
  config/                      navegación y configuración
```

Una página de `app` debe componer componentes; la lógica y los componentes de negocio viven en `modules`. No duplicar botones, campos, badges o patrones existentes. Cambios en `shared`, tokens globales o navegación transversal requieren revisión de coordinación.

## Secuencia de trabajo

1. Confirmar con coordinación los IDs de vistas asignados.
2. Actualizar la rama desde `development`.
3. Leer `AGENTS.md`, `apps/web/AGENTS.md` y la guía del canal.
4. Revisar historia, reglas y mockup asociados.
5. Implementar la ruta y su módulo con fixtures, sin conectar servicios reales.
6. Cubrir estados normal, carga, vacío y error; agregar estados específicos de la ficha.
7. Probar a 390, 768, 1280 y 1440 px, además de teclado y touch.
8. Ejecutar `npm run lint`, `npm run typecheck`, `npm run test` y `npm run build:web`.
9. Abrir PR hacia `development` con capturas y rutas probadas.

## Definición de terminado

- La vista cumple las acciones y estados de su ficha.
- La navegación permite entrar y salir sin depender del botón Atrás del navegador.
- Los textos visibles están en español y el código en inglés.
- No hay datos reales, credenciales ni dependencias de backend disfrazadas como funcionales.
- La interfaz funciona con mouse, touch y teclado y no presenta desbordamiento horizontal.
- Las acciones sensibles muestran confirmación, pero no simulan autorización real.
- El PR identifica mockup, reglas aplicadas, pruebas y pendientes.

## Inicio para asistentes de IA

Antes de editar, una IA debe leer `AGENTS.md`, `apps/web/AGENTS.md`, esta guía y el archivo del canal. Debe inspeccionar la implementación existente, reutilizar componentes y declarar cualquier suposición. No debe hacer commit, push, merge ni modificar otra rama sin autorización explícita de una persona responsable.

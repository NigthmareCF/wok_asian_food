# Menú vigente y carga de catálogo

La fuente de datos del menú vigente es `database/seeds/menu_real_dev.sql`. Es un seed idempotente y manual para bases de desarrollo, posterior a Flyway. No forma parte de la inicialización productiva.

## Qué incorpora

- Categorías: Sushi, Especialidades, Bebidas y Bebidas +18.
- Áreas canónicas: Sushi → `COCINA_FRIA`, Especialidades → `COCINA_CALIENTE`, Bebidas (incluida categoría +18) → `BARRA`. El seed consolida los códigos históricos `SUSHI_BAR`, `HOT_KITCHEN` y `BAR` sobre esas áreas para evitar estaciones duplicadas.
- 31 productos vigentes, precios en GTQ y descripciones públicas entregadas por coordinación.
- Opciones estructuradas para extras de sushi, variantes Panko, relleno/preparación de Onigiri, base de especialidades, variante de salsa de cerdo, sabor de bebidas variables y niveles estándar de picante. Los códigos internos se muestran con nombres en español. Los cuatro extras de Q5 están asociados en el seed a los nueve productos Sushi vigentes y la compatibilidad sigue siendo administrable por producto.
- Marca `age_restricted` para cerveza y soju, disponible en la respuesta pública para que Cliente/app la presenten.
- Slugs estables para referencias públicas y de desarrollo. Los canales siguen usando los UUID devueltos por API en pedidos.

El seed puede repetirse: las categorías se identifican por nombre, áreas por código, productos por SKU/slug y grupos/opciones por clave natural. Conserva UUIDs de menú existentes al actualizar por slug.

## Separación de receta

Los productos del menú mantienen `recipe_status = PENDING_DATA` y `items.track_inventory = false`. El seed incluye ahora siete insumos de bebidas con `track_inventory = true`, sin existencias iniciales, y 15 componentes cuantificados para las bebidas que se pueden representar sin ambigüedad. Esos renglones son borradores: reserva y consumo sólo leen recetas de productos cuyo estado sea `ACTIVE`. Las dos pulpas de carbonatada están vinculadas a sus opciones de sabor como `modifier_item_impacts` con `affects_availability = false`; no participan en disponibilidad ni en reservas.

Cantidades capturadas: matcha 1 g; agua 2 oz líquidas; leche 5 oz líquidas; pulpa de kiwi o maracuyá 1 oz líquida para los matcha saborizados; y una lata completa de agua mineral por carbonatada. El seed usa `G`, `FL_OZ` y `UNIT` como unidades base del insumo correspondiente. Hielo “para completar” queda como instrucción sin cantidad.

El equivalente indicado de 2 oz de endulzante no se convierte a azúcar ni a jarabe hasta que se confirme si esa medida es por peso o volumen y si representa jarabe terminado. Así no se duplican ambos insumos ni se mezcla masa con volumen. La proporción conocida de jarabe simple es azúcar:agua 1:1 por peso; el ejemplo de tanda usa 70 oz de cada uno. No se inventa el rendimiento final: permanece `TO_MEASURE`, y esta tanda todavía no es BOM ejecutable. No se estiman tiempos ni mermas.

Ninguna receta preliminar activa consumo. Los productos del menú siguen sin tracking propio y su disponibilidad continúa siendo manual hasta que se verifiquen receta e inventario. La salida de desarrollo tampoco crea saldos ni reservas.

No se muestran `PENDING_DATA`, `TO_CONFIRM_RECIPE` ni otras notas internas al Cliente. La respuesta pública incluye nombre, descripción, precio, moneda, opciones, slug y bandera `ageRestricted`; no expone el estado de receta.

## Administración y API

- `GET /api/v1/public/menu`: categorías y productos activos/publicados.
- `GET /api/v1/public/menu/products/{uuid-or-slug}`: detalle público de un producto publicado.
- `POST /api/v1/admin/catalog/categories`, `GET/PUT .../categories`: categorías auditadas.
- `POST /api/v1/admin/catalog/preparation-areas`, `GET/PUT .../preparation-areas`: estaciones auditadas.
- `POST /api/v1/admin/catalog/menu-items`: alta auditada; producto nuevo queda oculto/inactivo/no inventariable hasta que una persona lo revise.
- `GET/PUT /api/v1/admin/catalog/menu-items`: gestión de precio, publicación, slugs y marca +18 con control de versión.
- `/api/v1/admin/catalog/modifier-groups`: configuración de grupos/opciones/compatibilidad.

Los importes de modificadores se vuelven a calcular en backend al crear/aceptar solicitudes y se guardan como snapshots. Clientes nunca envían el total autoritativo.

La revisión de disponibilidad y las solicitudes remotas aceptan hasta 100 líneas como límite técnico de payload, no como límite de venta. El backend agrega los requerimientos de inventario compartidos entre todos los productos del carrito antes de estimar o reservar; repartir cantidades entre distintos SKU no aumenta la capacidad disponible.

## Opciones e incertidumbres

- Onigiri: relleno obligatorio (Surimi +Q0, Atún chipotle +Q5), preparación obligatoria (Normal +Q0, Frito en panko +Q5). Totales esperados Q40/Q45/Q45/Q50.
- Panko: variante obligatoria presentación estándar +Q0, solo atún +Q5, solo surimi +Q0; distribución de los seis cubos en la presentación estándar queda por confirmar.
- Cerdo: salsa agridulce/agridulce picante modelada sin recargo; el grupo de picante expone poco/medio/muy picante sin recargo. El modelo actual no expresa una dependencia condicional entre salsa picante y selección de nivel; endurecer esa regla antes de declarar el flujo completamente validado.
- Sabores estacionales: Soda coreana, Ice Tea Japonés, Té y Soju utilizan opción provisional “Según disponibilidad”, editable desde administración; carbonatada tiene Kiwi/Maracuyá.
- Uramaki Atún: la posible mayonesa aparece en los detalles preliminares, pero no en descripción pública confirmada; no se añade como producto/componente del seed.
- +18: el catálogo marca la restricción. No se inventó un proceso legal de confirmación de edad; definirlo antes de habilitar venta remota de estos productos.
- Recetario, política de permanencia, imagen por producto y sabores efectivamente disponibles quedan pendientes de coordinación.

## Validación

La prueba `RealMenuSeedIntegrationTest` ejecuta el seed dos veces contra PostgreSQL 18, revisa cardinalidades/precios/restricciones y compatibilidad de extras, comprueba los componentes preliminares/unidades, la pulpa de carbonatada no operativa, el estado pendiente de receta y la ausencia de saldos/reservas, calcula las cuatro combinaciones de Onigiri y consulta menú y producto por slug a través de HTTP. Esta prueba valida el catálogo y el contrato; no certifica recetas completas, stock real, autorización legal +18 ni disponibilidad de operación del restaurante.

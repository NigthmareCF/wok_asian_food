# Importación del recetario transcrito

La fuente estructurada versionada es [`../database/seeds/recipe_book_2026-10-10.json`](../../database/seeds/recipe_book_2026-10-10.json). La transcripción contiene 13 recetas, 72 líneas de ingredientes, 21 presentaciones de compra y 15 preguntas de validación. El XLSX de origen coincide con la transcripción de platillos, líneas, compras y pendientes; las correcciones confirmadas se toman del JSON actualizado el 2026-10-10.

Los archivos fuente recibidos se conservan en [`database/seeds/source/`](../../database/seeds/source/): XLSX original, JSON original y guía Markdown. Las 13 fotografías se optimizaron a WebP y se incluyen en los assets de Web y Mobile (`apps/web/public/menu/dishes/` y `apps/mobile/assets/menu-dishes/`).

La migración `V28__draft_recipe_book_import.sql` guarda trazabilidad de la fuente en tablas de borrador conectadas por `source_id`. No crea un catálogo de venta alternativo. Las recetas pueden referenciar un producto del catálogo existente cuando el nombre coincide de manera única; “Cerdo” y “Ramen” quedan vinculados para revisión como posibles coincidencias con Cerdo agridulce y Miso Ramen. Los ingredientes sólo se enlazan a `items` si existe una coincidencia única.

Los datos quedan en `PENDING_VALIDATION`. Rendimiento, procedimiento y tiempo de preparación permanecen NULL. Las cantidades ambiguas conservan unidad y observación; no se convierte `oz` a `fl_oz`, ni se usa una presentación de compra como existencia. Las presentaciones se guardan con `is_inventory = false`. La importación es idempotente por IDs REC/COM/Q y usa `ON CONFLICT DO NOTHING` para preservar cambios previos.

Después de que Flyway aplique la migración, generar y ejecutar la importación en una base de desarrollo:

```bash
python3 scripts/db/import_recipe_book.py database/seeds/recipe_book_2026-10-10.json \
  | psql "$DATABASE_URL" -v ON_ERROR_STOP=1
```

Validación local sin base de datos:

```bash
python3 -m unittest discover -s scripts/db -p 'test_*.py'
```

Las variaciones de venta continúan en el catálogo/modificadores existente (`database/seeds/menu_real_dev.sql`). El recetario no trae cantidades completas por variación, así que esas opciones siguen disponibles en el menú sin activar consumos de receta separados. Pendientes de respuesta están registrados para edición operativa futura.

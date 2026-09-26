# ERD WOK — índice de vistas

[ERD completo editable: 128 tablas / 17 páginas](wok-complete-erd.drawio)

[Facturación editable](invoicing-focus.drawio) · [Vista SVG](invoicing-focus.svg)

## Diagramas por dominio

Cada archivo Mermaid incluye todas las columnas locales, FK salientes y referencias externas abreviadas. Consultar el diccionario para CHECK, índices y UNIQUE compuestos.

| Dominio | Tablas propias | Archivo |
| --- | ---: | --- |
| 01 - Auth IAM | 14 | [01-auth-iam.mmd](01-auth-iam.mmd) |
| 02 - Customers Staff | 7 | [02-customers-staff.mmd](02-customers-staff.mmd) |
| 03 - Tables Reservations | 8 | [03-tables-reservations.mmd](03-tables-reservations.mmd) |
| 04 - Menu | 7 | [04-menu.mmd](04-menu.mmd) |
| 05 - Recipes Items | 7 | [05-recipes-items.mmd](05-recipes-items.mmd) |
| 06 - Inventory | 7 | [06-inventory.mmd](06-inventory.mmd) |
| 07 - Suppliers Purchases | 8 | [07-suppliers-purchases.mmd](07-suppliers-purchases.mmd) |
| 08 - Production | 6 | [08-production.mmd](08-production.mmd) |
| 09 - Availability Operations | 6 | [09-availability-operations.mmd](09-availability-operations.mmd) |
| 10 - Orders Kitchen | 9 | [10-orders-kitchen.mmd](10-orders-kitchen.mmd) |
| 11 - Delivery Messaging | 10 | [11-delivery-messaging.mmd](11-delivery-messaging.mmd) |
| 12 - Billing Payments Cash | 24 | [12-billing-payments-cash.mmd](12-billing-payments-cash.mmd) |
| 13 - AI Vision | 9 | [13-ai-vision.mmd](13-ai-vision.mmd) |
| 14 - Audit Settings Events | 6 | [14-audit-settings-events.mmd](14-audit-settings-events.mmd) |

Las relaciones son físicas, no pasos de proceso. Una FK NOT NULL obliga al hijo a tener padre; no obliga al padre a tener al menos un hijo. Las FK no son parte de la PK UUID: relaciones no identificadoras. Las condiciones de índices únicos parciales se revisan en SQL y no se presentan como unicidad global.

Regenerar vistas: `python3 database/design/generate_views.py` desde la raíz del repositorio. Los Mermaid son derivados; el modelo base no se modifica con este comando.

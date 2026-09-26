# Correspondencia con ERD preliminar

Fuente inspeccionada visualmente: `DIAGRAMA_PREELIMINAR_WOK.jpg` (2111 × 1861). No existe el nombre `DIAGRAMA_PREELIMINAR_WOK(1).jpg` en el inventario inspeccionado. Se conserva el original sin cambios.

Identificadas 39 entidades, incluyendo las tablas de asociación. Los nombres se transcriben tal como aparecen en los encabezados; no se asume que sus relaciones sean correctas.

| OLD ENTITY | NEW ENTITY/ENTITIES | CHANGE | REASON |
|---|---|---|---|
| INVENTARIO_PRODUCTO | inventory_balances / stock_thresholds / inventory_movements | Sustituir stock agregado por saldos y libro. | Permite ubicaciones, lotes y reconstrucción. |
| PRODUCTO | items / presentations / supplier_items / supplier_item_prices | Separar catálogo, presentación y proveedor. | El item admite múltiples ofertas y precios históricos. |
| ASIG_PRODUCT_PRODU | recipes / recipe_versions / recipe_components | Convertir asociación en BOM cuantificada. | Una receta puede consumir cualquier item. |
| INVENT_PRODUCC | inventory_lots / inventory_balances / stock_thresholds | Unificar inventarios. | Las preparaciones también son items inventariables. |
| PRODUCCION | items / recipes / production_orders / production_batches / production_outputs | Separar definición y ejecución. | El preliminar mezcla nombre, cantidad y elaboración. |
| MEDIDAS | units | Normalizar dimensiones y conversiones. | Cantidades decimales, sin conversión masa-volumen implícita. |
| PRESENTACION | presentations | Agregar item y factor a unidad base. | Una bolsa no equivale a una cantidad universal. |
| PROVEEDOR | suppliers / supplier_items | Extraer relación muchos a muchos. | Teléfono es texto y no entero. |
| INGREDIENTES | items / recipe_components | Eliminar doble FK producto/producción como identidad. | Un componente tiene una referencia no ambigua a item. |
| INGR_PLAT | recipes / recipe_versions / recipe_components / menu_items | Relacionar platillo con receta versionada. | Congela composición y admite subrecetas. |
| ASIG_AREA_CATE | menu_items.preparation_area_id / menu_categories | Asignar área al platillo. | Una categoría comercial no determina la estación operativa. |
| CATEGORIA | menu_categories / item_types | Separar categoría comercial y clasificación física. | Son dimensiones independientes. |
| AREA | preparation_areas | Conservar área y extender ruteo. | Permite dividir comandas. |
| PLATILLO | menu_items / items | Separar oferta comercial e item físico. | Precios decimales, visibilidad, receta e imagen. |
| ASIG_MOD_PLAT | menu_item_modifier_groups / modifiers | Asociar grupos con cardinalidad de selección. | Controla opciones obligatorias y límites. |
| MODIFICADOR | modifiers / modifier_item_impacts | Precio e impacto de receta separados. | Cambios afectan consumo y disponibilidad. |
| ASIG_EXT_PLAT | menu_item_modifier_groups / modifiers | Unificar extras con modificadores. | Evita dos mecanismos equivalentes. |
| EXTRA | modifiers / modifier_item_impacts | Representar extra como opción con cantidades. | Conserva costo, precio e impacto inventariable. |
| ASIG_DISP_PLAT | menu_item_availability_overrides | Reemplazar asociación estática por decisión temporal. | No sobrescribe decisiones humanas al recalcular. |
| DISPONIBILIDAD | menu_item_availability_overrides / service_status / inventory_allocations | Calcular disponibilidad y conservar override. | No es un simple catálogo de etiquetas. |
| MESAS | dining_tables / dining_table_status_history / reservation_table_assignments | Agregar capacidad, zona y ocupación. | Reservar sin asignar mesa es válido. |
| PEDIDO | orders | Consolidar cabecera comercial. | Mesa y cliente opcionales según canal. |
| ORDEN | order_items / order_item_status_history | Convertir detalle ambiguo en líneas explícitas. | Cantidad y cambios quedan por línea. |
| ASIG_ORD_PLAT | order_items | Eliminar puente sin atributos suficientes. | Cada línea referencia su platillo y precio histórico. |
| PRIVILEGIO | permissions | Conservar permisos atómicos. | Autorización por acción, no sólo administrador. |
| ASIG_PRIV_ESTAT | role_permissions | Reinterpretar asignación a rol. | Estado de cuenta no concede permisos. |
| ESTATUS | roles / users.status | Separar rol de estado. | El preliminar usa estatus como agrupación de privilegios. |
| USUARIO | users / user_credentials / customer_profiles / employee_profiles / user_roles | Separar identidad, secreto, perfil y roles. | Eliminar contraseña corta y rol único. |
| ASIG_PED_TIPED | orders.order_type | Sustituir N:M por atributo obligatorio. | Un pedido tiene una modalidad de cumplimiento. |
| TIPO_PED | orders.order_type | Dominio controlado DINE_IN/PICKUP/DELIVERY. | No confundir modalidad con canal. |
| ASIG_ESTPED_PED | order_status_history / orders.status | Separar historial y estado actual. | Una asociación sin fecha no representa transiciones. |
| ESTADO_PEDIDO | orders.status / order_status_history / orders.estimated_ready_at | Estado controlado y ETA por pedido. | El tiempo aproximado depende del pedido y carga. |
| CUENTA | bills / bill_orders / bill_items / tips | Desacoplar cuenta, mesa y propina. | Permite división por cantidad y reunión de pedidos. |
| ASIG_ESTCUE_CUENTA | bills.status / audit_logs | Estado vigente más auditoría de cambio. | No mantener estados simultáneos contradictorios. |
| EST_CUENT | bills.status | Dominio OPEN/ISSUED/PAID/VOID. | Transiciones protegidas en transacción. |
| TOT_MET_PAG | payments / payment_allocations / payment_refunds | Registrar cobros individuales y reversos. | Un total por método pierde intentos y pagos parciales. |
| MET_PAG | payment_methods | Catálogo configurable. | Identifica efectivo sin acoplar nombre de método. |
| CAJA | cash_registers / cash_sessions / cash_movements / cash_reconciliations | Eliminar ciclo caja-total pagado-cuenta. | Libro de caja, responsables y arqueos independientes. |
| FACTURA | invoices / invoice_items | Preservar datos fiscales e importes históricos. | NIT opcional, emisión/anulación explícitas y notas de crédito. |

Las entidades nuevas de sesiones, reservas, compras/recepciones, lotes, delivery, mensajería, IA, visión, seguridad y outbox no tienen equivalentes completos en el preliminar. No se propone una migración de registros: sólo hay una imagen, sin una base histórica exportada.

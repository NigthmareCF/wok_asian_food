"""Fuente declarativa del modelo WOK. Genera artefactos; no conecta a servidores."""
from pathlib import Path
import json, re, hashlib, html, xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[2]
TABLES={}
PAGES=['00 - Overview','01 - Auth IAM','02 - Customers Staff','03 - Tables Reservations','04 - Menu','05 - Recipes Items','06 - Inventory','07 - Suppliers Purchases','08 - Production','09 - Availability Operations','10 - Orders Kitchen','11 - Delivery Messaging','12 - Billing Payments Cash','13 - AI Vision','14 - Audit Settings Events','15 - Legacy Mapping','16 - ERD Completo']
TYPES={'s':'TEXT','u':'UUID','t':'TIMESTAMPTZ','d':'DATE','b':'BOOLEAN','i':'INTEGER','n':'NUMERIC(18,6)','m':'NUMERIC(14,2)','j':'JSONB','ip':'INET','time':'TIME','range':'TSTZRANGE'}
def table(name,page,purpose,spec,unique=(),checks=(),mutable=False,notes=''):
 cols=[dict(name='id',type='UUID',nullable=False,default='gen_random_uuid()',ref=None)]
 for part in spec.split(';'):
  if not part.strip():continue
  key,typ,*rest=part.strip().split('|'); nullable=key.endswith('?');key=key.rstrip('?')
  ref=typ[1:] if typ.startswith('@') else None
  cols.append(dict(name=key,type='UUID' if ref else TYPES.get(typ,typ),nullable=nullable,default=rest[0] if rest else None,ref=ref))
 if not any(c['name']=='created_at' for c in cols):cols.append(dict(name='created_at',type='TIMESTAMPTZ',nullable=False,default='now()',ref=None))
 if mutable:
  for key,typ,default,nullable,ref in [('updated_at','TIMESTAMPTZ','now()',False,None),('created_by','UUID',None,True,'users'),('updated_by','UUID',None,True,'users'),('row_version','INTEGER','1',False,None)]:
   if not any(c['name']==key for c in cols):cols.append(dict(name=key,type=typ,nullable=nullable,default=default,ref=ref))
  checks=tuple(checks)+('row_version > 0',)
 TABLES[name]=dict(name=name,page=page,purpose=purpose,columns=cols,unique=list(unique),checks=list(checks),indexes=[],notes=notes,mutable=mutable)
def idx(t,cols,where=None,unique=False):TABLES[t]['indexes'].append(dict(columns=cols,where=where,unique=unique))
def state(col,values):return col+' IN ('+', '.join("'"+v+"'" for v in values.split())+')'
def hist(name,page,parent,values):
 table(name,page,'Historial de transiciones con responsable y motivo.',f'{parent[:-1]}_id|@{parent};from_status?|s;to_status|s;reason?|s;actor_user_id?|@users;occurred_at|t|now();request_id?|u',checks=(state('to_status',values),))
# Identidad y acceso
clients=state('client_type','WEB MOBILE DESKTOP')
table('users',1,'Identidad de cuenta; nunca contiene contraseñas.','email|s;phone?|s;display_name|s;status|s|\'PENDING_VERIFICATION\';email_verified_at?|t;sessions_valid_after|t|now()',unique=('email',),checks=("email = lower(btrim(email)) AND position('@' in email) > 1",state('status','PENDING_VERIFICATION ACTIVE SUSPENDED CLOSED')),mutable=True)
table('user_credentials',1,'Credencial local separada de la identidad.','user_id|@users;password_hash|s;password_changed_at|t|now();must_change_password|b|false;credentials_updated_at|t|now()',unique=('user_id',),checks=('length(password_hash) >= 40',))
table('auth_identities',1,'Identidad externa vinculada mediante subject estable; el correo no vincula cuentas por sí solo.','user_id|@users;provider|s;provider_subject|s;email_at_link?|s;linked_at|t|now();last_login_at?|t',unique=('provider, provider_subject',),checks=(state('provider','GOOGLE APPLE'),'length(provider_subject) > 0'))
table('roles',1,'Roles operativos y de cliente.','code|s;name|s;description?|s;active|b|true',unique=('code',),mutable=True)
table('permissions',1,'Permisos atómicos por recurso y acción.','code|s;description|s',unique=('code',))
table('user_roles',1,'Asignaciones multirrol con revocación histórica.','user_id|@users;role_id|@roles;granted_by?|@users;revoked_at?|t;revoked_by?|@users;reason?|s')
idx('user_roles','user_id, role_id','revoked_at IS NULL',True)
table('role_permissions',1,'Conjunto de permisos vigente por rol.','role_id|@roles;permission_id|@permissions;granted_by?|@users',unique=('role_id, permission_id',))
table('auth_sessions',1,'Sesión por dispositivo; admite sesiones simultáneas.','user_id|@users;client_type|s;device_name?|s;device_identifier?|s;ip_address?|ip;user_agent?|s;last_activity_at|t|now();expires_at|t;revoked_at?|t;revoked_by?|@users;revocation_reason?|s',checks=(clients,'expires_at > created_at'))
table('refresh_tokens',1,'Hash de token rotativo; familia definida por sesión.','session_id|@auth_sessions;token_hash|s;parent_token_id?|@refresh_tokens;expires_at|t;used_at?|t;revoked_at?|t',unique=('token_hash','parent_token_id'),checks=('expires_at > created_at','length(token_hash) >= 40','parent_token_id IS NULL OR parent_token_id <> id'))
table('login_attempts',1,'Historial de intentos, incluso identificadores sin cuenta.','user_id?|@users;identifier_used|s;success|b;failure_reason?|s;ip_address?|ip;user_agent?|s;client_type|s;request_id?|u',checks=(clients,'(success AND failure_reason IS NULL) OR (NOT success AND failure_reason IS NOT NULL)'))
table('account_lockouts',1,'Episodios de bloqueo temporal y desbloqueo administrativo.','user_id|@users;locked_until|t;lock_reason|s;unlocked_at?|t;unlocked_by?|@users',checks=('locked_until > created_at',))
table('verification_challenges',1,'PIN protegido con hash autenticado; expiración y uso único.','user_id|@users;purpose|s;code_hash|s;destination_hash|s;expires_at|t;attempt_count|i|0;max_attempts|i|5;consumed_at?|t;revoked_at?|t',checks=(state('purpose','ACCOUNT_VERIFICATION PASSWORD_RESET EMAIL_CHANGE SENSITIVE_ACTION'),'attempt_count >= 0 AND max_attempts > 0 AND attempt_count <= max_attempts','expires_at > created_at','length(code_hash) >= 40'))
table('guest_access_tokens',1,'Token opaco y acotado a una operación de invitado.','customer_id?|@customer_profiles;scope|s;resource_id|u;token_hash|s;expires_at|t;consumed_at?|t;revoked_at?|t',unique=('token_hash',),checks=(state('scope','RESERVATION ORDER TRACKING'),'length(token_hash) >= 40','expires_at > created_at'))
table('security_events',1,'Eventos de seguridad independientes de auditoría funcional.','actor_user_id?|@users;event_type|s;severity|s;ip_address?|ip;user_agent?|s;session_id?|@auth_sessions;request_id?|u;correlation_id?|u;details|j|\'{}\'::jsonb;occurred_at|t|now()',checks=(state('severity','INFO WARNING CRITICAL'),))
# Personas
for name,purpose,spec in [
 ('customer_profiles','Perfil de cliente con o sin cuenta vinculada.','user_id?|@users;full_name|s;guest_phone?|s;notes?|s'),
 ('employee_profiles','Perfil laboral; los permisos se resuelven mediante RBAC.','user_id|@users;employee_code|s;hired_on|d;ended_on?|d;active|b|true')]:
 table(name,2,purpose,spec,unique=('user_id',)+(('employee_code',) if name=='employee_profiles' else ()),mutable=True)
table('customer_addresses',2,'Direcciones reutilizables; entregas guardan copia histórica.','customer_id|@customer_profiles;label|s;address_text|s;recipient_name|s;recipient_phone|s;latitude?|NUMERIC(9,6);longitude?|NUMERIC(9,6);instructions?|s;active|b|true',checks=('latitude BETWEEN -90 AND 90','longitude BETWEEN -180 AND 180'),mutable=True)
table('customer_incidents',2,'Incidentes documentados sin sustituir restricciones.','customer_id|@customer_profiles;order_id?|@orders;description|s;occurred_at|t;created_by|@users')
table('customer_restrictions',2,'Restricciones temporales revocables.','customer_id|@customer_profiles;restriction_type|s;reason|s;created_by|@users;expires_at?|t;revoked_by?|@users;revoked_at?|t',checks=(state('restriction_type','NO_DELIVERY PREPAY_ONLY NO_RESERVATIONS NO_MESSAGING FULL_BLOCK REQUIRES_AUTH'),'expires_at IS NULL OR expires_at > created_at'))
table('staff_schedules',2,'Turnos planificados por intervalo real.','employee_id|@employee_profiles;starts_at|t;ends_at|t;preparation_area_id?|@preparation_areas;notes?|s',checks=('ends_at > starts_at',),mutable=True)
table('schedule_exceptions',2,'Ausencias y cambios; referencia opcional al turno afectado.','employee_id|@employee_profiles;schedule_id?|@staff_schedules;exception_type|s;starts_at|t;ends_at|t;reason|s',checks=('ends_at > starts_at',state('exception_type','ABSENCE LEAVE EXTRA_TIME CHANGE')),mutable=True)
# Mesas y reservas
TSTATUS='FREE OCCUPIED RESERVED CLEANING UNAVAILABLE';RSTATUS='REQUESTED CONFIRMED ARRIVED SEATED COMPLETED CANCELLED NO_SHOW'
table('dining_tables',3,'Mesas físicas; estado actual como proyección operativa.','name|s;capacity|i;zone|s;active|b|true;current_status|s|\'FREE\'',unique=('name',),checks=('capacity > 0',state('current_status',TSTATUS)),mutable=True)
hist('dining_table_status_history',3,'dining_tables',TSTATUS)
table('reservations',3,'Reserva sin obligación de elegir mesa física.','customer_id|@customer_profiles;party_size|i;reservation_at|t;ends_at|t;requested_at|t|now();status|s|\'REQUESTED\';notes?|s;arrival_at?|t;cancelled_at?|t;cancellation_reason?|s',checks=('party_size > 0','ends_at > reservation_at',state('status',RSTATUS),"status <> 'CANCELLED' OR (cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL)"),mutable=True)
table('reservation_evaluations',3,'Resultado histórico de capacidad y condiciones evaluadas por backend.','reservation_id?|@reservations;request_id|u;decision|s;reason_codes|j;alternatives|j|\'[]\'::jsonb;conditions|j|\'[]\'::jsonb;estimated_occupancy_minutes|i;estimated_ready_at?|t;public_message|s;policy_version|s;evaluated_at|t|now()',checks=(state('decision','ACCEPT ACCEPT_WITH_CONDITIONS SUGGEST_OTHER_TIME REQUIRES_HUMAN_APPROVAL REJECT'),'estimated_occupancy_minutes > 0'))
hist('reservation_status_history',3,'reservations',RSTATUS)
table('reservation_table_assignments',3,'Asignación de una o varias mesas; intervalo bloqueado contra solapes.','reservation_id|@reservations;table_id|@dining_tables;occupied_period|range;released_at?|t;assigned_by|@users',checks=("NOT isempty(occupied_period) AND NOT lower_inf(occupied_period) AND NOT upper_inf(occupied_period) AND lower_inc(occupied_period) AND NOT upper_inc(occupied_period)",))
table('dining_sessions',3,'Atención presencial agrupa mesas, pedidos y pool facturable sin perder historia.','reservation_id?|@reservations;customer_id?|@customer_profiles;status|s|\'OPEN\';party_size|i;opened_at|t|now();closed_at?|t;estimated_end_at?|t',checks=(state('status','OPEN CLOSING CLOSED'),'party_size > 0','closed_at IS NULL OR closed_at >= opened_at'),mutable=True)
table('dining_session_tables',3,'Historia de mesas asignadas a una sesión de consumo.','dining_session_id|@dining_sessions;table_id|@dining_tables;assigned_at|t|now();released_at?|t;assigned_by|@users',checks=('released_at IS NULL OR released_at > assigned_at',))
# Items y recetas
ITEMT='RAW_MATERIAL PURCHASED_PRODUCT PREPARATION SEMIPROCESSED FINISHED_PRODUCT PACKAGING CONSUMABLE CLEANING'
table('item_types',5,'Clasificación estable del catálogo físico.','code|s;name|s',unique=('code',))
table('units',5,'Unidades canónicas y conversión dentro de una dimensión.','code|s;name|s;dimension|s;factor_to_base|n',unique=('code',),checks=('factor_to_base > 0',state('dimension','MASS VOLUME COUNT')))
table('items',5,'Catálogo único de insumos, productos, preparaciones y consumibles.','sku|s;name|s;description?|s;item_type_id|@item_types;base_unit_id|@units;track_inventory|b|true;active|b|true',unique=('sku',),mutable=True)
table('presentations',5,'Presentación por item expresada en su unidad base.','item_id|@items;name|s;base_quantity|n;barcode?|s',unique=('item_id, name',),checks=('base_quantity > 0',),mutable=True)
table('recipes',5,'Identidad de receta que produce un item.','output_item_id|@items;name|s;active|b|true',mutable=True)
table('recipe_versions',5,'Versión histórica inmutable después de publicación.','recipe_id|@recipes;version_number|i;yield_quantity|n;status|s|\'DRAFT\';instructions?|s;published_at?|t;created_by|@users',unique=('recipe_id, version_number',),checks=('version_number > 0','yield_quantity > 0',state('status','DRAFT PUBLISHED RETIRED')))
table('recipe_components',5,'BOM: componente item; subreceta fijada a versión cuando corresponda.','recipe_version_id|@recipe_versions;component_item_id|@items;component_recipe_version_id?|@recipe_versions;quantity|n;waste_fraction|NUMERIC(7,6)|0;position|i',unique=('recipe_version_id, position',),checks=('quantity > 0','waste_fraction >= 0 AND waste_fraction < 1','position > 0','component_recipe_version_id IS NULL OR component_recipe_version_id <> recipe_version_id'))
# Menú
table('menu_categories',4,'Agrupación comercial de platillos.','name|s;display_order|i|0;active|b|true',unique=('name',),mutable=True)
table('preparation_areas',4,'Áreas de preparación y ruteo de comandas.','code|s;name|s;active|b|true',unique=('code',),mutable=True)
table('menu_items',4,'Oferta comercial asociada a item físico y receta opcional.','item_id|@items;recipe_version_id?|@recipe_versions;category_id|@menu_categories;preparation_area_id|@preparation_areas;name|s;description?|s;price|m;currency_id|@currencies;image_reference?|s;visibility|s|\'PUBLIC\';status|s|\'ACTIVE\';display_order|i|0;estimated_preparation_seconds|i|0',checks=('price >= 0','estimated_preparation_seconds >= 0',state('visibility','PUBLIC STAFF HIDDEN'),state('status','ACTIVE INACTIVE')),mutable=True)
table('modifier_groups',4,'Reglas de selección independientes del menú.','name|s;min_selection|i|0;max_selection|i;required|b|false',checks=('min_selection >= 0 AND max_selection >= min_selection','required = (min_selection > 0)'),mutable=True)
table('modifiers',4,'Opciones con diferencia de precio; impactos separados.','group_id|@modifier_groups;name|s;price_delta|m|0;active|b|true',unique=('group_id, name','id, group_id'),mutable=True)
table('menu_item_modifier_groups',4,'Grupos habilitados por platillo.','menu_item_id|@menu_items;group_id|@modifier_groups;display_order|i|0',unique=('menu_item_id, group_id',))
table('modifier_item_impacts',4,'Delta firmado de consumo en unidad base por modificador.','modifier_id|@modifiers;item_id|@items;quantity_delta|n;affects_availability|b|true',unique=('modifier_id, item_id',),checks=('quantity_delta <> 0',))
# Inventario
table('inventory_locations',6,'Ubicaciones físicas de existencias.','code|s;name|s;active|b|true',unique=('code',),mutable=True)
table('inventory_lots',6,'Identidad del lote; cantidad y ubicación se consultan en saldos/movimientos.','item_id|@items;lot_code|s;received_at|t;expires_at?|t;unit_cost|NUMERIC(18,6);currency_id|@currencies;goods_receipt_item_id?|@goods_receipt_items;production_output_id?|@production_outputs;source_reason?|s',unique=('item_id, lot_code',),checks=('unit_cost >= 0','expires_at IS NULL OR expires_at > received_at','num_nonnulls(goods_receipt_item_id, production_output_id, source_reason) = 1'))
table('inventory_balances',6,'Proyección reconstruible del libro de inventario por lote y ubicación.','lot_id|@inventory_lots;location_id|@inventory_locations;quantity|n|0;reserved_quantity|n|0',unique=('lot_id, location_id',),checks=('quantity >= 0 AND reserved_quantity >= 0 AND reserved_quantity <= quantity',),mutable=True)
table('inventory_movements',6,'Libro inmutable con cantidad firmada; corrección mediante contramovimiento.','lot_id|@inventory_lots;location_id|@inventory_locations;movement_type|s;quantity_delta|n;unit_cost|n;occurred_at|t|now();created_by|@users;goods_receipt_item_id?|@goods_receipt_items;production_consumption_id?|@production_consumptions;production_output_id?|@production_outputs;order_item_id?|@order_items;transfer_id?|@inventory_transfers;reversal_of_id?|@inventory_movements;reason|s;request_id?|u;correlation_id?|u',unique=('reversal_of_id',),checks=(state('movement_type','PURCHASE PRODUCTION CONSUMPTION SALE WASTE ADJUSTMENT RETURN TRANSFER INTERNAL_USE'),'quantity_delta <> 0','unit_cost >= 0',"movement_type <> 'PURCHASE' OR (goods_receipt_item_id IS NOT NULL AND quantity_delta > 0)","movement_type <> 'TRANSFER' OR transfer_id IS NOT NULL","movement_type NOT IN ('CONSUMPTION','SALE','WASTE','INTERNAL_USE') OR quantity_delta < 0"))
table('inventory_transfers',6,'Cabecera de transferencia; dos asientos balanceados por lote.','source_location_id|@inventory_locations;destination_location_id|@inventory_locations;reason|s;created_by|@users;posted_at?|t',checks=('source_location_id <> destination_location_id',))
table('stock_thresholds',6,'Umbrales por item y ubicación.','item_id|@items;location_id|@inventory_locations;minimum_quantity|n;target_quantity|n;maximum_quantity|n',unique=('item_id, location_id',),checks=('minimum_quantity >= 0 AND target_quantity >= minimum_quantity AND maximum_quantity >= target_quantity',),mutable=True)
table('inventory_allocations',6,'Reserva de existencias para evitar sobreventa antes de consumir.','order_item_id?|@order_items;production_order_id?|@production_orders;lot_id|@inventory_lots;location_id|@inventory_locations;quantity|n;expires_at?|t;released_at?|t;consumed_at?|t',checks=('num_nonnulls(order_item_id, production_order_id) = 1','quantity > 0','NOT (released_at IS NOT NULL AND consumed_at IS NOT NULL)'))
# Proveedores y compras
table('suppliers',7,'Proveedor y contacto operativo.','name|s;contact_name?|s;email?|s;phone?|s;address_text?|s;tax_identifier?|s;active|b|true',mutable=True)
table('supplier_items',7,'Oferta de proveedor por presentación; historial de precios separado.','supplier_id|@suppliers;presentation_id|@presentations;supplier_sku?|s;preferred|b|false;active|b|true',unique=('supplier_id, presentation_id',),mutable=True)
idx('supplier_items','presentation_id','preferred AND active',True)
table('supplier_item_prices',7,'Precio histórico con intervalo de vigencia.','supplier_item_id|@supplier_items;price|m;currency_id|@currencies;valid_from|t;valid_until?|t',unique=('supplier_item_id, valid_from',),checks=('price >= 0','valid_until IS NULL OR valid_until > valid_from'))
PSTATUS='REQUESTED PARTIALLY_PURCHASED PURCHASED PARTIALLY_RECEIVED RECEIVED CANCELLED'
table('purchase_orders',7,'Solicitud y compromiso de compra; no genera existencias.','supplier_id|@suppliers;status|s|\'REQUESTED\';currency_id|@currencies;requested_at|t|now();ordered_at?|t;expected_at?|t;notes?|s',checks=(state('status',PSTATUS),),mutable=True)
table('purchase_order_items',7,'Cantidades solicitadas y comprometidas en unidad base con precio pactado.','purchase_order_id|@purchase_orders;item_id|@items;presentation_id?|@presentations;requested_quantity|n;purchased_quantity|n|0;unit_price|n',checks=('requested_quantity > 0 AND purchased_quantity >= 0 AND purchased_quantity <= requested_quantity','unit_price >= 0'),mutable=True)
hist('purchase_order_status_history',7,'purchase_orders',PSTATUS)
table('goods_receipts',7,'Recepción física; contabilización única genera lotes y movimientos.','purchase_order_id|@purchase_orders;receipt_reference|s;received_at|t;received_by|@users;status|s|\'DRAFT\';posted_at?|t;notes?|s',unique=('purchase_order_id, receipt_reference',),checks=(state('status','DRAFT POSTED REVERSED'),),mutable=True)
table('goods_receipt_items',7,'Recepción parcial y rechazos por línea comprada.','goods_receipt_id|@goods_receipts;purchase_order_item_id|@purchase_order_items;accepted_quantity|n;rejected_quantity|n|0;unit_cost|n;location_id|@inventory_locations;rejection_reason?|s',checks=('accepted_quantity >= 0 AND rejected_quantity >= 0 AND accepted_quantity + rejected_quantity > 0','unit_cost >= 0','rejected_quantity = 0 OR rejection_reason IS NOT NULL'))
# Producción
PROD='SUGGESTED PENDING IN_PROGRESS AVAILABLE DISCARDED CANCELLED'
table('production_orders',8,'Sugerencia o solicitud de producir una versión exacta.','recipe_version_id|@recipe_versions;currency_id|@currencies;planned_quantity|n;status|s|\'PENDING\';suggested_by_ai_session_id?|@ai_sessions;accepted_by?|@users;accepted_at?|t;modified_by?|@users;rejected_by?|@users;rejected_at?|t;reason?|s;planned_start_at?|t;planned_end_at?|t',checks=('planned_quantity > 0',state('status',PROD)),mutable=True)
table('production_batches',8,'Ejecución física de una orden; conserva costo real.','production_order_id|@production_orders;batch_code|s;started_at?|t;completed_at?|t;status|s|\'PENDING\';responsible_user_id|@users',unique=('batch_code',),checks=(state('status',PROD),'completed_at IS NULL OR (started_at IS NOT NULL AND completed_at >= started_at)'),mutable=True)
table('production_consumptions',8,'Consumo real por lote; conserva costo unitario.','production_batch_id|@production_batches;lot_id|@inventory_lots;location_id|@inventory_locations;quantity|n;unit_cost|n;consumed_at|t',checks=('quantity > 0','unit_cost >= 0'))
table('production_outputs',8,'Salida real, incluida merma, vinculada a lote producido.','production_batch_id|@production_batches;item_id|@items;location_id|@inventory_locations;quantity|n;unit_cost|n;output_type|s;produced_at|t;expires_at?|t',checks=('quantity > 0','unit_cost >= 0',state('output_type','USABLE WASTE')))
hist('production_status_history',8,'production_orders',PROD)
# Operación
table('menu_item_availability_overrides',9,'Decisión manual prioritaria sobre disponibilidad calculada.','menu_item_id|@menu_items;channel|s;is_available|b;reason|s;created_by|@users;expires_at?|t;revoked_by?|@users;revoked_at?|t',checks=(state('channel','ALL DINE_IN PICKUP DELIVERY'),'expires_at IS NULL OR expires_at > created_at'))
table('service_status',9,'Estado actual único del restaurante; dimensiones independientes.','singleton_key|i|1;restaurant_open|b|false;dine_in_enabled|b|false;pickup_enabled|b|false;delivery_enabled|b|false;online_orders_enabled|b|false;high_demand|b|false;production_in_progress|b|false',unique=('singleton_key',),checks=('singleton_key = 1',),mutable=True)
table('service_capabilities',9,'Estado independiente por capacidad con override auditable.','code|s;status|s|\'DISABLED\';reason?|s;effective_from|t|now();effective_until?|t;changed_by?|@users;policy_version|i|1',unique=('code',),checks=(state('code','LOCAL RESERVATIONS DINE_IN_ONLINE PICKUP DELIVERY ONLINE_ORDERS MESSAGING ONLINE_PAYMENTS PRODUCTION'),state('status','ENABLED MANUAL_APPROVAL PAUSED DISABLED'),'effective_until IS NULL OR effective_until > effective_from','policy_version > 0'),mutable=True)
table('service_capability_events',9,'Historial inmutable de cambios por capacidad.','capability_id|@service_capabilities;previous_status|s;new_status|s;reason|s;actor_user_id|@users;occurred_at|t|now();request_id?|u',checks=(state('previous_status','ENABLED MANUAL_APPROVAL PAUSED DISABLED'),state('new_status','ENABLED MANUAL_APPROVAL PAUSED DISABLED')))
table('service_status_history',9,'Cambio operativo con estado anterior y posterior.','service_status_id|@service_status;actor_user_id|@users;reason|s;before_data|j;after_data|j;occurred_at|t|now();request_id?|u')
table('preparation_capacity_slots',9,'Capacidad por área e intervalo para estimación de carga.','preparation_area_id|@preparation_areas;starts_at|t;ends_at|t;capacity_units|n;reserved_units|n|0',unique=('preparation_area_id, starts_at',),checks=('ends_at > starts_at','capacity_units >= 0 AND reserved_units >= 0 AND reserved_units <= capacity_units'),mutable=True)
# Pedidos y cocina
OST='DRAFT SUBMITTED ACCEPTED IN_PREPARATION READY COMPLETED CANCELLED';IST='DRAFT SENT IN_PREPARATION READY SERVED CANCELLED'
table('orders',10,'Pedido comercial multicanal; preventa vinculable a reserva.','customer_id?|@customer_profiles;table_id?|@dining_tables;reservation_id?|@reservations;channel|s;order_type|s;status|s|\'DRAFT\';currency_id|@currencies;comments?|s;ordered_at|t|now();accepted_at?|t;estimated_ready_at?|t;completed_at?|t;cancelled_at?|t;request_id?|u;correlation_id?|u;client_action_id?|u',checks=(state('channel','WEB MOBILE DESKTOP STAFF WHATSAPP INSTAGRAM OTHER'),state('order_type','DINE_IN PICKUP DELIVERY'),state('status',OST)),mutable=True)
table('order_items',10,'Línea histórica con precio y receta congelados al enviar.','order_id|@orders;menu_item_id|@menu_items;recipe_version_id?|@recipe_versions;item_name_snapshot|s;quantity|n;unit_price|m;status|s|\'DRAFT\';notes?|s;sent_at?|t;cancelled_at?|t;cancellation_reason?|s;replaces_order_item_id?|@order_items',checks=('quantity > 0','unit_price >= 0',state('status',IST),"status <> 'CANCELLED' OR (cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL)"),mutable=True)
table('order_item_modifiers',10,'Selección histórica; delta de precio congelado.','order_item_id|@order_items;modifier_id|@modifiers;name_snapshot|s;quantity|i|1;price_delta|m',checks=('quantity > 0',))
table('order_modifier_item_impacts',10,'Impacto de inventario congelado; no cambia con el catálogo.','order_item_modifier_id|@order_item_modifiers;item_id|@items;quantity_delta|n',unique=('order_item_modifier_id, item_id',),checks=('quantity_delta <> 0',))
hist('order_status_history',10,'orders',OST);hist('order_item_status_history',10,'order_items',IST)
table('special_requests',10,'Solicitudes especiales evaluadas por personal.','order_id|@orders;order_item_id?|@order_items;description|s;status|s|\'PENDING\';reviewed_by?|@users;reviewed_at?|t;response?|s',checks=(state('status','PENDING ACCEPTED REJECTED'),),mutable=True)
table('kitchen_tickets',10,'Comanda dividida por área, admite envíos incrementales.','order_id|@orders;preparation_area_id|@preparation_areas;status|s|\'QUEUED\';sent_at|t|now();started_at?|t;ready_at?|t;sequence_number|i',unique=('order_id, preparation_area_id, sequence_number',),checks=(state('status','QUEUED IN_PROGRESS READY CANCELLED'),'sequence_number > 0'),mutable=True)
table('kitchen_ticket_items',10,'Detalle enviado y cantidad por comanda; cancelación explícita.','kitchen_ticket_id|@kitchen_tickets;order_item_id|@order_items;quantity|n;status|s|\'QUEUED\';cancelled_at?|t;reason?|s',unique=('kitchen_ticket_id, order_item_id',),checks=('quantity > 0',state('status','QUEUED IN_PROGRESS READY CANCELLED')),mutable=True)
# Delivery y mensajes
DST='PENDING ASSIGNED PICKED_UP IN_TRANSIT DELIVERED FAILED CANCELLED'
table('delivery_partners',11,'Repartidor interno o proveedor externo.','partner_type|s;employee_id?|@employee_profiles;name|s;phone?|s;active|b|true',checks=(state('partner_type','INTERNAL EXTERNAL'),"(partner_type = 'INTERNAL') = (employee_id IS NOT NULL)"),mutable=True)
table('deliveries',11,'Entrega con dirección y contacto históricos; permite reintentos.','order_id|@orders;partner_id?|@delivery_partners;attempt_number|i|1;status|s|\'PENDING\';recipient_name_snapshot|s;phone_snapshot|s;address_snapshot|s;instructions_snapshot?|s;latitude?|NUMERIC(9,6);longitude?|NUMERIC(9,6);fee|m|0;assigned_at?|t;picked_up_at?|t;delivered_at?|t;external_reference?|s',unique=('order_id, attempt_number',),checks=('attempt_number > 0','fee >= 0',state('status',DST),'latitude BETWEEN -90 AND 90','longitude BETWEEN -180 AND 180'),mutable=True)
hist('delivery_status_history',11,'deliveries',DST)
table('conversations',11,'Conversación multicanal con cliente y modo de atención.','customer_id?|@customer_profiles;channel|s;external_thread_id?|s;status|s|\'OPEN\';handling_mode|s|\'HUMAN\';closed_at?|t',unique=('channel, external_thread_id',),checks=(state('channel','WEB WHATSAPP INSTAGRAM OTHER'),state('status','OPEN WAITING CLOSED'),state('handling_mode','AI HUMAN')),mutable=True)
table('messages',11,'Mensaje con emisor humano, cliente, sistema o IA.','conversation_id|@conversations;sender_type|s;sender_user_id?|@users;ai_session_id?|@ai_sessions;direction|s;body?|s;attachment_uri?|s;external_message_id?|s;sent_at?|t;delivered_at?|t;read_at?|t;status|s|\'PENDING\';reply_to_message_id?|@messages',unique=('conversation_id, external_message_id',),checks=(state('sender_type','CUSTOMER HUMAN AI SYSTEM'),state('direction','INBOUND OUTBOUND'),state('status','PENDING SENT DELIVERED READ FAILED'),'body IS NOT NULL OR attachment_uri IS NOT NULL',"sender_type <> 'HUMAN' OR sender_user_id IS NOT NULL","sender_type <> 'AI' OR ai_session_id IS NOT NULL"))
table('external_customer_identities',11,'Identidad por proveedor verificada antes de vincular con cliente interno.','customer_id|@customer_profiles;provider|s;external_subject|s;verified_at?|t;linked_by?|@users',unique=('provider, external_subject',),checks=('length(external_subject) > 0',))
table('message_attachments',11,'Metadatos y retención de adjuntos; contenido fuera de PostgreSQL.','message_id|@messages;storage_key|s;mime_type|s;byte_size|INTEGER;checksum_sha256|s;scan_status|s;expires_at?|t',unique=('storage_key',),checks=('byte_size > 0','length(checksum_sha256) = 64',state('scan_status','PENDING CLEAN REJECTED')))
table('message_transcriptions',11,'Transcripción de audio con proveedor y resultado separados del original.','attachment_id|@message_attachments;provider|s;language_code?|s;text|s;status|s;confidence?|NUMERIC(7,6)',unique=('attachment_id',),checks=(state('status','PENDING COMPLETED FAILED'),'confidence BETWEEN 0 AND 1'))
table('conversation_assignments',11,'Historial de asignación y liberación humana.','conversation_id|@conversations;assigned_to|@users;assigned_by?|@users;released_at?|t;reason?|s')
idx('conversation_assignments','conversation_id','released_at IS NULL',True)
table('message_templates',11,'Plantillas aprobadas y versionadas por canal e idioma.','code|s;version_number|i;channel|s;locale|s;body|s;active|b|true',unique=('code, version_number, locale',),checks=('version_number > 0',),mutable=True)
# Finanzas
table('currencies',12,'Monedas ISO; una moneda por documento, sin conversión implícita.','code|s;name|s;minor_units|i|2',unique=('code',),checks=("code ~ '^[A-Z]{3}$'",'minor_units BETWEEN 0 AND 2'))
table('bills',12,'Cuenta independiente de mesa; total calculado desde líneas.','customer_id?|@customer_profiles;currency_id|@currencies;name?|s;status|s|\'OPEN\';issued_at?|t;closed_at?|t;void_reason?|s',checks=(state('status','OPEN ISSUED PAID VOID'),),mutable=True)
table('bill_orders',12,'Una cuenta reúne pedidos; un pedido se divide entre cuentas.','bill_id|@bills;order_id|@orders',unique=('bill_id, order_id',))
table('bill_items',12,'Fracción facturable de una línea o cargo explícito; importes históricos.','bill_id|@bills;order_item_id?|@order_items;line_type|s;description_snapshot|s;quantity|n;unit_price|m;discount_amount|m|0;tax_amount|m|0;tax_rate_snapshot|NUMERIC(9,6)|0;voided_at?|t;voided_by?|@users;void_reason?|s',checks=('quantity > 0','unit_price >= 0 AND discount_amount >= 0 AND tax_amount >= 0','discount_amount <= round(quantity * unit_price, 2)','tax_rate_snapshot >= 0',state('line_type','SALE DELIVERY_FEE SERVICE_FEE'),"line_type <> 'SALE' OR order_item_id IS NOT NULL"))
table('payment_methods',12,'Métodos configurables; distingue efectivo para caja.','code|s;name|s;is_cash|b|false;active|b|true',unique=('code',),mutable=True)
table('payments',12,'Intento/cobro individual parcial de una cuenta; no almacena PAN/CVV.','bill_id|@bills;payment_method_id|@payment_methods;amount|m;status|s|\'PENDING\';provider?|s;provider_reference?|s;paid_at?|t;received_by?|@users;request_id?|u;correlation_id?|u;client_action_id?|u',unique=('provider, provider_reference',),checks=('amount > 0',state('status','PENDING SUCCEEDED FAILED CANCELLED'),"status <> 'SUCCEEDED' OR paid_at IS NOT NULL",'(provider IS NULL) = (provider_reference IS NULL)'),mutable=True)
table('payment_intents',12,'Intento de pasarela autorizado por backend; no almacena PAN/CVV.','bill_id|@bills;provider|s;provider_intent_id?|s;amount|m;currency_id|@currencies;status|s|\'CREATED\';idempotency_key|s;requires_action_url?|s;expires_at?|t;captured_at?|t',unique=('provider, provider_intent_id','provider, idempotency_key'),checks=('amount > 0',state('status','CREATED PENDING REQUIRES_ACTION AUTHORIZED CAPTURED FAILED CANCELLED UNKNOWN REFUNDED')) ,mutable=True)
table('payment_gateway_events',12,'Evento crudo referenciado para deduplicación y conciliación de webhook.','payment_intent_id?|@payment_intents;provider|s;provider_event_id|s;event_type|s;payload_hash|s;received_at|t|now();processed_at?|t;processing_status|s|\'RECEIVED\';error_code?|s',unique=('provider, provider_event_id',),checks=(state('processing_status','RECEIVED PROCESSED FAILED IGNORED'),'length(payload_hash) = 64'))
table('payment_allocations',12,'Distribuye el cobro entre venta y propina.','payment_id|@payments;tip_id?|@tips;allocation_type|s;amount|m',checks=('amount > 0',state('allocation_type','SALE TIP'),"(allocation_type = 'TIP') = (tip_id IS NOT NULL)"))
idx('payment_allocations','payment_id',"allocation_type = 'SALE'",True)
idx('payment_allocations','payment_id, tip_id',"allocation_type = 'TIP'",True)
table('payment_refunds',12,'Reembolso explícito sin borrar el pago original.','payment_id|@payments;amount|m;status|s|\'PENDING\';reason|s;provider_reference?|s;refunded_at?|t;created_by|@users',checks=('amount > 0',state('status','PENDING SUCCEEDED FAILED')),mutable=True)
table('refund_allocations',12,'Identifica la parte de venta o propina devuelta.','refund_id|@payment_refunds;payment_allocation_id|@payment_allocations;amount|m',unique=('refund_id, payment_allocation_id',),checks=('amount > 0',))
table('payment_fees',12,'Comisión del procesador separada del cobro y la propina.','payment_id|@payments;amount|m;description|s;assessed_at|t',checks=('amount >= 0',))
table('tips',12,'Propina voluntaria separada del ingreso por venta.','bill_id|@bills;amount|m;status|s|\'PLEDGED\';created_by?|@users;voided_at?|t;reason?|s',checks=('amount > 0',state('status','PLEDGED COLLECTED DISTRIBUTED VOID')),mutable=True)
table('tip_distributions',12,'Distribución de propina a empleados, pendiente o entregada.','tip_id|@tips;employee_id|@employee_profiles;amount|m;paid_at?|t;cash_movement_id?|@cash_movements;created_by|@users',checks=('amount > 0',))
table('cash_registers',12,'Cajas físicas y moneda de arqueo.','code|s;name|s;currency_id|@currencies;active|b|true',unique=('code',),mutable=True)
table('cash_sessions',12,'Turno de caja; saldo inicial se asienta como movimiento OPENING.','cash_register_id|@cash_registers;opened_by|@users;opened_at|t|now();closed_by?|@users;closed_at?|t;status|s|\'OPEN\'',checks=(state('status','OPEN CLOSING CLOSED'),'closed_at IS NULL OR closed_at >= opened_at',"status <> 'CLOSED' OR (closed_at IS NOT NULL AND closed_by IS NOT NULL)"),mutable=True)
idx('cash_sessions','cash_register_id',"status IN ('OPEN','CLOSING')",True)
table('cash_movements',12,'Libro de caja firmado; efectivo neto recibido, egresos y reversos.','cash_session_id|@cash_sessions;movement_type|s;amount_delta|m;payment_id?|@payments;refund_id?|@payment_refunds;reversal_of_id?|@cash_movements;reason|s;responsible_user_id|@users;occurred_at|t|now();request_id?|u',unique=('payment_id','refund_id','reversal_of_id'),checks=(state('movement_type','OPENING SALE INCOME EXPENSE WITHDRAWAL REFUND TIP_PAYOUT REVERSAL'),'amount_delta <> 0 OR movement_type = \'OPENING\'',"movement_type NOT IN ('EXPENSE','WITHDRAWAL','REFUND','TIP_PAYOUT') OR amount_delta < 0","movement_type NOT IN ('OPENING','SALE','INCOME') OR amount_delta >= 0","movement_type <> 'SALE' OR payment_id IS NOT NULL","movement_type <> 'REFUND' OR refund_id IS NOT NULL"))
idx('cash_movements','cash_session_id',"movement_type = 'OPENING'",True)
table('cash_reconciliations',12,'Arqueo histórico; diferencia calculada, cierre conserva corte.','cash_session_id|@cash_sessions;expected_cash|m;counted_cash|m;difference|NUMERIC(14,2) GENERATED ALWAYS AS (counted_cash - expected_cash) STORED;counted_by|@users;counted_at|t|now();is_final|b|false;notes?|s',checks=('counted_cash >= 0',))
idx('cash_reconciliations','cash_session_id','is_final',True)
table('invoices',12,'Documento fiscal con emisor/receptor históricos; NIT opcional.','bill_id|@bills;customer_id?|@customer_profiles;document_type|s;original_invoice_id?|@invoices;series|s;document_number|s;status|s|\'DRAFT\';issuer_snapshot|j;customer_name_snapshot|s;tax_identifier_snapshot?|s;address_snapshot?|s;currency_id|@currencies;subtotal|m;tax_total|m;total|m;issued_at?|t;voided_at?|t;void_reason?|s;external_authorization?|s;document_uri?|s',unique=('series, document_number','external_authorization'),checks=(state('document_type','INVOICE CREDIT_NOTE'),state('status','DRAFT ISSUED VOID'),'subtotal >= 0 AND tax_total >= 0 AND total = subtotal + tax_total',"document_type <> 'CREDIT_NOTE' OR original_invoice_id IS NOT NULL"))
table('fiscal_allocations',12,'Reserva del pool facturable por documento en una sesión o cuenta.','invoice_id|@invoices;bill_id|@bills;allocated_amount|m;released_at?|t',unique=('invoice_id, bill_id',),checks=('allocated_amount > 0',))
table('fiscal_attempts',12,'Intento de certificación externa por documento; UNKNOWN requiere conciliación.','invoice_id|@invoices;provider|s;request_id|u;status|s;submitted_at|t|now();completed_at?|t;provider_reference?|s;error_code?|s',unique=('request_id',),checks=(state('status','PENDING_CERTIFICATION CERTIFYING CERTIFIED REJECTED UNKNOWN CONTINGENCY CANCELLATION_PENDING CANCELLED'),))
table('fiscal_artifacts',12,'XML/PDF/acuses inmutables en storage con hash y referencia fiscal.','invoice_id|@invoices;artifact_type|s;storage_key|s;sha256|s;provider_uuid?|s;series?|s;document_number?|s',unique=('storage_key',),checks=(state('artifact_type','ORIGINAL_XML CERTIFIED_XML PDF ACKNOWLEDGEMENT'),'length(sha256) = 64'))
table('invoice_items',12,'Líneas fiscales congeladas; nunca releer precios actuales del menú.','invoice_id|@invoices;bill_item_id?|@bill_items;description_snapshot|s;quantity|n;unit_price|m;discount_amount|m|0;tax_amount|m|0;line_total|m',checks=('quantity > 0','unit_price >= 0 AND discount_amount >= 0 AND tax_amount >= 0','line_total = round(quantity * unit_price, 2) - discount_amount + tax_amount','line_total >= 0'))
# IA y visión
table('ai_sessions',13,'Sesión operativa de IA; sin razonamiento interno.','conversation_id?|@conversations;initiated_by?|@users;model_reference|s;status|s|\'ACTIVE\';started_at|t|now();ended_at?|t;correlation_id?|u',checks=(state('status','ACTIVE COMPLETED HANDED_OFF FAILED'),))
table('ai_tool_calls',13,'Invocación autorizada de herramienta con datos redactados.','ai_session_id|@ai_sessions;tool_name|s;arguments_redacted|j;result_summary?|j;status|s;authorized_user_id?|@users;started_at|t;finished_at?|t;request_id|u;correlation_id?|u',checks=(state('status','REQUESTED ALLOWED DENIED SUCCEEDED FAILED'),'finished_at IS NULL OR finished_at >= started_at'))
table('ai_handoffs',13,'Escalamiento a humano y resultado de aceptación.','ai_session_id|@ai_sessions;conversation_id|@conversations;reason|s;requested_at|t|now();accepted_by?|@users;accepted_at?|t;resolved_at?|t')
table('ai_feedback',13,'Corrección revisable; jamás dispara aprendizaje automático.','ai_session_id|@ai_sessions;message_id?|@messages;rating?|i;outcome|s;human_answer?|s;correction?|s;category?|s;status|s|\'RECORDED\';reviewed_by?|@users;reviewed_at?|t',checks=('rating IS NULL OR rating BETWEEN 1 AND 5',state('status','RECORDED TRAINING_CANDIDATE APPROVED REJECTED')))
table('ai_dataset_versions',13,'Dataset versionado aprobado por humano para entrenamiento separado.','version_tag|s;storage_key|s;sha256|s;record_count|i;status|s|\'DRAFT\';approved_by?|@users;approved_at?|t',unique=('version_tag',),checks=('record_count >= 0','length(sha256) = 64',state('status','DRAFT REVIEWED APPROVED RETIRED')))
table('voucher_evidence',13,'Extracción visual no equivale a pago confirmado.','payment_id?|@payments;order_id?|@orders;storage_key|s;sha256|s;status|s|\'RECEIVED\';extracted_fields|j|\'{}\'::jsonb;reviewed_by?|@users;reviewed_at?|t;review_reason?|s',unique=('sha256',),checks=(state('status','RECEIVED EXTRACTED MATCHED NEEDS_REVIEW VERIFIED REJECTED'),'length(sha256) = 64'))
table('camera_sources',13,'Fuentes de cámara; credenciales en gestor de secretos externo.','code|s;name|s;location_description|s;stream_reference|s;active|b|true',unique=('code',),mutable=True)
table('vision_events',13,'Detección sin video pesado; evidencia externa opcional.','camera_source_id|@camera_sources;event_type|s;confidence|NUMERIC(7,6);occurred_at|t;model_reference|s;evidence_uri?|s;evidence_expires_at?|t;metadata|j|\'{}\'::jsonb;correlation_id?|u',checks=('confidence BETWEEN 0 AND 1',))
table('vision_event_reviews',13,'Evaluación humana; decisiones previas se conservan.','vision_event_id|@vision_events;reviewer_user_id|@users;decision|s;reason|s;reviewed_at|t|now();supersedes_review_id?|@vision_event_reviews',unique=('supersedes_review_id',),checks=(state('decision','CONFIRM REJECT'),))
# Auditoría configuración eventos
table('audit_logs',14,'Auditoría independiente de la vida de la entidad; snapshots redactados.','actor_user_id?|@users;action|s;entity_type|s;entity_id|u;before_data?|j;after_data?|j;reason?|s;result|s;request_id?|u;correlation_id?|u;actor_label_snapshot?|s',checks=(state('result','SUCCESS FAILURE DENIED'),))
table('system_settings',14,'Configuración versionada por clave; valor JSON validado por contrato.','key|s;version_number|i;value|j;value_schema_version|i;effective_from|t;retired_at?|t;reason|s;created_by|@users',unique=('key, version_number',),checks=('version_number > 0 AND value_schema_version > 0','retired_at IS NULL OR retired_at > effective_from'))
idx('system_settings','key','retired_at IS NULL',True)
table('business_hours',14,'Ventanas semanales locales; cruces de medianoche se dividen en dos filas.','service_type|s;weekday|i;opens_at|time;closes_at|time;timezone_name|s;active|b|true',checks=('weekday BETWEEN 1 AND 7','closes_at > opens_at',state('service_type','RESTAURANT DINE_IN PICKUP DELIVERY ONLINE')),mutable=True)
table('outbox_events',14,'Evento transaccional para publicación al menos una vez; distinto de auditoría.','aggregate_type|s;aggregate_id|u;aggregate_version|i;event_type|s;payload|j;occurred_at|t|now();published_at?|t;attempt_count|i|0;next_attempt_at|t|now();claimed_until?|t;claimed_by?|s;last_error?|s;request_id?|u;correlation_id?|u',checks=('aggregate_version > 0 AND attempt_count >= 0',))
table('email_outbox',14,'Correo transaccional en cola; no bloquea el commit de negocio.','recipient|s;template_code|s;payload|j;status|s|\'PENDING\';attempt_count|i|0;next_attempt_at|t|now();sent_at?|t;provider_message_id?|s;last_error?|s;correlation_id?|u',checks=(state('status','PENDING SENDING SENT FAILED DEAD'),'attempt_count >= 0'))
table('idempotency_keys',14,'Reserva durable por principal, operación y clave para mutaciones críticas.','principal_scope|s;operation|s;key|s;request_hash|s;status|s|\'IN_PROGRESS\';resource_type?|s;resource_id?|u;response_code?|i;response_snapshot?|j;locked_until|t;expires_at|t;completed_at?|t;request_id?|u',unique=('principal_scope, operation, key',),checks=(state('status','IN_PROGRESS COMPLETED FAILED'),'expires_at > created_at','response_code IS NULL OR response_code BETWEEN 100 AND 599'))
# Historial de ejecución y recibo no fiscal del cobro.
hist('production_batch_status_history',8,'production_batches',PROD)
# El singular automático de batches se corrige explícitamente.
TABLES['production_batch_status_history']['columns'][1]['name']='production_batch_id'
table('payment_receipts',12,'Comprobante no fiscal inmutable de cobro; distinto de factura y recepción de mercadería.','payment_id|@payments;receipt_number|s;issued_at|t;amount_snapshot|m;currency_id|@currencies;payer_name_snapshot?|s;document_uri?|s;issued_by|@users',unique=('payment_id','receipt_number'),checks=('amount_snapshot > 0',))
# El borrador exigía numeración fiscal antes de certificar y sólo tres estados.
# En FEL, el certificador asigna identificadores y cada intento tiene estado propio.
for column in TABLES['invoices']['columns']:
 if column['name'] in ('series', 'document_number'):
  column['nullable']=True
TABLES['invoices']['checks']=[
 check.replace("'DRAFT', 'ISSUED', 'VOID'", "'DRAFT', 'PENDING_CERTIFICATION', 'CERTIFYING', 'CERTIFIED', 'REJECTED', 'UNKNOWN', 'CONTINGENCY', 'CANCELLATION_PENDING', 'CANCELLED'")
 for check in TABLES['invoices']['checks']
]
TABLES['invoices']['checks'].append('(series IS NULL) = (document_number IS NULL)')
TABLES['invoices']['checks'].append("status <> 'CERTIFIED' OR (series IS NOT NULL AND document_number IS NOT NULL AND external_authorization IS NOT NULL)")
# El estado transaccional del pago representa el ciclo online y presencial.
TABLES['payments']['checks']=[
 check.replace("'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED'", "'CREATED', 'PENDING', 'REQUIRES_ACTION', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'UNKNOWN', 'REFUNDED'").replace("status <> 'SUCCEEDED'", "status <> 'CAPTURED'")
 for check in TABLES['payments']['checks']
]
TABLES['payments']['columns'][next(i for i,c in enumerate(TABLES['payments']['columns']) if c['name']=='status')]['default']="'CREATED'"
NOTES={
 'users':'Registro público: sólo CLIENTE en user_roles, perfil y estado PENDING_VERIFICATION en una transacción. Activación consume challenge. Email normalizado; cambio requiere nueva verificación. UUID nunca sustituye autorización. Usuarios se desactivan o anonimizan, no se borran.',
 'user_credentials':'Hash de contraseña auto-descriptivo con algoritmo, parámetros y salt (por ejemplo Argon2id); TEXT evita límites arbitrarios. Nunca PIN, contraseña o refresh token sin protección. No incluir hashes en auditoría.',
 'refresh_tokens':'Rotación atómica: bloquear token y sesión, verificar vigencia, marcar used_at y crear sucesor. Reutilización revoca toda la sesión/familia. parent_token_id debe pertenecer a la misma sesión. token_hash usa hash de token aleatorio de alta entropía; la longitud no demuestra seguridad.',
 'verification_challenges':'PIN de baja entropía: code_hash debe ser HMAC con clave fuera de BD o hash robusto con secreto adicional; hash rápido sin secreto no basta. Bloquear fila para incremento/consumo; revocar challenges anteriores del mismo propósito al emitir reemplazo. destination_hash vincula el destino nuevo sin guardar el PIN.',
 'account_lockouts':'El historial es autoridad del bloqueo. locked_until vigente y unlocked_at nulo bloquean. Serializar evaluación bajo bloqueo del usuario; no usar índices parciales con now(). IP e identificador se limitan también para cuentas inexistentes.',
 'customer_profiles':'user_id único y opcional permite comensales o contactos externos sin cuenta. guest_phone sólo corresponde a perfiles sin cuenta; para cuentas consultar users.phone. La vinculación/reconciliación de un invitado requiere autorización y auditoría.',
 'recipes':'Se admiten recetas alternativas del mismo item. La versión elegida se fija en menú, componentes, pedidos y producción; no existe una versión current implícita para reconstruir historia.',
 'recipe_versions':'Publicar congela encabezado y componentes. Subrecetas deben producir el item del componente y estar publicadas. Validar DAG transitivo y unidad base antes de publicar; ver contrato R03.',
 'recipe_components':'quantity está expresada en unidad base del component_item_id para el rendimiento yield_quantity de la versión padre. waste_fraction es fracción de merma [0,1). Consumo bruto = quantity / (1 - waste_fraction). Los componentes elaborados pueden consumirse de stock o expandirse a subreceta, nunca ambos para la misma necesidad.',
 'inventory_lots':'El lote no tiene ubicación única: se mueve y divide entre ubicaciones. Cantidad por ubicación está en inventory_balances; entrada original y evolución en inventory_movements. Caducidad para productos sin vencimiento puede ser NULL. Lote producido enlaza production_output_id; saldo inicial usa source_reason.',
 'inventory_movements':'Asientos inmutables. FK de origen y signo deben corresponder al tipo; reglas R04–R06. Una reversión compensatoria usa ADJUSTMENT o RETURN y reversal_of_id, con cantidad opuesta y mismo lote/ubicación/costo. No modificar ni borrar asientos.',
 'inventory_balances':'Caché transaccional reconstruible: quantity = SUM(quantity_delta). reserved_quantity = SUM(asignaciones abiertas vigentes según liberación contabilizada). Expirar una asignación requiere liberar su reserva atómicamente, no sólo esperar expires_at.',
 'inventory_allocations':'Bloquear saldos en orden estable. Una asignación consumida enlaza movimientos mediante su pedido/producción; liberación y consumo son mutuamente excluyentes. La disponibilidad comercial no permite ignorar cantidad física negativa.',
 'purchase_orders':'Estado resume líneas: purchased_quantity expresa compromiso, no recepción. Prioridad de CANCELLED y estados parciales definida en R05; no hay entrada de inventario al marcar PURCHASED.',
 'goods_receipt_items':'Verificar que la línea pertenece a la orden de la cabecera; varias filas/recepciones y lotes pueden cubrir una línea. Suma aceptada contabilizada no supera comprado salvo ajuste explícito de compromiso antes de recibir.',
 'production_orders':'Cantidad planificada en unidad base del item resultante. Moneda para costos de ejecución; aceptar/modificar/rechazar sugerencias requiere usuario y motivo. IA no contabiliza producción sin decisión autorizada.',
 'production_outputs':'USABLE genera lote y movimiento positivo; WASTE documenta rendimiento perdido y no genera stock utilizable. Costeo real conserva consumo, merma y costo distribuido por salidas. Debe coincidir con el item producido por la receta.',
 'menu_item_availability_overrides':'Resolver primero override de canal vigente más reciente, después ALL más reciente, después cálculo. Vigente: no revocado y no expirado. AVAILABLE no salta cierres operativos ni integridad de stock. El cálculo nunca modifica overrides.',
 'service_status':'Excepción intencional al plural solicitada: singleton operativo. Flags son configuraciones independientes; apertura efectiva exige restaurant_open y permiso del canal. production_in_progress es proyección derivada de lotes, no interruptor humano.',
 'orders':'reservation_id permite preventa/preorder. bill_orders permite varias cuentas por pedido. El contexto mesa no determina propiedad de una cuenta. Precio/receta y notas aceptadas quedan congelados al enviar; reemplazos/anulaciones se auditan.',
 'order_items':'El precio unitario base excluye deltas de modificadores; al facturar se congela precio efectivo incluyendo deltas. Cantidad fraccionaria permite división de cuenta. No editar retrospectivamente una línea SENT; crear reemplazo y cancelación con motivo.',
 'kitchen_ticket_items':'La línea debe pertenecer al pedido de la comanda. Suma de cantidades activas por línea no supera cantidad enviada; retransmisiones usan idempotencia. Área se congela en kitchen_tickets aunque cambie el menú.',
 'bills':'Total venta = SUM(round(quantity * unit_price,2) - discount_amount + tax_amount) de bill_items no anuladas. Saldo venta descuenta asignaciones SALE de pagos CAPTURED y suma reembolsos SALE exitosos. Propina se concilia aparte. Total derivado no se duplica en bills.',
 'bill_items':'Una línea de pedido puede dividirse por cantidad entre cuentas. R08 impide sobrefacturación y mezcla de monedas. unit_price congela precio efectivo; tax_amount es impuesto adicional al precio neto de descuento, con política de impuestos explícita.',
 'payments':'amount es importe a capturar: venta más propina. Comisión se registra en payment_fees y no reduce amount. La moneda se hereda de bills. Sólo CAPTURED liquida saldo; UNKNOWN exige conciliación. Un pago sólo tiene una bill y un método; múltiples métodos producen múltiples filas.',
 'payment_allocations':'SUM(amount) debe igualar payments.amount antes de CAPTURED. Un tip debe pertenecer a la misma bill. Una fila SALE y hasta una por tip. El cambio en efectivo no es venta: amount es efectivo neto aplicado.',
 'payment_refunds':'Nunca cambiar amount del pago exitoso. SUM(reembolsos SUCCEEDED) no supera cobro y refund_allocations limita devolución por venta/propina original. Webhooks se deduplican por idempotencia y referencia externa.',
 'cash_movements':'Sólo efectivo real. Un pago electrónico no produce SALE en caja. Venta en efectivo incluye propina capturada; distribución de propina es salida TIP_PAYOUT. La conciliación registra cierre, no un movimiento negativo ficticio.',
 'cash_reconciliations':'expected_cash = SUM(asientos) hasta corte de cierre bajo bloqueo de sesión. difference se genera en PostgreSQL. Arqueos intermedios se conservan; uno final por sesión. Un faltante no se oculta alterando el saldo esperado.',
 'invoices':'Datos fiscales no se releen del cliente. bill vincula orders mediante bill_orders, sin order_id redundante. Factura y nota de crédito conservan líneas e importes. Política tributaria y autorización del proveedor fiscal requieren definición local antes de producción.',
 'audit_logs':'entity_id no tiene FK: sobrevive a cualquier entidad. actor_user_id RESTRICT mantiene identidad desactivada; actor_label_snapshot conserva presentación cuando sea necesario. Redactar secretos y limitar datos personales en before/after.',
 'outbox_events':'Evento y cambio de negocio se insertan en el mismo commit. Publicación con lease, backoff y reintentos; no promete exactly-once. Consumidores deduplican por event id y ordenan por aggregate_version cuando corresponda.',
 'idempotency_keys':'Tabla justificada por clientes múltiples, reintentos y webhooks. principal_scope se deriva en servidor (usuario/sesión invitada/proveedor), nunca se acepta sin autenticar. Misma clave con request_hash distinto se rechaza; respuesta guardada no contiene secretos. Retención mayor al horizonte de reintento.',
 'system_settings':'Configuración no contiene credenciales. Tipos y rangos por key/value_schema_version en contrato versionado. No usar JSON para relaciones comerciales. Una configuración vigente por clave; programación futura requiere retirar/activar atómicamente en effective_from.',
 'vision_event_reviews':'Nueva revisión conserva la anterior y puede supersederla una sola vez; ambas deben referir al mismo evento. La decisión humana no modifica confidence de detección.',
 'messages':'Invitados se identifican por conversation.customer_id aunque sender_user_id sea NULL. Respuesta debe pertenecer a la misma conversación. Adjuntos por URI; no secretos, tokens ni razonamiento de IA.',
}
for t,n in NOTES.items():TABLES[t]['notes']=n
TABLES['customer_profiles']['checks'].append('user_id IS NULL OR guest_phone IS NULL')
# Rechazar valores numéricos no finitos, incluso NaN que PostgreSQL ordena por encima de números.
for d in TABLES.values():
 for c in d['columns']:
  if c['type'].startswith('NUMERIC'):
   d['checks'].append(c['name'] + "::text NOT IN ('NaN', 'Infinity', '-Infinity')")
# Relaciones compuestas impiden asociaciones cruzadas en documentos.
COMPOSITES=[]
def composite(t,cols,target,targetcols):
 if targetcols not in TABLES[target]['unique']:TABLES[target]['unique'].append(targetcols)
 COMPOSITES.append((t,cols,target,targetcols))
# Se mantienen FK simples para navegación y FK compuestas para coherencia cuando existe contexto redundante.
composite('special_requests','order_item_id, order_id','order_items','id, order_id')
# Índices: rutas operativas y paginación; FK no indexadas automáticamente por PostgreSQL.
for t,cols,where in [
 ('orders','status, ordered_at, id',None),('orders','customer_id, ordered_at, id',None),
 ('order_status_history','order_id, occurred_at, id',None),('order_items','order_id, status',None),
 ('login_attempts','identifier_used, created_at, id',None),('login_attempts','ip_address, created_at',None),
 ('account_lockouts','user_id, locked_until','unlocked_at IS NULL'),
 ('auth_sessions','user_id, expires_at','revoked_at IS NULL'),
 ('verification_challenges','user_id, purpose, expires_at','consumed_at IS NULL AND revoked_at IS NULL'),
 ('inventory_lots','item_id, expires_at, id',None),('inventory_movements','lot_id, location_id, occurred_at, id',None),
 ('inventory_allocations','lot_id, location_id','released_at IS NULL AND consumed_at IS NULL'),
 ('reservations','status, reservation_at, id',None),('kitchen_tickets','preparation_area_id, sent_at, id',"status IN ('QUEUED','IN_PROGRESS')"),
 ('messages','conversation_id, created_at, id',None),('payments','bill_id, status',None),
 ('cash_movements','cash_session_id, occurred_at, id',None),('audit_logs','entity_type, entity_id, created_at, id',None),
 ('audit_logs','request_id',None),('security_events','occurred_at, id',None),('vision_events','camera_source_id, occurred_at, id',None),
 ('outbox_events','next_attempt_at, occurred_at, id','published_at IS NULL'),
 ('menu_item_availability_overrides','menu_item_id, channel, created_at, id','revoked_at IS NULL'),
 ('production_orders','status, planned_start_at, id',None),('deliveries','status, created_at, id',None),
 ('idempotency_keys','expires_at',None),('menu_items','category_id, status, display_order, id',None)]:idx(t,cols,where)
# Índices de soporte de FK sólo si no existe ya un prefijo útil.
for t,d in TABLES.items():
 prefixes=['id']+[x.split(',')[0].strip() for x in d['unique']]+[x['columns'].split(',')[0].strip() for x in d['indexes'] if not x['where']]
 for c in d['columns']:
  if c['ref'] and c['name'] not in prefixes and c['name'] not in ('created_by','updated_by','actor_user_id','revoked_by','granted_by','assigned_by','unlocked_by'):
   idx(t,c['name']);prefixes.append(c['name'])
LEGACY=[
 ('INVENTARIO_PRODUCTO','inventory_balances / stock_thresholds / inventory_movements','Sustituir stock agregado por saldos y libro.','Permite ubicaciones, lotes y reconstrucción.'),
 ('PRODUCTO','items / presentations / supplier_items / supplier_item_prices','Separar catálogo, presentación y proveedor.','El item admite múltiples ofertas y precios históricos.'),
 ('ASIG_PRODUCT_PRODU','recipes / recipe_versions / recipe_components','Convertir asociación en BOM cuantificada.','Una receta puede consumir cualquier item.'),
 ('INVENT_PRODUCC','inventory_lots / inventory_balances / stock_thresholds','Unificar inventarios.','Las preparaciones también son items inventariables.'),
 ('PRODUCCION','items / recipes / production_orders / production_batches / production_outputs','Separar definición y ejecución.','El preliminar mezcla nombre, cantidad y elaboración.'),
 ('MEDIDAS','units','Normalizar dimensiones y conversiones.','Cantidades decimales, sin conversión masa-volumen implícita.'),
 ('PRESENTACION','presentations','Agregar item y factor a unidad base.','Una bolsa no equivale a una cantidad universal.'),
 ('PROVEEDOR','suppliers / supplier_items','Extraer relación muchos a muchos.','Teléfono es texto y no entero.'),
 ('INGREDIENTES','items / recipe_components','Eliminar doble FK producto/producción como identidad.','Un componente tiene una referencia no ambigua a item.'),
 ('INGR_PLAT','recipes / recipe_versions / recipe_components / menu_items','Relacionar platillo con receta versionada.','Congela composición y admite subrecetas.'),
 ('ASIG_AREA_CATE','menu_items.preparation_area_id / menu_categories','Asignar área al platillo.','Una categoría comercial no determina la estación operativa.'),
 ('CATEGORIA','menu_categories / item_types','Separar categoría comercial y clasificación física.','Son dimensiones independientes.'),
 ('AREA','preparation_areas','Conservar área y extender ruteo.','Permite dividir comandas.'),
 ('PLATILLO','menu_items / items','Separar oferta comercial e item físico.','Precios decimales, visibilidad, receta e imagen.'),
 ('ASIG_MOD_PLAT','menu_item_modifier_groups / modifiers','Asociar grupos con cardinalidad de selección.','Controla opciones obligatorias y límites.'),
 ('MODIFICADOR','modifiers / modifier_item_impacts','Precio e impacto de receta separados.','Cambios afectan consumo y disponibilidad.'),
 ('ASIG_EXT_PLAT','menu_item_modifier_groups / modifiers','Unificar extras con modificadores.','Evita dos mecanismos equivalentes.'),
 ('EXTRA','modifiers / modifier_item_impacts','Representar extra como opción con cantidades.','Conserva costo, precio e impacto inventariable.'),
 ('ASIG_DISP_PLAT','menu_item_availability_overrides','Reemplazar asociación estática por decisión temporal.','No sobrescribe decisiones humanas al recalcular.'),
 ('DISPONIBILIDAD','menu_item_availability_overrides / service_status / inventory_allocations','Calcular disponibilidad y conservar override.','No es un simple catálogo de etiquetas.'),
 ('MESAS','dining_tables / dining_table_status_history / reservation_table_assignments','Agregar capacidad, zona y ocupación.','Reservar sin asignar mesa es válido.'),
 ('PEDIDO','orders','Consolidar cabecera comercial.','Mesa y cliente opcionales según canal.'),
 ('ORDEN','order_items / order_item_status_history','Convertir detalle ambiguo en líneas explícitas.','Cantidad y cambios quedan por línea.'),
 ('ASIG_ORD_PLAT','order_items','Eliminar puente sin atributos suficientes.','Cada línea referencia su platillo y precio histórico.'),
 ('PRIVILEGIO','permissions','Conservar permisos atómicos.','Autorización por acción, no sólo administrador.'),
 ('ASIG_PRIV_ESTAT','role_permissions','Reinterpretar asignación a rol.','Estado de cuenta no concede permisos.'),
 ('ESTATUS','roles / users.status','Separar rol de estado.','El preliminar usa estatus como agrupación de privilegios.'),
 ('USUARIO','users / user_credentials / customer_profiles / employee_profiles / user_roles','Separar identidad, secreto, perfil y roles.','Eliminar contraseña corta y rol único.'),
 ('ASIG_PED_TIPED','orders.order_type','Sustituir N:M por atributo obligatorio.','Un pedido tiene una modalidad de cumplimiento.'),
 ('TIPO_PED','orders.order_type','Dominio controlado DINE_IN/PICKUP/DELIVERY.','No confundir modalidad con canal.'),
 ('ASIG_ESTPED_PED','order_status_history / orders.status','Separar historial y estado actual.','Una asociación sin fecha no representa transiciones.'),
 ('ESTADO_PEDIDO','orders.status / order_status_history / orders.estimated_ready_at','Estado controlado y ETA por pedido.','El tiempo aproximado depende del pedido y carga.'),
 ('CUENTA','bills / bill_orders / bill_items / tips','Desacoplar cuenta, mesa y propina.','Permite división por cantidad y reunión de pedidos.'),
 ('ASIG_ESTCUE_CUENTA','bills.status / audit_logs','Estado vigente más auditoría de cambio.','No mantener estados simultáneos contradictorios.'),
 ('EST_CUENT','bills.status','Dominio OPEN/ISSUED/PAID/VOID.','Transiciones protegidas en transacción.'),
 ('TOT_MET_PAG','payments / payment_allocations / payment_refunds','Registrar cobros individuales y reversos.','Un total por método pierde intentos y pagos parciales.'),
 ('MET_PAG','payment_methods','Catálogo configurable.','Identifica efectivo sin acoplar nombre de método.'),
 ('CAJA','cash_registers / cash_sessions / cash_movements / cash_reconciliations','Eliminar ciclo caja-total pagado-cuenta.','Libro de caja, responsables y arqueos independientes.'),
 ('FACTURA','invoices / invoice_items','Preservar datos fiscales e importes históricos.','NIT opcional, emisión/anulación explícitas y notas de crédito.')]
def cname(prefix,*parts):
 n='_'.join([prefix,*parts]);return n if len(n)<=63 else n[:54]+'_'+hashlib.sha1(n.encode()).hexdigest()[:8]
def q(s):return "'"+s.replace("'","''")+"'"
def constraints(t,d):
 out=[(cname('pk',t),'PRIMARY KEY (id)')]
 for n,u in enumerate(d['unique'],1):out.append((cname('uq',t,str(n)),f'UNIQUE ({u})'))
 for n,ch in enumerate(d['checks'],1):out.append((cname('ck',t,str(n)),f'CHECK ({ch})'))
 return out
def fkname(t,c):return cname('fk',t,c['name'])
def typename(c):return c['type'].split(' GENERATED')[0]
def generate():
 sql=['-- WOK ASIAN FOOD — borrador declarativo PostgreSQL 18. No ejecutar en servidores.','-- Fuente: database/design/generate.py. Invariantes adicionales: docs/database/design-decisions.md.','BEGIN;','CREATE SCHEMA wok;','SET search_path = wok, public;','CREATE EXTENSION IF NOT EXISTS btree_gist;']
 for t,d in TABLES.items():
  parts=[]
  for c in d['columns']:
   x='    '+c['name']+' '+c['type']
   if not c['nullable']:x+=' CONSTRAINT '+cname('nn',t,c['name'])+' NOT NULL'
   if c['default'] is not None:x+=' DEFAULT '+c['default']
   parts.append(x)
  parts += ['    CONSTRAINT '+n+' '+v for n,v in constraints(t,d)]
  sql+=['', '-- '+d['purpose'],'CREATE TABLE '+t+' (',',\n'.join(parts),' );']
  sql.append('COMMENT ON TABLE '+t+' IS '+q(d['purpose'])+';')
 for t,d in TABLES.items():
  for c in d['columns']:
   if c['ref']:sql.append(f"ALTER TABLE {t} ADD CONSTRAINT {fkname(t,c)} FOREIGN KEY ({c['name']}) REFERENCES {c['ref']} (id) ON DELETE RESTRICT ON UPDATE RESTRICT;")
 for t,cols,target,targetcols in COMPOSITES:sql.append(f'ALTER TABLE {t} ADD CONSTRAINT {cname("fk",t,"context")} FOREIGN KEY ({cols}) REFERENCES {target} ({targetcols}) ON DELETE RESTRICT ON UPDATE RESTRICT;')
 sql.append('ALTER TABLE reservation_table_assignments ADD CONSTRAINT ex_reservation_tables_period EXCLUDE USING gist (table_id WITH =, occupied_period WITH &&) WHERE (released_at IS NULL);')
 for t,d in TABLES.items():
  for n,x in enumerate(d['indexes'],1):
   x['name']=cname('ux' if x['unique'] else 'ix',t,str(n))
   sql.append('CREATE '+('UNIQUE ' if x['unique'] else '')+'INDEX '+x['name']+' ON '+t+' ('+x['columns']+')'+(' WHERE '+x['where'] if x['where'] else '')+';')
 sql+=['','-- No se incluyen usuarios PostgreSQL, grants, triggers ni procesos de aplicación.','-- Definir privilegios y guardas de inmutabilidad en futuras migraciones antes de producción.','COMMIT;']
 (ROOT/'database/schema/postgresql.sql').write_text('\n'.join(sql)+'\n')
 doc=['# Diccionario de datos WOK','',f'Modelo de {len(TABLES)} tablas. PostgreSQL 18. Generado desde `database/design/generate.py`.','', 'Todas las PK son UUID generados. FK con ON DELETE RESTRICT y ON UPDATE RESTRICT: se conservan identidades y documentos históricos. Los IDs polimórficos de auditoría, outbox e idempotencia son referencias lógicas deliberadamente sin FK.','', 'Nulo: Sí permite NULL. — indica ausencia de default/restricción. PK y UNIQUE crean índices con el nombre de su constraint. Los campos created_at son fecha de registro; occurred_at y equivalentes representan el evento. `updated_at`, actores y `row_version` requieren mantenimiento transaccional; no hay triggers en este borrador.','', 'Las reglas entre filas y las excepciones a 3FN se detallan en [decisiones](design-decisions.md).']
 for t,d in TABLES.items():
  doc += ['',f'## {t}','',d['purpose'],'',f'Dominio: {PAGES[d["page"]]}.','', '| Columna | Tipo de dato | Nulo | Default | PK | FK | Unique |','|---|---|---|---|---|---|---|']
  for c in d['columns']:
   uniques=[n for n,v in constraints(t,d) if v.startswith('UNIQUE') and c['name'] in re.findall(r'\b\w+\b',v)[1:]]
   doc.append('| '+' | '.join([c['name'],c['type'], 'Sí' if c['nullable'] else 'No',c['default'] or '—','Sí' if c['name']=='id' else '—',(c['ref']+'.id; '+fkname(t,c)) if c['ref'] else '—',', '.join(uniques) or '—'])+' |')
  doc+=['','**Constraints y CHECK**','']+[f'- `{n}`: `{v}`.' for n,v in constraints(t,d)]
  if t=='reservation_table_assignments':doc+=['- `ex_reservation_tables_period`: EXCLUDE por mesa e intervalo solapado mientras no se libera.']
  doc+=['','**Índices adicionales**','']+([f'- `{x["name"]}`: '+('UNIQUE ' if x['unique'] else '')+f'`({x["columns"]})`'+(f' WHERE `{x["where"]}`' if x['where'] else '')+'.' for x in d['indexes']] or ['Ninguno; PK/UNIQUE cubren el acceso previsto.'])
  doc+=['','**Relaciones**','']
  for c in d['columns']:
   if c['ref']:
    one=c['name'] in d['unique'];doc.append(f'- `{t}.{c["name"]}` → `{c["ref"]}.id`: cada fila referencia '+('0..1' if c['nullable'] else '1')+' padre; cada padre tiene '+('0..1' if one else '0..N')+' filas. Borrado/actualización: RESTRICT.')
  for ct,cols,target,tc in COMPOSITES:
   if ct==t:doc.append(f'- FK compuesta `{cols}` → `{target}({tc})`: exige contexto coincidente; RESTRICT.')
  doc+=['','**Notas**','',d['notes'] or ('Entidad mutable: actualizar row_version y marcas de edición atómicamente; auditar cambios sensibles.' if d['mutable'] else 'Conservar referencias históricas. Las correcciones de hechos contabilizados se representan con eventos o documentos compensatorios; consultar decisiones para su ciclo de vida.')]
 (ROOT/'docs/database/data-dictionary.md').write_text('\n'.join(doc)+'\n')
 mapping=['# Correspondencia con ERD preliminar','', 'Fuente inspeccionada visualmente: `DIAGRAMA_PREELIMINAR_WOK.jpg` (2111 × 1861). No existe el nombre `DIAGRAMA_PREELIMINAR_WOK(1).jpg` en el inventario inspeccionado. Se conserva el original sin cambios.','',f'Identificadas {len(LEGACY)} entidades, incluyendo las tablas de asociación. Los nombres se transcriben tal como aparecen en los encabezados; no se asume que sus relaciones sean correctas.','', '| OLD ENTITY | NEW ENTITY/ENTITIES | CHANGE | REASON |','|---|---|---|---|']
 mapping += ['| '+' | '.join(row)+' |' for row in LEGACY]
 mapping+=['','Las entidades nuevas de sesiones, reservas, compras/recepciones, lotes, delivery, mensajería, IA, visión, seguridad y outbox no tienen equivalentes completos en el preliminar. No se propone una migración de registros: sólo hay una imagen, sin una base histórica exportada.']
 (ROOT/'docs/database/erd/legacy-mapping.md').write_text('\n'.join(mapping)+'\n')
 drawio()
 (ROOT/'database/design/model.json').write_text(json.dumps(dict(pages=PAGES,tables=TABLES,composite_foreign_keys=COMPOSITES,legacy=LEGACY),ensure_ascii=False,indent=2)+'\n')
def cell(root,id,value,style,x,y,w,h,parent='1',**attrs):
 c=ET.SubElement(root,'mxCell',id=id,value=value,style=style,parent=parent,vertex='1',**attrs);ET.SubElement(c,'mxGeometry',x=str(x),y=str(y),width=str(w),height=str(h),attrib={'as':'geometry'});return c
BOX='rounded=0;whiteSpace=wrap;html=1;fillColor=#17212e;strokeColor=#65758b;fontColor=#e6edf3;align=left;verticalAlign=top;spacing=10;fontSize=12;'
def entity(root,t,x,y,external=False):
 d=TABLES[t];columns=d['columns'][:1] if external else d['columns'];height=60+28*len(columns)
 header=t+(' · referencia' if external else '')
 style='swimlane;html=0;startSize=40;horizontal=1;collapsible=0;container=1;recursiveResize=0;rounded=0;fillColor=#223b55;swimlaneFillColor=#111c29;strokeColor=#7693b1;fontColor=#ffffff;fontSize=16;fontStyle=1;align=left;spacingLeft=12;'
 cell(root,t,header,style,x,y,620,height)
 for i,c in enumerate(columns):
  marker='PK' if c['name']=='id' else 'FK' if c['ref'] else '  '
  value=marker+' '+c['name']+' : '+typename(c)+(' ?' if c['nullable'] else '')
  color='#ffd479' if marker=='PK' else '#88caff' if marker=='FK' else '#d6e0eb'
  style='html=0;whiteSpace=wrap;rounded=0;fillColor='+('#172638' if i%2==0 else '#111c29')+';strokeColor=#314254;fontColor='+color+';fontFamily=monospace;fontSize=13;align=left;spacingLeft=10;verticalAlign=middle;resizable=0;'
  cell(root,t+'__'+c['name'],value,style,0,40+i*28,620,28,parent=t)
 return height

def drawio():
 mx=ET.Element('mxfile',host='app.diagrams.net',type='device')
 for p,name in enumerate(PAGES):
  dia=ET.SubElement(mx,'diagram',id='page-'+str(p),name=name)
  model=ET.SubElement(dia,'mxGraphModel',dx='2000',dy='1200',grid='1',gridSize='10',page='0',pageScale='1',background='#0d1117',math='0',shadow='0')
  root=ET.SubElement(model,'root');ET.SubElement(root,'mxCell',id='0');ET.SubElement(root,'mxCell',id='1',parent='0')
  cell(root,'title',html.escape(name)+'<br>WOK ASIAN FOOD · Entidades, atributos y relaciones · PostgreSQL 18',BOX,20,20,1500,65)
  cell(root,'legend','PK: clave primaria · FK: clave foránea · ?: admite NULL<br>Conexiones: atributo FK → atributo PK; cardinalidad junto a la relación.<br>Las pestañas 01–14 amplían cada dominio. En Overview aparecen las 109 entidades completas.',BOX,20,100,1500,85)
  if p==15:
   for i,row in enumerate(LEGACY):cell(root,'legacy-'+str(i),'<b>'+row[0]+'</b><br>→ '+html.escape(row[1])+'<br><br>'+html.escape(row[2])+'<br>'+html.escape(row[3]),BOX,20+(i%4)*490,220+(i//4)*190,450,165)
   continue
  local=list(TABLES) if p in (0,16) else [t for t,d in TABLES.items() if d['page']==p]
  ys=[230]*4
  if p==0:
   # Cada dominio ocupa una banda; las entidades siempre muestran todas sus filas.
   top=230
   for domain in range(1,15):
    cell(root,'domain-'+str(domain),PAGES[domain],BOX+'fontSize=20;',20,top,3050,50)
    ys=[top+90]*4
    for i,t in enumerate(t for t in local if TABLES[t]['page']==domain):
     col=i%4;h=entity(root,t,20+col*810,ys[col]);ys[col]+=h+150
    top=max(ys)+100
  elif p==16:
   # Lienzo único tradicional: todas las tablas completas, sin paneles de dominio.
   ys=[230]*10
   for i,t in enumerate(local):
    col=i%10;h=entity(root,t,20+col*850,ys[col]);ys[col]+=h+160
  else:
   for i,t in enumerate(local):
    col=i%4;h=entity(root,t,20+col*810,ys[col]);ys[col]+=h+150
  external=sorted({c['ref'] for t in local for c in TABLES[t]['columns'] if c['ref'] and c['ref'] not in local})
  for i,t in enumerate(external):
   x=3330+(i%2)*750;y=230+(i//2)*170
   entity(root,t,x,y,True)
   cell(root,'refpage-'+t,'Detalle: '+PAGES[TABLES[t]['page']],BOX,x,y+95,620,45)
  for t in local:
   d=TABLES[t]
   for c in d['columns']:
    if not c['ref']:continue
    parent_card='0..1' if c['nullable'] else '1'
    child_card='0..1' if c['name'] in d['unique'] else '0..N'
    start='ERzeroToOne' if c['name'] in d['unique'] else 'ERzeroToMany'
    end='ERzeroToOne' if c['nullable'] else 'ERmandOne'
    actor=c['name'] in ('created_by','updated_by','actor_user_id','revoked_by','granted_by','unlocked_by')
    style='edgeStyle=orthogonalEdgeStyle;rounded=0;html=0;strokeWidth=1.3;strokeColor='+('#65758b' if actor else '#69b9e8')+';fontColor=#d3e9fa;fontSize=10;labelBackgroundColor=#0d1117;startArrow='+start+';endArrow='+end+';startFill=0;endFill=0;exitX=1;exitY=0.5;entryX=0;entryY=0.5;'+('dashed=1;' if actor else '')
    edge=ET.SubElement(root,'mxCell',id='edge-'+t+'-'+c['name'],value=child_card+' hijos / '+parent_card+' padre',style=style,parent='1',edge='1',source=t+'__'+c['name'],target=c['ref']+'__id')
    ET.SubElement(edge,'mxGeometry',relative='1',attrib={'as':'geometry'})
  if p==16:
   for t,cols,target,tc in COMPOSITES:
    edge=ET.SubElement(root,'mxCell',id='composite-'+t,value='FK compuesta: ('+cols+') → ('+tc+')',style='edgeStyle=orthogonalEdgeStyle;html=0;strokeColor=#e5ad67;fontColor=#ffd49f;labelBackgroundColor=#0d1117;dashed=1;endArrow=ERzeroToOne;startArrow=ERzeroToMany;',parent='1',edge='1',source=t+'__'+cols.split(',')[0].strip(),target=target+'__'+tc.split(',')[0].strip())
    ET.SubElement(edge,'mxGeometry',relative='1',attrib={'as':'geometry'})
  for t,cols,target,tc in COMPOSITES:
   if t in local:cell(root,'note-'+t,'FK compuesta adicional: '+t+'('+cols+') → '+target+'('+tc+')',BOX,20,max(ys)+50,2400,60)
 ET.indent(mx);ET.ElementTree(mx).write(ROOT/'docs/database/erd/wok-complete-erd.drawio',encoding='utf-8',xml_declaration=True)
if __name__=='__main__':generate();print(f'{len(TABLES)} tablas; {len(LEGACY)} entidades legacy; {len(PAGES)} páginas.')

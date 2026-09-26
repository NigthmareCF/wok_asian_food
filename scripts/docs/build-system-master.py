"""Build a documented, offline handoff from explicitly selected project sources."""
from pathlib import Path
import hashlib, json, re, html, zipfile, os
from markdown_it import MarkdownIt
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/project'
GROUPS=[
('Requisitos originales completos',[
'docs/database/requirements/epics-and-user-stories.txt','docs/database/requirements/business-rules-and-requirements.txt','docs/database/requirements/views-and-mockups.txt']),
('Interpretación funcional desarrollada y revisión individual',[
'docs/database/FUNCTIONAL_SCOPE.md','docs/database/REQUIREMENTS_REVIEW.csv']),
('Contexto y decisiones registradas',[
'docs/WOK_ASIAN_FOOD_CONTEXTO_CENTRAL.md','docs/project/CURRENT_STATE.md','docs/project/TECH_DECISIONS.md']),
('Frontend: arquitectura, colaboración y funciones por portal',[
'docs/frontend/TEAM_GUIDE.md','docs/frontend/channels/README.md','docs/frontend/channels/CLIENT.md','docs/frontend/channels/OPERATIONAL.md','docs/frontend/channels/ADMIN.md','docs/frontend/ARCHITECTURE.md','docs/frontend/FRONTEND_FOUNDATION_BLUEPRINT.md','docs/frontend/WORKSTREAMS.md','docs/frontend/QA_CHECKLIST.md','docs/frontend/ADMIN_HANDOFF.md']),
('Planes anteriores completos: propuestas de entrega, no límite del producto',[
'docs/backend/README.md','docs/backend/DEVELOPMENT_PLAN.md','docs/backend/BACKLOG.md','docs/mobile/README.md','docs/mobile/CLIENT_APP_PLAN.md']),
('Diseño candidato: correspondencia, contratos, brechas y validación',[
'docs/database/README.md','docs/database/BACKEND_MAPPING.md','docs/database/REVIEW_FINDINGS.md','docs/database/design-decisions.md','docs/database/VALIDATION.md','docs/database/VALIDATION.json','docs/database/SOURCE_MANIFEST.json','docs/database/erd/legacy-mapping.md','docs/database/erd/README.md']),
('Evidencia documental de avances: fotografías fechadas, no auditoría actual de código',[
'docs/progress/CLIENT.md','docs/progress/OPERATIONAL.md','docs/progress/ADMIN.md','docs/progress/BACKEND.md','docs/progress/MOBILE.md','docs/progress/DATABASE.md']),
('Diccionario físico completo', ['docs/database/data-dictionary.md']),
('Diagramas textuales completos por dominio', [str(p.relative_to(ROOT)) for p in sorted((ROOT/'docs/database/erd').glob('*.mmd'))]),
('Anexos técnicos íntegros: SQL y modelo declarativo candidatos',[
'database/schema/postgresql.sql','database/design/model.json']),
]
ATTACHMENTS=['docs/database/erd/wok-complete-erd.drawio','docs/database/erd/invoicing-focus.drawio','docs/database/erd/invoicing-focus.svg','database/design/generate.py','database/design/generate_views.py','database/design/validate.py','AGENTS.md']
INTRO='''# Documento maestro integral — WOK Asian Food

Fecha de consolidación: 2026-09-18. Finalidad: preparar un nuevo plan que cubra el funcionamiento esperado del producto completo, con trazabilidad a sus fuentes. **No es aprobación automática del ERD, compromiso de calendario ni certificación de implementación.**

## Cómo interpretar este expediente

Este documento reúne contenido completo, no extractos de los archivos seleccionados. Primero establece cómo conectar requisitos, operaciones y datos; después incorpora las fuentes íntegras organizadas por tema. Las repeticiones entre versiones se conservan deliberadamente para no borrar requisitos ni ocultar diferencias. Los archivos originales se incluyen sin modificaciones en el ZIP y se identifican mediante SHA-256 en el manifiesto.

La parte interpretativa de `FUNCTIONAL_SCOPE.md` desarrolla cada una de las 21 épicas con actores, operaciones, datos, condiciones, excepciones y aceptación propuesta. Contiene literalmente las 308 historias y los anexos de 145 RN y 76 RT. Los tres TXT originales también se incorporan completos, incluyendo el catálogo de vistas y los criterios arquitectónicos. La repetición no añade nuevos requisitos.

Hay cinco niveles que el nuevo plan debe distinguir:

1. **Necesidad documentada:** lo que dicen las historias y reglas. Las fuentes se consideran levantamiento disponible; este expediente no acredita una firma de aprobación de cada requisito.
2. **Interpretación propuesta:** cómo podría ejecutarse el caso de uso, qué información requiere y qué falta decidir. Las propuestas no sustituyen una regla sin decisión registrada.
3. **Diseño candidato:** representación en tablas, contratos y diagramas. Existir en el ERD no prueba que un servicio aplique el comportamiento.
4. **Plan anterior:** priorización y calendario propuestos bajo restricciones concretas. Diferir una función allí no la elimina del producto que ahora se quiere planificar completo.
5. **Evidencia de implementación:** código integrado, migración ejecutada, API autorizada, pantalla conectada y pruebas reproducibles. Los reportes de avance incluidos son históricos; esta consolidación no repite una auditoría integral del código.

La expectativa personal del responsable del producto debe contrastarse con este inventario. No es posible deducir requisitos aún no expresados; cualquier diferencia debe convertirse en decisión o requisito adicional identificable, no quedar como supuesto tácito del desarrollador.

## A. Interpretación integral del funcionamiento esperado

### A.1 Un negocio compartido por varios canales

Cliente web y app móvil consumen el mismo negocio. Operativo gestiona ejecución y Administrativo configura y supervisa. Cambiar canal no crea inventario, permisos ni cuentas paralelos. La app prevista es exclusivamente Cliente; una función operativa móvil adicional sería un cambio de alcance.

La identidad de una persona, su cuenta de acceso, su perfil comercial y sus permisos son conceptos relacionados pero diferentes. Un empleado puede ser también cliente. Una persona puede tener varios roles. Una conversación externa no debe asociarse a un perfil por una mera coincidencia de nombre.

### A.2 Jornada completa del restaurante

**Antes de abrir:** revisar horarios y excepciones del día; personal previsto y realmente disponible; reservas y servicios comprometidos; lotes/remanentes y caducidad; compras pendientes; producciones necesarias; áreas con capacidad reducida. Publicar sólo lo que el sistema puede ofrecer conforme a las reglas. Abrir caja con el procedimiento acordado. La lista sugerida de compras/producciones ayuda a decidir, no ejecuta automáticamente esas acciones.

**Preparación de recursos:** registrar recepción real de compras y sus responsables; crear movimientos de entrada una sola vez; aprobar producción; consumir componentes según versión y registrar rendimiento real. Comprar no es recibir, producir no es vender, reservar no es consumir. La disponibilidad cambia según estos hechos.

**Inicio de atención:** identificar modalidad: local, recoger, delivery o preorden. Verificar servicios activos, horario, identidad/restricciones cuando corresponda y capacidad. En local, abrir atención y asignar mesas; con reserva, revisar condiciones y llegada; en remoto, recibir solicitud y obtener aceptación explícita.

**Confirmación:** validar productos, opciones, cantidades, precio aceptado, disponibilidad material, capacidad y ETA. Revalidar solicitudes que esperaron. Reservar recursos dentro de transacción y comunicar confirmación sólo después del commit. El carrito no aparta stock por defecto.

**Preparación:** distribuir por área; mostrar revisión vigente; registrar avances útiles, no microestados sin valor operativo; coordinar componentes; permitir cambios autorizados con trazabilidad. Una anulación económica no deshace un consumo físico realizado.

**Entrega y cobro:** registrar entrega apropiada a modalidad y aplicar pagos según política. Pago anticipado, preparación, entrega y emisión documental tienen estados separados. Dividir cuenta no duplica producción; entregar al repartidor no demuestra cobro; emitir comprobante no demuestra emisión fiscal.

**Cierre:** conciliar cuentas/saldos, propinas, comisiones, caja e importes externos; resolver o conservar explícitamente operaciones pendientes; registrar diferencias autorizadas; revisar merma, remanentes, lotes y necesidades del siguiente servicio. El procedimiento exacto para una cuenta abierta al cierre necesita política, no un cierre forzado silencioso.

### A.3 Estados y eventos: contrato a acordar

Los siguientes son ciclos conceptuales propuestos, no valores definitivos para un enum o un CHECK SQL:

| Objeto | Situaciones que debe distinguir | Evento que necesita autorización o condición |
|---|---|---|
| Solicitud remota | Recibida, pendiente/en espera, aceptada, rechazada, cancelada; expiración si se acuerda | Aceptación revalida horario, carga, stock y ETA; no ocurre sólo por reconectar. |
| Pedido | Borrador, confirmado, en preparación, listo, entregado/completado, cancelado según avance | Cancelar tras consumo conserva sus efectos físicos y económicos correspondientes. |
| Línea de pedido | Vigente, preparada/lista cuando sea útil, anulada, reemplazada | Reemplazo conserva vínculo; cambios después de comanda generan actualización. |
| Reserva | Solicitud/confirmación según política, llegada, cancelación, retraso/no presentación | Liberar espacio tras tolerancia no borra reserva ni promete reasignación futura. |
| Asignación de mesa | Vigente y terminada, con traslados/uniones históricos | Evitar asignaciones incompatibles y conservar deuda vinculada. |
| Cuenta | Abierta, con pago parcial, liquidada/cerrada; excepción autorizada | Cierre no oculta saldo pendiente. |
| Pago | Registrado/pendiente de validación si aplica, confirmado, corregido/reembolsado por operaciones trazables | Un medio externo puede devolver resultado incierto; no duplicar al reintentar. |
| Producción | Sugerida, aprobada, iniciada, finalizada, suspendida/descartada según fase | Distinguir recursos asignados de consumidos y rendimiento real. |
| Documento de facturación | Borrador, emitido y corrección/anulación según modalidad | Si hay emisor externo, rechazo/timeout/conciliación requieren contrato propio. |
| Impresión | Pendiente, intentada, resultado conocido o incierto, reimpresión explícita | No modificar la transacción del pedido para solucionar un fallo de impresora. |

La diferencia entre estos ciclos y los estados que ya contiene el DDL es una revisión necesaria. No se deben copiar estados del frontend como si fueran contratos de backend aprobados.

### A.4 Integridad entre módulos

Al aceptar pedido deben coordinarse recursos, capacidad, líneas y resultado idempotente. Al recibir compra deben coordinarse recepción y entrada física. Al finalizar producción deben explicarse consumos y salidas. Al cobrar deben concordar importe recibido, aplicaciones y saldo. Al modificar comanda deben concordar versión, líneas y áreas afectadas.

Una FK prueba existencia de un registro relacionado; por sí sola no prueba que sea accesible por el actor, que comparta moneda, que el saldo sea correcto o que su estado permita la acción. Parte de la integridad vive en constraints y parte en servicios transaccionales con pruebas concurrentes.

El backend deriva precios e importes de reglas acordadas. Los datos de formularios son solicitudes, no autoridad para fijar stock, descuentos o privilegios. Las pantallas presentan capacidades y errores del mismo contrato de negocio.

### A.5 Información histórica que no debe perderse

Conservar quién hizo qué y cuándo; precio/nombre/opciones realmente vendidos; receta/version utilizada; dirección acordada de entrega; datos de documento emitido; líneas anuladas y sus reemplazos; revisiones de comanda; lotes y movimientos; aplicaciones de pago y sus correcciones. La conservación concreta de datos personales y contenido de mensajes/cámaras requiere política explícita.

Cambiar un catálogo no reescribe ventas pasadas. Mover una mesa no mueve físicamente registros antiguos sin historia. Eliminar acceso del cliente no elimina automáticamente transacciones auditables. Un informe histórico debe explicarse con datos conservados, no con el catálogo actual.

### A.6 Facturación y conceptos separados

El diseño contiene facturas y líneas, pero el levantamiento de pagos no define por completo emisión, numeración, correcciones, permisos ni integración fiscal. Debe incorporarse un conjunto de casos de uso aprobado, sin presentar una nueva épica como si ya perteneciera a las 21 originales.

Acordar: modalidad académica o real; datos del receptor; consumo documentable; división de documentos; precios/impuestos/redondeo; momento de emisión; numeración; entrega de copia; corrección total/parcial; vínculo a línea original; operación incierta y reintento si interviene proveedor; conciliación con pagos y reembolsos. Las reglas fiscales específicas se investigan cuando se confirme modalidad/jurisdicción/proveedor, no se inventan en este expediente.

### A.7 Qué significa completar un flujo

Para cada recorrido se requiere regla aceptada, estado/transición definidos, persistencia, autorización, transacción, API, experiencia de pantalla, errores/recuperación y evidencia. Una pantalla con datos temporales es progreso frontend; no demuestra cobro, autenticación, stock o envío real. Una tabla sin caso de uso tampoco es una función terminada.

La aceptación debe incluir camino feliz, rechazo por reglas, permiso insuficiente, repetición por red, concurrencia cuando aplica y recuperación. Al menos pedidos y caja necesitan validar duplicación y consistencia. Integraciones reales requieren una estrategia de simulación para pruebas sin presentar esa simulación como producción.

## B. Discrepancias que el nuevo plan debe resolver explícitamente

| Tema | Evidencia disponible | Resolución que falta |
|---|---|---|
| Producto completo y entrega reducida | 21 épicas frente a P0/P1/P2 del plan anterior | Nueva asignación de fases por requisito; no reutilizar exclusiones sin revisión. |
| Calendario | 5–6 semanas y últimas 2–3 reservadas para estabilización | Confirmar fecha real de entrega, capacidad por persona y avance reutilizable; no deducir una fecha del día de generación. |
| Distribución de seis personas | Reparto inicial 3 frontend, 2 backend, 1 app, con rotación | Capacidad efectiva por semana, sin contar a la persona que rota como dos personas simultáneas. |
| Tecnología | Orientación a Java/Spring; Expo propuesto; varias decisiones registradas pendientes | Registrar adopción y versiones; no interpretar una recomendación antigua como aprobación nueva. |
| Repositorios | Fuentes históricas no coinciden completamente | Decisión explícita sobre organización y contratos compartidos. |
| Reservas tardías | RN-065/066 prohíben después del último ingreso | Preorden no crea excepción implícita; contrastar pantallas y corregir si contradicen regla aceptada. |
| Facturación | Tablas presentes; flujo funcional y entrega incompletos | Acordar casos de uso y modalidad antes de migraciones finales. |
| Solicitudes remotas | Espera/revalidación exigidas; modelo/plan usan representaciones distintas | Elegir agregado/estados y migración coherentes. |
| Mesas y comandas | Brechas de agrupación, revisiones e impresión | Resolver contratos y cardinalidades; véanse hallazgos DB-02–05. |
| Identidad y personal | Recreación de cuenta y liquidación por trabajador no cerradas | Resolver identidad histórica y cuenta de empleado antes de declarar cobertura. |
| Continuidad | Operación local exigida con LAN/servidor disponibles | Definir despliegue y responsabilidad del relay remoto, si se habilita. |
| Estado de implementación | Avances documentales de distintas fechas | Auditoría actual de ramas/backend del equipo y pruebas end-to-end antes de estimar restante. |

Las recomendaciones técnicas y referencias externas dentro de documentos históricos se reproducen como estaban. No se verificaron versiones, precios ni documentación externa actual en esta consolidación.

## C. Instrumento para construir el nuevo plan completo

No se asignan semanas ficticias a todo el producto. Primero cada requisito debe quedar en una ficha de ejecución con estos campos:

| Campo | Información que debe contener |
|---|---|
| Identificación | HU/RN/RT originales y requisito adicional aprobado si existe. |
| Resultado esperado | Qué puede hacer el actor y qué hecho de negocio queda confirmado. |
| Condiciones y alcance | Permisos, servicio, identidad, horario, estado previo, límites y fase. |
| Recorrido | Entrada, validaciones, decisión, escritura, respuesta y notificación. |
| Datos | Entidades/relaciones, claves, historia, cantidades, moneda, unidad y timestamps. |
| Consistencia | Invariantes, límite transaccional, concurrencia, idempotencia y compensaciones. |
| Contrato | Comando/consulta, DTO, errores, eventos y adaptación web/app. |
| Alternativas | Rechazo, espera, cancelación, fallo externo, resultado incierto y recuperación. |
| Evidencia | Escenario reproducible, datos de prueba, resultado esperado y prueba ejecutada. |
| Ejecución | Responsable, dependencias, estimación basada en avance real y criterio de terminado. |
| Aprobación | Decisión de PM/negocio/ingeniero y fecha, sin confundir revisión con implementación. |

Dependencias generales para ordenar construcción: identidad/permisos/configuración → catálogo/unidades/recetas → recursos y producción → disponibilidad/aceptación → cocina/entrega → cuentas/pagos/caja → facturación aprobada. Mesas/reservas se integran sobre pedidos y capacidad; mensajería, IA y visión consumen contratos controlados. El orden admite trabajo paralelo, pero no sustituye contratos comunes.

Seguridad y consistencia comienzan con el primer flujo. Las semanas finales permiten endurecer, integrar, reparar y verificar; no son el momento de añadir por primera vez autorización o transacciones a un sistema ya construido.

## D. Procedencia y límites de lectura

La consolidación incorpora únicamente los archivos enumerados a continuación. Las rutas absolutas corresponden a esta máquina. El ZIP conserva rutas relativas del proyecto para compartirlo. El manifiesto permite comprobar exactamente qué versión se incluyó.

Los tres TXT originales se recuperaron previamente del disco externo y hoy se usan sus copias locales verificables. La procedencia del diseño académico se registró en la revisión anterior. No se afirma una nueva lectura del disco externo en esta generación.

El plan histórico menciona notas del vault y diagramas externos que no pudo leer completamente. No se inventan rutas exactas de notas que no quedaron registradas, ni se incorporan notas privadas. Este expediente no certifica una lectura exhaustiva de todo el vault, todos los archivos de la unidad externa o los enlaces Figma. Tampoco incluye una copia del código fuente de la app.

'''
EXTERNAL=[
'/mnt/One_Touch/UNIVERSIDAD/ANALISIS DE SISTEMAS 1 Y 2/PROYECTO_WOK_DOCUMENTACION/epicas_historias_usuario.txt',
'/mnt/One_Touch/UNIVERSIDAD/ANALISIS DE SISTEMAS 1 Y 2/PROYECTO_WOK_DOCUMENTACION/reglas_negocio_requisitos_tecnicos.txt',
'/mnt/One_Touch/UNIVERSIDAD/ANALISIS DE SISTEMAS 1 Y 2/PROYECTO_WOK_DOCUMENTACION/vistas_mockups_rgb.txt']
# Rebase Markdown links, preserving fenced source code and all prose.
def renderable(text, source):
 result=[]; fenced=False; marker=''
 for line in text.splitlines(keepends=True):
  fence=re.match(r'^\s*(`{3,}|~{3,})',line)
  if fence:
   if not fenced: fenced=True;marker=fence[1][0]
   elif fence[1][0]==marker: fenced=False
   result.append(line);continue
  if not fenced:
   def link(m):
    target=m[2]
    if re.match(r'^(?:[a-z]+:|/|#)',target): return m[0]
    bare,sep,frag=target.partition('#')
    dest=(ROOT/source).parent/bare
    if not dest.exists(): return m[0]
    rel=os.path.relpath(dest,OUT)
    return '['+m[1]+']('+rel+(sep+frag if sep else '')+')'
   line=re.sub(r'\[([^\]\n]*)\]\(([^)\n]+)\)',link,line)
   line=re.sub(r'^(#{1,5}) ',lambda m:'#'+m[1]+' ',line)
  result.append(line)
 return ''.join(result)
records=[]; pieces=[INTRO]; index=['# Rutas exactas del expediente WOK\n\nFecha: 2026-09-18. Inventario del contenido utilizado/consolidado, no afirmación de auditoría completa del código.\n\n## Originales externos recuperados previamente\n\n']
index += [f'- `{v}`\n' for v in EXTERNAL]
index.append('\nRaíz de procedencia histórica del diseño académico: `/mnt/One_Touch/UNIVERSIDAD/DESARROLLO WEB/`. Las rutas lógicas de cada copia se conservan en `docs/database/SOURCE_MANIFEST.json`. No se verificó nuevamente ese disco en esta consolidación.\n\n## Fuentes locales íntegras\n\n')
toc=['## Índice de fuentes completas\n\n']; bodies=[]; number=0
for title,paths in GROUPS:
 index.append(f'### {title}\n\n')
 for path in paths:
  number+=1; file=ROOT/path; data=file.read_bytes(); original=data.decode('utf-8-sig')
  rec={'id':f'S{number:03}','group':title,'absolute_path':str(file),'archive_path':path,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'in_master':True}
  records.append(rec); sid=rec['id']; index.append(f'- **{sid}** `{file}`\n')
  toc.append(f'- [{sid} — {path}](#source-{sid.lower()})\n')
  bodies.append(f'\n<a id="source-{sid.lower()}"></a>\n\n## {sid}. {title} — `{path}`\n\nRuta exacta: `{file}`.\n\nContenido completo de la fuente; conservar su fecha, alcance y estado al interpretarlo. SHA-256 del original: `{rec["sha256"]}`.\n\n')
  if file.suffix=='.md': bodies.append(renderable(original,path)+'\n')
  else:
   lang={'.txt':'text','.csv':'csv','.sql':'sql','.json':'json','.mmd':'text'}.get(file.suffix,'text')
   longest=max([len(x) for x in re.findall(r'`+',original)] or [0]); fence='`'*max(3,longest+1)
   bodies.append(f'{fence}{lang}\n{original}'+('' if original.endswith('\n') else '\n')+f'{fence}\n')
 index.append('\n')
index.append('## Adjuntos de diseño y herramientas: archivos completos dentro del ZIP\n\n')
for path in ATTACHMENTS:
 file=ROOT/path; data=file.read_bytes()
 records.append({'id':f'A{len([r for r in records if not r["in_master"]])+1:03}','group':'Adjunto técnico','absolute_path':str(file),'archive_path':path,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'in_master':False})
 index.append(f'- `{file}`\n')
index.append('\n## Límites de procedencia\n\nNo se inventaron rutas del vault no registradas. No se copiaron notas privadas. Los archivos adjuntos de diagramas/generadores son soporte técnico, no evidencia de validación semántica exhaustiva. El SQL y JSON se reproducen íntegros en el maestro; los Draw.io, SVG y generadores están completos en el ZIP, no volcados como XML/código de herramienta en el cuerpo de lectura.\n')
indextext=''.join(index)
(OUT/'SYSTEM_SOURCE_PATHS.md').write_text(indextext)
manifest={'date':'2026-09-18','status':'COMPLETE_DOCUMENTARY_CONSOLIDATION_NOT_IMPLEMENTATION_CERTIFICATION','external_sources_previously_recovered':EXTERNAL,'sources':records}
(OUT/'SYSTEM_MASTER_MANIFEST.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
pieces+=['\n'+indextext+'\n',''.join(toc)]+bodies
master=''.join(pieces)
(OUT/'SYSTEM_MASTER.md').write_text(master)
renderer=MarkdownIt('commonmark',{'html':True}).enable('table')
body=renderer.render(master)
# A standalone reader does not load images or scripts from external references.
body=re.sub(r'<img\b[^>]*>', '[Imagen referenciada; consultar archivo fuente]',body)
page='''<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>WOK — Documento maestro integral</title><style>body{max-width:1120px;margin:40px auto;padding:0 24px;font:17px/1.6 system-ui;color:#18202a;background:#fff}h1,h2,h3{line-height:1.25}h2{margin-top:3em;border-bottom:1px solid #bbb;padding-bottom:.5em}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f5f7;padding:18px;font:13px/1.5 monospace}code{overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;font-size:14px;display:block;overflow:auto}td,th{border:1px solid #ccc;padding:10px;vertical-align:top}a{color:#135a9d}a[id]{scroll-margin-top:20px}@media print{body{max-width:none;font-size:11pt}pre{font-size:8pt}h2{break-before:page}tr{break-inside:avoid}}</style><body>'''+body+'</body></html>'
(OUT/'SYSTEM_MASTER.html').write_text(page)
package=OUT/'WOK_SYSTEM_MASTER_2026-09-18.zip'
with zipfile.ZipFile(package,'w',zipfile.ZIP_DEFLATED) as z:
 for r in records:z.write(ROOT/r['archive_path'],r['archive_path'])
 for name in ['SYSTEM_MASTER.md','SYSTEM_MASTER.html','SYSTEM_SOURCE_PATHS.md','SYSTEM_MASTER_MANIFEST.json']:
  z.write(OUT/name,'docs/project/'+name)
 z.write(Path(__file__),'scripts/docs/build-system-master.py')
 z.writestr('LEEME.txt','WOK — expediente completo, 2026-09-18\nExtraer el ZIP conservando carpetas. Abrir docs/project/SYSTEM_MASTER.html en navegador o SYSTEM_MASTER.md en editor.\nRutas originales: SYSTEM_SOURCE_PATHS.md. Integridad: SYSTEM_MASTER_MANIFEST.json.\nNo ejecutar el SQL automáticamente: diseño candidato sin aprobación ni prueba PostgreSQL completa.\n')
# Verify payload identities and coverage, not runtime implementation.
with zipfile.ZipFile(package) as z:
 assert z.testzip() is None
 for r in records: assert hashlib.sha256(z.read(r['archive_path'])).hexdigest()==r['sha256']
for kind,count in [('HU',308),('RN',145),('RT',76)]:
 pattern=rf'\b{kind}-'+(r'[A-Z]+-' if kind=='HU' else '')+r'\d+\b'
 assert len(set(re.findall(pattern,(ROOT/'docs/database/FUNCTIONAL_SCOPE.md').read_text())))==count
print(json.dumps({'source_files':len(records),'full_inline_sources':number,'master_words':len(master.split()),'master_bytes':len(master.encode()),'zip_bytes':package.stat().st_size,'zip_integrity':'PASS','original_hashes':'PASS'},indent=2))

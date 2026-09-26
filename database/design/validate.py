"""Valida artefactos locales sin abrir conexiones ni ejecutar SQL."""
from pathlib import Path
from datetime import date
import hashlib
import importlib.util
import json
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
model = json.loads((ROOT / "database/design/model.json").read_text())
tables = model["tables"]
sql = (ROOT / "database/schema/postgresql.sql").read_text()
dictionary = (ROOT / "docs/database/data-dictionary.md").read_text()
errors = []


def check(condition, message):
    if not condition:
        errors.append(message)


check(len(tables) >= 109, "Se perdieron entidades de la base recuperada")
check({"auth_identities", "service_capabilities", "payment_intents", "fiscal_attempts", "email_outbox", "ai_feedback"}.issubset(tables), "Entidades del nuevo alcance ausentes")
check(set(re.findall(r"CREATE TABLE (\w+) \(", sql)) == set(tables), "Tablas DDL/modelo")
check(set(re.findall(r"^## (\w+)$", dictionary, re.M)) == set(tables), "Tablas diccionario/modelo")
names = re.findall(r"(?:CONSTRAINT|INDEX) (\w+)", sql)
check(len(names) == len(set(names)), "Nombres de restricciones/indices repetidos")
check(all(len(n) <= 63 for n in names), "Identificador PostgreSQL demasiado largo")
foreign_keys = []
for name, table in tables.items():
    columns = table["columns"]
    column_names = [c["name"] for c in columns]
    check(len(column_names) == len(set(column_names)), f"Columnas repetidas: {name}")
    check(columns[0]["name"] == "id" and columns[0]["type"] == "UUID" and not columns[0]["nullable"], f"PK: {name}")
    block = re.search(r"CREATE TABLE " + name + r" \(\n(.*?)\n \);", sql, re.S)
    check(block is not None, f"Definicion SQL ausente: {name}")
    if block:
        actual = re.findall(r"^    (?!CONSTRAINT\b)(\w+) ", block[1], re.M)
        check(actual == column_names, f"Orden/lista de columnas DDL/modelo: {name}")
        for c in columns:
            line = next((l for l in block[1].splitlines() if l.startswith("    " + c["name"] + " ")), "")
            check(line.startswith("    " + c["name"] + " " + c["type"]), f"Tipo DDL: {name}.{c['name']}")
            check((" NOT NULL" in line) == (not c["nullable"]), f"NULL DDL: {name}.{c['name']}")
            if c["default"] is not None:
                check(" DEFAULT " + c["default"] in line, f"DEFAULT DDL: {name}.{c['name']}")
        for unique in table["unique"]:
            check("UNIQUE (" + unique + ")" in block[1], f"UNIQUE DDL: {name}/{unique}")
        for expr in table["checks"]:
            check("CHECK (" + expr + ")" in block[1], f"CHECK DDL: {name}/{expr}")
    for c in columns:
        check(c["type"] not in {"FLOAT", "REAL", "DOUBLE PRECISION"}, f"Numero aproximado: {name}.{c['name']}")
        if c["ref"]:
            check(c["ref"] in tables and c["type"] == "UUID", f"FK invalida: {name}.{c['name']}")
            fragment = f"FOREIGN KEY ({c['name']}) REFERENCES {c['ref']} (id) ON DELETE RESTRICT ON UPDATE RESTRICT"
            check(fragment in sql, f"FK DDL: {name}.{c['name']}")
            foreign_keys.append((name, c["name"], c["ref"]))
    for unique in table["unique"]:
        check(all(c.strip() in column_names for c in unique.split(",")), f"UNIQUE desconocida: {name}")
    for idx in table["indexes"]:
        check(all(c.strip() in column_names for c in idx["columns"].split(",")), f"Indice desconocido: {name}")
        fragment = f"INDEX {idx['name']} ON {name} ({idx['columns']})"
        if idx["where"]:
            fragment += " WHERE " + idx["where"]
        check(fragment in sql, f"Indice DDL: {idx['name']}")

for child, cols, parent, target_cols in model["composite_foreign_keys"]:
    check(child in tables and parent in tables, "FK compuesta: tablas")
    for table_name, col_list in [(child, cols), (parent, target_cols)]:
        check(all(c.strip() in {x['name'] for x in tables[table_name]['columns']} for c in col_list.split(',')), "FK compuesta: columnas")
    check(target_cols in tables[parent]["unique"], "FK compuesta: destino sin UNIQUE")
    check(f"FOREIGN KEY ({cols}) REFERENCES {parent} ({target_cols})" in sql, "FK compuesta DDL")

check("ex_reservation_tables_period EXCLUDE" in sql, "Exclusion de reservas ausente")
check(sql.count("ON DELETE RESTRICT ON UPDATE RESTRICT") == len(foreign_keys) + len(model["composite_foreign_keys"]), "Conteo de FK DDL")
xml = ET.parse(ROOT / "docs/database/erd/wok-complete-erd.drawio")
pages = xml.findall("diagram")
check([p.get("name") for p in pages] == model["pages"], "Paginas ERD/modelo")
for page_index, page in enumerate(pages):
    cells = page.findall(".//mxCell")
    by_id = {c.get("id"): c for c in cells}
    check(len(cells) == len(by_id), f"IDs repetidos en pagina {page_index}")
    for cell in cells:
        if cell.get("edge") == "1":
            check(cell.get("source") in by_id and cell.get("target") in by_id, f"Arista rota en pagina {page_index}")
    if page_index == 15:
        continue
    local = tables if page_index in (0, 16) else {n: t for n, t in tables.items() if t["page"] == page_index}
    rectangles = []
    for name, table in local.items():
        check(name in by_id, f"Entidad ausente ERD: {page_index}/{name}")
        if name not in by_id: continue
        g = by_id[name].find("mxGeometry")
        rect = tuple(float(g.get(k)) for k in ("x", "y", "width", "height"))
        x,y,w,h = rect
        check(w > 0 and h > 0, f"Geometria invalida: {name}")
        for other,(ox,oy,ow,oh) in rectangles:
            check(x+w <= ox or ox+ow <= x or y+h <= oy or oy+oh <= y, f"Entidades solapadas: {name}/{other}")
        rectangles.append((name, rect))
        text = "\n".join(c.get("value", "") for c in cells if c.get("parent") == name)
        for c in table["columns"]:
            check(c["name"] + " : " + c["type"].split(" GENERATED")[0] in text, f"Columna ERD: {name}.{c['name']}")
            if c["ref"]:
                edge = by_id.get(f"edge-{name}-{c['name']}")
                check(edge is not None and edge.get("source") == name+"__"+c["name"] and edge.get("target") == c["ref"]+"__id", f"FK/PK ERD: {name}.{c['name']}")

manifest = json.loads((ROOT / "docs/database/SOURCE_MANIFEST.json").read_text())
for entry in manifest["sources"]:
    check(hashlib.sha256((ROOT/entry["copy"]).read_bytes()).hexdigest() == entry.get("current_sha256", entry["sha256"]), f"Divergencia de artefacto: {entry['copy']}")

migration = (ROOT / "database/migrations/V1__identity_and_core.sql").read_text()
builder_spec = importlib.util.spec_from_file_location("build_initial_migration", ROOT / "database/design/build_initial_migration.py")
builder = importlib.util.module_from_spec(builder_spec)
builder_spec.loader.exec_module(builder)
check(migration == builder.render(), "V1 difiere del corte revisado de la fuente declarativa")
check("CREATE SCHEMA wok;" in migration, "V1 sin esquema WOK")
check(set(re.findall(r"CREATE TABLE (\w+) \(", migration)).issubset(tables), "V1 tiene tablas sin fuente declarativa")
check("CREATE TABLE auth_identities (" in migration and "CREATE TABLE email_outbox (" in migration, "V1 carece de identidad externa o correo")
check("CREATE TABLE payment_intents (" not in migration, "V1 incluye pagos sin revisar corte financiero")
reservation_migration = (ROOT / "database/migrations/V3__tables_and_reservations.sql").read_text()
reservation_spec = importlib.util.spec_from_file_location("build_reservation_migration", ROOT / "database/design/build_reservation_migration.py")
reservation_builder = importlib.util.module_from_spec(reservation_spec)
reservation_spec.loader.exec_module(reservation_builder)
check(reservation_migration == reservation_builder.render(), "V3 difiere del corte revisado de la fuente declarativa")
check("ex_reservation_tables_period EXCLUDE USING gist" in reservation_migration, "V3 carece de exclusion de solape")

requirements = (ROOT / "docs/database/requirements/business-rules-and-requirements.txt").read_text()
epics = (ROOT / "docs/database/requirements/epics-and-user-stories.txt").read_text()
rn = re.findall(r"^RN-\d+\.", requirements, re.M)
rt = re.findall(r"^RT-\d+\.", requirements, re.M)
ep = re.findall(r"^EP-\d+\.", epics, re.M)
hu = re.findall(r"^HU-[A-Z]+-\d+\.", epics, re.M)
check((len(rn),len(rt),len(ep)) == (145,76,21), "Conteos de requisitos originales")

# Parser opcional: nunca instalar dependencias ni conectar a un servidor aqui.
parser = "No disponible; no se acredita analisis sintactico completo ni ejecucion PostgreSQL."
try:
    from pglast import parse_sql
    statements = parse_sql(sql)
    parser = f"pglast analizo {len(statements)} sentencias; no se ejecutaron."
except ImportError:
    pass
except Exception as exc:
    errors.append("Parser SQL: " + str(exc))

summary = {
    "date": date.today().isoformat(), "status": "PASS_STATIC" if not errors else "FAIL",
    "tables": len(tables), "columns": sum(len(t['columns']) for t in tables.values()),
    "simple_foreign_keys": len(foreign_keys), "composite_foreign_keys": len(model['composite_foreign_keys']),
    "diagram_pages": len(pages), "explicit_indexes": sum(len(t['indexes']) for t in tables.values()),
    "epics": len(ep), "user_stories": len(hu), "business_rules": len(rn), "technical_requirements": len(rt),
    "sql_parser": parser, "sql_executed": False, "business_rules_implemented": False, "errors": errors,
}
(ROOT/"docs/database/VALIDATION.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2)+"\n")
print(json.dumps(summary, ensure_ascii=False, indent=2))
raise SystemExit(1 if errors else 0)

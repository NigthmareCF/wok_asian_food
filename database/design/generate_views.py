"""Vistas derivadas del modelo: Mermaid por dominio y foco de facturacion.

No ejecuta SQL ni modifica el modelo importado. Solo usa la biblioteca estandar.
"""
from pathlib import Path
import html
import json
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs/database/erd"
MODEL = json.loads((ROOT / "database/design/model.json").read_text())
TABLES = MODEL["tables"]
FOCUS = {
    "orders": (40, 100),
    "bill_orders": (550, 100),
    "bills": (1060, 100),
    "invoice_items": (40, 600),
    "invoices": (550, 600),
    "bill_items": (1060, 600),
    "payment_receipts": (550, 1100),
    "payments": (1060, 1100),
}
ATTRIBUTES = {
    "orders": "id customer_id channel order_type status currency_id accepted_at",
    "bill_orders": "id bill_id order_id",
    "bills": "id customer_id currency_id status issued_at closed_at",
    "invoice_items": "id invoice_id bill_item_id description_snapshot quantity unit_price tax_amount line_total",
    "invoices": "id bill_id document_type original_invoice_id series document_number status total external_authorization",
    "bill_items": "id bill_id order_item_id line_type quantity unit_price tax_amount voided_at",
    "payment_receipts": "id payment_id receipt_number issued_at amount_snapshot currency_id",
    "payments": "id bill_id payment_method_id amount status provider_reference paid_at",
}
WIDTH, HEIGHT = 400, 345


def alias(name):
    parts = name.split("_")
    return parts[0] + "".join(p.title() for p in parts[1:])


def scalar_unique(table, column):
    # Un indice parcial no establece una cardinalidad global 1:1.
    return column in TABLES[table]["unique"] or any(
        i["unique"] and not i["where"] and i["columns"].strip() == column
        for i in TABLES[table]["indexes"]
    )


def mermaid(page):
    local = {n for n, t in TABLES.items() if t["page"] == page}
    external = {
        c["ref"] for n in local for c in TABLES[n]["columns"]
        if c["ref"] and c["ref"] not in local
    }
    lines = ["erDiagram", "    %% Vista fisica: la cardinalidad proviene de NULL y UNIQUE.",
             "    %% Referencias externas muestran solo PK. Un padre puede tener cero hijos."]
    for n in sorted(local | external):
        lines.append(f'    {alias(n)}["{n}"] {{')
        for c in TABLES[n]["columns"]:
            if n in external and c["name"] != "id":
                continue
            dtype = c["type"].split(" GENERATED")[0].split("(")[0].lower()
            keys = []
            if c["name"] == "id": keys.append("PK")
            if c["ref"]: keys.append("FK")
            if scalar_unique(n, c["name"]): keys.append("UK")
            mark = " " + ", ".join(keys) if keys else ""
            note = ' "NULL permitido"' if c["nullable"] else ""
            lines.append(f'        {dtype} {c["name"]}{mark}{note}')
        lines.append("    }")
    for n in sorted(local):
        for c in TABLES[n]["columns"]:
            if not c["ref"]: continue
            parent = "|o" if c["nullable"] else "||"
            child = "o|" if scalar_unique(n, c["name"]) else "o{"
            # FK no forma parte de PK: relacion fisica no identificadora.
            lines.append(f'    {alias(c["ref"])} {parent}..{child} {alias(n)} : "{c["name"]}"')
    for child, cols, parent, target_cols in MODEL["composite_foreign_keys"]:
        if child in local:
            lines.append(f'    %% FK compuesta adicional {child}({cols}) -> {parent}({target_cols}).')
            lines.append(f'    {alias(parent)} |o..o{{ {alias(child)} : "FK compuesta contextual"')
    return "\n".join(lines) + "\n"


def focus():
    mx = ET.Element("mxfile", host="app.diagrams.net")
    diagram = ET.SubElement(mx, "diagram", id="invoicing", name="Facturacion - relaciones principales")
    graph = ET.SubElement(diagram, "mxGraphModel", grid="1", page="1", pageWidth="1520", pageHeight="1510", background="#f8fafc")
    root = ET.SubElement(graph, "root")
    ET.SubElement(root, "mxCell", id="0")
    ET.SubElement(root, "mxCell", id="1", parent="0")

    def cell(cid, label, x, y, w, h, style):
        element = ET.SubElement(root, "mxCell", id=cid, value=label, vertex="1", parent="1", style=style)
        ET.SubElement(element, "mxGeometry", x=str(x), y=str(y), width=str(w), height=str(h), attrib={"as": "geometry"})

    title = "WOK | Facturacion, cuentas y pagos"
    note = "Vista parcial del modelo de 109 tablas. Flecha: tabla hija -> padre. NULL/UNIQUE determinan cardinalidad."
    cell("title", title, 40, 15, 1420, 40, "text;html=0;fontSize=24;fontStyle=1;align=left;")
    cell("note", note, 40, 55, 1420, 32, "text;html=0;fontSize=12;align=left;")
    svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="1510" height="1510" viewBox="0 0 1510 1510">',
           '<rect width="1510" height="1510" fill="#f8fafc"/>',
           '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#52627a"/></marker></defs>',
           f'<text x="40" y="42" font-family="sans-serif" font-size="26" font-weight="bold" fill="#132338">{html.escape(title)}</text>',
           f'<text x="40" y="75" font-family="sans-serif" font-size="13" fill="#44556b">{html.escape(note)}</text>']
    # Rutas por calles entre tablas; tambien se conservan como aristas editables.
    paths = {
        ("bill_orders", "order_id"): [(550, 210), (440, 210)],
        ("bill_orders", "bill_id"): [(950, 260), (1060, 260)],
        ("bill_items", "bill_id"): [(1350, 600), (1350, 445)],
        ("invoices", "bill_id"): [(840, 600), (840, 500), (1180, 500), (1180, 445)],
        ("invoice_items", "invoice_id"): [(440, 710), (550, 710)],
        ("invoice_items", "bill_item_id"): [(350, 600), (350, 545), (1270, 545), (1270, 600)],
        ("invoices", "original_invoice_id"): [(550, 850), (490, 850), (490, 920), (550, 920)],
        ("payments", "bill_id"): [(1460, 1280), (1490, 1280), (1490, 380), (1460, 380)],
        ("payment_receipts", "payment_id"): [(950, 1220), (1060, 1220)],
    }
    for (child, name), points in paths.items():
        col = next(c for c in TABLES[child]["columns"] if c["name"] == name)
        parent = col["ref"]
        pcard = "0..1" if col["nullable"] else "1"
        ccard = "0..1" if scalar_unique(child, name) else "0..N"
        label = f"{name} ({ccard} / {pcard})"
        edge = ET.SubElement(root, "mxCell", id=f"edge-{child}-{name}", value=label, edge="1", parent="1", source=child, target=parent,
                             style="edgeStyle=orthogonalEdgeStyle;html=0;endArrow=block;strokeColor=#52627a;fontSize=11;labelBackgroundColor=#f8fafc;")
        geo = ET.SubElement(edge, "mxGeometry", relative="1", attrib={"as": "geometry"})
        array = ET.SubElement(geo, "Array", attrib={"as": "points"})
        for x, y in points[1:-1]: ET.SubElement(array, "mxPoint", x=str(x), y=str(y))
        path = "M " + " L ".join(f"{x} {y}" for x, y in points)
        svg.append(f'<path d="{path}" fill="none" stroke="#52627a" stroke-width="2" marker-end="url(#arrow)"/>')
        # Etiqueta en el primer segmento, rotada si es vertical.
        x1,y1=points[0];x2,y2=points[1]
        if (child, name) in {("payments", "bill_id"), ("invoices", "original_invoice_id")}:
            x1,y1=points[1];x2,y2=points[2]
        x=(x1+x2)/2;y=(y1+y2)/2
        transform=f' transform="rotate(-90 {x-7} {y})"' if x1==x2 else ""
        svg.append(f'<text x="{x-7 if x1==x2 else x}" y="{y if x1==x2 else y-9}" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#34465d"{transform}>{html.escape(label)}</text>')
    for name, (x, y) in FOCUS.items():
        selected = ATTRIBUTES[name].split()
        rows = []
        for key in selected:
            col = next(c for c in TABLES[name]["columns"] if c["name"] == key)
            marker = "PK" if key == "id" else "FK" if col["ref"] else "  "
            rows.append(f'{marker} {key}' + (" ?" if col["nullable"] else ""))
        cell(name, name + "\n\n" + "\n".join(rows), x,y,WIDTH,HEIGHT,
             "rounded=1;whiteSpace=wrap;html=0;fillColor=#ffffff;strokeColor=#8a9bb0;fontColor=#132338;fontFamily=monospace;fontSize=16;align=left;verticalAlign=top;spacing=16;")
        svg += [f'<rect x="{x}" y="{y}" width="{WIDTH}" height="{HEIGHT}" rx="10" fill="white" stroke="#8a9bb0"/>',
                f'<text x="{x+18}" y="{y+30}" font-family="monospace" font-size="19" font-weight="bold" fill="#173653">{name}</text>',
                f'<path d="M {x} {y+47} H {x+WIDTH}" stroke="#cbd5e1"/>']
        for i,row in enumerate(rows):
            svg.append(f'<text x="{x+18}" y="{y+78+i*27}" font-family="monospace" font-size="15" fill="#334155">{html.escape(row)}</text>')
    footer = "? = nullable. FK externas y columnas omitidas: consultar ERD completo. CREDIT_NOTE referencia factura original; no equivale a reembolso."
    svg.append(f'<text x="40" y="1480" font-family="sans-serif" font-size="12" fill="#44556b">{html.escape(footer)}</text></svg>')
    cell("footer", footer,40,1460,1420,40,"text;html=0;fontSize=12;align=left;")
    ET.indent(mx)
    ET.ElementTree(mx).write(OUT/"invoicing-focus.drawio",encoding="utf-8",xml_declaration=True)
    (OUT/"invoicing-focus.svg").write_text("\n".join(svg))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    index = ["# ERD WOK — índice de vistas", "", f"[ERD completo editable: {len(TABLES)} tablas / {len(MODEL['pages'])} páginas](wok-complete-erd.drawio)", "",
             "[Facturación editable](invoicing-focus.drawio) · [Vista SVG](invoicing-focus.svg)", "",
             "## Diagramas por dominio", "", "Cada archivo Mermaid incluye todas las columnas locales, FK salientes y referencias externas abreviadas. Consultar el diccionario para CHECK, índices y UNIQUE compuestos.", "",
             "| Dominio | Tablas propias | Archivo |", "| --- | ---: | --- |"]
    for page in range(1, 15):
        slug = re.sub(r"[^a-z0-9]+", "-", MODEL["pages"][page].lower()).strip("-")
        filename = slug + ".mmd"
        (OUT/filename).write_text(mermaid(page))
        count=sum(t["page"]==page for t in TABLES.values())
        index.append(f'| {MODEL["pages"][page]} | {count} | [{filename}]({filename}) |')
    index += ["", "Las relaciones son físicas, no pasos de proceso. Una FK NOT NULL obliga al hijo a tener padre; no obliga al padre a tener al menos un hijo. Las FK no son parte de la PK UUID: relaciones no identificadoras. Las condiciones de índices únicos parciales se revisan en SQL y no se presentan como unicidad global.", "",
              "Regenerar vistas: `python3 database/design/generate_views.py` desde la raíz del repositorio. Los Mermaid son derivados; el modelo base no se modifica con este comando."]
    (OUT/"README.md").write_text("\n".join(index)+"\n")
    focus()
    print("Generadas 14 vistas Mermaid, foco de facturación Draw.io/SVG e índice.")


if __name__ == "__main__":
    main()

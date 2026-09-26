"""Generate editable Draw.io pages for WOK architecture and critical flows."""

from pathlib import Path
import html
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "docs/architecture/wok-system-architecture.drawio"

PAGES = {
    "Backend": ["Web / App / Meta", "Nginx TLS / routing", "Spring modular core", "PostgreSQL + outbox", "Storage", "Payment / FEL / Meta / Email ports", "AI Gateway → private runtime"],
    "AI": ["Customer channels", "Messaging + identity", "AI orchestrator + scope guard", "Tool broker → authorized use case", "Filtered DTO ← PostgreSQL via backend", "Private AI runtime + GPU", "Human handoff / template fallback"],
    "Auth": ["Register CLIENT / Google OIDC", "Verify challenge or provider sub", "WOK identity + RBAC", "Short access JWT", "Opaque refresh family + rotation", "Revoke on reuse / logout", "Audit security event"],
    "Client": ["Anonymous menu / service", "Register / verify / login", "Cart draft", "Reservation or pickup or delivery", "Server capacity and checkout", "Tracking / messaging / FEL", "Profile / addresses"],
    "Operational": ["Tables / reservations", "Pending requests", "Orders / KDS / delivery", "Payments / mixed tips", "Cash / FEL workspace", "Messaging / AI handoff", "Inventory / production / health"],
    "Admin": ["Users / roles / sessions", "Security events / audit", "Rules / service capability", "Payments / FEL settings", "Meta / email / AI settings", "Feedback / datasets", "Reports / integration health"],
    "Mobile": ["Expo Client UI", "Access in memory / refresh secure", "Same WOK API hostname", "Offline cart + drafts only", "Online reservation / order", "Payment / FEL / messaging", "No model or backend on phone"],
    "Reservations": ["People + date (≥3h)", "Compatible slots + preorder", "OperationalCapacityService", "Conditions / alternatives / human", "Atomic reservation + audit", "20-minute arrival tolerance"],
    "Payment": ["Server-priced bill", "Payment intent", "Hosted fields / 3DS provider", "Signed webhook + dedup", "Reconcile UNKNOWN", "Cash/mixed allocation + tips"],
    "FEL": ["Billable dining pool", "Multiple drafts", "Emit each via outbox", "FelGateway → certifier → SAT", "Status check UNKNOWN", "XML/PDF/ack + hashes"],
    "Messaging": ["Meta / Web / App webhook", "Signature + raw event + dedup", "External identity verification", "Conversation per channel", "Template / AI / human", "Message outbox + delivery"],
}

FLOWS = {
    "01 Registration": ["Client submit", "Validate + CLIENT only", "Hash password + PENDING", "Challenge + email outbox", "Verify", "ACTIVE + audit"],
    "02 Login": ["Credentials", "Rate limit + password", "Status + RBAC", "WOK JWT + refresh family", "Audit"],
    "03 Google": ["OIDC code + nonce", "Verify issuer/audience/sub", "Find AUTH_IDENTITY", "No auto-link by email", "WOK session"],
    "04 Verification": ["Code received", "HMAC check + TTL/attempts", "Consume once", "Activate CLIENT", "Audit"],
    "05 Refresh": ["Opaque refresh", "Hash + lock family", "Rotate token", "Detect reuse → revoke", "Short JWT"],
    "06 Guest": ["Guest request", "Opaque scoped token", "Owner/operation check", "Limited view", "Expire/revoke"],
    "07 Reservation": ["People/date ≥3h", "Compatible slots/preorder", "Capacity decision", "Human approval if needed", "Atomic booking"],
    "08 Dine-in online": ["Digital table request ≥3h", "Capacity + occupancy", "Conditions/human", "Arrival + dining session", "KDS + bill"],
    "09 Pickup": ["Cart draft", "Time ≥ ETA", "Server reprices/revalidates", "Accept request", "KDS → ready"],
    "10 Delivery": ["Address + phone + order", "Capacity/ETA + payment", "Accept request", "KDS + courier", "Handoff + tracking"],
    "11 Capacity": ["Service state + date/load", "Staff/table/kitchen/stock", "Occupancy estimate", "Decision + reason codes", "Revalidate at commit"],
    "12 Kitchen": ["Accepted order", "Tickets per area/revision", "Prepare + adjust ETA", "Ready", "Notify + audit"],
    "13 Online card": ["Server amount", "Gateway intent", "Secure fields SDK", "3DS/provider", "Webhook + reconciliation"],
    "14 3DS": ["Intent requires action", "Frictionless or challenge", "Provider result", "Signed webhook", "CAPTURED or UNKNOWN"],
    "15 Reconciliation": ["UNKNOWN event", "Query provider status", "Dedup and compare", "Update payment", "Audit discrepancy"],
    "16 Mixed payment": ["Bill balance", "Cash/card/transfer parts", "Allocate each payment", "Separate tips/fees", "Close only at zero"],
    "17 FEL": ["Frozen bill data", "DTE draft", "Outbox → certifier", "Certified/unknown/rejected", "Artifacts + audit"],
    "18 Multi-invoice": ["Dining pool", "Create draft allocations", "Validate sum ≤ pool", "Emit independently", "Reconcile each DTE"],
    "19 Cash": ["Opening float", "Sales + tips + inflows", "Expenses/withdrawals", "Expected vs counted", "Authorized close"],
    "20 Meta": ["Official webhook", "Signature + raw event", "Dedup + normalize", "Verified external identity", "Conversation + outbox"],
    "21 Voice": ["Validated audio", "Storage/checksum", "STT provider", "Transcription", "Conversation pipeline"],
    "22 AI tool request": ["User text / image", "Scope + sensitivity guard", "AI runtime suggests tool", "Backend auth + DTO validation", "Use case → filtered data", "Audit + answer"],
    "23 AI human handoff": ["Low confidence / customer ask", "Summarize minimal context", "Human queue", "Accept/edit/reject", "Send + feedback"],
    "24 Voucher": ["Validated upload + hash", "OCR extraction", "Compare order/amount/reference", "Duplicate detection", "Human financial review", "Verified only by payment domain"],
    "25 WAN failure": ["External connectivity degraded", "LAN Nginx + Spring + DB ready", "Tables/KDS/cash/inventory continue", "External outbox waits", "Client draft stays unconfirmed"],
    "26 WAN recovery": ["WAN restored", "Worker resumes with dedup", "FEL/Meta/email status check", "Revalidate online requests", "No duplicate order/payment"],
    "27 Email": ["Domain action commits", "Email outbox", "Worker retry/backoff", "EmailProvider", "Delivery status + audit"],
}


def add_page(mxfile: ET.Element, name: str, nodes: list[str]) -> None:
    diagram = ET.SubElement(mxfile, "diagram", {"name": name, "id": name.lower().replace(" ", "-")})
    graph = ET.SubElement(diagram, "mxGraphModel", {"dx": "1200", "dy": "800", "grid": "1", "gridSize": "10", "page": "1", "pageScale": "1", "pageWidth": "1400", "pageHeight": "900", "math": "0", "shadow": "0"})
    root = ET.SubElement(graph, "root")
    ET.SubElement(root, "mxCell", {"id": "0"})
    ET.SubElement(root, "mxCell", {"id": "1", "parent": "0"})
    title = ET.SubElement(root, "mxCell", {"id": "title", "value": html.escape(name), "style": "text;html=1;align=left;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=24;fontStyle=1;fontColor=#F5F5F5;", "vertex": "1", "parent": "1"})
    ET.SubElement(title, "mxGeometry", {"x": "60", "y": "35", "width": "1180", "height": "48", "as": "geometry"})
    for index, label in enumerate(nodes):
        x = 70 + (index % 4) * 320
        y = 145 + (index // 4) * 210
        cell = ET.SubElement(root, "mxCell", {"id": f"n{index}", "value": html.escape(label), "style": "rounded=1;whiteSpace=wrap;html=1;fillColor=#1E1E22;strokeColor=#E85930;fontColor=#F5F5F5;fontSize=16;spacing=14;arcSize=14;", "vertex": "1", "parent": "1"})
        ET.SubElement(cell, "mxGeometry", {"x": str(x), "y": str(y), "width": "250", "height": "95", "as": "geometry"})
        if index:
            edge = ET.SubElement(root, "mxCell", {"id": f"e{index}", "style": "edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;endArrow=block;endFill=1;strokeColor=#B4B4BE;strokeWidth=2;", "edge": "1", "parent": "1", "source": f"n{index - 1}", "target": f"n{index}"})
            ET.SubElement(edge, "mxGeometry", {"relative": "1", "as": "geometry"})
    if name == "AI":
        note = ET.SubElement(root, "mxCell", {"id": "trust-note", "value": "NO DIRECT DB ACCESS — Tool Broker mediates all data", "style": "rounded=1;whiteSpace=wrap;html=1;fillColor=#8B1E1E;strokeColor=#F87171;fontColor=#FFFFFF;fontSize=14;fontStyle=1;", "vertex": "1", "parent": "1"})
        ET.SubElement(note, "mxGeometry", {"x": "70", "y": "600", "width": "580", "height": "55", "as": "geometry"})


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    mxfile = ET.Element("mxfile", {"host": "app.diagrams.net", "modified": "2026-09-25T00:00:00.000Z", "agent": "WOK architecture generator", "version": "24.7.17", "type": "device"})
    for name, nodes in {**PAGES, **FLOWS}.items():
        add_page(mxfile, name, nodes)
    ET.indent(mxfile)
    ET.ElementTree(mxfile).write(OUTPUT, encoding="utf-8", xml_declaration=True)
    print(f"Generated {len(PAGES) + len(FLOWS)} Draw.io pages: {OUTPUT}")


if __name__ == "__main__":
    main()

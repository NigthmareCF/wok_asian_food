"""Build the reviewed reservations/tables V3 cut once; never overwrite it."""

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from database.design import generate as design
from database.design.build_initial_migration import TABLES as V1_TABLES


TARGET = ROOT / "database/migrations/V3__tables_and_reservations.sql"
TABLES = (
    "dining_tables", "dining_table_status_history", "reservations",
    "reservation_status_history", "reservation_table_assignments",
    "reservation_evaluations", "dining_sessions", "dining_session_tables",
)


def render() -> str:
    available = set(V1_TABLES) | set(TABLES)
    for name in TABLES:
        for column in design.TABLES[name]["columns"]:
            if column["ref"] and column["ref"] not in available:
                raise ValueError(f"V3 needs {column['ref']} for {name}.{column['name']}")
    lines = [
        "-- Reviewed reservations/tables cut from database/design/generate.py.",
        "-- The 3-hour advance rule belongs to the application service: current time is not immutable.",
        "SET search_path = wok, public;",
        "CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;",
    ]
    for name in TABLES:
        table = design.TABLES[name]
        parts = []
        for column in table["columns"]:
            definition = f"    {column['name']} {column['type']}"
            if not column["nullable"]:
                definition += f" CONSTRAINT {design.cname('nn', name, column['name'])} NOT NULL"
            if column["default"] is not None:
                definition += f" DEFAULT {column['default']}"
            parts.append(definition)
        parts.extend(f"    CONSTRAINT {constraint_name} {expression}"
                     for constraint_name, expression in design.constraints(name, table))
        lines.extend(("", f"CREATE TABLE {name} (", ",\n".join(parts), ");"))
    for name in TABLES:
        for column in design.TABLES[name]["columns"]:
            if column["ref"]:
                lines.append(
                    f"ALTER TABLE {name} ADD CONSTRAINT {design.fkname(name, column)} "
                    f"FOREIGN KEY ({column['name']}) REFERENCES {column['ref']} (id) "
                    "ON DELETE RESTRICT ON UPDATE RESTRICT;"
                )
    lines.append(
        "ALTER TABLE reservation_table_assignments ADD CONSTRAINT "
        "ex_reservation_tables_period EXCLUDE USING gist "
        "(table_id WITH =, occupied_period WITH &&) WHERE (released_at IS NULL);"
    )
    for name in TABLES:
        for number, index in enumerate(design.TABLES[name]["indexes"], 1):
            lines.append(
                "CREATE " + ("UNIQUE " if index["unique"] else "") + "INDEX "
                + design.cname("ux" if index["unique"] else "ix", name, str(number))
                + " ON " + name + " (" + index["columns"] + ")"
                + (" WHERE " + index["where"] if index["where"] else "") + ";"
            )
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    if TARGET.exists():
        raise SystemExit(f"Migration exists and must stay immutable: {TARGET}")
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(render())
    print(f"Created {TARGET} with {len(TABLES)} reviewed tables")

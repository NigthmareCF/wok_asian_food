"""Build the reviewed V1 database cut once; never overwrite an applied migration."""

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from database.design import generate as design

TARGET = ROOT / "database/migrations/V1__identity_and_core.sql"
TABLES = (
    "users", "user_credentials", "auth_identities", "roles", "permissions",
    "user_roles", "role_permissions", "auth_sessions", "refresh_tokens",
    "login_attempts", "account_lockouts", "verification_challenges",
    "customer_profiles", "guest_access_tokens", "security_events",
    "currencies", "service_capabilities", "service_capability_events",
    "business_hours", "outbox_events", "email_outbox", "idempotency_keys",
    "audit_logs",
)


def render() -> str:
    included = set(TABLES)
    for name in TABLES:
        for column in design.TABLES[name]["columns"]:
            if column["ref"] and column["ref"] not in included:
                raise ValueError(f"V1 needs {column['ref']} for {name}.{column['name']}")
    lines = [
        "-- Reviewed initial cut from database/design/generate.py; immutable after deployment.",
        "-- Full candidate schema is NOT the Flyway baseline.",
        "CREATE SCHEMA wok;",
        "SET search_path = wok, public;",
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

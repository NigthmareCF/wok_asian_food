"""Record hashes of evolved copies while preserving original recovered hashes."""

from pathlib import Path
import hashlib
import json


ROOT = Path(__file__).resolve().parents[2]
path = ROOT / "docs/database/SOURCE_MANIFEST.json"
manifest = json.loads(path.read_text())
manifest["status"] = "EVOLVED_CANDIDATE_WITH_EXPLICIT_V1_MIGRATION"
manifest["evolution_note"] = "sha256 is the recovered source hash; current_sha256 identifies locally evolved copies. Original source bundle is preserved separately."
for entry in manifest["sources"]:
    content = (ROOT / entry["copy"]).read_bytes()
    current = hashlib.sha256(content).hexdigest()
    if current != entry["sha256"]:
        entry["current_sha256"] = current
        entry["current_bytes"] = len(content)
    else:
        entry.pop("current_sha256", None)
        entry.pop("current_bytes", None)
path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")

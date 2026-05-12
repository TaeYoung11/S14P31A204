from __future__ import annotations

import json
from pathlib import Path

import ifcopenshell

from ai_authoring.engine_3d import delete_element


ROOT = Path(__file__).resolve().parents[1]
HOUSE_KR = ROOT / "scripts" / "House_KR.ifc"
INSPECTION_JSON = ROOT / "artifacts" / "delete-wall-void" / "house_kr_delete_wall_void_inspection.json"
OUT_DIR = ROOT / "artifacts" / "delete-wall-void"


def _load_preferred_candidates() -> dict[str, dict[str, str] | None]:
    payload = json.loads(INSPECTION_JSON.read_text(encoding="utf-8"))
    return payload["preferred_candidates"]


def _write_deleted_variant(kind: str, global_id: str) -> dict[str, str]:
    model = ifcopenshell.open(str(HOUSE_KR))
    product = model.by_guid(global_id)
    if product is None:
        raise RuntimeError(f"{kind} candidate not found: {global_id}")
    removed = delete_element(model, product, etype_str=product.is_a())
    if not removed:
        raise RuntimeError(f"failed to delete {kind} candidate: {global_id}")

    scenario_dir = OUT_DIR / f"delete_{kind}_house_kr"
    scenario_dir.mkdir(parents=True, exist_ok=True)
    result_ifc = scenario_dir / "result.ifc"
    manifest_json = scenario_dir / "manifest.json"
    model.write(str(result_ifc))

    manifest = {
        "scenario": f"delete_{kind}_house_kr",
        "source_ifc": str(HOUSE_KR),
        "deleted_global_id": global_id,
        "result_ifc": str(result_ifc),
    }
    manifest_json.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def main() -> None:
    preferred = _load_preferred_candidates()
    artifacts = []
    for kind in ("door", "window"):
        candidate = preferred.get(kind)
        if candidate is None:
            continue
        artifacts.append(_write_deleted_variant(kind, candidate["global_id"]))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    top_manifest = OUT_DIR / "viewer-manifest.json"
    top_manifest.write_text(
        json.dumps({"artifacts": artifacts}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(str(top_manifest))


if __name__ == "__main__":
    main()

# ai-layout-import

`ai-layout-import` converts validated layout JSON into a new IFC model.

## Current scope

- Supported input contracts:
  - `ai_domain.LayoutImportV1`
  - `ai_domain.LayoutImportV2`
- Generated IFC entities:
  - `IfcProject`
  - `IfcSite`
  - `IfcBuilding`
  - `IfcBuildingStorey`
  - `IfcSpace`
  - `IfcZone`
  - `IfcWall`
  - `IfcSlab`
  - `IfcRoof`
- Still not generated:
  - `IfcDoor`
  - `IfcWindow`

## V2 contract boundaries

`v2` adds contract fields and boundary-driven generation for wall/slab/roof:

- `generation_options`
- extended `modeling_defaults`
- `generation_policy`

Supported `v2` policy values are currently fixed to:

- `boundary_wall_mode = outer_boundary`
- `shared_wall_policy = from_adjacency`
- `roof_shape = flat`

When a `v2` generation option is enabled, the service validates prerequisites before IFC generation:

- `generate_walls=true` requires `wall_thickness_mm` and floor boundaries
- `generate_slabs=true` requires `slab_thickness_mm` and floor boundaries
- `generate_roof=true` requires `roof_height_mm` and a boundary on the top floor

When enabled, generated elements follow these rules:

- wall: one `IfcWall` per floor boundary edge
- shared wall: one `IfcWall` per deduped room-edge overlap when `shared_wall_policy=from_adjacency`
- slab: one `IfcSlab` per floor boundary
- roof: one `IfcRoof` from the top-floor boundary

Shared wall generation rules are currently:

- only `axis-aligned` rooms with `angle = 0`
- actual room-edge overlap is required
- segments that lie on the exterior boundary line are not generated as interior shared walls
- `A->B` and `B->A` adjacency pairs are deduped
- `strength` remains metadata only in project `AdjacencyJson`
- cross-floor adjacency and rotated rooms fail validation

Opening rules are not part of this ticket and are not validated here.

## Units

- `width`, `height`, `space_height_mm`, `wall_thickness_mm`, `slab_thickness_mm`, `roof_height_mm`: integer millimetres
- `x`, `y`: float millimetres
- `angle`: float radians

The service converts millimetres to metres immediately before IFC geometry creation.

## Public API

```python
from ai_layout_import import convert_layout_to_ifc
```

```python
convert_layout_to_ifc(request, "output/model.ifc")
```

## CLI

V1 sample:

```powershell
uv run layout-import-json-to-ifc --input packages/ai-layout-import/examples/layout_import_v1_sample.json --output .codex-test-output/model.ifc
```

V2 sample:

```powershell
uv run layout-import-json-to-ifc --input packages/ai-layout-import/examples/layout_import_v2_sample.json --output .codex-test-output/model.ifc
```

On success, stdout prints:

```json
{"ok": true, "output_path": ".codex-test-output/model.ifc"}
```

On validation failure, stderr prints:

```json
{"ok": false, "code": "validation_error", "message": "input validation failed", "details": []}
```

## Notes

- `v1` input behavior remains unchanged.
- `v2` now generates `IfcWall`, `IfcSlab`, and `IfcRoof` from `boundaries`.
- `v2` also generates interior shared walls from `adjacency` when `shared_wall_policy=from_adjacency`.
- Openings are still not generated.

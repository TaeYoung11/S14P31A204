# ai-layout-import

`ai-layout-import` converts validated layout JSON into a new IFC model.

## Current scope

- Supported input contracts:
  - `ai_domain.LayoutImportV1`
  - `ai_domain.LayoutImportV2`
  - `ai_domain.LayoutImportV3`
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
  - `IfcOpeningElement`
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

When a boundary-driven generation option is enabled, the service now degrades missing inputs instead of failing the whole job:

- missing `wall_thickness_mm` -> default `200`
- missing `slab_thickness_mm` -> default `150`
- missing `roof_height_mm` -> default `1000`
- missing floor boundary for any room floor -> `generate_walls=false` and `generate_slabs=false`
- missing top-floor boundary -> `generate_roof=false`
- `generate_walls=false` also forces `generate_openings=false`

This is a feature downgrade, not geometry healing. The service does not synthesize missing boundaries.

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

`v3` explicit opening rules:

- `generate_openings=true` requires `opening_policy=explicit_only`
- one `IfcOpeningElement` is created per explicit opening
- `door` -> `IfcDoor`
- `window` -> `IfcWindow`
- `window` sill height is fixed at `900mm`
- if walls are degraded off, openings are also disabled

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

## Storage References

Worker storage refs support these formats:

- `s3://bucket/key`
- `http://host[:port]/bucket/key`
- `https://host[:port]/bucket/key`
- bucket-relative keys such as `projects/<id>/model.ifc`

For local Docker/MinIO, the expected absolute object URL style is path-style:

- `http://minio:9000/<bucket>/<key>`

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
- `v3` generates explicit openings, doors, and windows.
- Worker logs now record automatic default application and feature downgrade decisions.

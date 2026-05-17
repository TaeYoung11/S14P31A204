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

`v2` is the official contract for the current bubble-to-IFC generation path. `LayoutImportV3` remains supported for existing explicit-opening callers, but this package does not require FE/BE to switch generation payloads to V3.

`v2` adds contract fields and generation controls for room walls, site boundary
walls, slabs, roof, and inferred openings:

- `generation_options`
- extended `modeling_defaults`
- `generation_policy`
- `entrance` room type
- room metadata: `source_bubble_id`, `original_label`, `original_type`, `material`, `color`, `wall_type`
- connection metadata: `id`, `intent`, `connection_strength`, `source_bubble_id`, `target_bubble_id`

Supported `v2` policy values are currently fixed to:

- `boundary_wall_mode = outer_boundary`
- `shared_wall_policy = from_adjacency`
- `roof_shape = flat`

When a boundary-driven generation option is enabled, the service now degrades missing inputs instead of failing the whole job:

- missing `wall_thickness_mm` -> default `200`
- missing `slab_thickness_mm` -> default `150`
- missing `roof_height_mm` -> default `1000`
- missing floor boundary for any room floor -> `generate_slabs=false`
- missing top-floor boundary -> `generate_roof=false`
- `generate_walls=false` also forces `generate_openings=false`
- V3 explicit openings that target a missing `wall-boundary-*` ref are disabled
  rather than failing the whole job

This is a feature downgrade, not geometry healing. The service does not synthesize
missing site boundaries. Room boundary walls are generated from room rectangles and
do not require a site boundary polygon.

When enabled, generated elements follow these rules:

- site boundary wall: one `IfcWall` per floor boundary edge when a boundary polygon exists
- room boundary wall: one `IfcWall` per room perimeter segment
- shared room boundary wall: one deduped `IfcWall` for each actual room-edge overlap
- legacy shared wall: one compatibility `IfcWall` per deduped room-edge overlap when `shared_wall_policy=from_adjacency`
- `IfcRelSpaceBoundary`: one physical relationship from each `IfcSpace` to each room boundary wall it touches
- inferred opening: V2 `generate_openings=true` creates openings only when final room geometry produced a shared room boundary wall
- slab: one `IfcSlab` per floor boundary
- roof: one `IfcRoof` from the top-floor boundary

Shared wall generation rules are currently:

- only `axis-aligned` rooms with `angle = 0`
- actual room-edge overlap is required
- segments that lie on the exterior boundary line are not generated as interior shared walls
- `A->B` and `B->A` adjacency pairs are deduped
- `strength` is used as a soft placement optimization weight before IFC generation
- cross-floor adjacency and rotated-room shared wall candidates are skipped with warnings

V2 inferred opening rules:

- `connection_strength=strong`, `intent=open_passage`, or `strength >= 0.95` creates a large doorless `IfcOpeningElement`
- normal circulation creates `IfcOpeningElement + IfcDoor`
- weak relation or `strength < 0.5` records adjacency metadata only; no opening is generated
- an opening is never generated unless the final room geometry produced a host shared room boundary wall
- space merge is never inferred from a strong connection; merge requires an explicit future contract

Generated IFC semantic property sets:

- `IfcSpace`: `Pset_BatangLayoutImportRoom` and `Pset_BatangRoom`
- `IfcWall`: `Pset_WallCommon` and `Pset_BatangWall`
- inferred `IfcOpeningElement`/`IfcDoor`: `Pset_BatangOpening`

`Pset_BatangWall` distinguishes site shell walls from room-specific authoring targets:

- `WallKind = SITE_BOUNDARY`: site/floor shell wall generated from `boundaries`
- `WallKind = ROOM_BOUNDARY`: one room touches this wall segment
- `WallKind = SHARED_ROOM_BOUNDARY`: two rooms share this wall segment

Room boundary walls also include:

- `BoundedRoomIdsJson`
- `BoundedRoomNamesJson`
- `BoundedRoomTypesJson`
- `WallSideByRoomJson`
- `Source = room_perimeter`

The standard `IfcRelSpaceBoundary` relationship is the primary downstream contract
for resolving requests such as "bathroom west wall". Custom property sets are
secondary metadata for search, debugging, and authoring context.

`v3` explicit opening rules:

- `generate_openings=true` requires `opening_policy=explicit_only`
- one `IfcOpeningElement` is created per explicit opening
- `door` -> `IfcDoor`
- `window` -> `IfcWindow`
- `window` sill height is fixed at `900mm`
- if `generate_walls=false`, openings are also disabled
- if an explicit opening targets a missing boundary wall on a floor without a
  boundary, openings are disabled for fail-soft behavior

## Units

- `width`, `height`, `space_height_mm`, `wall_thickness_mm`, `slab_thickness_mm`, `roof_height_mm`: integer millimetres
- `x`, `y`: float millimetres
- `angle`: float radians

The service converts millimetres to metres immediately before IFC geometry creation.

## Adjacency strength optimization

For `v2` and `v3`, the service applies a deterministic, in-memory room placement pass before IFC entities are created:

- `strength >= 0.75`: prefer edge-touch/shared-wall placement when feasible
- `0.45 <= strength < 0.75`: prefer closer placement and short circulation
- `strength < 0.45`: prefer loose proximity without forcing edge-touch

The optimizer is intentionally not a full floor planner:

- `locked=true` rooms are never moved
- only unlocked room `x`/`y` values may change
- room `angle`, size, floor, type, name, id, and `zoneId` are preserved
- room positive-area overlap is rejected; edge/corner touch is allowed
- boundary containment is enforced when a boundary exists for the room floor
- zone metadata is preserved but not interpreted as public/private/service zoning

Unsatisfied adjacency relationships do not fail IFC generation by themselves. They are reported in validation report warnings through:

- `layoutOptimizationApplied`
- `movedRoomCount`
- `satisfiedAdjacencyCount`
- `unsatisfiedAdjacencyCount`
- `unsatisfiedAdjacencyRefs`
- `skippedAdjacencyReasons`

## Public API

```python
from ai_layout_import import convert_layout_to_ifc
```

```python
summary = convert_layout_to_ifc(request, "output/model.ifc")
```

`convert_layout_to_ifc(...)` returns a normalization summary for fail-soft handling:

- `defaultsApplied`
- `degradedFeatures`
- `missingBoundaryFloors`
- `availableBoundaryFloors`
- `roomFloors`
- `topFloorBoundaryMissing`
- `openingsDisabledBecauseWallsDisabled`
- `hasWarnings`

## Storage References

Worker storage refs support these formats:

- `s3://bucket/key`
- `http://host[:port]/bucket/key`
- `https://host[:port]/bucket/key`
- bucket-relative keys such as `projects/<id>/model.ifc`

For local Docker/MinIO, the expected absolute object URL style is path-style:

- `http://minio:9000/<bucket>/<key>`

## Fail-Soft Warning Surfacing

Fail-soft handling is surfaced at three levels:

- logs: full operational detail
- validation report: detailed `warnings`
- completed event/output: summary-only `has_warnings`

Completed validation report example:

```json
{
  "status": "completed",
  "warnings": {
    "defaultsApplied": {
      "wall_thickness_mm": 200
    },
    "degradedFeatures": ["generate_slabs"],
    "missingBoundaryFloors": [2],
    "availableBoundaryFloors": [1],
    "roomFloors": [1, 2],
    "topFloorBoundaryMissing": false,
    "openingsDisabledBecauseWallsDisabled": false,
    "layoutOptimizationApplied": true,
    "movedRoomCount": 1,
    "satisfiedAdjacencyCount": 1,
    "unsatisfiedAdjacencyCount": 0,
    "unsatisfiedAdjacencyRefs": [],
    "skippedAdjacencyReasons": []
  }
}
```

Completed worker output example:

```json
{
  "storage_url": "projects/project-1/revisions/rev-1/ifc/model.v1.ifc",
  "validation_report_storage_url": "projects/project-1/jobs/job-1/steps/001/engine/validation-report.v1.json",
  "has_warnings": true
}
```

Failed reports keep the existing error-first shape and do not add `warnings`.

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
- `v2` now generates room boundary `IfcWall` entities and `IfcRelSpaceBoundary` links from room rectangles.
- `v2` still generates site boundary `IfcWall`, `IfcSlab`, and `IfcRoof` from `boundaries` when boundaries exist.
- `v2` also generates compatibility interior shared walls from `adjacency` when `shared_wall_policy=from_adjacency`.
- `v2`/`v3` use `adjacency.strength` to optimize unlocked room placement before generation.
- `v3` generates explicit openings, doors, and windows.
- Worker logs now record automatic default application and feature downgrade decisions.

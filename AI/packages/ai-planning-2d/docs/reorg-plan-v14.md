# Reorg Plan V14

## Purpose
This document is the active execution plan for the branch.

The branch now has two coupled goals:
1. make the 2D worker actually runnable in production-like RabbitMQ runtime
2. make the House_KR public-toilet path structurally fixable by reducing file size, clarifying module boundaries, and introducing a stricter plan/apply model

This plan incorporates the repeated review findings from Gemini and Claude.

## Non-Negotiable Blockers

### Blocker A. 2D worker runtime is not actually connected
- `TWO_D_LLM` is missing from `ai-common.adapters.rabbitmq.kombu_client._WORKER_TYPE_TO_QUEUE`
- current worker tests use fake consumers and do not prove real queue resolution
- consequence:
  - `two-d-llm-worker` entrypoint exists
  - but `RabbitMQConsumer(worker_type="TWO_D_LLM")` crashes at startup in real runtime

### Blocker B. PlanV14 migration is not reviewable in current file layout
- `toilet_demo.py` and `executor.py` are too large
- `test_smoke.py` is too large and mixes runtime / IFC / golden / synthetic tests
- consequence:
  - PlanV14 would land as an unreadable giant diff
  - schema, validator, planner, and apply changes would be tangled again

### Blocker C. Viewer artifacts are structural, not local bugs
- duplicated walls
- openings that do not cut walls
- floating artifacts
- mismatched south-wall replacement
- cause:
  - current wall/opening handling is not a single source of truth for final IFC output

## Design Decisions

### 1. Runtime must be fixed before deeper refactor
- queue registration and real startup smoke tests come first
- do not start moving runtime files before the queue blocker is closed

### 2. PlanV14 becomes the target contract
Top-level shape:
- `plan_schema_version`
- `plan_status`
- `storey_id`
- `floor_entrance_space_id`
- `house_kr_fingerprint_match`
- `user_intent`
- `expected_resulting_space_names`
- `expected_resulting_space_types`
- `affected_zone_polygon_mm`
- `space_plans`
- `final_walls`
- `final_openings`
- `validation_issues`
- `validation_warnings`
- `representation_templates_used`

### 3. Stop using the current 3-bucket wall model
Do not continue with:
- `donor_walls_to_reuse`
- `donor_walls_to_delete`
- `required_new_walls`

Replace it with:
- affected-zone clear
- final wall list
- final opening list

Meaning:
- every existing wall/opening in the affected zone is deleted
- the final IFC inside that zone is rebuilt only from `final_walls` and `final_openings`

### 4. Helper contracts are mandatory

#### Opening helper
Strict invariants:
- `opening.ObjectPlacement.PlacementRelTo == host_wall.ObjectPlacement`
- `door/window.ObjectPlacement.PlacementRelTo == opening.ObjectPlacement`
- opening location is recalculated in wall-local coordinates
- opening body extrudes along wall normal
- opening depth is at least wall thickness plus tolerance buffer
- opening lies fully within host wall length
- opening local `y == 0`
- opening local `z == sill_height` for windows, `0` for doors

#### Wall helper
New walls should be created from an existing House_KR wall template:
- `IfcWallStandardCase`
- `IfcMaterialLayerSetUsage`
- representation signature
- wall type association, if present
- storey containment association
- template offset / direction sense preserved

#### Cleanup helper
Cleanup order must be explicit:
1. `IfcRelSpaceBoundary`
2. `IfcRelFillsElement`, then `IfcDoor/IfcWindow`
3. `IfcRelVoidsElement`, then `IfcOpeningElement`
4. `IfcRelContainedInSpatialStructure`, then `IfcWall`

Never delete shared wall types or shared material sets during affected-zone cleanup.

## PlanV14 Inner Type Fields

### `SpacePlan`
- `local_id: str`
- `global_id: str | None`
- `is_new: bool`
- `source_space_id: str | None`
- `polygon_world_mm: list[tuple[float, float]]`
- `polygon_local_mm: list[tuple[float, float]]`
- `placement_world_mm: tuple[float, float]`
- `name: str`
- `space_type: str`
- `locked: bool`
- `walls_bounding_local_ids: list[str]`
- `openings_local_ids: list[str]`
- `required_openings: dict`
- `access_circulation: dict`

### `WallPlan`
- `local_id: str`
- `kind: str`
- `start_mm: tuple[float, float]`
- `end_mm: tuple[float, float]`
- `thickness_mm: int`
- `bounded_space_local_ids: list[str]`
- `hosts_opening_local_ids: list[str]`
- `representation_template_global_id: str`

### `OpeningPlan`
- `local_id: str`
- `opening_kind: str`
- `host_wall_local_id: str`
- `segment_along_wall_mm: tuple[float, float]`
- `width_mm: int`
- `height_mm: int`
- `sill_height_mm: int`
- `swing_in_space_local_id: str | None`
- `opens_toward_space_local_id: str | None`
- `operation_type: str | None`
- `serves_door_requirement_of_space_local_id: str | None`
- `serves_window_requirement_of_space_local_id: str | None`
- `representation_template_global_id: str`

### `ValidationIssue`
- `code: str`
- `severity: str`
- `message: str`
- `context: dict`

### Sub-schemas

#### `required_openings`
- `needs_door_count: int`
- `needs_window_count: int`
- `door_satisfied_by_opening_local_ids: list[str]`
- `window_satisfied_by_opening_local_ids: list[str]`

#### `access_circulation`
- `reachable_from_space_local_id: str | None`
- `via_opening_local_id: str | None`

## Target Source Structure

```text
ai_planning_2d/
  __init__.py
  __main__.py

  runtime/
    app.py
    worker.py
    job_runner.py

  schemas/
    command.py
    ifc_context.py
    plan_v14.py
    validation.py

  llm/
    engine.py
    prompts.py
    parsing.py

  planning/
    command_builder.py
    session.py
    critique.py
    policies.py
    engine_request.py
    add_room_placement.py
    healing/
      remove.py
      resize.py
      space.py

  ifc/
    extractor.py
    apply.py
    cleanup.py
    walls.py
    openings.py
    representations.py

  validators/
    preview.py
    batch.py
    plan.py
    ifc.py
    geometry.py

  demo/
    house_kr/
      public_toilet_planner.py
      split_candidates.py
      opening_planner.py
      rules.py
      fingerprint.py
      recommendation_rules.py

  utils/
    shape_to_rects.py
```

## Target Test Structure

```text
tests/
  _fixtures/
    synthetic.py
    house_kr.py

  runtime/
    test_worker.py
    test_app.py
    test_job_runner.py

  schemas/
    test_command.py
    test_ifc_context.py
    test_plan_v14.py

  llm/
    test_engine.py

  planning/
    test_command_builder.py
    test_session.py
    test_critique.py
    test_policies.py
    test_engine_request.py
    healing/
      test_remove.py
      test_resize.py
      test_space.py

  ifc/
    test_extractor.py
    test_apply.py
    test_cleanup.py
    test_walls.py
    test_openings.py

  validators/
    test_preview.py
    test_batch.py
    test_plan.py
    test_ifc.py
    test_geometry.py

  demo/
    house_kr/
      test_public_toilet_planner.py
      test_split_candidates.py
      test_opening_planner.py
      test_golden_regression.py
```

## Migration Order

### Phase 0. Runtime blocker fix
Scope:
- add `TWO_D_LLM_COMMAND_QUEUE`
- register `"TWO_D_LLM"` in `_WORKER_TYPE_TO_QUEUE`
- replace hardcoded queue log string with actual resolved queue name
- add real-consumer smoke test using `RabbitMQConsumer`
- verify deploy command / Docker / K8s entrypoint uses `two-d-llm-worker`
- move `docs/RabbitMQ AI 명세.md` responsibility note toward `ai-common` ownership

Done when:
- real `RabbitMQConsumer` startup path resolves queue without `ValueError`
- worker runtime is no longer fake-only
- Docker/K8s entrypoint path is confirmed

### Phase 1. Schema foundation
Scope:
- create `schemas/`
- freeze `PlanV14`, `SpacePlan`, `WallPlan`, `OpeningPlan`, `ValidationIssue`
- move command schemas and IFC context schemas out of `command.py`
- add plan schema versioning and plan status enums
- add `tests/_fixtures/synthetic.py` minimum scaffold

Done when:
- planner/apply code can reference one stable schema module
- schema fields are locked in code and docs

### Phase 2. Validator foundation
Scope:
- create `validators/`
- move preview/batch validation out of flat modules
- add PlanV14 validator suite
- separate synthetic IFC validation and output IFC viewer-regression validation

Plan-level invariants:
- duplicate wall detection
- opening lies within host wall
- openings on same wall do not overlap
- polygon is simple
- polygon area is non-zero
- perimeter coverage
- endpoint snap consistency
- circulation reachability
- required door existence
- required window existence for exterior-contact spaces
- bbox fill ratio
- inscribed rectangle threshold
- entrance avoidance
- affected-zone completeness

IFC-output viewer regressions:
- no floating products outside floor bbox
- no duplicate wall segments
- no orphan openings
- no orphan fillers
- opening placement is wall-local
- perimeter coverage match

Helper-level invariants:
- opening extrusion direction follows wall normal
- opening depth exceeds wall thickness by tolerance
- opening local placement stays within wall length
- wall signature clone preserves class/material/type/storey contract
- cleanup preserves shared wall types and shared material sets

Done when:
- PlanV14 can be rejected before apply for structural reasons
- `docs/v13-baseline.md` is recorded with current six viewer-regression results

### Phase 3. IFC module split
Scope:
- create `ifc/`
- move extraction to `ifc/extractor.py`
- split `executor.py` into:
  - `ifc/apply.py`
  - `ifc/cleanup.py`
  - `ifc/walls.py`
  - `ifc/openings.py`
  - `ifc/representations.py`

Sub-steps inside this phase:
1. mechanical move only
2. helper introduction
3. cleanup and phase-order hardening

Sub-step invariants:
- step 1:
  - no logic change
  - only import paths and file locations change
  - all existing tests pass unchanged
- step 2:
  - helper contracts added with synthetic fixture tests
  - existing behavior still unchanged
- step 3:
  - explicit cleanup ordering
  - explicit apply phase order
  - shared wall types/materials remain untouched

Done when:
- wall creation, opening creation, and cleanup can be tested independently

### Phase 4. Planning module split
Scope:
- create `planning/`
- rename:
  - `pipeline.py` -> `planning/command_builder.py`
  - `session_pipeline.py` -> `planning/session.py`
- move `critique.py`, `policies.py`, `engine_request.py`
- move healing modules under `planning/healing/`

Done when:
- generic planning code is separated from runtime and demo code
- existing planning/policy/healing tests pass after import updates

### Phase 5. Demo isolation
Scope:
- create `demo/house_kr/`
- split `toilet_demo.py` into:
  - `public_toilet_planner.py`
  - `split_candidates.py`
  - `opening_planner.py`
  - `rules.py`
  - `fingerprint.py`
  - `recommendation_rules.py`

Done when:
- House_KR logic no longer sits in the generic package root
- demo code imports only from `schemas`, `validators`, `ifc`, `planning`, `utils`
- generic planning code does not import from `demo`

### Phase 6. Runtime and LLM structure cleanup
Scope:
- create `runtime/` and `llm/`
- move:
  - `worker.py` -> `runtime/worker.py`
  - `worker_app.py` -> `runtime/app.py`
  - engine prompt/parsing logic into `llm/`
- update:
  - `__main__.py` -> `from .runtime.app import main`
  - `pyproject.toml` console script -> `ai_planning_2d.runtime.app:main`

Done when:
- runtime depends on planning, but planning does not depend on runtime
- `python -m ai_planning_2d --once` works
- `two-d-llm-worker --once` works
- Docker/K8s entrypoint reflects the moved runtime path

### Phase 7. Test reorganization
Scope:
- split `test_smoke.py`
- separate:
  - runtime tests
  - synthetic unit tests
  - House_KR golden tests
  - IFC viewer-regression tests
- add `tests/_fixtures/house_kr.py`

Done when:
- failures identify responsibility area quickly
- old `test_smoke.py` responsibilities are fully redistributed

### Phase 8. Public surface cleanup
Scope:
- simplify `__init__.py`
- keep temporary re-export shims only as long as needed
- remove flat demo exports from package root

Done when:
- imports reflect actual architecture
- all temporary re-export shims are removed in one coordinated change

## PR Strategy

### PR-0
- Phase 0 only

### PR-A
- Phase 1 + Phase 2
- schemas + validators + helper contracts
- synthetic fixtures only
- no behavior change in House_KR flow yet
- helper scope in PR-A is limited to:
  - interface signatures
  - invariant contracts
  - synthetic-fixture unit tests
- helper body rewrites are deferred to PR-B

### PR-A2
- mechanical-only scope:
  - Phase 3 sub-step 1 only
  - Phase 4 entirety
  - Phase 5 entirety
- import path changes only
- no behavior change
- all existing tests continue to pass
- explicitly excluded from PR-A2:
  - Phase 3 sub-step 2 helper introduction
  - Phase 3 sub-step 3 cleanup and phase-order hardening
- those behavior-changing parts are deferred to PR-B

### PR-B
- planner emits PlanV14
- apply consumes PlanV14
- affected-zone clear + final-list model
- new helpers actually used
- House_KR golden regression
- atomic replacement only
- backward-compat shim for old 3-bucket path is forbidden

PR-B sub-steps:
1. planner emits PlanV14
2. apply consumes PlanV14
3. House_KR golden output is checked

### PR-A3
- Phase 6 + Phase 7
- runtime/llm relocation
- tests reorganization

### PR-C
- Phase 8
- critique dry-run
- clarification round-trip
- final fingerprint / intention routing cleanup

## House_KR-Specific Constraints To Keep
- fixture:
  - `scripts/House_KR_nobathroom.ifc`
- user intent for this demo path:
  - `shared_toilet_split_big_room`
- resulting spaces must both be first-class:
  - `서재`
  - `화장실`

## Immediate Documentation Follow-Up
Before PR-A implementation starts, record:
1. the six viewer-regression baseline checks against `v13`
2. the measured Big Room geometry facts from `House_KR_nobathroom.ifc`

Required companion docs:
- `docs/v13-baseline.md`
- `docs/house-kr-nobathroom-measurements.md`

## Mandatory Chore Commit Between PR-0 And PR-A
- Commit name:
  - `docs: record v13 baseline + House_KR_nobathroom measurements`
- This commit must fill:
  - `docs/v13-baseline.md`
  - `docs/house-kr-nobathroom-measurements.md`
- PR-A must not start before this chore commit lands.

# Current Status

## What Is Working
- IFC extraction to `IFCContext`
  - IFC4-family files are accepted
  - meter-only length units are enforced
  - spaces, walls, openings, doors, windows, boundaries, and storeys are extracted
- 2D preview/apply pipeline
  - natural-language command parsing
  - command batch generation
  - policy-based preview
  - preview validation
- shared apply contract
  - `engineRequest`
  - `IfcEditCommandPayload`
  - `ai-authoring` integration
- 2D worker bootstrap code exists
  - `worker_app.py`
  - `__main__.py`
  - `two-d-llm-worker` console script
- 2D worker queue registration now exists in `ai-common`
  - `TWO_D_LLM_COMMAND_QUEUE`
  - `_WORKER_TYPE_TO_QUEUE["TWO_D_LLM"]`
- 2D worker startup smoke coverage now includes the default `RabbitMQConsumer` init path
- 2D worker shutdown path now installs SIGTERM / SIGINT handlers
- top-level dispatcher and Docker image now include 2D worker support
  - `main.py` dispatches `WORKER_TYPE=TWO_D_LLM`
  - `Dockerfile` installs `ai-planning-2d`

## What Is Not Working Yet
- Production-grade 2D worker runtime is not fully closed yet.
  - queue registry is fixed in code
  - repository-side Docker path is updated
  - graceful shutdown is handled in worker bootstrap
  - external K8s/deploy manifest verification is still pending
- House_KR public-toilet demo is still not visually correct in the viewer.
  - duplicated walls
  - floating / orphan-looking artifacts
  - openings that do not cut walls correctly
  - remainder room usability is still fragile

## Current Branch Reality
- The branch is no longer trying to improve the generic editor first.
- The active goal is:
  1. close the 2D worker runtime blocker
  2. restructure `ai-planning-2d` so PlanV14 migration is reviewable
  3. rebuild the House_KR public-toilet path on top of a stricter schema/apply model

## Main Structural Problems
- Runtime deployment verification
  - `two-d-llm-worker` exists and queue resolution now works in tests
  - Docker/K8s execution path still needs explicit verification
- Fat files
  - `toilet_demo.py`
  - `executor.py`
  - `test_smoke.py`
- Mixed responsibilities
  - runtime, planning, IFC mutation, schema literals, and demo-specific logic are too flat in `src/ai_planning_2d`
- Viewer artifacts come from the current wall/opening model
  - current `reuse / delete / create` wall buckets are not a safe single source of truth

## Locked Direction
- Do not keep patching the current 3-bucket wall model.
- Move toward:
  - `affected_zone_polygon_mm`
  - `final_walls`
  - `final_openings`
  - `space_plans`
- Make all split results first-class:
  - `서재`
  - `화장실`
- Use helper-level contracts for:
  - strict wall-local opening placement
  - wall signature cloning from House_KR templates
  - explicit cascade cleanup before wall deletion

## Active Planning Documents
- Runtime / reorg / PlanV14 execution order:
  - `docs/reorg-plan-v14.md`
- Baseline regression record:
  - `docs/v13-baseline.md`
- House_KR fixture measurements:
  - `docs/house-kr-nobathroom-measurements.md`

## Validation Baseline
- `ruff check`
- `packages/ai-planning-2d/tests/test_plan_v14.py`
- `packages/ai-planning-2d/tests/test_validators_foundation.py`
- `packages/ai-planning-2d/tests/test_plan_validators.py`
- `packages/ai-planning-2d/tests/test_ifc_validators.py`
- `packages/ai-planning-2d/tests/test_worker.py`
- `packages/ai-planning-2d/tests/test_critique.py`
- `packages/ai-planning-2d/tests/test_toilet_demo.py`
- `packages/ai-planning-2d/tests/test_smoke.py`
- `packages/ai-authoring/tests/test_operations_shared.py`

## Immediate Priority Order
1. Verify deploy-side `two-d-llm-worker` entrypoint usage
2. Freeze PlanV14 inner types
3. Split schema / validator modules out of fat files
4. Replace the current wall/opening apply model with an affected-zone final-list model

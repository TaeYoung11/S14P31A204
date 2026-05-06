# 2D Implementation Sequence

## Goal

Define the actual implementation order for 2D work before the teammate's engine MR is merged.

This sequence is optimized for:

- preserving work regardless of engine refactor direction
- unlocking `House_KR.ifc` as a real input
- raising demo readiness on the same IFC file

## Phase 0. Constraints

- do not start a broad shared IFC core refactor yet
- do not build 2D-only fake visuals that are not saved into IFC
- do not optimize for add-room floating-block demos
- prioritize deterministic read + deterministic edit policy over breadth

## Phase 1. Real IFC Input Recovery

### Step 1. Support `House_KR.ifc` space extraction

Target:

- `extract_ifc_context("House_KR.ifc")` returns `spaces == 7`

Implementation focus:

- read `IfcSpace` polygons from `FootPrint / IfcGeometricCurveSet`
- add `IfcFacetedBrep` fallback for 2D footprint derivation
- use `BaseQuantities` as fallback for width/height when Batang Psets are absent
- preserve storey assignment and placement

Done criteria:

- all 7 spaces have `id`, `floor`, `polygon`
- width/height are non-null for most rooms
- both storey boundaries are generated

### Step 2. Recover semantic room naming fallback

Target:

- rooms can be targeted in a user-meaningful way

Implementation focus:

- inspect ArchiCAD / AC_* psets for room naming candidates
- add name resolution priority:
  - semantic external pset
  - `LongName`
  - `Name`
  - generated fallback
- if only numeric names remain, trigger clarification policy

Done criteria:

- room labels shown to the user are understandable
- room targeting is not limited to raw numeric IFC names

## Phase 2. Stable 2D Context

### Step 3. Improve wall-space-room graph quality

Target:

- walls, spaces, openings, and adjacency are coherent enough for mutation planning

Implementation focus:

- improve wall-to-space boundary collection
- confirm door/window host wall mapping quality on `House_KR.ifc`
- validate adjacency pairs against extracted spaces
- ensure floor boundaries come from actual room geometry when possible

Done criteria:

- room adjacency on real IFC is plausible
- host wall data for openings is stable enough for room delete/resize planning

### Step 4. Write explicit clarification rules

Target:

- avoid fake success for ambiguous edits

Implementation focus:

- ambiguous room target
- unresolved semantic room naming
- resize direction ambiguity
- conflict with multiple neighboring rooms
- unsupported wall/opening side effects

Done criteria:

- every major failure path returns clarification or explicit unsupported status
- silent no-op is not treated as success

## Phase 3. Deterministic 2D Edit Policy

### Step 5. Define `remove_room` policy

Target:

- room deletion is layout-aware, not just `IfcSpace` removal

Implementation focus:

- define the first deterministic deletion strategy
- recommended first policy:
  - only allow deletion when one dominant adjacent room can absorb the removed area
  - otherwise clarify or block
- specify wall handling rules
- specify opening orphan handling rules

Done criteria:

- one documented deletion policy exists
- team can agree whether delete means merge, vacancy, or unsupported

Reference:

- `premerge-2d-engine-plan.md` -> `remove_room 1차 deterministic rule`

### Step 6. Define `resize_room` policy

Target:

- resize behavior is deterministic and demo-safe

Implementation focus:

- choose first supported resize mode
- recommended first policy:
  - allow only expansion toward simple free/adjacent region
  - block multi-direction ambiguous changes
- define wall movement and opening reprojection expectations

Done criteria:

- one documented resize policy exists
- unsupported resize scenarios are explicitly blocked

Reference:

- `premerge-2d-engine-plan.md` -> `resize_room 1차 deterministic rule`

## Phase 4. Engine Integration Readiness

### Step 7. Express 2D outputs in engine-friendly terms

Target:

- be ready to plug into the teammate's shared engine once the MR lands

Implementation focus:

- define planner outputs in terms of mutation intents:
  - move wall
  - delete wall
  - resize space
  - recreate opening
  - update pset
- keep this layer independent from final package layout

Done criteria:

- 2D planner outputs can be mapped to a future shared executor without redesign

### Step 8. Review teammate MR against 2D contract

Target:

- decide shared-vs-separate boundary using evidence, not guesses

Questions to answer:

- is there already a reusable IFC mutation layer?
- can 2D pass deterministic layout plans into it?
- are placement/pset/relation helpers reusable as-is?
- does the shared engine expose failure reporting suitable for clarification?

Done criteria:

- clear decision on whether to:
  - adopt the shared layer
  - request extension points
  - or propose extraction of a true shared IFC core

## What Not to Implement First

- generic add-room placement for demos
- color-only visual edits without IFC persistence
- package-wide shared core extraction
- deep 3D-aware refactors before the MR

## First Practical Build Order

If work starts immediately, do it in this exact order:

1. `House_KR.ifc` space geometry extraction
2. semantic room naming fallback
3. boundary and adjacency stabilization
4. clarification policy implementation
5. `remove_room` policy definition
6. `resize_room` policy definition
7. engine integration after teammate MR review

## Success Definition

This sequence is successful when:

- `House_KR.ifc` becomes a usable 2D context source
- existing rooms can be identified semantically
- delete/resize are planned deterministically or blocked safely
- the resulting mutation model is ready to attach to a shared IFC executor

# House_KR Delete Wall Void Inspection

## Goal
- Confirm whether this branch can enter `delete_wall_void` implementation for `House_KR`
- Fix one atomic delete candidate for viewer verification
- Keep branch scope aligned with `parametric wall only`

## Scope Rule
- In scope for this branch:
  - atomic delete of an existing `IfcDoor`
  - atomic delete of an existing `IfcWindow`
  - only when the host wall body is parametric
- Out of scope for this branch:
  - `IfcBooleanClippingResult` wall healing
  - compound delete + create flows
  - `create_window` retry
  - `create_wall` auto-apply revival

## Inspection Source
- IFC: [House_KR.ifc](/abs/path/C:/Users/SSAFY/Desktop/S14P31A204/AI/scripts/House_KR.ifc)
- Inspection script:
  [inspect_house_kr_delete_wall_void_candidates.py](/abs/path/C:/Users/SSAFY/Desktop/S14P31A204/AI/scripts/inspect_house_kr_delete_wall_void_candidates.py)
- Viewer artifact generator:
  [generate_delete_wall_void_viewer_artifacts.py](/abs/path/C:/Users/SSAFY/Desktop/S14P31A204/AI/scripts/generate_delete_wall_void_viewer_artifacts.py)

## Summary
- Doors: `5 total`, `5 parametric`, `0 BCR`
- Windows: `11 total`, `9 parametric`, `2 BCR`
- Bare openings: `1 total`, `0 parametric`, `0 BCR`

## Preferred Atomic Delete Candidates
- Door candidate
  - element: `IfcDoor`
  - global id: `1Oms875aH3Wg$9l65H2ZGw`
  - opening id: `0LM8GvGe$G3dlW4mZ4aA9R`
  - host wall id: `3PfS__Y_DBAfq5naM6zD2Z`
  - host wall body: `parametric`
- Window candidate
  - element: `IfcWindow`
  - global id: `1srAI$R4T8ihLXSNHmUSET`
  - opening id: `0seqbT9MlcQAX_K0YLzD86`
  - host wall id: `3rPX_Juz59peXXY6wDJl18`
  - host wall body: `parametric`

## Blocked Cases
- BCR-hosted windows exist and must be blocked in this branch
  - `1zOBw0Gej5Wf0QAJfHnOc0`
  - `2ACmFFQhT1Ouf0x4YRUh9m`
- Bare opening candidate is not usable for this branch
  - only bare opening found is `Slab Opening`
  - it has no host wall and is not a wall-opening delete case

## Binary Gate Status
- Atomic delete candidate exists for door: `PASS`
- Atomic delete candidate exists for window: `PASS`
- Parametric wall only restriction is meaningful in House_KR: `PASS`
- Bare `IfcOpeningElement` wall-hosted delete candidate exists: `FAIL`
- Viewer healing for chosen delete case: `PENDING`

## Decision For This Branch
- Proceed with `delete_wall_void` for `IfcDoor` and `IfcWindow`
- Enforce `parametric wall only`
- Explicitly block BCR-hosted cases
- Reject direct `IfcOpeningElement` delete in this branch
- Do not claim `bare opening` support from House_KR validation in this branch unless a separate validated sample is added later

## Rejection Contract
- BCR-hosted cases must be rejected with a user-facing soft message, not silently skipped
- direct `IfcOpeningElement` targets must be rejected as "not validated in this branch"
- compound delete + create follow-up must remain out of scope

## Next Step
- Generate one delete-door artifact and one delete-window artifact
- Verify healing in the chosen IFC viewer
- Only after viewer confirmation, continue to primitive implementation and tests

## Viewer Check Status
- Transient door/window delete IFC artifacts were generated from the preferred candidates
- Viewer check result:
  - preferred door delete: natural healing confirmed
  - preferred window delete: natural healing confirmed
- The generated IFC artifacts were temporary verification outputs and are not kept in the branch

## Headless Sanity Check
- Source `House_KR.ifc`
  - doors: `5`
  - windows: `11`
  - openings: `17`
  - voids: `17`
- After preferred door delete
  - doors: `4`
  - windows: `11`
  - openings: `16`
  - voids: `16`
- After preferred window delete
  - doors: `5`
  - windows: `10`
  - openings: `16`
  - voids: `16`

## Current Gate Reading
- Atomic delete pair removal works in headless count terms: `PASS`
- Viewer healing for the chosen door/window case: `PENDING USER CHECK`
- Bare opening validation in House_KR: `NOT AVAILABLE`

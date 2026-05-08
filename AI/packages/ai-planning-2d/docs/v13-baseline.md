# V13 Baseline

## Purpose
This document records the pre-PlanV14 viewer-regression baseline for:
- `scripts/House_KR_nobathroom_insert_toilet_v13.ifc`

It must be updated before PR-A implementation begins.

Current repository state on 2026-05-08:
- `scripts/House_KR_nobathroom_insert_toilet_v13.ifc` is not present in this repo.
- The baseline below is therefore blocked at fixture availability, not at validator execution.

## Required Checks
Record pass/fail and notes for:
1. no floating products outside floor bbox
2. no duplicate wall segments
3. no orphan openings
4. no orphan fillers
5. opening placement is wall-local
6. resulting-space perimeter coverage

## Result Template

| Check | Status | Notes |
| --- | --- | --- |
| no floating products outside floor bbox | blocked | Target fixture `scripts/House_KR_nobathroom_insert_toilet_v13.ifc` is missing from repo. |
| no duplicate wall segments | blocked | Target fixture `scripts/House_KR_nobathroom_insert_toilet_v13.ifc` is missing from repo. |
| no orphan openings | blocked | Target fixture `scripts/House_KR_nobathroom_insert_toilet_v13.ifc` is missing from repo. |
| no orphan fillers | blocked | Target fixture `scripts/House_KR_nobathroom_insert_toilet_v13.ifc` is missing from repo. |
| opening placement is wall-local | blocked | Target fixture `scripts/House_KR_nobathroom_insert_toilet_v13.ifc` is missing from repo. |
| resulting-space perimeter coverage | blocked | Target fixture `scripts/House_KR_nobathroom_insert_toilet_v13.ifc` is missing from repo. |

## Interpretation
- This document is not a success report.
- It is the baseline that PR-B must beat.
- Before viewer-quality comparison can be re-run, the missing v13 fixture must be restored or re-generated.

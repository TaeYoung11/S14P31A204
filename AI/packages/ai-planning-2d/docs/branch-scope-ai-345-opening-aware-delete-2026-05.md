# AI-345 Branch Scope

## Goal

This branch has one centered deliverable:

- `House_KR atomic delete primitive 1개 + viewer 검증 + 관련 정책 문서화`

More concretely:

- implement `delete_wall_void`
- support atomic delete of existing `IfcDoor` and `IfcWindow`
- reject unsupported direct `IfcOpeningElement` delete in this branch
- verify behavior in the chosen demo viewer
- document destructive-edit policy and next-branch boundaries

## Branch Strategy

This branch intentionally follows:

- branch scope: large enough to avoid MR idle time
- commit scope: small enough to review step by step

Rule:

- keep one main axis in the branch
- split work into multiple logical commits
- do not add a second apply primitive just because this branch is already open

## Include

Allowed in this branch:

1. House_KR atomic delete candidate inspection
2. `delete_wall_void` scaffold / interfaces
3. `delete_wall_void` implementation
4. unit / integration / smoke tests for atomic delete
5. viewer verification artifacts or reference checks for atomic delete
6. destructive clarification text updates related to delete capability
7. docs for next-branch handoff and scope boundaries

## Exclude

Do not add these in this branch:

- `create_window` retry
- `create_wall` auto-apply revival
- compound `delete + create_wall`
- partition apply
- approval UI / approval flow
- BCR wall healing implementation
- free-form room generation
- broad policy redesign unrelated to atomic delete

## Technical Constraints

- target building: `House_KR`
- target operation: atomic delete only
- validated target classes for this branch: `IfcDoor`, `IfcWindow`
- direct `IfcOpeningElement` delete: reject in this branch
- supported host wall class for apply: parametric wall only
- BCR wall handling: block, do not heal in this branch
- demo viewer must be fixed before acceptance judgment

## Binary Gate Before Full Implementation

Before deep implementation, confirm:

1. there is at least one valid atomic delete case in `House_KR`
2. the chosen viewer shows acceptable healing behavior for that case

If either condition fails:

- do not keep expanding implementation
- fall back to inspection / policy / documentation output only

## Anti-Drift Rules

- no second apply primitive in this branch
- no compound flow in code, docs, prompts, or user-facing text
- if a new requested task is outside the include list, move it to a later branch
- if commit count meaningfully exceeds about 7 logical units, re-evaluate branch drift

## Done Criteria

This branch can close when all of the following are true:

1. atomic delete works for the accepted House_KR case
2. related tests pass
3. viewer verification passes in the chosen demo viewer
4. destructive clarification text is updated
5. BCR block behavior is explicit in code/tests/docs
6. next-branch candidates are documented:
   - compound `delete + create_wall`
   - `create_window`

## Next-Branch Candidates

These are intentionally out of scope here:

1. compound `delete + create_wall`
2. `create_window` re-attempt
3. partition apply and larger opening-aware space rework

# codex.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

## 5. Editor Realtime And History Safety

**Treat autosave, STOMP sync, snapshots, and undo/redo as one system.**

The editor has tightly coupled realtime state. Small condition changes can break autosave,
undo, redo, or 2D/3D synchronization. When touching any of these areas, do not make an
isolated change without checking the full flow:

- `useEditorPage.ts`
- `useBubbleSnapshotRealtime.ts`
- `useWorkspaceRemoteSnapshotHandlers.ts`
- `useWorkspaceCommandPublisher.ts`
- `workspaceRealtime.service.ts`
- 2D canvas edit handlers
- 3D IFC transform/delete/selection handlers

Before changing editor realtime/history code, explicitly identify:
- Whether the change marks the snapshot dirty.
- Whether it creates, consumes, or skips a pending workspace command.
- Whether it changes STOMP publish timing or duplicate publish behavior.
- Whether it changes server echo handling.
- Whether it affects history cursor updates.
- Whether it changes 2D layout state, 3D IFC source state, or both.

For editor realtime/history changes, verify this complete cycle:

`local state -> pending command -> publish -> server echo -> history cursor -> undo/redo`

Rules:
- Do not change `FLOOR_PLAN_UPDATED`, `FLOOR_PLAN_PROCESSING`, undo, or redo handling without checking IFC URL application, floor-plan layout application, bubble snapshot application, and history cursor updates together.
- Do not call `replaceFloorPlanState` for a narrow edit if a functional updater can preserve concurrent local state.
- Do not consume `workspaceCommandPublisher` commands unless the publish path is definitely ready to send that command.
- Do not add new `mode === '3d'` behavior without checking the 2D state after switching modes.
- Do not add temporary console logs or performance markers without removing them before commit.
- Keep `useEditorPage.ts` changes small. Prefer moving focused logic into existing hooks or utilities.

Minimum manual checks before considering the change done:
- 2D room move, undo, redo.
- 2D wall/opening edit, undo, redo.
- 3D Space move and 2D layout reflection.
- 3D Wall/Slab/Roof move, undo, redo.
- 3D delete without worker DLQ.
- Floor add and floor panel consistency in 2D and 3D.
- Hard refresh keeps the latest IFC and history state.

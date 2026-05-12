# 2D LLM Demo One-Pager

## Demo Message

`2D LLM` is a safe IFC editing copilot.
It applies clear local edits precisely and refuses risky room-scale or wall-scale auto-edits.

## Current Branch Result

### Apply-capable demo path

- create door on a selected wall
- House_KR viewer verification completed
- host wall / opening / door relation preserved
- wall-local convention mismatch corrected

### Planning-assist only

- room add / remove / resize
- insert toilet
- create wall
- conflict-aware wall clarification

## Best Single Demo

### Scenario

- user selects one wall in 2D
- assistant input shows a chip like `[wall#2]`
- user asks to add a door
- system previews and applies it
- result is confirmed in 2D and IFC viewer

## Demo Rules

- single selection only
- selector wins over free text
- room requests do not auto-apply
- insert toilet does not auto-apply
- create wall does not auto-apply
- create door is apply-capable only when IFC template reuse is possible

## What Not To Demo As Apply

- room add / remove / resize
- insert toilet
- create wall
- multi-selection
- generic fallback door creation without reusable door template

## Why Create Wall Was Deferred

- two different House_KR living-room candidates failed in viewer
- actual IFC opening extents still overlapped the attach wall segment
- there is no single viewer-validated partition-wall candidate on this branch

## Next Work

1. keep `create_door` as the main auto-apply demo
2. keep `create_wall` deferred until a real enumerate-first candidate pass exists
3. keep wall edits in Phase 1 only
   - detect colliding doors / windows / openings
   - explain destructive impact
   - do not auto-apply
   - do not ask for unsupported destructive approval on this branch
4. postpone deletion primitives to the next branch
   - likely as one family such as `delete_wall_void`
5. evaluate whether `create_window` can be hardened using the same template-pair strategy
6. keep selector-based contracts stable and avoid widening scope before viewer validation

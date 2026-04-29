# Shared Schemas

This directory contains JSON Schemas shared across the BE/AI boundary and AI workspace packages.

## Included here

- `messages/*.schema.json`: queue message payload schemas
- `layout_import_v1.schema.json`: v1 layout import contract
- `layout_import_v2.schema.json`: v2 layout import contract
- `engine_request.schema.json`: 3D engine request contract
- `engine_preview_result.schema.json`: 3D engine preview result contract
- `engine_apply_result.schema.json`: 3D engine apply result contract

## Worker message contracts

- `messages/command_message.schema.json`: full worker command message contract
- `messages/event_message.schema.json`: full worker event message contract
- Worker message fields use camelCase to match MQ contracts.
- `ifc_generate` accepts layout import payloads using either:
  - `layout_import_v1.schema.json`
  - `layout_import_v2.schema.json`
- `ifc_edit` accepts either an inline engine request or a referenced command JSON.

## Layout import versions

- `v1` remains the original space-oriented import contract.
- `v2` adds:
  - `generation_options`
  - extended `modeling_defaults`
  - `generation_policy`
- `v2` currently fixes policy support to:
  - `boundary_wall_mode = outer_boundary`
  - `shared_wall_policy = from_adjacency`
  - `roof_shape = flat`

The `v2` contract is intended to lock input validation and feature prerequisites for future wall/slab/roof generation. It does not imply those IFC elements are generated today.

# MinIO Storage Spec

## Scope
- This document locks the MinIO/S3 object paths used by the AI workers.
- All job step prefixes use `projects/{project_id}/jobs/{job_id}/steps/{step_no}`.
- `step_no` is always a 3-digit zero-padded segment such as `001`, `002`, `010`.

## Canonical Layout

```text
projects/{project_id}/
  scene-states/{scene_state_id}/{scene_type}/snapshot.v1.json
  revisions/{revision_id}/
    {scene_type}/snapshot.v1.json
    ifc/model.v1.ifc
    manifest.v1.json
  jobs/{job_id}/
    steps/{step_no}/
      planner/
        2d-command.v1.json
        3d-command.v1.json
      engine/
        engine-request.v2.json
        preview-result.v2.json
        validation-report.v1.json
      error/
        error-detail.v1.json
  render-inputs/{artifact_id}.{ext}
  renders/{artifact_id}.png
```

## Artifact Paths

| Artifact | Path | Owner | Notes |
| --- | --- | --- | --- |
| scene state snapshot | `projects/{project_id}/scene-states/{scene_state_id}/{scene_type}/snapshot.v1.json` | BE | Persistent |
| revision snapshot | `projects/{project_id}/revisions/{revision_id}/{scene_type}/snapshot.v1.json` | BE | Persistent |
| final IFC | `projects/{project_id}/revisions/{revision_id}/ifc/model.v1.ifc` | `ai-authoring` | Existing behavior |
| revision manifest | `projects/{project_id}/revisions/{revision_id}/manifest.v1.json` | `ai-authoring` | Existing behavior |
| 2D planner output | `projects/{project_id}/jobs/{job_id}/steps/{step_no}/planner/2d-command.v1.json` | `ai-planning-2d` | Observability artifact |
| 3D planner output | `projects/{project_id}/jobs/{job_id}/steps/{step_no}/planner/3d-command.v1.json` | `ai-planning-3d` | Out of scope for this branch |
| engine request | `projects/{project_id}/jobs/{job_id}/steps/{step_no}/engine/engine-request.v2.json` | `ai-planning-2d` | Alias of `expectedOutput.editPlanStorageUrl` |
| engine preview result | `projects/{project_id}/jobs/{job_id}/steps/{step_no}/engine/preview-result.v2.json` | `ai-planning-2d` | Observability artifact |
| validation report | `projects/{project_id}/jobs/{job_id}/steps/{step_no}/engine/validation-report.v1.json` | `ai-planning-2d` | Alias of `expectedOutput.validationReportStorageUrl` |
| error detail | `projects/{project_id}/jobs/{job_id}/steps/{step_no}/error/error-detail.v1.json` | `ai-planning-2d` | Failure artifact |
| render input | `projects/{project_id}/render-inputs/{artifact_id}.{ext}` | `ai-rendering` | Out of scope for this branch |
| render output | `projects/{project_id}/renders/{artifact_id}.png` | `ai-rendering` | Out of scope for this branch |

## 2D Worker Rules

### Existing IFC Upload
- `expectedOutput.ifcStorageUrl` behavior is unchanged.
- If the step produces an IFC and `expectedOutput.ifcStorageUrl` is provided, the worker writes the IFC there.
- This branch adds the four 2D planning artifacts on top of the existing IFC upload behavior.

### Bucket Resolution
- The path builder returns bucket-relative keys, not full `s3://...` URLs.
- The worker resolves the bucket at the call site.
- Bucket inheritance order for self-constructed 2D artifacts uses the first non-`None` expected output URL:
  1. `expectedOutput.editPlanStorageUrl`
  2. `expectedOutput.ifcStorageUrl`
  3. `expectedOutput.validationReportStorageUrl`
  4. `expectedOutput.errorDetailStorageUrl`
  5. fallback: `S3_BUCKET`
- If the provided expected output URLs point to different buckets, the worker logs a warning and uses the first bucket in the priority order above.

### Core vs Observability Artifacts
- Core artifacts:
  - `engine-request.v2.json`
  - `validation-report.v1.json`
- Observability artifacts:
  - `2d-command.v1.json`
  - `preview-result.v2.json`

### URL Source Rules
- `engine-request.v2.json`
  - uses `expectedOutput.editPlanStorageUrl`
- `validation-report.v1.json`
  - uses `expectedOutput.validationReportStorageUrl`
- `2d-command.v1.json`
  - self-constructed by `ai-planning-2d`
- `preview-result.v2.json`
  - self-constructed by `ai-planning-2d`
- `error-detail.v1.json`
  - uses `expectedOutput.errorDetailStorageUrl` if provided
  - otherwise self-constructs to `projects/{project_id}/jobs/{job_id}/steps/{step_no}/error/error-detail.v1.json`

### Retry and Write Order
- Write order:
  1. `2d-command.v1.json`
  2. `preview-result.v2.json`
  3. `engine-request.v2.json`
  4. `validation-report.v1.json`
  5. `model.v1.ifc` when produced
- Observability artifact write failure:
  - log `observability_artifact_write_failed`
  - continue execution
- Core artifact write failure:
  - raise retryable worker error
- Retry safety:
  - all keys are deterministic from `(project_id, job_id, step_no)`
  - S3 overwrite semantics make retries idempotent

### Event Output Priority
- `EventOutputRef.storageUrl` priority:
  1. IFC URL
  2. engine-request URL
  3. validation-report URL
  4. otherwise fail with `NO_OUTPUT`

## Payload Schemas

### 2d-command.v1.json
- `schema_version: "v1"`
- `user_instruction: str`
- `parsed_command: FloorNLPCommand.model_dump(mode="json")`
- `command_batch: CommandBatch.model_dump(mode="json")`
- `needs_clarification: bool`
- `clarification_question: str | None`
- `parsed_at: ISO8601 UTC`

### engine-request.v2.json
- Shape: `IfcEditCommandPayload.model_dump(mode="json")`
- This is the canonical hand-off payload to `ai-authoring`.
- `expectedOutput.editPlanStorageUrl` is the backward-compatible alias for this artifact.
- No extra wrapping is added by the 2D worker.

### preview-result.v2.json
- `schema_version: "v2"`
- `status: str`
- `summary: str`
- `command: FloorNLPCommand.model_dump(mode="json")`
- `command_batch: CommandBatch.model_dump(mode="json")`
- `policy_plan: dict | None`
- `matched_count: int`
- `validation_warnings: list[str]`
- `engine_request: dict | None`
- `ifc_edit_payload: dict | None`
- `engine_capabilities: dict`
- Note: `preview-result.v2.json` intentionally contains an observability snapshot of `ifc_edit_payload`.
- In this branch, `policy_plan` keeps the current `session_pipeline` dict shape.
- A future PR may replace `policy_plan` with `PlanV14.model_dump()` and bump the schema if needed.

### validation-report.v1.json
- `schema_version: "v1"`
- `artifact_id: str`
- `job_id: str`
- `step_no: int`
- `plan_validation_issues: list[ValidationIssue.model_dump(mode="json")]`
- `plan_validation_warnings: list[ValidationIssue.model_dump(mode="json")]`
- `preview_warnings: list[str]`
- `ifc_validation_issues: list[ValidationIssue.model_dump(mode="json")] | None`
- `ifc_validation_issues = None` means IFC validation was not executed in this branch.
- Validation reports are always written, even when all issue lists are empty.

### error-detail.v1.json
- `schema_version: "v1"`
- `error_code: str`
- `error_message: str`
- `error_class: str`
- `job_id: str`
- `step_no: int`
- `timestamp: ISO8601 UTC`
- `validation_issues: list[ValidationIssue.model_dump(mode="json")] | None`
- `uploaded_artifacts: list[str]`
- `failed_artifact: str | None`
- Error detail upload is best-effort; the original worker failure still wins if the error-detail write also fails.

## Logging Conventions
- Observability artifact write failures use:
  - level: `WARNING`
  - code: `observability_artifact_write_failed`
  - fields: `artifact_kind`, `key`, `bucket`, `error_class`, `error_message`
- Step padding mismatch in expected output URLs is advisory only:
  - the worker logs a warning
  - the worker still uses the provided expected output URL

## Implementation Boundaries
- This branch does not add new `ExpectedOutputRef` fields in `ai-domain`.
- This branch does not implement:
  - render-input / render-output writes
  - scene-state snapshot writes
  - revision snapshot writes
  - lifecycle or bucket provisioning
  - MinIO integration tests
- `ai-authoring` keeps its current upload code in this branch.
- Lifecycle policy is owned by BE/infra, not by the AI workers.

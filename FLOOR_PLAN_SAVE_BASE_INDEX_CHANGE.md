# Floor-plan Save API FE Change

## Context

2D/3D mode save should use:

```http
POST /api/v1/projects/{projectId}/workspace/floor-plan/save
```

Backend contract is changing so the frontend does not send an S3 bucket/path or presigned URL.

## Request Body

Frontend now sends:

```json
{
  "revisionId": "current IFC revision id or null",
  "baseIndex": 3
}
```

Removed from request:

```json
{
  "s3Url": "..."
}
```

## Changed Files

### `FE/src/features/editor/services/workspaceSave.service.ts`

`saveFloorPlanSnapshot` input changed from:

```ts
input: { revisionId?: string | null; s3Url: string }
```

to:

```ts
input: { revisionId?: string | null; baseIndex: number }
```

Request body now posts:

```ts
{
  revisionId: input.revisionId ?? null,
  baseIndex: input.baseIndex,
}
```

### `FE/src/features/editor/hooks/useEditorPage.ts`

2D/3D manual save path now calls:

```ts
workspaceSaveService.saveFloorPlanSnapshot(projectId, {
  revisionId: currentIfcRevisionId,
  baseIndex: floorPlanHistoryBaseIndexRef.current,
})
```

The save guard checks that `baseIndex` is a non-negative integer before calling the API.

Frontend no longer stores or forwards `currentIfcStorageUrl` for the save API.

## Behavior

- Bubble draft save remains unchanged.
- 2D/3D header save uses the REST floor-plan save endpoint.
- FE does not need to know bucket name, S3 key, or presigned URL for save.
- Backend is expected to resolve the actual saved IFC/S3 artifact from `baseIndex` and/or `revisionId`.

## Verification

Ran from `FE`:

```bash
npm run build
```

Result: build passed.

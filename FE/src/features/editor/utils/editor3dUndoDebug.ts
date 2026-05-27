import type { IfcElementChange } from '../types'
import type { FloorPlanSnapshotPayload } from './workspaceSyncMessage'

const EDITOR_3D_UNDO_DEBUG_STORAGE_KEY = 'editor3dUndoDebug'

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const hasFiniteVector3 = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return isFiniteNumber(record.x) || isFiniteNumber(record.y) || isFiniteNumber(record.z)
}

export const isEditor3dUndoDebugEnabled = (): boolean => {
  if (typeof window === 'undefined') return false
  try {
    const runtimeFlag = (window as Window & { __EDITOR_3D_UNDO_DEBUG__?: boolean }).__EDITOR_3D_UNDO_DEBUG__
    if (runtimeFlag === true) return true

    const queryFlag = new URLSearchParams(window.location.search).get(EDITOR_3D_UNDO_DEBUG_STORAGE_KEY)
    if (queryFlag === '1' || queryFlag === 'true') return true

    return window.localStorage.getItem(EDITOR_3D_UNDO_DEBUG_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export const logEditor3dUndoDebug = (
  scope: string,
  event: string,
  payload?: Record<string, unknown>,
) => {
  if (!isEditor3dUndoDebugEnabled()) return
  console.log(`[editor3d-undo-debug][${scope}] ${event}`, payload ?? {})
}

export const hasIfcElementTransformChangeFor3dUndo = (change: IfcElementChange): boolean =>
  hasFiniteVector3(change.translationMm) ||
  isFiniteNumber(change.positionX) ||
  isFiniteNumber(change.positionY) ||
  isFiniteNumber(change.positionZ) ||
  isFiniteNumber(change.rotationX) ||
  isFiniteNumber(change.rotationY) ||
  isFiniteNumber(change.rotationZ) ||
  isFiniteNumber(change.lengthMm) ||
  isFiniteNumber(change.heightMm) ||
  isFiniteNumber(change.thicknessMm)

export const summarizeIfcElementChangeFor3dUndo = (change: IfcElementChange): Record<string, unknown> => ({
  expressId: change.expressId,
  localId: change.localId ?? null,
  localIds: change.localIds ?? [],
  globalId: change.globalId ?? null,
  ifcClass: change.ifcClass ?? null,
  deleted: change.deleted === true,
  hasTranslationMm: hasFiniteVector3(change.translationMm),
  translationMm: change.translationMm ?? null,
  position: {
    x: change.positionX ?? null,
    y: change.positionY ?? null,
    z: change.positionZ ?? null,
  },
  rotation: {
    x: change.rotationX ?? null,
    y: change.rotationY ?? null,
    z: change.rotationZ ?? null,
  },
  dimensions: {
    lengthMm: change.lengthMm ?? null,
    heightMm: change.heightMm ?? null,
    thicknessMm: change.thicknessMm ?? null,
  },
})

export const summarizeFloorPlanSnapshotFor3dUndo = (
  snapshot: FloorPlanSnapshotPayload | null | undefined,
): Record<string, unknown> => {
  const layout = snapshot?.layout
  const changes = layout?.ifcElementChanges ?? []
  const transformChanges = changes.filter(hasIfcElementTransformChangeFor3dUndo)
  return {
    baseIndex: snapshot?.baseIndex ?? layout?.baseIndex ?? null,
    revisionId: snapshot?.revisionId ?? null,
    hasLayout: Boolean(layout),
    phaseStatus: layout?.phaseStatus ?? null,
    floorLayerCount: layout?.floorLayers?.length ?? 0,
    libraryElementCount: layout?.libraryElements?.length ?? 0,
    hiddenElementCount: layout?.hiddenElementIds?.length ?? 0,
    ifcElementChangeCount: changes.length,
    transformChangeCount: transformChanges.length,
    deletedChangeCount: changes.filter((change) => change.deleted === true).length,
    transformSamples: transformChanges.slice(0, 5).map(summarizeIfcElementChangeFor3dUndo),
  }
}

export const summarizeWorkspaceCommandFor3dUndo = (
  command: unknown,
): Record<string, unknown> | null => {
  if (!command || typeof command !== 'object') return null
  const record = command as Record<string, unknown>
  const patch = record.patch && typeof record.patch === 'object'
    ? record.patch as Record<string, unknown>
    : null
  return {
    op: record.op ?? null,
    entity: record.entity ?? null,
    id: record.id ?? null,
    timestamp: record.timestamp ?? null,
    patchKeys: patch ? Object.keys(patch).sort() : [],
    globalId: patch?.globalId ?? patch?.global_id ?? null,
    expressId: patch?.expressId ?? null,
    ifcClass: patch?.ifcClass ?? null,
    translationMm: patch?.translationMm ?? patch?.translation_mm ?? null,
    rotationDegrees: patch?.rotationDegrees ?? patch?.rotation_degrees ?? null,
    rotationAxisAngle: patch?.rotationAxisAngle ?? patch?.rotation_axis_angle ?? null,
  }
}

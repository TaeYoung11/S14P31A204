import type { EditorMode, IfcElementChange, IfcElementInfo } from '../types'

type IfcElementPatch = Omit<IfcElementChange, 'expressId'>

interface IfcChangeTargetMeta {
  globalId?: string
  ifcClass?: string
}

const hasFiniteTriple = (
  x: number | undefined,
  y: number | undefined,
  z: number | undefined,
): x is number => Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)

const isSameIfcElementSelection = (
  previous: IfcElementInfo,
  next: IfcElementInfo,
): boolean => (
  previous.source === 'ifc' &&
  next.source === 'ifc' &&
  typeof next.expressId === 'number' &&
  previous.id === next.id &&
  previous.expressId === next.expressId
)

/**
 * 3D 선택 이벤트에서 위치/회전 변화분만 추출해 IFC 변경 patch를 만든다.
 * 동일 IFC 요소 재선택이 아니거나 변화가 없으면 null을 반환한다.
 */
export const buildIfcSelectionTransformPatch = (params: {
  mode: EditorMode
  previous: IfcElementInfo | null
  next: IfcElementInfo | null
}): { expressId: number; patch: IfcElementPatch } | null => {
  const { mode, previous, next } = params
  if (mode !== '3d') return null
  if (!previous || !next) return null
  if (next.source !== 'ifc' || typeof next.expressId !== 'number') return null
  if (!isSameIfcElementSelection(previous, next)) return null

  const patch: IfcElementPatch = {}
  if (
    hasFiniteTriple(next.positionX, next.positionY, next.positionZ) &&
    (
      next.positionX !== previous.positionX ||
      next.positionY !== previous.positionY ||
      next.positionZ !== previous.positionZ
    )
  ) {
    patch.positionX = next.positionX
    patch.positionY = next.positionY
    patch.positionZ = next.positionZ
  }
  if (
    hasFiniteTriple(next.rotationX, next.rotationY, next.rotationZ) &&
    (
      next.rotationX !== previous.rotationX ||
      next.rotationY !== previous.rotationY ||
      next.rotationZ !== previous.rotationZ
    )
  ) {
    patch.rotationX = next.rotationX
    patch.rotationY = next.rotationY
    patch.rotationZ = next.rotationZ
  }
  if (Object.keys(patch).length === 0) return null
  return { expressId: next.expressId, patch }
}

/**
 * IFC 요소 변경 patch를 expressId 기준 캐시에 병합한다.
 */
export const mergeIfcElementChangeByExpressId = (
  changesById: Record<number, IfcElementChange>,
  expressId: number,
  patch: IfcElementPatch,
  meta?: IfcChangeTargetMeta,
): Record<number, IfcElementChange> => ({
  ...changesById,
  [expressId]: {
    ...changesById[expressId],
    ...patch,
    expressId,
    ...(meta ? { globalId: meta.globalId, ifcClass: meta.ifcClass } : {}),
  },
})

/**
 * IFC patch를 실시간 동기화 대상으로 발행할지 판단한다.
 */
export const shouldPublishIfcElementPatch = (
  element: IfcElementInfo | null,
  patch: IfcElementPatch,
): element is IfcElementInfo & { source: 'ifc'; expressId: number; globalId: string } =>
  Boolean(element?.globalId) &&
  element?.source === 'ifc' &&
  typeof element?.expressId === 'number' &&
  !patch.deleted

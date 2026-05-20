export type MovedIfcProxyVisibilityState = {
  visible: boolean
  opacity: number
}

export type MovedIfcProxyVisibilityRecord = {
  hideLocalIds: number[]
}

interface MovedIfcProxyVisibilityFilterOptions {
  allIds: Set<number>
  activeStoreyExpressId?: number | null
  storeyMap: Map<number, Set<number>>
  overlayStoreyExpressIds: number[]
  overlayIfcStoreyOpacityByExpressId?: Record<number, number>
  deletedLocalIds: Set<number>
  hiddenLocalIds: Set<number>
}

/**
 * 이동 완료 후 proxy로 대체 표시 중인 IFC 요소의 층 visibility 필터를 만든다.
 * 원본 fragment와 같은 층/숨김/겹쳐보기 정책을 proxy Object3D에도 적용한다.
 */
export const createMovedIfcProxyVisibilityFilter = ({
  allIds,
  activeStoreyExpressId,
  storeyMap,
  overlayStoreyExpressIds,
  overlayIfcStoreyOpacityByExpressId,
  deletedLocalIds,
  hiddenLocalIds,
}: MovedIfcProxyVisibilityFilterOptions) => {
  const activeStoreyIds = new Set<number>()
  if (activeStoreyExpressId != null) {
    storeyMap.get(activeStoreyExpressId)?.forEach((id) => activeStoreyIds.add(id))
  }

  const overlayStoreyIdsByStoreyId = new Map<number, Set<number>>()
  overlayStoreyExpressIds.forEach((storeyId) => {
    const ids = storeyMap.get(storeyId)
    if (ids && ids.size > 0) overlayStoreyIdsByStoreyId.set(storeyId, ids)
  })

  const visibleStoreyIds = new Set<number>()
  if (activeStoreyExpressId == null) {
    allIds.forEach((id) => visibleStoreyIds.add(id))
  } else {
    activeStoreyIds.forEach((id) => visibleStoreyIds.add(id))
    overlayStoreyIdsByStoreyId.forEach((ids) => ids.forEach((id) => visibleStoreyIds.add(id)))
  }
  deletedLocalIds.forEach((id) => visibleStoreyIds.delete(id))
  hiddenLocalIds.forEach((id) => visibleStoreyIds.delete(id))

  const resolveOverlayOpacityForLocalIds = (localIds: number[]): number | null => {
    for (const storeyId of overlayStoreyExpressIds) {
      if (storeyId === activeStoreyExpressId) continue
      const ids = overlayStoreyIdsByStoreyId.get(storeyId)
      if (!ids) continue
      const hasOverlayId = localIds.some((localId) => ids.has(localId))
      if (!hasOverlayId) continue
      const rawTransparency = overlayIfcStoreyOpacityByExpressId?.[storeyId] ?? 0.35
      const clampedTransparency = Math.min(Math.max(rawTransparency, 0), 1)
      return 1 - clampedTransparency
    }
    return null
  }

  return (record: MovedIfcProxyVisibilityRecord): MovedIfcProxyVisibilityState => {
    const recordLocalIds = record.hideLocalIds.filter((id) => allIds.has(id))
    if (recordLocalIds.length === 0) return { visible: true, opacity: 1 }

    const isDeletedOrHidden = recordLocalIds.some((id) => deletedLocalIds.has(id) || hiddenLocalIds.has(id))
    if (isDeletedOrHidden) return { visible: false, opacity: 0 }

    const visible = recordLocalIds.some((id) => visibleStoreyIds.has(id))
    if (!visible) return { visible: false, opacity: 0 }

    const isActiveStoreyElement =
      activeStoreyExpressId != null &&
      recordLocalIds.some((id) => activeStoreyIds.has(id))
    if (isActiveStoreyElement) return { visible: true, opacity: 1 }

    return { visible: true, opacity: resolveOverlayOpacityForLocalIds(recordLocalIds) ?? 1 }
  }
}

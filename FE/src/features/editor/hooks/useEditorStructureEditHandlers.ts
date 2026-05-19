import { useCallback, useMemo } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  DEFAULT_WALL_MATERIAL,
  FLOOR_OPENING_PRESETS,
  FLOOR_MM_PER_PX,
  FLOOR_WALL_HEIGHT_MAX_MM,
  FLOOR_WALL_HEIGHT_MIN_MM,
  FLOOR_WALL_PRESETS,
  FLOOR_WALL_THICKNESS_MAX_MM,
  FLOOR_WALL_THICKNESS_MIN_MM,
} from '../constants'
import type { FloorLayer, FloorOpening, FloorRoom, FloorWall, Point2D } from '../types'
import { collectAutoDoorOpeningIdsFromWallIds, createFloorOpeningId, createFloorWallId } from '../utils/editorPageHelpers'
import { buildWallOutsideOverlapSegments, getWallGeometryKey, getWallOverlapInterval, projectAxisAlignedWall } from '../utils/wallGeometry'
import { createsNewWallRoomCollision } from '../utils/wallRoomCollision'
import { clampWallHeightMm, clampWallThicknessMm } from '../utils/wallSync'

interface WorkspaceCommandPublisherLike {
  createWall: (wall: FloorWall) => void
  updateWallGeometry: (wallId: string, start: Point2D, end: Point2D, startMm?: Point2D, endMm?: Point2D) => void
  deleteWall: (wallId: string) => void
  upsertOpening: (opening: FloorOpening, exists: boolean) => void
  updateOpening: (openingType: FloorOpening['type'], openingId: string, patch: Record<string, unknown>) => void
  deleteOpening: (opening: FloorOpening) => void
  updateWallStyle: (wallId: string, next: {
    wallType?: FloorWall['type']
    thickness?: number
    height?: number
    material?: string
  }) => void
  hasPendingCommand: () => boolean
  markSnapshotOnlyChange: (reason: string, id?: string, metadata?: Record<string, unknown>) => void
}

export interface FloorWallCreateStorey {
  storeyGlobalId?: string
  storeyName?: string
}

const hasStorey = (storey: FloorWallCreateStorey): boolean =>
  Boolean(storey.storeyGlobalId || storey.storeyName)

const ensureSnapshotCommandIfNeeded = (
  workspaceCommandPublisher: WorkspaceCommandPublisherLike,
  reason: string,
  id: string,
  metadata: Record<string, unknown> = {},
): void => {
  if (workspaceCommandPublisher.hasPendingCommand()) return
  workspaceCommandPublisher.markSnapshotOnlyChange(reason, id, metadata)
}

export function resolveActiveFloorLayerStorey(
  floorLayers: FloorLayer[],
  activeFloorLayerId: string | null,
): FloorWallCreateStorey {
  const activeLayer = activeFloorLayerId
    ? floorLayers.find((layer) => layer.id === activeFloorLayerId)
    : null
  return {
    storeyGlobalId: activeLayer?.storeyGlobalId,
    storeyName: activeLayer?.storeyName ?? activeLayer?.name,
  }
}

export function resolveFloorWallCreateStorey(
  activeLayerStorey: FloorWallCreateStorey,
  fallbackStorey: FloorWallCreateStorey,
): FloorWallCreateStorey {
  return hasStorey(activeLayerStorey) ? activeLayerStorey : fallbackStorey
}

interface UseEditorStructureEditHandlersParams {
  floorRooms: FloorRoom[]
  floorLayers: FloorLayer[]
  activeFloorLayerId: string | null
  floorWalls: FloorWall[]
  visibleAutoFloorWalls: FloorWall[]
  autoFloorWalls: FloorWall[]
  mergedFloorOpenings: FloorOpening[]
  selectedFloorWallId: string | null
  wallCreatePreset: { type: FloorWall['type']; thickness: number; heightMm: number }
  workspaceCommandPublisher: WorkspaceCommandPublisherLike
  clearSelection: () => void
  setFloorWalls: Dispatch<SetStateAction<FloorWall[]>>
  setFloorOpenings: Dispatch<SetStateAction<FloorOpening[]>>
  setWallCreatePreset: Dispatch<SetStateAction<{ type: FloorWall['type']; thickness: number; heightMm: number }>>
  setSelectedFloorWallId: Dispatch<SetStateAction<string | null>>
  setSelectedFloorWallIds: Dispatch<SetStateAction<string[]>>
  setSelectedFloorOpeningId: Dispatch<SetStateAction<string | null>>
  setSelectedFloorOpeningIds: Dispatch<SetStateAction<string[]>>
  setSelectedTool: Dispatch<SetStateAction<string>>
  setHiddenAutoWallIds: Dispatch<SetStateAction<string[]>>
  setHiddenAutoOpeningIds: Dispatch<SetStateAction<string[]>>
  isAutoDerivedWallId: (wallId: string) => boolean
  ensureFloorWallInManual: (wallId: string) => void
  ensureFloorOpeningInManual: (openingId: string) => void
  updateFloorOpeningFromEditable: (openingId: string, updater: (opening: FloorOpening) => FloorOpening) => void
  updateFloorWallFromEditable: (wallId: string, updater: (wall: FloorWall) => FloorWall) => void
  promoteCurrentAutoFloorOpenings: () => void
  normalizeOpeningByCurrentWall: (opening: FloorOpening) => FloorOpening
  onFloorPlanChanged: () => void
}

/**
 * 2D 벽/개구부 편집 핸들러 묶음.
 * 페이지 훅의 대형 편집 로직을 분리해 책임을 명확히 한다.
 */
export function useEditorStructureEditHandlers({
  floorRooms,
  floorLayers,
  activeFloorLayerId,
  floorWalls,
  visibleAutoFloorWalls,
  autoFloorWalls,
  mergedFloorOpenings,
  selectedFloorWallId,
  wallCreatePreset,
  workspaceCommandPublisher,
  clearSelection,
  setFloorWalls,
  setFloorOpenings,
  setWallCreatePreset,
  setSelectedFloorWallId,
  setSelectedFloorWallIds,
  setSelectedFloorOpeningId,
  setSelectedFloorOpeningIds,
  setSelectedTool,
  setHiddenAutoWallIds,
  setHiddenAutoOpeningIds,
  isAutoDerivedWallId,
  ensureFloorWallInManual,
  ensureFloorOpeningInManual,
  updateFloorOpeningFromEditable,
  updateFloorWallFromEditable,
  promoteCurrentAutoFloorOpenings,
  normalizeOpeningByCurrentWall,
  onFloorPlanChanged,
}: UseEditorStructureEditHandlersParams) {
const getEditableWallById = useCallback((wallId: string): FloorWall | null => {
    return (
      floorWalls.find((wall) => wall.id === wallId) ??
      visibleAutoFloorWalls.find((wall) => wall.id === wallId) ??
      null
    )
  }, [floorWalls, visibleAutoFloorWalls])

  const estimateMmDelta = useCallback((wall: FloorWall, dx: number, dy: number): Point2D | null => {
    if (!wall.startMm || !wall.endMm) return null
    const pxLength = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y)
    const mmLength = Math.hypot(wall.endMm.x - wall.startMm.x, wall.endMm.y - wall.startMm.y)
    if (!Number.isFinite(pxLength) || pxLength <= 0 || !Number.isFinite(mmLength) || mmLength <= 0) return null
    const mmPerPx = mmLength / pxLength
    return { x: dx * mmPerPx, y: dy * mmPerPx }
  }, [])

  const estimateMmPoint = useCallback((point: Point2D): Point2D | undefined => {
    const referenceWall = [...floorWalls, ...visibleAutoFloorWalls].find((wall) => wall.startMm && wall.endMm)
    if (!referenceWall?.startMm || !referenceWall.endMm) {
      return {
        x: point.x * FLOOR_MM_PER_PX,
        y: point.y * FLOOR_MM_PER_PX,
      }
    }
    const pxLength = Math.hypot(referenceWall.end.x - referenceWall.start.x, referenceWall.end.y - referenceWall.start.y)
    const mmLength = Math.hypot(referenceWall.endMm.x - referenceWall.startMm.x, referenceWall.endMm.y - referenceWall.startMm.y)
    if (!Number.isFinite(pxLength) || pxLength <= 0 || !Number.isFinite(mmLength) || mmLength <= 0) return undefined
    const mmPerPx = mmLength / pxLength
    return {
      x: referenceWall.startMm.x + (point.x - referenceWall.start.x) * mmPerPx,
      y: referenceWall.startMm.y + (point.y - referenceWall.start.y) * mmPerPx,
    }
  }, [floorWalls, visibleAutoFloorWalls])

  const activeLayerStorey = useMemo(
    () => resolveActiveFloorLayerStorey(floorLayers, activeFloorLayerId),
    [floorLayers, activeFloorLayerId],
  )

  const getReferenceStorey = useCallback((): FloorWallCreateStorey => {
    const referenceWall = [...floorWalls, ...visibleAutoFloorWalls]
      .find((wall) => wall.storeyGlobalId || wall.storeyName)
    return {
      storeyGlobalId: referenceWall?.storeyGlobalId,
      storeyName: referenceWall?.storeyName,
    }
  }, [floorWalls, visibleAutoFloorWalls])

  const isWallEditBlockedByRoomCollision = useCallback((
    wall: FloorWall,
    nextStart: Point2D,
    nextEnd: Point2D,
  ): boolean => {
    return createsNewWallRoomCollision({
      floorRooms,
      prevStart: wall.start,
      prevEnd: wall.end,
      nextStart,
      nextEnd,
      insetPx: 2,
    })
  }, [floorRooms])

  const handleCreateFloorWall = useCallback((
    start: Point2D,
    end: Point2D,
    options?: { type?: FloorWall['type']; thickness?: number; heightMm?: number },
  ) => {
    const nextType = options?.type ?? wallCreatePreset.type
    const fallbackPreset = FLOOR_WALL_PRESETS[nextType]
    const nextThickness = clampWallThicknessMm(
      options?.thickness ?? wallCreatePreset.thickness ?? fallbackPreset.thickness,
      FLOOR_WALL_THICKNESS_MIN_MM,
      FLOOR_WALL_THICKNESS_MAX_MM,
    )
    const nextHeightMm = clampWallHeightMm(
      options?.heightMm ?? wallCreatePreset.heightMm ?? fallbackPreset.heightMm,
      FLOOR_WALL_HEIGHT_MIN_MM,
      FLOOR_WALL_HEIGHT_MAX_MM,
    )
    const createStorey = resolveFloorWallCreateStorey(activeLayerStorey, getReferenceStorey())
    const newWall: FloorWall = {
      id: createFloorWallId(),
      floorLayerId: activeFloorLayerId ?? undefined,
      type: nextType,
      storeyGlobalId: createStorey.storeyGlobalId,
      storeyName: createStorey.storeyName,
      start,
      end,
      startMm: estimateMmPoint(start),
      endMm: estimateMmPoint(end),
      thickness: nextThickness,
      heightMm: nextHeightMm,
      material: DEFAULT_WALL_MATERIAL,
    }
    onFloorPlanChanged()
    workspaceCommandPublisher.createWall(newWall)
    setFloorWalls((prev) => [...prev, newWall])
    setWallCreatePreset({
      type: nextType,
      thickness: nextThickness,
      heightMm: nextHeightMm,
    })
    setSelectedFloorWallId(newWall.id)
    setSelectedFloorWallIds([newWall.id])
    setSelectedFloorOpeningIds([])
    setSelectedFloorOpeningId(null)
    clearSelection()
    setSelectedTool('wall')
  }, [
    wallCreatePreset,
    activeFloorLayerId,
    activeLayerStorey,
    estimateMmPoint,
    getReferenceStorey,
    workspaceCommandPublisher,
    setFloorWalls,
    setWallCreatePreset,
    setSelectedFloorWallId,
    setSelectedFloorWallIds,
    setSelectedFloorOpeningIds,
    setSelectedFloorOpeningId,
    clearSelection,
    setSelectedTool,
    onFloorPlanChanged,
  ])

  const handleSelectFloorWall = useCallback((wallId: string | null, append = false) => {
    if (wallId === null) {
      setSelectedFloorWallId(null)
      setSelectedFloorWallIds([])
      return
    }
    ensureFloorWallInManual(wallId)
    if (append) {
      setSelectedFloorWallIds((prev) => {
        const exists = prev.includes(wallId)
        const next = exists ? prev.filter((id) => id !== wallId) : [...prev, wallId]
        setSelectedFloorWallId(next.length > 0 ? next[next.length - 1] : null)
        return next
      })
    } else {
      setSelectedFloorWallId(wallId)
      setSelectedFloorWallIds([wallId])
    }
    setSelectedFloorOpeningId(null)
    setSelectedFloorOpeningIds([])
    clearSelection()
  }, [
    setSelectedFloorWallId,
    setSelectedFloorWallIds,
    ensureFloorWallInManual,
    setSelectedFloorOpeningId,
    setSelectedFloorOpeningIds,
    clearSelection,
  ])

  const handleMoveFloorWall = useCallback((wallId: string, dx: number, dy: number) => {
    const targetWall = getEditableWallById(wallId)
    if (!targetWall) return
    const nextStart = { x: targetWall.start.x + dx, y: targetWall.start.y + dy }
    const nextEnd = { x: targetWall.end.x + dx, y: targetWall.end.y + dy }
    const mmDelta = estimateMmDelta(targetWall, dx, dy)
    const nextStartMm = targetWall.startMm && mmDelta
      ? { x: targetWall.startMm.x + mmDelta.x, y: targetWall.startMm.y + mmDelta.y }
      : estimateMmPoint(nextStart)
    const nextEndMm = targetWall.endMm && mmDelta
      ? { x: targetWall.endMm.x + mmDelta.x, y: targetWall.endMm.y + mmDelta.y }
      : estimateMmPoint(nextEnd)
    if (isWallEditBlockedByRoomCollision(targetWall, nextStart, nextEnd)) return

    onFloorPlanChanged()
    ensureFloorWallInManual(wallId)
    setFloorWalls((prev) =>
      prev.map((wall) =>
        wall.id === wallId
          ? { ...wall, start: nextStart, end: nextEnd, startMm: nextStartMm, endMm: nextEndMm }
          : wall,
      ),
    )
    workspaceCommandPublisher.updateWallGeometry(wallId, nextStart, nextEnd, nextStartMm, nextEndMm)
    ensureSnapshotCommandIfNeeded(workspaceCommandPublisher, 'wall-geometry', wallId, { wallId })
  }, [getEditableWallById, estimateMmDelta, estimateMmPoint, isWallEditBlockedByRoomCollision, onFloorPlanChanged, ensureFloorWallInManual, setFloorWalls, workspaceCommandPublisher])

  const handleUpdateFloorWallEndpoint = useCallback((
    wallId: string,
    endpoint: 'start' | 'end',
    point: Point2D,
  ) => {
    const targetWall = getEditableWallById(wallId)
    if (!targetWall) return
    const nextStart = endpoint === 'start' ? point : targetWall.start
    const nextEnd = endpoint === 'end' ? point : targetWall.end
    const pxDelta = endpoint === 'start'
      ? { x: point.x - targetWall.start.x, y: point.y - targetWall.start.y }
      : { x: point.x - targetWall.end.x, y: point.y - targetWall.end.y }
    const mmDelta = estimateMmDelta(targetWall, pxDelta.x, pxDelta.y)
    const pointMm = endpoint === 'start'
      ? (targetWall.startMm && mmDelta ? { x: targetWall.startMm.x + mmDelta.x, y: targetWall.startMm.y + mmDelta.y } : estimateMmPoint(point))
      : (targetWall.endMm && mmDelta ? { x: targetWall.endMm.x + mmDelta.x, y: targetWall.endMm.y + mmDelta.y } : estimateMmPoint(point))
    const nextStartMm = endpoint === 'start' ? pointMm : targetWall.startMm ?? estimateMmPoint(nextStart)
    const nextEndMm = endpoint === 'end' ? pointMm : targetWall.endMm ?? estimateMmPoint(nextEnd)
    if (isWallEditBlockedByRoomCollision(targetWall, nextStart, nextEnd)) return

    onFloorPlanChanged()
    ensureFloorWallInManual(wallId)
    setFloorWalls((prev) => prev.map((wall) => (wall.id === wallId ? { ...wall, [endpoint]: point, [`${endpoint}Mm`]: pointMm } : wall)))
    workspaceCommandPublisher.updateWallGeometry(wallId, nextStart, nextEnd, nextStartMm, nextEndMm)
    ensureSnapshotCommandIfNeeded(workspaceCommandPublisher, 'wall-endpoint', wallId, { wallId, endpoint })
  }, [getEditableWallById, estimateMmDelta, estimateMmPoint, isWallEditBlockedByRoomCollision, onFloorPlanChanged, ensureFloorWallInManual, setFloorWalls, workspaceCommandPublisher])

  const handleDeleteFloorWall = useCallback((wallId: string) => {
    onFloorPlanChanged()
    const hiddenIds = new Set<string>([wallId])
    const manualResidualWalls: FloorWall[] = []

    if (isAutoDerivedWallId(wallId)) {
      const targetAutoWall = autoFloorWalls.find((wall) => wall.id === wallId)
      const targetProjection = targetAutoWall ? projectAxisAlignedWall(targetAutoWall) : null

      if (targetAutoWall && targetProjection) {
        autoFloorWalls.forEach((candidate) => {
          if (candidate.id === targetAutoWall.id) return
          if (!isAutoDerivedWallId(candidate.id)) return
          const candidateProjection = projectAxisAlignedWall(candidate)
          if (!candidateProjection) return
          const overlap = getWallOverlapInterval(targetProjection, candidateProjection)
          if (!overlap) return

          hiddenIds.add(candidate.id)
          const outsideSegments = buildWallOutsideOverlapSegments(candidate, overlap.start, overlap.end)
          outsideSegments.forEach((segment) => {
            manualResidualWalls.push({
              id: createFloorWallId(),
              floorLayerId: candidate.floorLayerId ?? targetAutoWall.floorLayerId ?? activeFloorLayerId ?? undefined,
              start: segment.start,
              end: segment.end,
              type: candidate.type,
              thickness: candidate.thickness,
              heightMm: candidate.heightMm,
              material: candidate.material,
            })
          })
        })
      }

      setHiddenAutoWallIds((prev) => {
        const merged = new Set(prev)
        hiddenIds.forEach((id) => merged.add(id))
        return Array.from(merged)
      })
    }

    const autoOpeningIdsFromDeletedWalls = collectAutoDoorOpeningIdsFromWallIds(hiddenIds)
    if (autoOpeningIdsFromDeletedWalls.length > 0) {
      setHiddenAutoOpeningIds((prev) => {
        const merged = new Set(prev)
        autoOpeningIdsFromDeletedWalls.forEach((id) => merged.add(id))
        return Array.from(merged)
      })
    }
    setFloorOpenings((prev) => prev.filter((opening) => !hiddenIds.has(opening.wallId)))
    setSelectedFloorOpeningIds((prev) =>
      prev.filter((openingId) => {
        const opening = mergedFloorOpenings.find((item) => item.id === openingId)
        if (!opening) return false
        return !hiddenIds.has(opening.wallId)
      }),
    )
    setFloorWalls((prev) => {
      const ensured = [...prev]
      hiddenIds.forEach((id) => {
        if (ensured.some((wall) => wall.id === id)) return
        const autoWall = autoFloorWalls.find((wall) => wall.id === id)
        if (autoWall) ensured.push(autoWall)
      })
      const next = ensured.filter((wall) => !hiddenIds.has(wall.id))
      const geometryKeySet = new Set(next.map(getWallGeometryKey))
      manualResidualWalls.forEach((wall) => {
        const key = getWallGeometryKey(wall)
        if (geometryKeySet.has(key)) return
        geometryKeySet.add(key)
        next.push(wall)
      })
      return next
    })
    workspaceCommandPublisher.deleteWall(wallId)
    if (selectedFloorWallId && hiddenIds.has(selectedFloorWallId)) setSelectedFloorWallId(null)
    setSelectedFloorWallIds((prev) => prev.filter((id) => !hiddenIds.has(id)))
  }, [
    isAutoDerivedWallId,
    autoFloorWalls,
    activeFloorLayerId,
    setHiddenAutoWallIds,
    setHiddenAutoOpeningIds,
    setFloorOpenings,
    setSelectedFloorOpeningIds,
    mergedFloorOpenings,
    setFloorWalls,
    workspaceCommandPublisher,
    onFloorPlanChanged,
    selectedFloorWallId,
    setSelectedFloorWallId,
    setSelectedFloorWallIds,
  ])

  const handleCreateFloorOpening = useCallback((
    wallId: string,
    type: FloorOpening['type'],
    wallPosition: number,
    preferredId?: string,
  ) => {
    promoteCurrentAutoFloorOpenings()
    const clamped = Math.min(Math.max(wallPosition, 0), 1)
    const preset = FLOOR_OPENING_PRESETS[type]
    const rawOpening: FloorOpening = {
      id: preferredId ?? createFloorOpeningId(),
      type,
      wallId,
      wallPosition: clamped,
      widthMm: preset.widthMm,
      heightMm: preset.heightMm,
      sillHeightMm: preset.sillHeightMm,
      doorHingeSide: type === 'door' ? 'left' : undefined,
      doorSwingDirection: type === 'door' ? 'inward' : undefined,
    }
    const hostWall = getEditableWallById(wallId)
    const center = hostWall
      ? {
        x: hostWall.start.x + (hostWall.end.x - hostWall.start.x) * clamped,
        y: hostWall.start.y + (hostWall.end.y - hostWall.start.y) * clamped,
      }
      : null
    const centerMm = hostWall?.startMm && hostWall.endMm
      ? {
        x: hostWall.startMm.x + (hostWall.endMm.x - hostWall.startMm.x) * clamped,
        y: hostWall.startMm.y + (hostWall.endMm.y - hostWall.startMm.y) * clamped,
      }
      : center
        ? estimateMmPoint(center)
        : undefined
    const openingWithIfcTarget = hostWall
      ? {
        ...rawOpening,
        hostWallGlobalId: hostWall.globalId ?? hostWall.id,
        storeyGlobalId: hostWall.storeyGlobalId,
        storeyName: hostWall.storeyName,
        centerMm,
      }
      : rawOpening
    const newOpening = normalizeOpeningByCurrentWall(openingWithIfcTarget)
    const existingOpening = mergedFloorOpenings.find((opening) => opening.id === newOpening.id)
    const shouldUpdateExistingOpening = Boolean(
      existingOpening &&
      !existingOpening.id.startsWith('auto-') &&
      (existingOpening.globalId || existingOpening.sourceIfcClass),
    )
    onFloorPlanChanged()
    setFloorOpenings((prev) => {
      const exists = prev.some((opening) => opening.id === newOpening.id)
      if (exists) return prev.map((opening) => (opening.id === newOpening.id ? newOpening : opening))
      return [...prev, newOpening]
    })
    workspaceCommandPublisher.upsertOpening(newOpening, shouldUpdateExistingOpening)
    ensureSnapshotCommandIfNeeded(workspaceCommandPublisher, 'opening-upsert', newOpening.id, { openingId: newOpening.id })
    setHiddenAutoOpeningIds((prev) => prev.filter((id) => id !== newOpening.id))
    setSelectedFloorWallId(null)
    setSelectedFloorWallIds([])
    setSelectedFloorOpeningId(newOpening.id)
    setSelectedFloorOpeningIds([newOpening.id])
    clearSelection()
    setSelectedTool(type)
  }, [
    promoteCurrentAutoFloorOpenings,
    getEditableWallById,
    estimateMmPoint,
    normalizeOpeningByCurrentWall,
    mergedFloorOpenings,
    setFloorOpenings,
    workspaceCommandPublisher,
    setHiddenAutoOpeningIds,
    setSelectedFloorWallId,
    setSelectedFloorWallIds,
    setSelectedFloorOpeningId,
    setSelectedFloorOpeningIds,
    clearSelection,
    setSelectedTool,
    onFloorPlanChanged,
  ])

  const handleSelectFloorOpening = useCallback((openingId: string | null, append = false) => {
    if (openingId === null) {
      setSelectedFloorOpeningId(null)
      setSelectedFloorOpeningIds([])
      return
    }
    promoteCurrentAutoFloorOpenings()
    ensureFloorOpeningInManual(openingId)
    if (append) {
      setSelectedFloorOpeningIds((prev) => {
        const exists = prev.includes(openingId)
        const next = exists ? prev.filter((id) => id !== openingId) : [...prev, openingId]
        setSelectedFloorOpeningId(next.length > 0 ? next[next.length - 1] : null)
        return next
      })
    } else {
      setSelectedFloorOpeningId(openingId)
      setSelectedFloorOpeningIds([openingId])
    }
    setSelectedFloorWallId(null)
    setSelectedFloorWallIds([])
    clearSelection()
  }, [
    setSelectedFloorOpeningId,
    setSelectedFloorOpeningIds,
    promoteCurrentAutoFloorOpenings,
    ensureFloorOpeningInManual,
    setSelectedFloorWallId,
    setSelectedFloorWallIds,
    clearSelection,
  ])

  const handleMoveFloorOpening = useCallback((openingId: string, wallPosition: number, wallId?: string) => {
    if (!Number.isFinite(wallPosition)) return
    const targetOpening = mergedFloorOpenings.find((opening) => opening.id === openingId)
    if (!targetOpening) return
    const clamped = Math.min(Math.max(wallPosition, 0), 1)
    const nextOpeningPreNormalized: FloorOpening = {
      ...targetOpening,
      wallPosition: clamped,
      wallId: wallId ?? targetOpening.wallId,
    }
    const hostWall = getEditableWallById(nextOpeningPreNormalized.wallId)
    if (hostWall?.startMm && hostWall.endMm) {
      nextOpeningPreNormalized.hostWallGlobalId = hostWall.globalId ?? hostWall.id
      nextOpeningPreNormalized.storeyGlobalId = hostWall.storeyGlobalId
      nextOpeningPreNormalized.storeyName = hostWall.storeyName
      nextOpeningPreNormalized.centerMm = {
        x: hostWall.startMm.x + (hostWall.endMm.x - hostWall.startMm.x) * clamped,
        y: hostWall.startMm.y + (hostWall.endMm.y - hostWall.startMm.y) * clamped,
      }
    }
    const nextOpening = normalizeOpeningByCurrentWall(nextOpeningPreNormalized)
    onFloorPlanChanged()
    updateFloorOpeningFromEditable(openingId, () => nextOpening)
    workspaceCommandPublisher.updateOpening(nextOpening.type, openingId, {
      wall_id: nextOpening.wallId,
      wall_position: nextOpening.wallPosition,
      hostWallGlobalId: nextOpening.hostWallGlobalId,
      storeyGlobalId: nextOpening.storeyGlobalId,
      storeyName: nextOpening.storeyName,
      centerMm: nextOpening.centerMm ? [nextOpening.centerMm.x, nextOpening.centerMm.y] : undefined,
    })
    ensureSnapshotCommandIfNeeded(workspaceCommandPublisher, 'opening-move', openingId, { openingId })
  }, [getEditableWallById, mergedFloorOpenings, normalizeOpeningByCurrentWall, onFloorPlanChanged, updateFloorOpeningFromEditable, workspaceCommandPublisher])

  const handleUpdateFloorOpeningSize = useCallback((openingId: string, widthMm: number, heightMm: number) => {
    if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm)) return
    const targetOpening = mergedFloorOpenings.find((opening) => opening.id === openingId)
    if (!targetOpening) return
    const nextWidth = Math.min(Math.max(widthMm, 300), 4000)
    const nextHeight = Math.min(Math.max(heightMm, 300), 4000)
    const nextOpeningPreNormalized: FloorOpening = {
      ...targetOpening,
      widthMm: nextWidth,
      heightMm: nextHeight,
    }
    const nextOpening = normalizeOpeningByCurrentWall(nextOpeningPreNormalized)
    onFloorPlanChanged()
    updateFloorOpeningFromEditable(openingId, () => nextOpening)
    workspaceCommandPublisher.updateOpening(nextOpening.type, openingId, {
      width: nextOpening.widthMm,
      height: nextOpening.heightMm,
      wall_position: nextOpening.wallPosition,
    })
    ensureSnapshotCommandIfNeeded(workspaceCommandPublisher, 'opening-size', openingId, { openingId })
  }, [mergedFloorOpenings, normalizeOpeningByCurrentWall, onFloorPlanChanged, updateFloorOpeningFromEditable, workspaceCommandPublisher])

  const handleUpdateFloorWindowSillHeight = useCallback((openingId: string, sillHeightMm: number) => {
    if (!Number.isFinite(sillHeightMm)) return
    const targetOpening = mergedFloorOpenings.find((opening) => opening.id === openingId)
    if (!targetOpening || targetOpening.type !== 'window') return
    const next = Math.min(Math.max(sillHeightMm, 0), 2500)
    onFloorPlanChanged()
    updateFloorOpeningFromEditable(openingId, (opening) => ({ ...opening, sillHeightMm: next }))
    workspaceCommandPublisher.updateOpening('window', openingId, {
      sill_height: next,
    })
    ensureSnapshotCommandIfNeeded(workspaceCommandPublisher, 'opening-sill-height', openingId, { openingId })
  }, [mergedFloorOpenings, onFloorPlanChanged, updateFloorOpeningFromEditable, workspaceCommandPublisher])

  const handleUpdateFloorDoorSwingDirection = useCallback((
    openingId: string,
    swingDirection: NonNullable<FloorOpening['doorSwingDirection']>,
  ) => {
    const targetOpening = mergedFloorOpenings.find((opening) => opening.id === openingId)
    if (!targetOpening || targetOpening.type !== 'door') return
    onFloorPlanChanged()
    updateFloorOpeningFromEditable(openingId, (opening) => ({ ...opening, doorSwingDirection: swingDirection }))
    workspaceCommandPublisher.updateOpening('door', openingId, {
      door_swing_direction: swingDirection,
    })
    ensureSnapshotCommandIfNeeded(workspaceCommandPublisher, 'opening-swing-direction', openingId, { openingId })
  }, [mergedFloorOpenings, onFloorPlanChanged, updateFloorOpeningFromEditable, workspaceCommandPublisher])

  const handleUpdateFloorDoorHingeSide = useCallback((
    openingId: string,
    hingeSide: NonNullable<FloorOpening['doorHingeSide']>,
  ) => {
    const targetOpening = mergedFloorOpenings.find((opening) => opening.id === openingId)
    if (!targetOpening || targetOpening.type !== 'door') return
    onFloorPlanChanged()
    updateFloorOpeningFromEditable(openingId, (opening) => ({ ...opening, doorHingeSide: hingeSide }))
    workspaceCommandPublisher.updateOpening('door', openingId, {
      door_hinge_side: hingeSide,
    })
    ensureSnapshotCommandIfNeeded(workspaceCommandPublisher, 'opening-hinge-side', openingId, { openingId })
  }, [mergedFloorOpenings, onFloorPlanChanged, updateFloorOpeningFromEditable, workspaceCommandPublisher])

  const handleDeleteFloorOpening = useCallback((openingId: string) => {
    const targetOpening = mergedFloorOpenings.find((opening) => opening.id === openingId)
    onFloorPlanChanged()
    setFloorOpenings((prev) => prev.filter((opening) => opening.id !== openingId))
    if (openingId.startsWith('auto-door-')) {
      setHiddenAutoOpeningIds((prev) => {
        if (prev.includes(openingId)) return prev
        return [...prev, openingId]
      })
    }
    if (targetOpening) {
      workspaceCommandPublisher.deleteOpening(targetOpening)
    }
    ensureSnapshotCommandIfNeeded(workspaceCommandPublisher, 'opening-delete', openingId, { openingId })
    setSelectedFloorOpeningId((prev) => (prev === openingId ? null : prev))
    setSelectedFloorOpeningIds((prev) => prev.filter((id) => id !== openingId))
  }, [mergedFloorOpenings, onFloorPlanChanged, setFloorOpenings, setHiddenAutoOpeningIds, workspaceCommandPublisher, setSelectedFloorOpeningId, setSelectedFloorOpeningIds])

  const handleUpdateFloorWallType = useCallback((wallId: string, type: FloorWall['type']) => {
    onFloorPlanChanged()
    updateFloorWallFromEditable(wallId, (wall) => ({ ...wall, type }))
    workspaceCommandPublisher.updateWallStyle(wallId, { wallType: type })
    ensureSnapshotCommandIfNeeded(workspaceCommandPublisher, 'wall-style', wallId, { wallId, field: 'type' })
    setWallCreatePreset((prev) => ({ ...prev, type }))
  }, [onFloorPlanChanged, updateFloorWallFromEditable, workspaceCommandPublisher, setWallCreatePreset])

  const handleUpdateFloorWallThickness = useCallback((wallId: string, thickness: number) => {
    if (!Number.isFinite(thickness)) return
    const next = clampWallThicknessMm(
      thickness,
      FLOOR_WALL_THICKNESS_MIN_MM,
      FLOOR_WALL_THICKNESS_MAX_MM,
    )
    onFloorPlanChanged()
    updateFloorWallFromEditable(wallId, (wall) => ({ ...wall, thickness: next }))
    workspaceCommandPublisher.updateWallStyle(wallId, { thickness: next })
    ensureSnapshotCommandIfNeeded(workspaceCommandPublisher, 'wall-style', wallId, { wallId, field: 'thickness' })
    setWallCreatePreset((prev) => ({ ...prev, thickness: next }))
  }, [onFloorPlanChanged, updateFloorWallFromEditable, workspaceCommandPublisher, setWallCreatePreset])

  const handleUpdateFloorWallHeight = useCallback((wallId: string, heightMm: number) => {
    if (!Number.isFinite(heightMm)) return
    const next = clampWallHeightMm(
      heightMm,
      FLOOR_WALL_HEIGHT_MIN_MM,
      FLOOR_WALL_HEIGHT_MAX_MM,
    )
    onFloorPlanChanged()
    updateFloorWallFromEditable(wallId, (wall) => ({ ...wall, heightMm: next }))
    workspaceCommandPublisher.updateWallStyle(wallId, { height: next })
    ensureSnapshotCommandIfNeeded(workspaceCommandPublisher, 'wall-style', wallId, { wallId, field: 'height' })
    setWallCreatePreset((prev) => ({ ...prev, heightMm: next }))
  }, [onFloorPlanChanged, updateFloorWallFromEditable, workspaceCommandPublisher, setWallCreatePreset])

  const handleUpdateFloorWallMaterial = useCallback((wallId: string, material: string) => {
    const next = material.trim()
    if (!next) return
    onFloorPlanChanged()
    updateFloorWallFromEditable(wallId, (wall) => ({ ...wall, material: next }))
    workspaceCommandPublisher.updateWallStyle(wallId, { material: next })
    ensureSnapshotCommandIfNeeded(workspaceCommandPublisher, 'wall-style', wallId, { wallId, field: 'material' })
  }, [onFloorPlanChanged, updateFloorWallFromEditable, workspaceCommandPublisher])

  return {
    handleCreateFloorWall,
    handleSelectFloorWall,
    handleMoveFloorWall,
    handleUpdateFloorWallEndpoint,
    handleDeleteFloorWall,
    handleCreateFloorOpening,
    handleSelectFloorOpening,
    handleMoveFloorOpening,
    handleUpdateFloorOpeningSize,
    handleUpdateFloorWindowSillHeight,
    handleUpdateFloorDoorSwingDirection,
    handleUpdateFloorDoorHingeSide,
    handleDeleteFloorOpening,
    handleUpdateFloorWallType,
    handleUpdateFloorWallThickness,
    handleUpdateFloorWallHeight,
    handleUpdateFloorWallMaterial,
  }
}

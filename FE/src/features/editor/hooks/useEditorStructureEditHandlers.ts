import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  DEFAULT_WALL_MATERIAL,
  FLOOR_OPENING_PRESETS,
  FLOOR_WALL_HEIGHT_MAX_MM,
  FLOOR_WALL_HEIGHT_MIN_MM,
  FLOOR_WALL_PRESETS,
  FLOOR_WALL_THICKNESS_MAX_MM,
  FLOOR_WALL_THICKNESS_MIN_MM,
} from '../constants'
import type { FloorOpening, FloorRoom, FloorWall, Point2D } from '../types'
import { collectAutoDoorOpeningIdsFromWallIds, createFloorOpeningId, createFloorWallId } from '../utils/editorPageHelpers'
import { buildWallOutsideOverlapSegments, getWallGeometryKey, getWallOverlapInterval, projectAxisAlignedWall } from '../utils/wallGeometry'
import { createsNewWallRoomCollision } from '../utils/wallRoomCollision'
import { clampWallHeightMm, clampWallThicknessMm } from '../utils/wallSync'

interface WorkspaceCommandPublisherLike {
  createWall: (wall: FloorWall) => void
  updateWallGeometry: (wallId: string, start: Point2D, end: Point2D) => void
  updateWallEndpoint: (wallId: string, endpoint: 'start' | 'end', point: Point2D) => void
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
}

interface UseEditorStructureEditHandlersParams {
  floorRooms: FloorRoom[]
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
}

/**
 * 2D 벽/개구부 편집 핸들러 묶음.
 * 페이지 훅의 대형 편집 로직을 분리해 책임을 명확히 한다.
 */
export function useEditorStructureEditHandlers({
  floorRooms,
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
}: UseEditorStructureEditHandlersParams) {
  const getEditableWallById = useCallback((wallId: string): FloorWall | null => {
    return (
      floorWalls.find((wall) => wall.id === wallId) ??
      visibleAutoFloorWalls.find((wall) => wall.id === wallId) ??
      null
    )
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
    const newWall: FloorWall = {
      id: createFloorWallId(),
      type: nextType,
      start,
      end,
      thickness: nextThickness,
      heightMm: nextHeightMm,
      material: DEFAULT_WALL_MATERIAL,
    }
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
    workspaceCommandPublisher,
    setFloorWalls,
    setWallCreatePreset,
    setSelectedFloorWallId,
    setSelectedFloorWallIds,
    setSelectedFloorOpeningIds,
    setSelectedFloorOpeningId,
    clearSelection,
    setSelectedTool,
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
    if (isWallEditBlockedByRoomCollision(targetWall, nextStart, nextEnd)) return

    ensureFloorWallInManual(wallId)
    setFloorWalls((prev) =>
      prev.map((wall) =>
        wall.id === wallId
          ? { ...wall, start: nextStart, end: nextEnd }
          : wall,
      ),
    )
    workspaceCommandPublisher.updateWallGeometry(wallId, nextStart, nextEnd)
  }, [getEditableWallById, isWallEditBlockedByRoomCollision, ensureFloorWallInManual, setFloorWalls, workspaceCommandPublisher])

  const handleUpdateFloorWallEndpoint = useCallback((
    wallId: string,
    endpoint: 'start' | 'end',
    point: Point2D,
  ) => {
    const targetWall = getEditableWallById(wallId)
    if (!targetWall) return
    const nextStart = endpoint === 'start' ? point : targetWall.start
    const nextEnd = endpoint === 'end' ? point : targetWall.end
    if (isWallEditBlockedByRoomCollision(targetWall, nextStart, nextEnd)) return

    ensureFloorWallInManual(wallId)
    setFloorWalls((prev) => prev.map((wall) => (wall.id === wallId ? { ...wall, [endpoint]: point } : wall)))
    workspaceCommandPublisher.updateWallEndpoint(wallId, endpoint, point)
  }, [getEditableWallById, isWallEditBlockedByRoomCollision, ensureFloorWallInManual, setFloorWalls, workspaceCommandPublisher])

  const handleDeleteFloorWall = useCallback((wallId: string) => {
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
    setHiddenAutoWallIds,
    setHiddenAutoOpeningIds,
    setFloorOpenings,
    setSelectedFloorOpeningIds,
    mergedFloorOpenings,
    setFloorWalls,
    workspaceCommandPublisher,
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
    const newOpening = normalizeOpeningByCurrentWall(rawOpening)
    const existingOpening = mergedFloorOpenings.find((opening) => opening.id === newOpening.id)
    setFloorOpenings((prev) => {
      const exists = prev.some((opening) => opening.id === newOpening.id)
      if (exists) return prev.map((opening) => (opening.id === newOpening.id ? newOpening : opening))
      return [...prev, newOpening]
    })
    workspaceCommandPublisher.upsertOpening(newOpening, Boolean(existingOpening))
    setHiddenAutoOpeningIds((prev) => prev.filter((id) => id !== newOpening.id))
    setSelectedFloorWallId(null)
    setSelectedFloorWallIds([])
    setSelectedFloorOpeningId(newOpening.id)
    setSelectedFloorOpeningIds([newOpening.id])
    clearSelection()
    setSelectedTool(type)
  }, [
    promoteCurrentAutoFloorOpenings,
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
    const nextOpening = normalizeOpeningByCurrentWall(nextOpeningPreNormalized)
    updateFloorOpeningFromEditable(openingId, () => nextOpening)
    workspaceCommandPublisher.updateOpening(nextOpening.type, openingId, {
      wall_id: nextOpening.wallId,
      wall_position: nextOpening.wallPosition,
    })
  }, [mergedFloorOpenings, normalizeOpeningByCurrentWall, updateFloorOpeningFromEditable, workspaceCommandPublisher])

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
    updateFloorOpeningFromEditable(openingId, () => nextOpening)
    workspaceCommandPublisher.updateOpening(nextOpening.type, openingId, {
      width: nextOpening.widthMm,
      height: nextOpening.heightMm,
      wall_position: nextOpening.wallPosition,
    })
  }, [mergedFloorOpenings, normalizeOpeningByCurrentWall, updateFloorOpeningFromEditable, workspaceCommandPublisher])

  const handleUpdateFloorWindowSillHeight = useCallback((openingId: string, sillHeightMm: number) => {
    if (!Number.isFinite(sillHeightMm)) return
    const targetOpening = mergedFloorOpenings.find((opening) => opening.id === openingId)
    if (!targetOpening || targetOpening.type !== 'window') return
    const next = Math.min(Math.max(sillHeightMm, 0), 2500)
    updateFloorOpeningFromEditable(openingId, (opening) => ({ ...opening, sillHeightMm: next }))
    workspaceCommandPublisher.updateOpening('window', openingId, {
      sill_height: next,
    })
  }, [mergedFloorOpenings, updateFloorOpeningFromEditable, workspaceCommandPublisher])

  const handleUpdateFloorDoorSwingDirection = useCallback((
    openingId: string,
    swingDirection: NonNullable<FloorOpening['doorSwingDirection']>,
  ) => {
    const targetOpening = mergedFloorOpenings.find((opening) => opening.id === openingId)
    if (!targetOpening || targetOpening.type !== 'door') return
    updateFloorOpeningFromEditable(openingId, (opening) => ({ ...opening, doorSwingDirection: swingDirection }))
    workspaceCommandPublisher.updateOpening('door', openingId, {
      door_swing_direction: swingDirection,
    })
  }, [mergedFloorOpenings, updateFloorOpeningFromEditable, workspaceCommandPublisher])

  const handleUpdateFloorDoorHingeSide = useCallback((
    openingId: string,
    hingeSide: NonNullable<FloorOpening['doorHingeSide']>,
  ) => {
    const targetOpening = mergedFloorOpenings.find((opening) => opening.id === openingId)
    if (!targetOpening || targetOpening.type !== 'door') return
    updateFloorOpeningFromEditable(openingId, (opening) => ({ ...opening, doorHingeSide: hingeSide }))
    workspaceCommandPublisher.updateOpening('door', openingId, {
      door_hinge_side: hingeSide,
    })
  }, [mergedFloorOpenings, updateFloorOpeningFromEditable, workspaceCommandPublisher])

  const handleDeleteFloorOpening = useCallback((openingId: string) => {
    const targetOpening = mergedFloorOpenings.find((opening) => opening.id === openingId)
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
    setSelectedFloorOpeningId((prev) => (prev === openingId ? null : prev))
    setSelectedFloorOpeningIds((prev) => prev.filter((id) => id !== openingId))
  }, [mergedFloorOpenings, setFloorOpenings, setHiddenAutoOpeningIds, workspaceCommandPublisher, setSelectedFloorOpeningId, setSelectedFloorOpeningIds])

  const handleUpdateFloorWallType = useCallback((wallId: string, type: FloorWall['type']) => {
    updateFloorWallFromEditable(wallId, (wall) => ({ ...wall, type }))
    workspaceCommandPublisher.updateWallStyle(wallId, { wallType: type })
    setWallCreatePreset((prev) => ({ ...prev, type }))
  }, [updateFloorWallFromEditable, workspaceCommandPublisher, setWallCreatePreset])

  const handleUpdateFloorWallThickness = useCallback((wallId: string, thickness: number) => {
    if (!Number.isFinite(thickness)) return
    const next = clampWallThicknessMm(
      thickness,
      FLOOR_WALL_THICKNESS_MIN_MM,
      FLOOR_WALL_THICKNESS_MAX_MM,
    )
    updateFloorWallFromEditable(wallId, (wall) => ({ ...wall, thickness: next }))
    workspaceCommandPublisher.updateWallStyle(wallId, { thickness: next })
    setWallCreatePreset((prev) => ({ ...prev, thickness: next }))
  }, [updateFloorWallFromEditable, workspaceCommandPublisher, setWallCreatePreset])

  const handleUpdateFloorWallHeight = useCallback((wallId: string, heightMm: number) => {
    if (!Number.isFinite(heightMm)) return
    const next = clampWallHeightMm(
      heightMm,
      FLOOR_WALL_HEIGHT_MIN_MM,
      FLOOR_WALL_HEIGHT_MAX_MM,
    )
    updateFloorWallFromEditable(wallId, (wall) => ({ ...wall, heightMm: next }))
    workspaceCommandPublisher.updateWallStyle(wallId, { height: next })
    setWallCreatePreset((prev) => ({ ...prev, heightMm: next }))
  }, [updateFloorWallFromEditable, workspaceCommandPublisher, setWallCreatePreset])

  const handleUpdateFloorWallMaterial = useCallback((wallId: string, material: string) => {
    const next = material.trim()
    if (!next) return
    updateFloorWallFromEditable(wallId, (wall) => ({ ...wall, material: next }))
    workspaceCommandPublisher.updateWallStyle(wallId, { material: next })
  }, [updateFloorWallFromEditable, workspaceCommandPublisher])

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

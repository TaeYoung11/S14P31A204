import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { FloorOpening, FloorWall, IfcElementInfo, Point2D } from '../types'
import type { WorkspaceCommand, WorkspaceCommandSource } from '../types/workspaceCommand.types'
import {
  createEntityCommand,
  deleteEntityCommand,
  updateEntityCommand,
} from '../services/workspaceCommand.service'

interface UseWorkspaceCommandPublisherOptions {
  projectId: string | undefined
  source: WorkspaceCommandSource
  getBaseRevisionId: () => string | null | undefined
  getBaseIndex: () => number
}

const IFC_GLOBAL_ID_PATTERN = /^[0-9A-Za-z_$]{22}$/
const TRANSLATION_EPSILON = 1e-6

const toIfcGlobalId = (id: string): string | null => {
  if (IFC_GLOBAL_ID_PATTERN.test(id)) return id
  const candidate = id.split('-floor-')[0]
  return IFC_GLOBAL_ID_PATTERN.test(candidate) ? candidate : null
}

const toIfcElementCommandId = (element: IfcElementInfo): string | null => {
  if (element.globalId && element.globalId.trim()) return element.globalId.trim()
  return null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const getFiniteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const hasNonZeroTranslation = (...values: Array<number | null>): boolean =>
  values.some((value) => value !== null && Math.abs(value) > TRANSLATION_EPSILON)

const compactRecord = (record: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== null))

const hasMeaningfulValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return false
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.some(hasMeaningfulValue)
  if (isRecord(value)) return Object.values(value).some(hasMeaningfulValue)
  return false
}

const toPointObjectFromUnknown = (value: unknown): Record<string, number> | null => {
  if (Array.isArray(value)) {
    const [x, y] = value
    return typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)
      ? { x, y }
      : null
  }
  if (!isRecord(value)) return null
  const x = getFiniteNumber(value.x)
  const y = getFiniteNumber(value.y)
  return x !== null && y !== null ? { x, y } : null
}

const toWorkerMmPoint = (point?: Point2D | null): Record<string, number> | null => {
  if (!point) return null
  const maxAbs = Math.max(Math.abs(point.x), Math.abs(point.y))
  const scale = maxAbs > 0 && maxAbs < 1000 ? 1000 : 1
  return { x: point.x * scale, y: point.y * scale }
}

const toWorkerMmPointFromUnknown = (value: unknown): Record<string, number> | null => {
  const point = toPointObjectFromUnknown(value)
  if (!point) return null
  const maxAbs = Math.max(Math.abs(point.x), Math.abs(point.y))
  const scale = maxAbs > 0 && maxAbs < 1000 ? 1000 : 1
  return { x: point.x * scale, y: point.y * scale }
}

const openingEntity = (type: FloorOpening['type']): 'door' | 'window' =>
  type === 'door' ? 'door' : 'window'

const hasCommandPayload = (command: WorkspaceCommand): boolean => {
  if (command.op === 'delete') return true
  if (command.op === 'create') return hasMeaningfulValue(command.data)
  if (command.op === 'update') return hasMeaningfulValue(command.patch)
  return false
}

export function useWorkspaceCommandPublisher({
  projectId,
}: UseWorkspaceCommandPublisherOptions) {
  const pendingCommandRef = useRef<WorkspaceCommand | null>(null)
  const issuedLocalCreateIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    pendingCommandRef.current = null
    issuedLocalCreateIdsRef.current.clear()
  }, [projectId])

  const consumePendingCommand = useCallback((): WorkspaceCommand | null => {
    const command = pendingCommandRef.current
    pendingCommandRef.current = null
    if (!command || !hasCommandPayload(command)) return null
    if (command.op === 'create' && !toIfcGlobalId(command.id)) {
      issuedLocalCreateIdsRef.current.add(command.id)
    }
    return command
  }, [])

  const updatePendingCreate = useCallback((localId: string, patch: Record<string, unknown>): boolean => {
    const current = pendingCommandRef.current
    if (current?.op !== 'create' || current.id !== localId) return false
    pendingCommandRef.current = createEntityCommand(current.entity, current.id, {
      ...current.data,
      ...compactRecord(patch),
    })
    return true
  }, [])

  const cancelPendingCreate = useCallback((localId: string): boolean => {
    const current = pendingCommandRef.current
    if (current?.op !== 'create' || current.id !== localId) return false
    pendingCommandRef.current = null
    return true
  }, [])

  const createWall = useCallback((wall: FloorWall) => {
    if (issuedLocalCreateIdsRef.current.has(wall.id)) return
    const startMm = toWorkerMmPoint(wall.startMm)
    const endMm = toWorkerMmPoint(wall.endMm)
    if (!startMm || !endMm) return

    pendingCommandRef.current = createEntityCommand('wall', wall.id, compactRecord({
      storeyGlobalId: wall.storeyGlobalId,
      storeyName: wall.storeyName,
      startMm,
      endMm,
      thickness: wall.thickness,
      heightMm: wall.heightMm,
      material: wall.material,
    }))
  }, [])

  const updateWall = useCallback((wallId: string, patch: Record<string, unknown>) => {
    const globalId = toIfcGlobalId(wallId)
    const storeyGlobalId = typeof patch.storeyGlobalId === 'string'
      ? patch.storeyGlobalId
      : typeof patch.storeyId === 'string'
        ? patch.storeyId
        : undefined
    const storeyName = typeof patch.storeyName === 'string'
      ? patch.storeyName
      : typeof patch.storey === 'string'
        ? patch.storey
        : undefined
    const startMm = toWorkerMmPointFromUnknown(patch.startMm) ?? undefined
    const endMm = toWorkerMmPointFromUnknown(patch.endMm) ?? undefined
    const thickness = getFiniteNumber(patch.thickness) ?? getFiniteNumber(patch.thicknessMm) ?? getFiniteNumber(patch.widthMm)
    const heightMm = getFiniteNumber(patch.height) ?? getFiniteNumber(patch.heightMm)

    if (!globalId) {
      if (issuedLocalCreateIdsRef.current.has(wallId)) return
      const createPatch = compactRecord({
        storeyGlobalId,
        storeyName,
        startMm,
        endMm,
        thickness,
        heightMm,
        material: typeof patch.material === 'string' ? patch.material : undefined,
        color: typeof patch.color === 'string' ? patch.color : undefined,
      })
      if (Object.keys(createPatch).length > 0 && updatePendingCreate(wallId, createPatch)) return
      if (!startMm || !endMm) return
      pendingCommandRef.current = createEntityCommand('wall', wallId, compactRecord({
        storeyGlobalId,
        storeyName,
        startMm,
        endMm,
        thickness: thickness ?? 135,
        heightMm: heightMm ?? 2800,
        material: typeof patch.material === 'string' ? patch.material : undefined,
      }))
      return
    }

    const translationMm = isRecord(patch.translationMm) ? patch.translationMm : null
    const translationX = getFiniteNumber(translationMm?.x)
    const translationY = getFiniteNumber(translationMm?.y)
    const translationZ = getFiniteNumber(translationMm?.z)
    if (translationX !== null || translationY !== null || translationZ !== null) {
      if (!hasNonZeroTranslation(translationX, translationY, translationZ)) return
      pendingCommandRef.current = updateEntityCommand('wall', globalId, compactRecord({
        storeyGlobalId,
        storeyName,
        translationMm: compactRecord({
          x: translationX !== null ? translationX : undefined,
          y: translationY !== null ? translationY : undefined,
          z: translationZ !== null ? translationZ : undefined,
        }),
      }))
      return
    }

    if (startMm || endMm) {
      pendingCommandRef.current = updateEntityCommand('wall', globalId, compactRecord({
        storeyGlobalId,
        storeyName,
        startMm,
        endMm,
      }))
      return
    }

    const nextPatch = compactRecord({
      storeyGlobalId,
      storeyName,
      thickness,
      heightMm,
      material: typeof patch.material === 'string' ? patch.material : undefined,
      color: typeof patch.color === 'string' ? patch.color : undefined,
      wall_type: typeof patch.wall_type === 'string' ? patch.wall_type : undefined,
    })
    if (hasMeaningfulValue(nextPatch)) {
      pendingCommandRef.current = updateEntityCommand('wall', globalId, nextPatch)
    }
  }, [updatePendingCreate])

  const deleteWall = useCallback((wallId: string) => {
    const globalId = toIfcGlobalId(wallId)
    if (!globalId && cancelPendingCreate(wallId)) return
    if (!globalId) return
    pendingCommandRef.current = deleteEntityCommand('wall', globalId)
  }, [cancelPendingCreate])

  const createOpening = useCallback((opening: FloorOpening) => {
    const centerMm = toWorkerMmPoint(opening.centerMm)
    if (!centerMm) return
    const rawHostWallId = opening.hostWallGlobalId ?? opening.wallId
    const hostWallGlobalId = toIfcGlobalId(rawHostWallId)

    pendingCommandRef.current = createEntityCommand(openingEntity(opening.type), opening.id, compactRecord({
      storeyGlobalId: opening.storeyGlobalId,
      storeyName: opening.storeyName,
      hostWallGlobalId,
      wall_id: hostWallGlobalId ? undefined : rawHostWallId,
      centerMm,
      lengthMm: opening.widthMm,
      heightMm: opening.heightMm,
      sillHeightMm: opening.sillHeightMm,
      wall_position: opening.wallPosition,
    }))
  }, [])

  const updateOpening = useCallback(
    (openingType: FloorOpening['type'], openingId: string, patch: Record<string, unknown>) => {
      const nextPatch = compactRecord({
        storeyGlobalId: typeof patch.storeyGlobalId === 'string'
          ? patch.storeyGlobalId
          : typeof patch.storeyId === 'string'
            ? patch.storeyId
            : undefined,
        storeyName: typeof patch.storeyName === 'string'
          ? patch.storeyName
          : typeof patch.storey === 'string'
            ? patch.storey
            : undefined,
        hostWallGlobalId: typeof patch.hostWallGlobalId === 'string' ? patch.hostWallGlobalId : undefined,
        centerMm: toWorkerMmPointFromUnknown(patch.centerMm),
        lengthMm: getFiniteNumber(patch.width) ?? getFiniteNumber(patch.widthMm),
        heightMm: getFiniteNumber(patch.height) ?? getFiniteNumber(patch.heightMm),
        wall_position: getFiniteNumber(patch.wall_position),
        sillHeightMm: getFiniteNumber(patch.sill_height) ?? getFiniteNumber(patch.sillHeightMm),
        door_swing_direction: typeof patch.door_swing_direction === 'string' ? patch.door_swing_direction : undefined,
        door_hinge_side: typeof patch.door_hinge_side === 'string' ? patch.door_hinge_side : undefined,
      })
      if (!hasMeaningfulValue(nextPatch)) return

      const globalId = toIfcGlobalId(openingId)
      if (!globalId) {
        updatePendingCreate(openingId, nextPatch)
        return
      }
      pendingCommandRef.current = updateEntityCommand(openingEntity(openingType), globalId, nextPatch)
    },
    [updatePendingCreate],
  )

  const upsertOpening = useCallback((opening: FloorOpening, exists: boolean) => {
    if (exists) {
      updateOpening(opening.type, opening.globalId ?? opening.id, {
        widthMm: opening.widthMm,
        heightMm: opening.heightMm,
      })
      return
    }
    createOpening(opening)
  }, [createOpening, updateOpening])

  const deleteOpening = useCallback((opening: FloorOpening) => {
    const globalId = toIfcGlobalId(opening.globalId ?? opening.id)
    if (!globalId && cancelPendingCreate(opening.id)) return
    if (!globalId) return
    pendingCommandRef.current = deleteEntityCommand(openingEntity(opening.type), globalId)
  }, [cancelPendingCreate])

  const updateIfcElement = useCallback((element: IfcElementInfo, patch: Record<string, unknown>) => {
    const commandId = toIfcElementCommandId(element)
    if (!commandId) return
    const translationMm = isRecord(patch.translationMm) ? patch.translationMm : null
    const translationX = getFiniteNumber(translationMm?.x)
    const translationY = getFiniteNumber(translationMm?.y)
    const translationZ = getFiniteNumber(translationMm?.z)
    if (translationX !== null || translationY !== null || translationZ !== null) {
      if (!hasNonZeroTranslation(translationX, translationY, translationZ)) return
      pendingCommandRef.current = updateEntityCommand('ifcElement', commandId, {
        globalId: element.globalId,
        expressId: element.expressId,
        ifcClass: element.ifcClass,
        translationMm: compactRecord({
          x: translationX !== null ? translationX : undefined,
          y: translationY !== null ? translationY : undefined,
          z: translationZ !== null ? translationZ : undefined,
        }),
      })
      return
    }

    const nextPatch = compactRecord({
      lengthMm: getFiniteNumber(patch.lengthMm),
      heightMm: getFiniteNumber(patch.heightMm),
      thickness: getFiniteNumber(patch.thicknessMm),
      material: typeof patch.material === 'string' ? patch.material : undefined,
      color: typeof patch.color === 'string' ? patch.color : undefined,
      rotation_degrees: compactRecord({
        x: getFiniteNumber(patch.rotationX),
        y: getFiniteNumber(patch.rotationY),
        z: getFiniteNumber(patch.rotationZ),
      }),
    })
    if (isRecord(nextPatch.rotation_degrees) && Object.keys(nextPatch.rotation_degrees).length === 0) {
      delete nextPatch.rotation_degrees
    }
    if (hasMeaningfulValue(nextPatch)) {
      pendingCommandRef.current = updateEntityCommand('ifcElement', commandId, compactRecord({
        globalId: element.globalId,
        expressId: element.expressId,
        ifcClass: element.ifcClass,
        ...nextPatch,
      }))
    }
  }, [])

  const deleteIfcElement = useCallback((element: IfcElementInfo) => {
    const commandId = toIfcElementCommandId(element)
    if (!commandId) return
    pendingCommandRef.current = deleteEntityCommand('ifcElement', commandId)
  }, [])

  const updateRoom = useCallback((roomId: string, patch: Record<string, unknown>) => {
    const patchGlobalId = typeof patch.globalId === 'string' ? toIfcGlobalId(patch.globalId) : null
    const globalId = toIfcGlobalId(roomId) ?? patchGlobalId
    if (!globalId) return

    const translationMm = isRecord(patch.translationMm) ? patch.translationMm : null
    const translationX = getFiniteNumber(translationMm?.x)
    const translationY = getFiniteNumber(translationMm?.y)
    const translationZ = getFiniteNumber(translationMm?.z)
    if (translationX !== null || translationY !== null || translationZ !== null) {
      if (!hasNonZeroTranslation(translationX, translationY, translationZ)) return
      pendingCommandRef.current = updateEntityCommand('room', globalId, {
        translationMm: compactRecord({
          x: translationX,
          y: translationY,
          z: translationZ,
        }),
      })
      return
    }

    const widthMm = getFiniteNumber(patch.widthMm)
    const heightMm = getFiniteNumber(patch.heightMm)
    const nextPatch = compactRecord({
      widthMm,
      heightMm,
      pset_name: widthMm !== null || heightMm !== null ? 'Batang_SpaceDimensions' : undefined,
      pset_updates: widthMm !== null || heightMm !== null
        ? {
          Batang_SpaceDimensions: {
            ...(widthMm !== null ? { Width: widthMm } : {}),
            ...(heightMm !== null ? { Height: heightMm } : {}),
          },
        }
        : undefined,
    })
    if (hasMeaningfulValue(nextPatch)) {
      pendingCommandRef.current = updateEntityCommand('room', globalId, nextPatch)
    }
  }, [])

  const deleteRoom = useCallback((roomId: string) => {
    const globalId = toIfcGlobalId(roomId)
    if (!globalId) return
    pendingCommandRef.current = deleteEntityCommand('room', globalId)
  }, [])

  const updateWallGeometry = useCallback((wallId: string, start: Point2D, end: Point2D, startMm?: Point2D, endMm?: Point2D) => {
    updateWall(wallId, {
      start,
      end,
      startMm,
      endMm,
    })
  }, [updateWall])

  const updateWallEndpoint = useCallback((wallId: string, endpoint: 'start' | 'end', point: Point2D, pointMm?: Point2D) => {
    updateWall(wallId, {
      [endpoint]: point,
      [`${endpoint}Mm`]: pointMm,
    })
  }, [updateWall])

  const updateWallStyle = useCallback((wallId: string, next: {
    wallType?: FloorWall['type']
    thickness?: number
    height?: number
    material?: string
  }) => {
    const patch: Record<string, unknown> = {}
    if (next.wallType !== undefined) patch.wall_type = next.wallType
    if (next.thickness !== undefined) patch.thickness = next.thickness
    if (next.height !== undefined) patch.height = next.height
    if (next.material !== undefined) patch.material = next.material
    if (Object.keys(patch).length === 0) return
    updateWall(wallId, patch)
  }, [updateWall])

  return useMemo(() => ({
    createWall,
    updateWall,
    deleteWall,
    createOpening,
    updateOpening,
    upsertOpening,
    deleteOpening,
    updateWallGeometry,
    updateWallEndpoint,
    updateWallStyle,
    updateIfcElement,
    deleteIfcElement,
    updateRoom,
    deleteRoom,
    consumePendingCommand,
  }), [
    consumePendingCommand,
    createOpening,
    createWall,
    deleteIfcElement,
    deleteOpening,
    deleteRoom,
    deleteWall,
    updateIfcElement,
    updateOpening,
    updateRoom,
    updateWall,
    updateWallEndpoint,
    updateWallGeometry,
    updateWallStyle,
    upsertOpening,
  ])
}

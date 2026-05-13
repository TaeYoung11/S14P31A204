import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { FloorOpening, FloorWall, IfcElementInfo, Point2D } from '../types'
import type { WorkspaceCommand, WorkspaceCommandSource } from '../types/workspaceCommand.types'
import {
  createEntityCommand,
  createWorkspaceCommandId,
} from '../services/workspaceCommand.service'

type EngineOperation = {
  id: string
  type: string
  selector?: Record<string, unknown>
  parameters: Record<string, unknown>
}

interface UseWorkspaceCommandPublisherOptions {
  projectId: string | undefined
  source: WorkspaceCommandSource
  getBaseRevisionId: () => string | null | undefined
  getBaseIndex: () => number
}

const IFC_GLOBAL_ID_PATTERN = /^[0-9A-Za-z_$]{22}$/

const toIfcGlobalId = (id: string): string | null => {
  if (IFC_GLOBAL_ID_PATTERN.test(id)) return id
  const candidate = id.split('-floor-')[0]
  return IFC_GLOBAL_ID_PATTERN.test(candidate) ? candidate : null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const getFiniteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const toPointObject = (point?: Point2D | null): Record<string, number> | null =>
  point ? { x: point.x, y: point.y } : null

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

const toSelector = (globalId: string): Record<string, string[]> => ({ global_ids: [globalId] })

const absoluteDimension = (value: number): Record<string, number | string> => ({
  mode: 'ABSOLUTE',
  value,
})

export function useWorkspaceCommandPublisher({
  projectId,
  getBaseRevisionId,
}: UseWorkspaceCommandPublisherOptions) {
  const pendingCommandRef = useRef<WorkspaceCommand | null>(null)

  useEffect(() => {
    pendingCommandRef.current = null
  }, [projectId])

  const recordEngineOperations = useCallback((operations: EngineOperation[]) => {
    if (!projectId || operations.length === 0) return
    const baseRevisionId = getBaseRevisionId()
    if (!baseRevisionId) return
    const current = pendingCommandRef.current
    const currentData = current?.op === 'create' && current.entity === 'ifcBatch' ? current.data : null
    const existingOperations = Array.isArray(currentData?.operations) ? currentData.operations : []
    const requestId = typeof currentData?.request_id === 'string' ? currentData.request_id : createWorkspaceCommandId()
    pendingCommandRef.current = createEntityCommand('ifcBatch', requestId, {
      schema_version: 'v1',
      request_id: requestId,
      mode: 'apply',
      project_id: projectId,
      base_revision_id: baseRevisionId,
      operations: [...existingOperations, ...operations],
    })
  }, [getBaseRevisionId, projectId])

  const mutatePendingOperations = useCallback((mutate: (operations: EngineOperation[]) => EngineOperation[]) => {
    const current = pendingCommandRef.current
    const currentData = current?.op === 'create' && current.entity === 'ifcBatch' ? current.data : null
    if (!current || !currentData || !Array.isArray(currentData.operations)) return false
    const nextOperations = mutate(currentData.operations as EngineOperation[])
    if (nextOperations === currentData.operations) return false
    if (nextOperations.length === 0) {
      pendingCommandRef.current = null
      return true
    }
    pendingCommandRef.current = createEntityCommand('ifcBatch', current.id, {
      ...currentData,
      operations: nextOperations,
    })
    return true
  }, [])

  const cancelPendingCreateByClientId = useCallback((clientId: string): boolean => {
    let removed = false
    mutatePendingOperations((operations) => {
      const next = operations.filter((operation) => {
        const shouldRemove =
          operation.type === 'create_element' &&
          isRecord(operation.parameters) &&
          operation.parameters.client_id === clientId
        if (shouldRemove) removed = true
        return !shouldRemove
      })
      return removed ? next : operations
    })
    return removed
  }, [mutatePendingOperations])

  const updatePendingCreateByClientId = useCallback((clientId: string, parameters: Record<string, unknown>): boolean => {
    let updated = false
    mutatePendingOperations((operations) => {
      const next = operations.map((operation) => {
        if (
          operation.type !== 'create_element' ||
          !isRecord(operation.parameters) ||
          operation.parameters.client_id !== clientId
        ) {
          return operation
        }
        updated = true
        return {
          ...operation,
          parameters: {
            ...operation.parameters,
            ...parameters,
          },
        }
      })
      return updated ? next : operations
    })
    return updated
  }, [mutatePendingOperations])

  const consumePendingCommand = useCallback((): WorkspaceCommand | null => {
    const command = pendingCommandRef.current
    pendingCommandRef.current = null
    return command
  }, [])

  const createWall = useCallback((wall: FloorWall) => {
    const startMm = toPointObject(wall.startMm)
    const endMm = toPointObject(wall.endMm)
    if (!startMm || !endMm) return
    recordEngineOperations([{
      id: `op-${createWorkspaceCommandId()}`,
      type: 'create_element',
      parameters: {
        element_type: 'IfcWall',
        client_id: wall.id,
        storey_global_id: wall.storeyGlobalId,
        start_mm: startMm,
        end_mm: endMm,
        dimensions_mm: {
          width: wall.thickness,
          height: wall.heightMm,
        },
        material: wall.material,
      },
    }])
  }, [recordEngineOperations])

  const updateWall = useCallback((wallId: string, patch: Record<string, unknown>) => {
    const globalId = toIfcGlobalId(wallId)
    if (!globalId) return

    const startMm = isRecord(patch.startMm) ? patch.startMm : null
    const endMm = isRecord(patch.endMm) ? patch.endMm : null
    if (startMm || endMm) {
      recordEngineOperations([{
        id: `op-${createWorkspaceCommandId()}`,
        type: 'transform_elements',
        selector: toSelector(globalId),
        parameters: {
          ...(startMm ? { start_mm: startMm } : {}),
          ...(endMm ? { end_mm: endMm } : {}),
        },
      }])
      return
    }

    const dimensions: Record<string, Record<string, number | string>> = {}
    const thickness = getFiniteNumber(patch.thickness) ?? getFiniteNumber(patch.thicknessMm) ?? getFiniteNumber(patch.widthMm)
    const height = getFiniteNumber(patch.height) ?? getFiniteNumber(patch.heightMm)
    if (thickness !== null) dimensions.width = absoluteDimension(thickness)
    if (height !== null) dimensions.height = absoluteDimension(height)

    const parameters: Record<string, unknown> = {}
    if (Object.keys(dimensions).length > 0) parameters.dimensions_mm = dimensions
    if (typeof patch.material === 'string') parameters.material = patch.material
    if (typeof patch.color === 'string') parameters.color = patch.color
    if (Object.keys(parameters).length === 0) return

    recordEngineOperations([{
      id: `op-${createWorkspaceCommandId()}`,
      type: 'update_element_properties',
      selector: toSelector(globalId),
      parameters,
    }])
  }, [recordEngineOperations])

  const deleteWall = useCallback((wallId: string) => {
    const globalId = toIfcGlobalId(wallId)
    if (!globalId && cancelPendingCreateByClientId(wallId)) return
    if (!globalId) return
    recordEngineOperations([{
      id: `op-${createWorkspaceCommandId()}`,
      type: 'delete_elements',
      selector: toSelector(globalId),
      parameters: {},
    }])
  }, [cancelPendingCreateByClientId, recordEngineOperations])

  const createOpening = useCallback((opening: FloorOpening) => {
    const centerMm = toPointObject(opening.centerMm)
    const hostWallGlobalId = toIfcGlobalId(opening.hostWallGlobalId ?? opening.wallId)
    if (!centerMm || !hostWallGlobalId) return
    recordEngineOperations([{
      id: `op-${createWorkspaceCommandId()}`,
      type: 'create_element',
      parameters: {
        element_type: opening.type === 'door' ? 'IfcDoor' : 'IfcWindow',
        client_id: opening.id,
        storey_global_id: opening.storeyGlobalId,
        host_wall_global_id: hostWallGlobalId,
        center_mm: centerMm,
        dimensions_mm: {
          length: opening.widthMm,
          height: opening.heightMm,
        },
        sill_height_mm: opening.sillHeightMm,
      },
    }])
  }, [recordEngineOperations])

  const updateOpening = useCallback(
    (_openingType: FloorOpening['type'], openingId: string, patch: Record<string, unknown>) => {
      const dimensions: Record<string, Record<string, number | string>> = {}
      const width = getFiniteNumber(patch.width) ?? getFiniteNumber(patch.widthMm)
      const height = getFiniteNumber(patch.height) ?? getFiniteNumber(patch.heightMm)
      if (width !== null) dimensions.length = absoluteDimension(width)
      if (height !== null) dimensions.height = absoluteDimension(height)
      const centerMm = toPointObjectFromUnknown(patch.centerMm)
      const parameters: Record<string, unknown> = {}
      if (Object.keys(dimensions).length > 0) parameters.dimensions_mm = dimensions
      if (centerMm) parameters.center_mm = centerMm
      if (typeof patch.hostWallGlobalId === 'string') parameters.host_wall_global_id = patch.hostWallGlobalId
      if (typeof patch.storeyGlobalId === 'string') parameters.storey_global_id = patch.storeyGlobalId
      if (typeof patch.wall_position === 'number' && Number.isFinite(patch.wall_position)) {
        parameters.wall_position = patch.wall_position
      }
      const sillHeight = getFiniteNumber(patch.sill_height) ?? getFiniteNumber(patch.sillHeightMm)
      if (sillHeight !== null) parameters.sill_height_mm = sillHeight
      if (typeof patch.door_swing_direction === 'string') parameters.door_swing_direction = patch.door_swing_direction
      if (typeof patch.door_hinge_side === 'string') parameters.door_hinge_side = patch.door_hinge_side
      if (Object.keys(parameters).length === 0) return

      const globalId = toIfcGlobalId(openingId)
      if (!globalId) {
        updatePendingCreateByClientId(openingId, parameters)
        return
      }
      recordEngineOperations([{
        id: `op-${createWorkspaceCommandId()}`,
        type: 'update_element_properties',
        selector: toSelector(globalId),
        parameters,
      }])
    },
    [recordEngineOperations, updatePendingCreateByClientId],
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
    if (!globalId && cancelPendingCreateByClientId(opening.id)) return
    if (!globalId) return
    recordEngineOperations([{
      id: `op-${createWorkspaceCommandId()}`,
      type: 'delete_elements',
      selector: toSelector(globalId),
      parameters: {},
    }])
  }, [cancelPendingCreateByClientId, recordEngineOperations])

  const updateIfcElement = useCallback((element: IfcElementInfo, patch: Record<string, unknown>) => {
    if (!element.globalId) return
    const translationMm = isRecord(patch.translationMm) ? patch.translationMm : null
    const translationX = getFiniteNumber(translationMm?.x)
    const translationY = getFiniteNumber(translationMm?.y)
    const translationZ = getFiniteNumber(translationMm?.z)
    const operations: EngineOperation[] = []
    if (translationX !== null || translationY !== null || translationZ !== null) {
      operations.push({
        id: `op-${createWorkspaceCommandId()}`,
        type: 'transform_elements',
        selector: toSelector(element.globalId),
        parameters: {
          translation_mm: {
            x: translationX ?? 0,
            y: translationY ?? 0,
            z: translationZ ?? 0,
          },
        },
      })
    }
    const dimensions: Record<string, Record<string, number | string>> = {}
    const length = getFiniteNumber(patch.lengthMm)
    const height = getFiniteNumber(patch.heightMm)
    const thickness = getFiniteNumber(patch.thicknessMm)
    if (length !== null) dimensions.length = absoluteDimension(length)
    if (height !== null) dimensions.height = absoluteDimension(height)
    if (thickness !== null) dimensions.thickness = absoluteDimension(thickness)

    const propertyParameters: Record<string, unknown> = {}
    if (Object.keys(dimensions).length > 0) propertyParameters.dimensions_mm = dimensions
    if (typeof patch.material === 'string') propertyParameters.material = patch.material
    if (typeof patch.color === 'string') propertyParameters.color = patch.color
    const rotationX = getFiniteNumber(patch.rotationX)
    const rotationY = getFiniteNumber(patch.rotationY)
    const rotationZ = getFiniteNumber(patch.rotationZ)
    if (rotationX !== null || rotationY !== null || rotationZ !== null) {
      propertyParameters.rotation_degrees = {
        x: rotationX ?? 0,
        y: rotationY ?? 0,
        z: rotationZ ?? 0,
      }
    }
    if (Object.keys(propertyParameters).length > 0) {
      operations.push({
        id: `op-${createWorkspaceCommandId()}`,
        type: 'update_element_properties',
        selector: toSelector(element.globalId),
        parameters: propertyParameters,
      })
    }
    recordEngineOperations(operations)
  }, [recordEngineOperations])

  const deleteIfcElement = useCallback((element: IfcElementInfo) => {
    if (!element.globalId) return
    recordEngineOperations([{
      id: `op-${createWorkspaceCommandId()}`,
      type: 'delete_elements',
      selector: toSelector(element.globalId),
      parameters: {},
    }])
  }, [recordEngineOperations])

  const updateRoom = useCallback((roomId: string, patch: Record<string, unknown>) => {
    const globalId = toIfcGlobalId(roomId)
    if (!globalId) return

    const operations: EngineOperation[] = []
    const translationMm = isRecord(patch.translationMm) ? patch.translationMm : null
    const translationX = getFiniteNumber(translationMm?.x)
    const translationY = getFiniteNumber(translationMm?.y)
    const translationZ = getFiniteNumber(translationMm?.z) ?? 0
    if (translationX !== null || translationY !== null) {
      operations.push({
        id: `op-${createWorkspaceCommandId()}`,
        type: 'transform_elements',
        selector: toSelector(globalId),
        parameters: {
          translation_mm: {
            x: translationX ?? 0,
            y: translationY ?? 0,
            z: translationZ,
          },
        },
      })
    }

    const widthMm = getFiniteNumber(patch.widthMm)
    const heightMm = getFiniteNumber(patch.heightMm)
    if (widthMm !== null || heightMm !== null) {
      const dimensions: Record<string, Record<string, number | string>> = {}
      if (widthMm !== null) dimensions.width = absoluteDimension(widthMm)
      if (heightMm !== null) dimensions.height = absoluteDimension(heightMm)
      operations.push({
        id: `op-${createWorkspaceCommandId()}`,
        type: 'update_element_properties',
        selector: toSelector(globalId),
        parameters: {
          pset_name: 'Batang_SpaceDimensions',
          dimensions_mm: dimensions,
          pset_updates: {
            Batang_SpaceDimensions: {
              ...(widthMm !== null ? { Width: widthMm } : {}),
              ...(heightMm !== null ? { Height: heightMm } : {}),
            },
          },
        },
      })
    }
    recordEngineOperations(operations)
  }, [recordEngineOperations])

  const deleteRoom = useCallback((roomId: string) => {
    const globalId = toIfcGlobalId(roomId)
    if (!globalId) return
    recordEngineOperations([{
      id: `op-${createWorkspaceCommandId()}`,
      type: 'delete_elements',
      selector: toSelector(globalId),
      parameters: {},
    }])
  }, [recordEngineOperations])

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

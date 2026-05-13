import { useCallback, useEffect, useRef } from 'react'
import type { FloorOpening, FloorWall, IfcElementChange, IfcElementInfo, Point2D } from '../types'
import type { WorkspaceCommandSource } from '../types/workspaceCommand.types'
import {
  createEntityCommand,
  createWorkspaceCommandEnvelope,
  deleteEntityCommand,
  publishWorkspaceCommand,
  updateEntityCommand,
} from '../services/workspaceCommand.service'
import { serializeOpeningForCommand, serializeWallForCommand, toPointTuple } from '../utils/workspaceCommandMapper'

interface UseWorkspaceCommandPublisherOptions {
  projectId: string | undefined
  source: WorkspaceCommandSource
  getBaseRevisionId: () => string | null | undefined
  getBaseIndex: () => number
}

/**
 * FE 편집 이벤트를 실시간 Command 메시지로 전송하는 브리지 훅.
 * 백엔드 실시간 라우트가 없거나 연결이 끊긴 경우에도 편집 UX는 유지된다.
 */
export function useWorkspaceCommandPublisher({
  projectId,
  source,
  getBaseRevisionId,
  getBaseIndex,
}: UseWorkspaceCommandPublisherOptions) {
  const pendingCommandQueueRef = useRef<Array<ReturnType<typeof createWorkspaceCommandEnvelope>>>([])

  useEffect(() => {
    pendingCommandQueueRef.current = []
  }, [projectId])

  const publishSafely = useCallback((build: () => ReturnType<typeof createWorkspaceCommandEnvelope>) => {
    if (!projectId) return
    const baseRevisionId = getBaseRevisionId()
    if (!baseRevisionId) return
    const nextEnvelope = build()
    const queued = pendingCommandQueueRef.current
    try {
      if (queued.length > 0) {
        while (queued.length > 0) {
          const pendingEnvelope = queued[0]
          publishWorkspaceCommand(projectId, pendingEnvelope)
          queued.shift()
        }
      }
      publishWorkspaceCommand(projectId, nextEnvelope)
    } catch (error) {
      queued.push(nextEnvelope)
      console.warn('[editor] workspace command publish failed; queued for retry', {
        projectId,
        queueSize: queued.length,
        error,
      })
      // 실시간 연결 상태와 무관하게 편집 기능은 계속 동작해야 한다.
    }
  }, [getBaseRevisionId, projectId])

  const envelopeOptions = useCallback(() => {
    const baseRevisionId = getBaseRevisionId()
    if (!projectId || !baseRevisionId) return null
    return {
      projectId,
      baseRevisionId,
      baseIndex: getBaseIndex(),
      meta: { source },
    }
  }, [getBaseIndex, getBaseRevisionId, projectId, source])

  const createWall = useCallback((wall: FloorWall) => {
    publishSafely(() => createWorkspaceCommandEnvelope(
      createEntityCommand('wall', wall.id, serializeWallForCommand(wall)),
      envelopeOptions()!,
    ))
  }, [envelopeOptions, publishSafely])

  const updateWall = useCallback((wallId: string, patch: Record<string, unknown>) => {
    publishSafely(() => createWorkspaceCommandEnvelope(
      updateEntityCommand('wall', wallId, patch),
      envelopeOptions()!,
    ))
  }, [envelopeOptions, publishSafely])

  const deleteWall = useCallback((wallId: string) => {
    publishSafely(() => createWorkspaceCommandEnvelope(
      deleteEntityCommand('wall', wallId),
      envelopeOptions()!,
    ))
  }, [envelopeOptions, publishSafely])

  const createOpening = useCallback((opening: FloorOpening) => {
    publishSafely(() => createWorkspaceCommandEnvelope(
      createEntityCommand(opening.type, opening.id, serializeOpeningForCommand(opening)),
      envelopeOptions()!,
    ))
  }, [envelopeOptions, publishSafely])

  const updateOpening = useCallback(
    (openingType: FloorOpening['type'], openingId: string, patch: Record<string, unknown>) => {
      publishSafely(() => createWorkspaceCommandEnvelope(
        updateEntityCommand(openingType, openingId, patch),
        envelopeOptions()!,
      ))
    },
    [envelopeOptions, publishSafely],
  )

  const upsertOpening = useCallback((opening: FloorOpening, exists: boolean) => {
    if (exists) {
      updateOpening(opening.type, opening.id, serializeOpeningForCommand(opening))
      return
    }
    createOpening(opening)
  }, [createOpening, updateOpening])

  const deleteOpening = useCallback((opening: FloorOpening) => {
    publishSafely(() => createWorkspaceCommandEnvelope(
      deleteEntityCommand(opening.type, opening.id),
      envelopeOptions()!,
    ))
  }, [envelopeOptions, publishSafely])

  const updateIfcElement = useCallback((element: IfcElementInfo, patch: Omit<IfcElementChange, 'expressId'>) => {
    if (!element.globalId) return
    publishSafely(() => createWorkspaceCommandEnvelope(
      updateEntityCommand('ifcElement', element.globalId!, {
        ...patch,
        globalId: element.globalId,
        ifcClass: element.ifcClass,
      }),
      envelopeOptions()!,
    ))
  }, [envelopeOptions, publishSafely])

  const deleteIfcElement = useCallback((element: IfcElementInfo) => {
    if (!element.globalId) return
    publishSafely(() => createWorkspaceCommandEnvelope(
      deleteEntityCommand('ifcElement', element.globalId!),
      envelopeOptions()!,
    ))
  }, [envelopeOptions, publishSafely])

  const updateWallGeometry = useCallback((wallId: string, start: Point2D, end: Point2D, startMm?: Point2D, endMm?: Point2D) => {
    updateWall(wallId, {
      start: toPointTuple(start),
      end: toPointTuple(end),
      startMm: startMm ? toPointTuple(startMm) : undefined,
      endMm: endMm ? toPointTuple(endMm) : undefined,
    })
  }, [updateWall])

  const updateWallEndpoint = useCallback((wallId: string, endpoint: 'start' | 'end', point: Point2D, pointMm?: Point2D) => {
    updateWall(wallId, {
      [endpoint]: toPointTuple(point),
      [`${endpoint}Mm`]: pointMm ? toPointTuple(pointMm) : undefined,
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

  return {
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
  }
}

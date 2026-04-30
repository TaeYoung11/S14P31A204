import { useCallback } from 'react'
import type { EditorMode, FloorOpening, FloorWall, Point2D } from '../types'
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
  source: EditorMode
}

/**
 * FE 편집 이벤트를 실시간 Command 메시지로 전송하는 브리지 훅.
 * 백엔드 실시간 라우트가 없거나 연결이 끊긴 경우에도 편집 UX는 유지된다.
 */
export function useWorkspaceCommandPublisher({ projectId, source }: UseWorkspaceCommandPublisherOptions) {
  const publishSafely = useCallback((build: () => ReturnType<typeof createWorkspaceCommandEnvelope>) => {
    if (!projectId) return
    try {
      publishWorkspaceCommand(projectId, build())
    } catch {
      // 실시간 연결 상태와 무관하게 편집 기능은 계속 동작해야 한다.
    }
  }, [projectId])

  const createWall = useCallback((wall: FloorWall) => {
    publishSafely(() => createWorkspaceCommandEnvelope(
      createEntityCommand('wall', wall.id, serializeWallForCommand(wall)),
      { meta: { projectId, source } },
    ))
  }, [projectId, source, publishSafely])

  const updateWall = useCallback((wallId: string, patch: Record<string, unknown>) => {
    publishSafely(() => createWorkspaceCommandEnvelope(
      updateEntityCommand('wall', wallId, patch),
      { meta: { projectId, source } },
    ))
  }, [projectId, source, publishSafely])

  const deleteWall = useCallback((wallId: string) => {
    publishSafely(() => createWorkspaceCommandEnvelope(
      deleteEntityCommand('wall', wallId),
      { meta: { projectId, source } },
    ))
  }, [projectId, source, publishSafely])

  const createOpening = useCallback((opening: FloorOpening) => {
    publishSafely(() => createWorkspaceCommandEnvelope(
      createEntityCommand(opening.type, opening.id, serializeOpeningForCommand(opening)),
      { meta: { projectId, source } },
    ))
  }, [projectId, source, publishSafely])

  const updateOpening = useCallback(
    (openingType: FloorOpening['type'], openingId: string, patch: Record<string, unknown>) => {
      publishSafely(() => createWorkspaceCommandEnvelope(
        updateEntityCommand(openingType, openingId, patch),
        { meta: { projectId, source } },
      ))
    },
    [projectId, source, publishSafely],
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
      { meta: { projectId, source } },
    ))
  }, [projectId, source, publishSafely])

  const updateWallGeometry = useCallback((wallId: string, start: Point2D, end: Point2D) => {
    updateWall(wallId, {
      start: toPointTuple(start),
      end: toPointTuple(end),
    })
  }, [updateWall])

  const updateWallEndpoint = useCallback((wallId: string, endpoint: 'start' | 'end', point: Point2D) => {
    updateWall(wallId, {
      [endpoint]: toPointTuple(point),
    })
  }, [updateWall])

  const updateWallStyle = useCallback((wallId: string, next: { wallType?: FloorWall['type']; thickness?: number; height?: number }) => {
    const patch: Record<string, unknown> = {}
    if (next.wallType !== undefined) patch.wall_type = next.wallType
    if (next.thickness !== undefined) patch.thickness = next.thickness
    if (next.height !== undefined) patch.height = next.height
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
  }
}

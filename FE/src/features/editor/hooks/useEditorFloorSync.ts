import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { ConnectionData, FloorRoom, FloorWall } from '../types'
import { deriveAutoWallsFromRooms } from '../utils/autoWalls'
import { buildSyncedConnectionsFromRooms } from '../utils/roomConnectionSync'
import { remapPerimeterAlignedManualWalls } from '../utils/wallSync'
import type { AxisAlignedRect } from '../utils/geometry2d'

interface UseEditorFloorSyncParams {
  canSyncBubbleStateFrom2D: boolean
  connections: ConnectionData[]
  replaceConnections: (nextConnections: ConnectionData[]) => void
  setFloorWalls: Dispatch<SetStateAction<FloorWall[]>>
}

/**
 * Bubble <-> 2D 동기화 훅.
 * - Room 편집 결과를 연결선/수동벽 파생 상태에 반영한다.
 */
export function useEditorFloorSync({
  canSyncBubbleStateFrom2D,
  connections,
  replaceConnections,
  setFloorWalls,
}: UseEditorFloorSyncParams) {
  /** 2D Room 변경 결과를 Bubble connection 상태에 반영한다. */
  const syncBubbleConnectionsFromRooms = useCallback((nextRooms: FloorRoom[]) => {
    if (!canSyncBubbleStateFrom2D) return
    const nextConnections = buildSyncedConnectionsFromRooms(connections, nextRooms)
    if (!nextConnections) return
    replaceConnections(nextConnections)
  }, [canSyncBubbleStateFrom2D, connections, replaceConnections])

  /**
   * Room 배치 변경 시, 수동 목록으로 승격된 auto-wall의 좌표를 최신 Room 경계로 동기화한다.
   * (타입/두께/높이 등 편집 속성은 유지)
   */
  const syncManualAutoWallsFromRooms = useCallback((nextRooms: FloorRoom[]) => {
    const nextAutoWalls = deriveAutoWallsFromRooms(nextRooms)
    const nextAutoById = new Map(nextAutoWalls.map((wall) => [wall.id, wall] as const))
    setFloorWalls((prev) => {
      let changed = false
      const next = prev.map((wall) => {
        const auto = nextAutoById.get(wall.id)
        if (!auto) return wall
        if (
          wall.start.x === auto.start.x &&
          wall.start.y === auto.start.y &&
          wall.end.x === auto.end.x &&
          wall.end.y === auto.end.y
        ) {
          return wall
        }
        changed = true
        return {
          ...wall,
          start: auto.start,
          end: auto.end,
        }
      })
      return changed ? next : prev
    })
  }, [setFloorWalls])

  /**
   * Room 리사이즈 시, 해당 Room 외곽에 정렬된 수동 벽도 함께 비례 리사이즈한다.
   * - auto-room/auto-shared 계열은 별도 동기화 경로(syncManualAutoWallsFromRooms)에서 처리
   * - 외곽에 정렬된 수동 벽만 최소 범위로 보정
   */
  const syncPerimeterManualWallsForRoomResize = useCallback(
    (roomBubbleId: string, prevRect: AxisAlignedRect, nextRect: AxisAlignedRect) => {
      setFloorWalls((prevWalls) =>
        remapPerimeterAlignedManualWalls(prevWalls, roomBubbleId, prevRect, nextRect),
      )
    },
    [setFloorWalls],
  )

  /** Room 이동/리사이즈 후 공통 동기화(벽 좌표 + 연결선)를 반영한다. */
  const syncFloorDerivedStateFromRooms = useCallback((nextRooms: FloorRoom[]) => {
    syncManualAutoWallsFromRooms(nextRooms)
    syncBubbleConnectionsFromRooms(nextRooms)
  }, [syncManualAutoWallsFromRooms, syncBubbleConnectionsFromRooms])

  return {
    syncBubbleConnectionsFromRooms,
    syncManualAutoWallsFromRooms,
    syncPerimeterManualWallsForRoomResize,
    syncFloorDerivedStateFromRooms,
  }
}

import { useCallback, useMemo } from 'react'
import type { FloorRoom, FloorWall, Point2D } from '../../types'
import { snapToGrid } from './twoDCanvas.utils'

interface UseWallSnapParams {
  walls: FloorWall[]
  rooms: FloorRoom[]
  isGridSnapEnabled: boolean
  gridSnapStepPx: number
  wallSnapDistance: number
  roomPolygonMinVertexCount: number
}

/**
 * 벽 생성 시 사용하는 스냅 후보 생성 및 스냅 좌표 계산을 관리한다.
 * - 그리드 스냅
 * - 인접 점 스냅
 * - 직교 잠금(Shift)
 */
export function useWallSnap({
  walls,
  rooms,
  isGridSnapEnabled,
  gridSnapStepPx,
  wallSnapDistance,
  roomPolygonMinVertexCount,
}: UseWallSnapParams) {
  const wallSnapCandidates = useMemo<Point2D[]>(() => {
    const points: Point2D[] = []
    for (const wall of walls) {
      points.push(wall.start, wall.end)
    }
    for (const room of rooms) {
      if (room.polygon && room.polygon.length >= roomPolygonMinVertexCount) {
        room.polygon.forEach((point) => {
          if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return
          points.push({ x: point.x, y: point.y })
        })
        continue
      }
      points.push(
        { x: room.x, y: room.y },
        { x: room.x + room.width, y: room.y },
        { x: room.x + room.width, y: room.y + room.height },
        { x: room.x, y: room.y + room.height },
      )
    }
    return points
  }, [walls, rooms, roomPolygonMinVertexCount])

  const getSnappedWallPoint = useCallback((
    raw: Point2D,
    start: Point2D | null,
    isOrthogonalLocked: boolean,
  ): Point2D => {
    let point = isGridSnapEnabled ? snapToGrid(raw, gridSnapStepPx) : raw

    let minDistance = Number.POSITIVE_INFINITY
    let nearest: Point2D | null = null
    for (const candidate of wallSnapCandidates) {
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y)
      if (distance < minDistance) {
        minDistance = distance
        nearest = candidate
      }
    }
    if (nearest && minDistance <= wallSnapDistance) {
      point = { x: nearest.x, y: nearest.y }
    }

    if (start && isOrthogonalLocked) {
      const dx = Math.abs(point.x - start.x)
      const dy = Math.abs(point.y - start.y)
      point = dx >= dy ? { x: point.x, y: start.y } : { x: start.x, y: point.y }
    }

    return point
  }, [gridSnapStepPx, isGridSnapEnabled, wallSnapCandidates, wallSnapDistance])

  return {
    getSnappedWallPoint,
  }
}

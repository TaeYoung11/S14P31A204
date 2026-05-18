import type {
  BubbleData,
  FloorLayer,
  FloorOpening,
  FloorRoom,
  FloorWall,
  WorkspaceSnapshot,
  CanvasViewTransform,
  Point2D,
} from '../types'
import { radiansToDegrees, rotatePointAround } from './canvasViewTransform'

export type WorkspaceCoordinateFrame = 'project_north' | 'true_north'

export interface WorkspaceCoordinateFrameTransformContext {
  sourceFrame: WorkspaceCoordinateFrame
  targetFrame: WorkspaceCoordinateFrame
  /**
   * canonical 좌표계를 project north로 정렬할 때 쓰는 뷰 변환.
   * - source/target이 다를 때만 사용한다.
   * - 값이 없으면 안전하게 no-op 처리한다.
   */
  projectNorthViewTransform: CanvasViewTransform | null
}

interface CoordinateFrameRotationContext {
  centerX: number
  centerY: number
  radians: number
}

interface SnapshotMmTransformContext {
  centerMmX: number
  centerMmY: number
}

const resolveCoordinateFrameRotationContext = (
  context: WorkspaceCoordinateFrameTransformContext,
): CoordinateFrameRotationContext | null => {
  const { sourceFrame, targetFrame, projectNorthViewTransform } = context
  if (sourceFrame === targetFrame) return null
  if (!projectNorthViewTransform) return null

  const { centerX, centerY, rotationRadians } = projectNorthViewTransform
  const radians = sourceFrame === 'project_north' && targetFrame === 'true_north'
    ? -rotationRadians
    : sourceFrame === 'true_north' && targetFrame === 'project_north'
      ? rotationRadians
      : 0

  if (!Number.isFinite(radians) || Math.abs(radians) < 1e-9) return null
  return { centerX, centerY, radians }
}

const rotateVector = (x: number, y: number, radians: number): Point2D => {
  if (!Number.isFinite(radians) || Math.abs(radians) < 1e-9) return { x, y }
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  }
}

const getMedian = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return (sorted[middle - 1] + sorted[middle]) / 2
}

const resolveWallMmReference = (snapshot: WorkspaceSnapshot): {
  mmPerPx: number
  offsetMmX: number
  offsetMmY: number
} | null => {
  const mmPerPxCandidates: number[] = []
  for (const wall of snapshot.floorWalls) {
    if (!wall.startMm || !wall.endMm) continue
    const pxLength = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y)
    const mmLength = Math.hypot(wall.endMm.x - wall.startMm.x, wall.endMm.y - wall.startMm.y)
    if (!Number.isFinite(pxLength) || !Number.isFinite(mmLength) || pxLength <= 1e-9 || mmLength <= 1e-9) {
      continue
    }
    const mmPerPx = mmLength / pxLength
    if (!Number.isFinite(mmPerPx) || mmPerPx <= 0) continue
    mmPerPxCandidates.push(mmPerPx)
  }

  const mmPerPx = getMedian(mmPerPxCandidates)
  if (!mmPerPx) return null

  const offsetMmXCandidates: number[] = []
  const offsetMmYCandidates: number[] = []
  for (const wall of snapshot.floorWalls) {
    if (!wall.startMm || !wall.endMm) continue
    const startOffsetX = wall.startMm.x - wall.start.x * mmPerPx
    const startOffsetY = wall.startMm.y - wall.start.y * mmPerPx
    const endOffsetX = wall.endMm.x - wall.end.x * mmPerPx
    const endOffsetY = wall.endMm.y - wall.end.y * mmPerPx
    if (Number.isFinite(startOffsetX)) offsetMmXCandidates.push(startOffsetX)
    if (Number.isFinite(endOffsetX)) offsetMmXCandidates.push(endOffsetX)
    if (Number.isFinite(startOffsetY)) offsetMmYCandidates.push(startOffsetY)
    if (Number.isFinite(endOffsetY)) offsetMmYCandidates.push(endOffsetY)
  }

  const offsetMmX = getMedian(offsetMmXCandidates)
  const offsetMmY = getMedian(offsetMmYCandidates)
  if (offsetMmX === null || offsetMmY === null) return null

  return {
    mmPerPx,
    offsetMmX,
    offsetMmY,
  }
}

const resolveSnapshotMmTransformContext = (
  snapshot: WorkspaceSnapshot,
  rotationContext: CoordinateFrameRotationContext,
): SnapshotMmTransformContext | null => {
  const reference = resolveWallMmReference(snapshot)
  if (!reference) return null
  const centerMmX = rotationContext.centerX * reference.mmPerPx + reference.offsetMmX
  const centerMmY = rotationContext.centerY * reference.mmPerPx + reference.offsetMmY
  if (!Number.isFinite(centerMmX) || !Number.isFinite(centerMmY)) return null
  return { centerMmX, centerMmY }
}

const rotateBubble = (
  bubble: BubbleData,
  radians: number,
  centerX: number,
  centerY: number,
): BubbleData => {
  const mapped = rotatePointAround({ x: bubble.x, y: bubble.y }, radians, centerX, centerY)
  return {
    ...bubble,
    x: mapped.x,
    y: mapped.y,
  }
}

const mapBubblesWithRotation = (
  bubbles: BubbleData[],
  rotationContext: CoordinateFrameRotationContext,
): BubbleData[] => {
  const { centerX, centerY, radians } = rotationContext
  return bubbles.map((bubble) => rotateBubble(bubble, radians, centerX, centerY))
}

/** 버블 목록을 source → target 좌표 프레임으로 변환한다. */
export function mapBubblesCoordinateFrame(
  bubbles: BubbleData[],
  context: WorkspaceCoordinateFrameTransformContext,
): BubbleData[] {
  const rotationContext = resolveCoordinateFrameRotationContext(context)
  if (!rotationContext) return bubbles
  return mapBubblesWithRotation(bubbles, rotationContext)
}

/** [x1,y1,x2,y2,...] 형태의 평면 좌표를 source → target 좌표 프레임으로 변환한다. */
export function mapFlatPointsCoordinateFrame(
  points: number[],
  context: WorkspaceCoordinateFrameTransformContext,
): number[] {
  const rotationContext = resolveCoordinateFrameRotationContext(context)
  if (!rotationContext) return points
  if (points.length < 2 || points.length % 2 !== 0) return points

  for (let index = 0; index + 1 < points.length; index += 2) {
    if (!Number.isFinite(points[index]) || !Number.isFinite(points[index + 1])) {
      // 입력 정점이 깨진 경우 점 유실을 막기 위해 변환을 포기하고 원본을 유지한다.
      return points
    }
  }

  const { centerX, centerY, radians } = rotationContext
  const mapped: number[] = []
  for (let index = 0; index + 1 < points.length; index += 2) {
    const x = points[index]
    const y = points[index + 1]
    const rotated = rotatePointAround({ x, y }, radians, centerX, centerY)
    mapped.push(rotated.x, rotated.y)
  }
  return mapped
}

const rotateContour = (room: FloorRoom, radians: number, centerX: number, centerY: number): FloorRoom['contour'] =>
  room.contour?.map((segment) =>
    segment.type === 'line'
      ? {
          type: 'line',
          from: rotatePointAround(segment.from, radians, centerX, centerY),
          to: rotatePointAround(segment.to, radians, centerX, centerY),
        }
      : {
          ...segment,
          center: rotatePointAround(segment.center, radians, centerX, centerY),
        })

const rotateRoom = (
  room: FloorRoom,
  radians: number,
  centerX: number,
  centerY: number,
): FloorRoom => {
  if (!room.transform) {
    const mappedTopLeft = rotatePointAround({ x: room.x, y: room.y }, radians, centerX, centerY)
    return {
      ...room,
      x: mappedTopLeft.x,
      y: mappedTopLeft.y,
      polygon: room.polygon?.map((point) => rotatePointAround(point, radians, centerX, centerY)),
      contour: rotateContour(room, radians, centerX, centerY),
    }
  }

  // transform 기반 room은 geometry를 건드리지 않고 transform만 회전해 이중 반영을 피한다.
  const rotatedOrigin = room.transform.origin
    ? rotatePointAround(room.transform.origin, radians, centerX, centerY)
    : room.transform.origin
  const rotatedTranslation = rotateVector(
    room.transform.translationX ?? 0,
    room.transform.translationY ?? 0,
    radians,
  )
  return {
    ...room,
    transform: {
      ...room.transform,
      origin: rotatedOrigin,
      translationX: rotatedTranslation.x,
      translationY: rotatedTranslation.y,
      rotationDeg: (room.transform.rotationDeg ?? 0) + radiansToDegrees(radians),
    },
  }
}

const rotateFloorLayer = (
  layer: FloorLayer,
  radians: number,
  centerX: number,
  centerY: number,
): FloorLayer => ({
  ...layer,
  rooms: layer.rooms.map((room) => rotateRoom(room, radians, centerX, centerY)),
})

const rotateWall = (
  wall: FloorWall,
  radians: number,
  centerX: number,
  centerY: number,
  mmContext: SnapshotMmTransformContext | null,
): FloorWall => ({
  ...wall,
  start: rotatePointAround(wall.start, radians, centerX, centerY),
  end: rotatePointAround(wall.end, radians, centerX, centerY),
  // mm 필드가 있으면 동일 회전을 적용해 px/mm 좌표 프레임 불일치를 방지한다.
  startMm: wall.startMm && mmContext
    ? rotatePointAround(wall.startMm, radians, mmContext.centerMmX, mmContext.centerMmY)
    : wall.startMm,
  endMm: wall.endMm && mmContext
    ? rotatePointAround(wall.endMm, radians, mmContext.centerMmX, mmContext.centerMmY)
    : wall.endMm,
})

const rotateOpening = (
  opening: FloorOpening,
  radians: number,
  mmContext: SnapshotMmTransformContext | null,
): FloorOpening => ({
  ...opening,
  centerMm: opening.centerMm && mmContext
    ? rotatePointAround(opening.centerMm, radians, mmContext.centerMmX, mmContext.centerMmY)
    : opening.centerMm,
})

/**
 * 저장/동기화 경계에서 좌표 프레임을 변환한다.
 * - 기본(source===target)은 원본 snapshot을 그대로 반환한다.
 * - 변환이 필요한데 기준 transform이 없으면 안전하게 no-op 처리한다.
 */
export function mapWorkspaceSnapshotCoordinateFrame(
  snapshot: WorkspaceSnapshot,
  context: WorkspaceCoordinateFrameTransformContext,
): WorkspaceSnapshot {
  const rotationContext = resolveCoordinateFrameRotationContext(context)
  if (!rotationContext) return snapshot
  const { centerX, centerY, radians } = rotationContext
  const mmContext = resolveSnapshotMmTransformContext(snapshot, rotationContext)

  return {
    ...snapshot,
    bubbles: mapBubblesWithRotation(snapshot.bubbles, rotationContext),
    floorLayers: snapshot.floorLayers.map((layer) => rotateFloorLayer(layer, radians, centerX, centerY)),
    floorWalls: snapshot.floorWalls.map((wall) => rotateWall(wall, radians, centerX, centerY, mmContext)),
    floorOpenings: snapshot.floorOpenings.map((opening) => rotateOpening(opening, radians, mmContext)),
  }
}

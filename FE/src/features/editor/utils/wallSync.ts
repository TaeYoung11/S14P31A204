import type { AxisAlignedRect } from './geometry2d'
import type { FloorWall } from '../types'

const PERIMETER_EDGE_TOLERANCE_PX = 12

/** 벽 두께(mm) 입력값을 허용 범위로 보정한다. */
export function clampWallThicknessMm(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max)
}

/** 벽 높이(mm) 입력값을 허용 범위로 보정한다. */
export function clampWallHeightMm(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max)
}

/**
 * Room 리사이즈 시 외곽에 정렬된 수동 벽 좌표를 새 사각형에 맞춰 보정한다.
 * - auto-room/auto-shared 벽은 제외(별도 동기화 경로 담당)
 * - 수직/수평 벽만 처리
 * - 변경이 없으면 원본 배열 참조를 그대로 반환
 */
export function remapPerimeterAlignedManualWalls(
  walls: FloorWall[],
  roomBubbleId: string,
  prevRect: AxisAlignedRect,
  nextRect: AxisAlignedRect,
): FloorWall[] {
  const prevLeft = prevRect.x
  const prevRight = prevRect.x + prevRect.width
  const prevTop = prevRect.y
  const prevBottom = prevRect.y + prevRect.height
  const nextLeft = nextRect.x
  const nextRight = nextRect.x + nextRect.width
  const nextTop = nextRect.y
  const nextBottom = nextRect.y + nextRect.height
  const safePrevWidth = Math.max(prevRect.width, 1)
  const safePrevHeight = Math.max(prevRect.height, 1)
  const near = (a: number, b: number) => Math.abs(a - b) <= PERIMETER_EDGE_TOLERANCE_PX
  const overlaps = (a1: number, a2: number, b1: number, b2: number) =>
    Math.min(Math.max(a1, a2), Math.max(b1, b2)) - Math.max(Math.min(a1, a2), Math.min(b1, b2)) >= -PERIMETER_EDGE_TOLERANCE_PX
  const mapX = (x: number) => nextLeft + ((x - prevLeft) / safePrevWidth) * nextRect.width
  const mapY = (y: number) => nextTop + ((y - prevTop) / safePrevHeight) * nextRect.height

  let changed = false
  const nextWalls = walls.map((wall) => {
    if (wall.id.startsWith(`auto-room-${roomBubbleId}-`) || wall.id.startsWith('auto-shared-')) {
      return wall
    }

    const sx = wall.start.x
    const sy = wall.start.y
    const ex = wall.end.x
    const ey = wall.end.y
    const isVertical = Math.abs(sx - ex) <= PERIMETER_EDGE_TOLERANCE_PX
    const isHorizontal = Math.abs(sy - ey) <= PERIMETER_EDGE_TOLERANCE_PX
    if (!isVertical && !isHorizontal) return wall

    let nextStart = wall.start
    let nextEnd = wall.end
    let matched = false

    if (isVertical) {
      const wallX = (sx + ex) / 2
      const onLeft = near(wallX, prevLeft)
      const onRight = near(wallX, prevRight)
      if ((onLeft || onRight) && overlaps(sy, ey, prevTop, prevBottom)) {
        const targetX = onLeft ? nextLeft : nextRight
        nextStart = { x: targetX, y: mapY(sy) }
        nextEnd = { x: targetX, y: mapY(ey) }
        matched = true
      }
    }

    if (!matched && isHorizontal) {
      const wallY = (sy + ey) / 2
      const onTop = near(wallY, prevTop)
      const onBottom = near(wallY, prevBottom)
      if ((onTop || onBottom) && overlaps(sx, ex, prevLeft, prevRight)) {
        const targetY = onTop ? nextTop : nextBottom
        nextStart = { x: mapX(sx), y: targetY }
        nextEnd = { x: mapX(ex), y: targetY }
        matched = true
      }
    }

    if (!matched) return wall
    if (
      nextStart.x === wall.start.x &&
      nextStart.y === wall.start.y &&
      nextEnd.x === wall.end.x &&
      nextEnd.y === wall.end.y
    ) {
      return wall
    }
    changed = true
    return {
      ...wall,
      start: nextStart,
      end: nextEnd,
    }
  })

  return changed ? nextWalls : walls
}

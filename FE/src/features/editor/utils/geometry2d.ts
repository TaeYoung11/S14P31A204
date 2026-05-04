import type { Point2D } from '../types'

/** 2D 평면 캔버스에서 공통으로 쓰는 축 정렬 사각형 좌표 타입 */
export interface AxisAlignedRect {
  x: number
  y: number
  width: number
  height: number
}

/** 사각형 내부 포함 여부를 검사한다. */
export function pointInRect(point: Point2D, rect: AxisAlignedRect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

/**
 * 선분과 사각형의 교차 여부를 검사한다.
 * Cohen–Sutherland 알고리즘 기반으로 경계 교차를 계산한다.
 */
export function lineIntersectsRect(start: Point2D, end: Point2D, rect: AxisAlignedRect): boolean {
  if (pointInRect(start, rect) || pointInRect(end, rect)) return true

  const LEFT = 1
  const RIGHT = 2
  const BOTTOM = 4
  const TOP = 8
  const xMin = rect.x
  const xMax = rect.x + rect.width
  const yMin = rect.y
  const yMax = rect.y + rect.height

  const computeCode = (x: number, y: number) => {
    let code = 0
    if (x < xMin) code |= LEFT
    else if (x > xMax) code |= RIGHT
    if (y < yMin) code |= TOP
    else if (y > yMax) code |= BOTTOM
    return code
  }

  let x1 = start.x
  let y1 = start.y
  let x2 = end.x
  let y2 = end.y
  let code1 = computeCode(x1, y1)
  let code2 = computeCode(x2, y2)

  while (true) {
    if ((code1 | code2) === 0) return true
    if ((code1 & code2) !== 0) return false

    const outCode = code1 !== 0 ? code1 : code2
    let x = 0
    let y = 0

    if (outCode & TOP) {
      x = x1 + ((x2 - x1) * (yMin - y1)) / (y2 - y1 || 1)
      y = yMin
    } else if (outCode & BOTTOM) {
      x = x1 + ((x2 - x1) * (yMax - y1)) / (y2 - y1 || 1)
      y = yMax
    } else if (outCode & RIGHT) {
      y = y1 + ((y2 - y1) * (xMax - x1)) / (x2 - x1 || 1)
      x = xMax
    } else if (outCode & LEFT) {
      y = y1 + ((y2 - y1) * (xMin - x1)) / (x2 - x1 || 1)
      x = xMin
    }

    if (outCode === code1) {
      x1 = x
      y1 = y
      code1 = computeCode(x1, y1)
    } else {
      x2 = x
      y2 = y
      code2 = computeCode(x2, y2)
    }
  }
}

/** Room 내부 판정을 위해 외곽에서 일정 inset 만큼 줄인 사각형을 만든다. */
export function insetRect(rect: AxisAlignedRect, inset: number): AxisAlignedRect | null {
  const width = rect.width - inset * 2
  const height = rect.height - inset * 2
  if (width <= 0 || height <= 0) return null
  return {
    x: rect.x + inset,
    y: rect.y + inset,
    width,
    height,
  }
}

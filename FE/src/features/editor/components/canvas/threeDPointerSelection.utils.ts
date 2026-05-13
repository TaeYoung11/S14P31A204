type ThreeModule = typeof import('three')

export interface ScreenRect {
  left: number
  top: number
  right: number
  bottom: number
}

interface ScreenPoint {
  x: number
  y: number
}

/** 포인터 좌표가 DOM 경계 안에 있는지 판별한다. */
export const isPointerInsideBounds = (
  bounds: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
  clientX: number,
  clientY: number,
) => (
  clientX >= bounds.left &&
  clientX <= bounds.right &&
  clientY >= bounds.top &&
  clientY <= bounds.bottom
)

/** 포인터 좌표를 NDC(-1~1)로 변환한다. */
export const toNormalizedMouse = (
  THREE: ThreeModule,
  bounds: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  clientX: number,
  clientY: number,
) => new THREE.Vector2(
  ((clientX - bounds.left) / bounds.width) * 2 - 1,
  -((clientY - bounds.top) / bounds.height) * 2 + 1,
)

/** 드래그 시작/종료 포인터 좌표로 화면 사각형을 만든다. */
export const toScreenRectFromPointers = (
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): ScreenRect => ({
  left: Math.min(startX, endX),
  top: Math.min(startY, endY),
  right: Math.max(startX, endX),
  bottom: Math.max(startY, endY),
})

/** 점이 화면 사각형 내부에 있는지 판별한다. */
export const isScreenPointInsideRect = (point: ScreenPoint, rect: ScreenRect) => (
  point.x >= rect.left &&
  point.x <= rect.right &&
  point.y >= rect.top &&
  point.y <= rect.bottom
)

/**
 * 선택 목록에 같은 key가 없을 때만 항목을 추가한다.
 * 이미 존재하면 기존 목록을 그대로 반환한다.
 */
export const appendUniqueSelectionByKey = <T>(
  previous: T[],
  next: T,
  getKey: (entry: T) => string,
) => {
  const nextKey = getKey(next)
  if (previous.some((entry) => getKey(entry) === nextKey)) return previous
  return [...previous, next]
}

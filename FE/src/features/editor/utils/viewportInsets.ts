/**
 * 캔버스 가시영역 보정을 위한 스테이지 여백(inset) 정보.
 * 좌우 패널/툴바가 겹치는 영역을 제외하고 fit/center 계산할 때 사용한다.
 */
export interface ViewportInsets {
  left: number
  right: number
  top: number
  bottom: number
}

export const EMPTY_VIEWPORT_INSETS: ViewportInsets = {
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
}

/**
 * 음수/undefined inset을 0으로 보정해 계산 안정성을 보장한다.
 */
export function normalizeViewportInsets(insets?: Partial<ViewportInsets>): ViewportInsets {
  return {
    left: Math.max(0, insets?.left ?? 0),
    right: Math.max(0, insets?.right ?? 0),
    top: Math.max(0, insets?.top ?? 0),
    bottom: Math.max(0, insets?.bottom ?? 0),
  }
}

/**
 * 현재 스테이지에서 실제로 그리기 가능한 가시영역 프레임을 반환한다.
 */
export function getViewportFrame(
  stageWidth: number,
  stageHeight: number,
  insets?: Partial<ViewportInsets>,
) {
  const safeInsets = normalizeViewportInsets(insets)
  const width = Math.max(stageWidth - safeInsets.left - safeInsets.right, 1)
  const height = Math.max(stageHeight - safeInsets.top - safeInsets.bottom, 1)

  return {
    x: safeInsets.left,
    y: safeInsets.top,
    width,
    height,
    centerX: safeInsets.left + width / 2,
    centerY: safeInsets.top + height / 2,
    insets: safeInsets,
  }
}

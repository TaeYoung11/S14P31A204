export interface PanelBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface PanelMetrics {
  baseLeftViewport: number
  baseTopViewport: number
  panelWidth: number
  panelHeight: number
}

export interface VisibleSizeConfig {
  openMinVisibleWidthPx: number
  openMinVisibleHeightPx: number
  collapsedVisibleEdgePx: number
}

export interface PanelBoundsConfig {
  rightDragLimitPx: number
  leftDockBleedPx: number
  topReservedPx: number
  bottomReservedPx: number
}

/**
 * 패널 열린/닫힌 상태에 맞는 최소 가시 크기를 계산한다.
 */
export function getPanelVisibleSize(
  isOpen: boolean,
  panelWidth: number,
  panelHeight: number,
  config: VisibleSizeConfig,
) {
  const visibleWidth = Math.min(
    panelWidth,
    isOpen ? config.openMinVisibleWidthPx : config.collapsedVisibleEdgePx,
  )
  const visibleHeight = Math.min(
    panelHeight,
    isOpen ? config.openMinVisibleHeightPx : config.collapsedVisibleEdgePx,
  )
  return { visibleWidth, visibleHeight }
}

/**
 * 뷰포트 기준 메트릭을 offset 기준 bounds로 변환한다.
 */
export function getPanelBoundsFromMetrics(
  metrics: PanelMetrics,
  visibleWidth: number,
  visibleHeight: number,
  viewportHeight: number,
  config: PanelBoundsConfig,
): PanelBounds {
  void visibleWidth
  const minLeftViewport = config.leftDockBleedPx
  const maxLeftViewport = metrics.baseLeftViewport + config.rightDragLimitPx
  const minTopViewport = config.topReservedPx - (metrics.panelHeight - visibleHeight)
  const maxTopViewport = viewportHeight - config.bottomReservedPx - visibleHeight

  return {
    minX: minLeftViewport - metrics.baseLeftViewport,
    maxX: maxLeftViewport - metrics.baseLeftViewport,
    minY: minTopViewport - metrics.baseTopViewport,
    maxY: maxTopViewport - metrics.baseTopViewport,
  }
}

/**
 * 패널 DOM을 찾지 못하는 경우를 위한 fallback bounds 계산.
 */
export function getPanelBoundsFallback(
  panelWidth: number,
  visibleWidth: number,
  visibleHeight: number,
  viewportHeight: number,
  config: PanelBoundsConfig,
): PanelBounds {
  void panelWidth
  void visibleWidth
  const minX = config.leftDockBleedPx
  const maxX = config.rightDragLimitPx
  const minY = -Math.max(0, viewportHeight - config.topReservedPx - visibleHeight)
  const maxY = Math.max(minY, viewportHeight - config.topReservedPx - config.bottomReservedPx - visibleHeight)

  return { minX, maxX, minY, maxY }
}

/**
 * 값 범위를 [min, max]로 고정한다.
 */
export function clampRange(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/**
 * 경계 근접 시 지정한 snap 거리 안에서 경계로 붙인다.
 */
export function snapToEdge(value: number, min: number, max: number, snapDistance: number) {
  if (Math.abs(value - min) <= snapDistance) return min
  if (Math.abs(value - max) <= snapDistance) return max
  return value
}

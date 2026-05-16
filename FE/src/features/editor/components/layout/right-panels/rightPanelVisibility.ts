import type { EditorMode, PanelKey } from '@/features/editor/types'

const MODE_VISIBLE_PANEL_KEYS: Record<EditorMode, PanelKey[]> = {
  bubble: ['attributes'],
  '2d': ['attributes'],
  '3d': ['attributes'],
  view: [],
}

/**
 * 모드별 표시 대상 패널 키 목록
 */
export function getVisiblePanelKeys(mode: EditorMode): PanelKey[] {
  return MODE_VISIBLE_PANEL_KEYS[mode]
}

/**
 * 열린 패널 상태에 따라 우측 도크 너비(px)를 계산한다.
 */
export function getRightDockWidth(
  visiblePanelKeys: PanelKey[],
  panelOpenState: Record<PanelKey, boolean>,
  panelWidths: Record<PanelKey, number>,
) {
  const hasAnyOpenPanel = visiblePanelKeys.some((panelKey) => panelOpenState[panelKey])
  if (!hasAnyOpenPanel) {
    return 56
  }

  const maxOpenPanelWidth = visiblePanelKeys.reduce((maxWidth, panelKey) => {
    if (!panelOpenState[panelKey]) return maxWidth
    return Math.max(maxWidth, panelWidths[panelKey] ?? 300)
  }, 300)

  return maxOpenPanelWidth
}

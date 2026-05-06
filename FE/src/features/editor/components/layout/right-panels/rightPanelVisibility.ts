import type { EditorMode, PanelKey } from '@/features/editor/types'

/**
 * 모드별 표시 대상 패널 키 목록
 */
export function getVisiblePanelKeys(mode: EditorMode): PanelKey[] {
  if (mode === 'bubble') return ['attributes', 'zoning', 'assistant']
  if (mode === '3d') return ['attributes', 'floorView', 'hierarchy', 'assistant']
  if (mode === '2d') return ['attributes', 'assistant']
  return []
}

/**
 * 열린 패널 존재 여부에 따라 우측 도크 너비 클래스를 반환한다.
 */
export function getRightDockWidthClass(visiblePanelKeys: PanelKey[], panelOpenState: Record<PanelKey, boolean>) {
  const hasAnyOpenPanel = visiblePanelKeys.some((panelKey) => panelOpenState[panelKey])
  return hasAnyOpenPanel ? 'w-[300px]' : 'w-[56px]'
}

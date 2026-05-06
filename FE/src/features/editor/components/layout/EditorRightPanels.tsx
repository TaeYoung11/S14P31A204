import EditorRightPanelsCollaborationDock from './right-panels/EditorRightPanelsCollaborationDock'
import type { EditorRightPanelsProps } from './right-panels/EditorRightPanels.types'
import EditorRightPanelsWorkspaceDock from './right-panels/EditorRightPanelsWorkspaceDock'
import { getRightDockWidth, getVisiblePanelKeys } from './right-panels/rightPanelVisibility'

/**
 * 에디터 우측 패널 루트 조합 컴포넌트
 * - 협업 모드 분기와 도크 폭 계산만 담당한다.
 */
export function EditorRightPanels(props: EditorRightPanelsProps) {
  const { mode, isCollaborationMode, panelOpenState, panelWidths } = props
  const visiblePanelKeys = getVisiblePanelKeys(mode)
  const rightDockWidth = getRightDockWidth(visiblePanelKeys, panelOpenState, panelWidths)

  if (isCollaborationMode && mode !== 'bubble') {
    return <EditorRightPanelsCollaborationDock {...props} />
  }

  return <EditorRightPanelsWorkspaceDock rightDockWidth={rightDockWidth} props={props} />
}

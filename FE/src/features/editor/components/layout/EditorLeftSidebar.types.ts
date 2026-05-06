import type { EditorMode } from '../../types'

/**
 * 에디터 좌측 사이드바 입력 속성
 * - 모드/선택 도구/콜백만 받고 내부 렌더링은 모드별 컴포넌트로 위임한다.
 */
export interface EditorLeftSidebarProps {
  mode: EditorMode
  isLineStyleModalOpen: boolean
  isLibraryOpen?: boolean
  isGridVisible?: boolean
  selectedTool: string
  onToolSelect: (tool: string) => void
  onAddSpace: () => void
  onToggleCollaboration?: () => void
  onToggleLibrary?: () => void
  onToggleGrid?: () => void
  onExportIFC?: () => void
  onGenerateFloorPlan?: () => void
  onAutoLayoutBubbles?: () => void
  canGenerateFloorPlan?: boolean
  canAutoLayoutBubbles?: boolean
  isFloorPlanGenerated?: boolean
  isBubbleReadOnly?: boolean
  hasDeletableSelection?: boolean
  onDeleteSelected?: () => void
}

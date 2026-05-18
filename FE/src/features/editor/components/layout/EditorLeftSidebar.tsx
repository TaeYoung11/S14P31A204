import type { EditorLeftSidebarProps } from './EditorLeftSidebar.types'
import BubbleSidebarTools from './sidebar/BubbleSidebarTools'
import ReadOnlySidebarFooter from './sidebar/ReadOnlySidebarFooter'
import ReadOnlySidebarTools from './sidebar/ReadOnlySidebarTools'
import SidebarFrame from './sidebar/SidebarFrame'
import SidebarFooterActions from './sidebar/SidebarFooterActions'
import ThreeDSidebarTools from './sidebar/ThreeDSidebarTools'
import TwoDSidebarTools from './sidebar/TwoDSidebarTools'

/**
 * 에디터 왼쪽 도구 사이드바
 * - 모드별 도구 그룹 렌더링만 담당한다.
 * - 계산/검증 로직은 상위 훅에서 전달된 값만 사용한다.
 */
export default function EditorLeftSidebar({
  mode,
  isLineStyleModalOpen,
  isLibraryOpen,
  isCollaborationMode = false,
  isAgentPanelMode = false,
  isGridVisible,
  selectedTool,
  onToolSelect,
  onAddSpace,
  onToggleCollaboration,
  onToggleAgentPanel,
  onToggleLibrary,
  onToggleGrid,
  onExportIFC,
  onAutoLayoutBubbles,
  canAutoLayoutBubbles = false,
  isBubbleReadOnly = false,
  isEditorReadOnly = false,
  isDeleteActionLocked = false,
  hasDeletableSelection = false,
  onDeleteSelected,
}: EditorLeftSidebarProps) {
  const shouldShowFooterActions = mode === '2d' || mode === '3d'

  /**
   * 현재 에디터 모드에 맞는 도구 묶음을 반환한다.
   * - mode 별 컴포넌트 선택만 담당한다.
   * - 도구별 계산/검증 로직은 각 하위 컴포넌트/훅으로 위임한다.
   */
  const renderModeTools = () => {
    if (mode === 'bubble') {
      return (
        <BubbleSidebarTools
          selectedTool={selectedTool}
          isLineStyleModalOpen={isLineStyleModalOpen}
          isBubbleReadOnly={isBubbleReadOnly}
          canAutoLayoutBubbles={canAutoLayoutBubbles}
          hasDeletableSelection={hasDeletableSelection}
          isDeleteActionLocked={isDeleteActionLocked}
          onToolSelect={onToolSelect}
          onAddSpace={onAddSpace}
          onAutoLayoutBubbles={onAutoLayoutBubbles}
          onDeleteSelected={onDeleteSelected}
        />
      )
    }

    if (mode === '2d') {
      return (
        <TwoDSidebarTools
          selectedTool={selectedTool}
          isGridVisible={isGridVisible}
          hasDeletableSelection={hasDeletableSelection}
          isDeleteActionLocked={isDeleteActionLocked}
          onToolSelect={onToolSelect}
          onAddRoom={onAddSpace}
          onToggleGrid={onToggleGrid}
          onDeleteSelected={onDeleteSelected}
        />
      )
    }

    if (mode === '3d') {
      return (
        <ThreeDSidebarTools
          selectedTool={selectedTool}
          isLibraryOpen={isLibraryOpen}
          hasDeletableSelection={hasDeletableSelection}
          isDeleteActionLocked={isDeleteActionLocked}
          onToolSelect={onToolSelect}
          onToggleLibrary={onToggleLibrary}
          onDeleteSelected={onDeleteSelected}
          onExportIFC={onExportIFC}
        />
      )
    }

    return null
  }

  if (isEditorReadOnly) {
    return (
      <SidebarFrame
        footer={
          <ReadOnlySidebarFooter
            mode={mode}
            isCollaborationMode={isCollaborationMode}
            onToggleCollaboration={onToggleCollaboration}
          />
        }
      >
        <ReadOnlySidebarTools
          mode={mode}
          selectedTool={selectedTool}
          isGridVisible={isGridVisible}
          onToolSelect={onToolSelect}
          onToggleGrid={onToggleGrid}
        />
      </SidebarFrame>
    )
  }

  return (
    <SidebarFrame
      footer={
        shouldShowFooterActions ? (
          <SidebarFooterActions
            isCollaborationMode={isCollaborationMode}
            isAgentPanelMode={isAgentPanelMode}
            onToggleCollaboration={onToggleCollaboration}
            onToggleAgentPanel={onToggleAgentPanel}
          />
        ) : undefined
      }
    >
      {renderModeTools()}
    </SidebarFrame>
  )
}

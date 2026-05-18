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
      {mode === 'bubble' && (
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
      )}

      {mode === '2d' && (
        <TwoDSidebarTools
          selectedTool={selectedTool}
          isGridVisible={isGridVisible}
          hasDeletableSelection={hasDeletableSelection}
          isDeleteActionLocked={isDeleteActionLocked}
          onToolSelect={onToolSelect}
          onToggleGrid={onToggleGrid}
          onDeleteSelected={onDeleteSelected}
        />
      )}

      {mode === '3d' && (
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
      )}
    </SidebarFrame>
  )
}

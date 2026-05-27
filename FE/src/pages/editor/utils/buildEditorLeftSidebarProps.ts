import type { EditorPageViewModel } from '../types/editorPageViewModel'
import type { EditorLeftSidebarProps } from '../types/editorLeftSidebarProps'

type SidebarViewModel = Pick<
  EditorPageViewModel,
  | 'mode'
  | 'isLineStyleModalOpen'
  | 'isLibraryOpen'
  | 'isCollaborationMode'
  | 'isAgentPanelMode'
  | 'isGridVisible'
  | 'selectedTool'
  | 'handleSetSelectedTool'
  | 'handleOpenAddModal'
  | 'handleToggleCollaboration'
  | 'handleToggleAgentPanel'
  | 'setIsLibraryOpen'
  | 'toggleGrid'
  | 'handleAutoLayoutBubbles'
  | 'canAutoLayoutBubbles'
  | 'isBubbleReadOnly'
  | 'isEditorReadOnly'
  | 'isDeleteActionLocked'
  | 'hasDeletableSelection'
  | 'handleDeleteSelected'
  | 'handleOpenIFCExportModal'
>

/**
 * EditorPage ViewModel을 좌측 사이드바 전용 props로 매핑한다.
 * 조합 컴포넌트는 배치/렌더링 책임만 갖고, 매핑 책임은 유틸로 분리한다.
 */
export function buildEditorLeftSidebarProps(vm: SidebarViewModel): EditorLeftSidebarProps {
  return {
    mode: vm.mode,
    isLineStyleModalOpen: vm.isLineStyleModalOpen,
    isLibraryOpen: vm.isLibraryOpen,
    isCollaborationMode: vm.isCollaborationMode,
    isAgentPanelMode: vm.isAgentPanelMode,
    isGridVisible: vm.isGridVisible,
    selectedTool: vm.selectedTool,
    onToolSelect: vm.handleSetSelectedTool,
    onAddSpace: vm.handleOpenAddModal,
    onToggleCollaboration: vm.handleToggleCollaboration,
    onToggleAgentPanel: vm.handleToggleAgentPanel,
    onToggleLibrary: () => vm.setIsLibraryOpen(!vm.isLibraryOpen),
    onToggleGrid: vm.toggleGrid,
    onExportIFC: vm.handleOpenIFCExportModal,
    onAutoLayoutBubbles: vm.handleAutoLayoutBubbles,
    canAutoLayoutBubbles: vm.canAutoLayoutBubbles,
    isBubbleReadOnly: vm.isBubbleReadOnly,
    isEditorReadOnly: vm.isEditorReadOnly,
    isDeleteActionLocked: vm.isDeleteActionLocked,
    hasDeletableSelection: vm.hasDeletableSelection,
    onDeleteSelected: vm.handleDeleteSelected,
  }
}

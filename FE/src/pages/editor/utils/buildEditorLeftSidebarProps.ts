import type { EditorPageViewModel } from '../types/editorPageViewModel'
import type { EditorLeftSidebarProps } from '../types/editorLeftSidebarProps'

type SidebarViewModel = Pick<
  EditorPageViewModel,
  | 'mode'
  | 'isLineStyleModalOpen'
  | 'isLibraryOpen'
  | 'isGridVisible'
  | 'selectedTool'
  | 'handleSetSelectedTool'
  | 'handleOpenAddModal'
  | 'handleToggleCollaboration'
  | 'setIsLibraryOpen'
  | 'toggleGrid'
  | 'handleGenerateFloorPlanFromBubble'
  | 'handleAutoLayoutBubbles'
  | 'canGenerateFloorPlanFromBubble'
  | 'canAutoLayoutBubbles'
  | 'isFloorPlanGenerated'
  | 'isBubbleReadOnly'
  | 'isEditorReadOnly'
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
    isGridVisible: vm.isGridVisible,
    selectedTool: vm.selectedTool,
    onToolSelect: vm.handleSetSelectedTool,
    onAddSpace: vm.handleOpenAddModal,
    onToggleCollaboration: vm.handleToggleCollaboration,
    onToggleLibrary: () => vm.setIsLibraryOpen(!vm.isLibraryOpen),
    onToggleGrid: vm.toggleGrid,
    onExportIFC: vm.handleOpenIFCExportModal,
    onAutoLayoutBubbles: vm.handleAutoLayoutBubbles,
    canAutoLayoutBubbles: vm.canAutoLayoutBubbles,
    onGenerateFloorPlan: vm.handleGenerateFloorPlanFromBubble,
    canGenerateFloorPlan: vm.canGenerateFloorPlanFromBubble,
    isFloorPlanGenerated: vm.isFloorPlanGenerated,
    isBubbleReadOnly: vm.isBubbleReadOnly,
    isEditorReadOnly: vm.isEditorReadOnly,
    hasDeletableSelection: vm.hasDeletableSelection,
    onDeleteSelected: vm.handleDeleteSelected,
  }
}

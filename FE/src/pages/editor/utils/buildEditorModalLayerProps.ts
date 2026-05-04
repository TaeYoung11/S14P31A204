import type { EditorPageViewModel } from '../types/editorPageViewModel'
import type { EditorModalLayerProps } from '../types/editorModalLayerProps'

type ModalLayerViewModel = Pick<
  EditorPageViewModel,
  | 'isAddModalOpen'
  | 'addSpaceFormData'
  | 'onCloseAddModal'
  | 'handleConfirmAddSpace'
  | 'setAddSpaceFormData'
  | 'isZoningModalOpen'
  | 'editingZoneId'
  | 'zoningFormData'
  | 'bubbles'
  | 'zoningAutoColorPreview'
  | 'closeZoningModal'
  | 'confirmZoningModal'
  | 'setZoningFormData'
  | 'toggleZoningBubble'
  | 'isLineStyleModalOpen'
  | 'lineConnectionPair'
  | 'selectedLineStyle'
  | 'closeLineStyleModal'
  | 'confirmLineStyleModal'
  | 'setSelectedStyle'
  | 'getBubbleLabel'
  | 'isInviteModalOpen'
  | 'onCloseInviteModal'
  | 'projectId'
  | 'isNotificationModalOpen'
  | 'onCloseNotificationModal'
  | 'isExportModalOpen'
  | 'onCloseExportModal'
  | 'isExportSelectionModalOpen'
  | 'onCloseExportSelectionModal'
  | 'handleOpenExportModal'
  | 'isIFCExportModalOpen'
  | 'onCloseIFCExportModal'
>

/**
 * EditorPage ViewModel을 모달 레이어 전용 props로 매핑한다.
 * 조합 컴포넌트는 배치/렌더링 책임만 갖고, 매핑 책임은 유틸로 분리한다.
 */
export function buildEditorModalLayerProps(vm: ModalLayerViewModel): EditorModalLayerProps {
  return {
    isAddModalOpen: vm.isAddModalOpen,
    addSpaceFormData: vm.addSpaceFormData,
    onCloseAddModal: vm.onCloseAddModal,
    onConfirmAddSpace: vm.handleConfirmAddSpace,
    onChangeAddSpaceFormData: vm.setAddSpaceFormData,

    isZoningModalOpen: vm.isZoningModalOpen,
    editingZoneId: vm.editingZoneId,
    zoningFormData: vm.zoningFormData,
    bubbles: vm.bubbles,
    zoningAutoColorPreview: vm.zoningAutoColorPreview,
    onCloseZoningModal: vm.closeZoningModal,
    onConfirmZoningModal: vm.confirmZoningModal,
    onChangeZoningFormData: vm.setZoningFormData,
    onToggleZoningBubble: vm.toggleZoningBubble,

    isLineStyleModalOpen: vm.isLineStyleModalOpen,
    lineConnectionPair: vm.lineConnectionPair,
    selectedLineStyle: vm.selectedLineStyle,
    onCloseLineStyleModal: vm.closeLineStyleModal,
    onConfirmLineStyleModal: vm.confirmLineStyleModal,
    onChangeSelectedLineStyle: vm.setSelectedStyle,
    getBubbleLabel: vm.getBubbleLabel,

    isInviteModalOpen: vm.isInviteModalOpen,
    onCloseInviteModal: vm.onCloseInviteModal,
    currentProjectId: vm.projectId,

    isNotificationModalOpen: vm.isNotificationModalOpen,
    onCloseNotificationModal: vm.onCloseNotificationModal,

    isExportModalOpen: vm.isExportModalOpen,
    onCloseExportModal: vm.onCloseExportModal,

    isExportSelectionModalOpen: vm.isExportSelectionModalOpen,
    onCloseExportSelectionModal: vm.onCloseExportSelectionModal,
    onOpenExportModal: vm.handleOpenExportModal,

    isIFCExportModalOpen: vm.isIFCExportModalOpen,
    onCloseIFCExportModal: vm.onCloseIFCExportModal,
  }
}

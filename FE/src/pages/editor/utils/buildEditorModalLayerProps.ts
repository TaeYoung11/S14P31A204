import type { EditorPageViewModel } from '../types/editorPageViewModel'
import type { EditorModalLayerProps } from '../types/editorModalLayerProps'

type ModalLayerViewModel = Pick<
  EditorPageViewModel,
  | 'isGenerate3DModalOpen'
  | 'handleCloseGenerate3DModal'
  | 'handleConfirmGenerate3D'
  | 'isAddModalOpen'
  | 'activeBubbleFloor'
  | 'addSpaceFormData'
  | 'onCloseAddModal'
  | 'handleConfirmAddSpace'
  | 'setAddSpaceFormData'
  | 'isZoningModalOpen'
  | 'editingZoneId'
  | 'zoningFormData'
  | 'zoningValidationMessage'
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
  | 'ifcElementChanges'
  | 'currentIfcUrl'
  | 'currentIfcAssetId'
>

type ModalLayerPropsSubset<K extends keyof EditorModalLayerProps> = Pick<EditorModalLayerProps, K>

/**
 * 공간 추가 + 조닝 모달 관련 props를 매핑한다.
 */
function buildSpaceAndZoningModalProps(
  vm: ModalLayerViewModel,
): ModalLayerPropsSubset<
  | 'isAddModalOpen'
  | 'activeBubbleFloor'
  | 'addSpaceFormData'
  | 'onCloseAddModal'
  | 'onConfirmAddSpace'
  | 'onChangeAddSpaceFormData'
  | 'isZoningModalOpen'
  | 'editingZoneId'
  | 'zoningFormData'
  | 'zoningValidationMessage'
  | 'bubbles'
  | 'zoningAutoColorPreview'
  | 'onCloseZoningModal'
  | 'onConfirmZoningModal'
  | 'onChangeZoningFormData'
  | 'onToggleZoningBubble'
> {
  return {
    isAddModalOpen: vm.isAddModalOpen,
    activeBubbleFloor: vm.activeBubbleFloor,
    addSpaceFormData: vm.addSpaceFormData,
    onCloseAddModal: vm.onCloseAddModal,
    onConfirmAddSpace: vm.handleConfirmAddSpace,
    onChangeAddSpaceFormData: vm.setAddSpaceFormData,
    isZoningModalOpen: vm.isZoningModalOpen,
    editingZoneId: vm.editingZoneId,
    zoningFormData: vm.zoningFormData,
    zoningValidationMessage: vm.zoningValidationMessage,
    bubbles: vm.bubbles,
    zoningAutoColorPreview: vm.zoningAutoColorPreview,
    onCloseZoningModal: vm.closeZoningModal,
    onConfirmZoningModal: vm.confirmZoningModal,
    onChangeZoningFormData: vm.setZoningFormData,
    onToggleZoningBubble: vm.toggleZoningBubble,
  }
}

/**
 * 선 스타일/초대/알림 모달 관련 props를 매핑한다.
 */
function buildLineAndInviteModalProps(
  vm: ModalLayerViewModel,
): ModalLayerPropsSubset<
  | 'isLineStyleModalOpen'
  | 'lineConnectionPair'
  | 'selectedLineStyle'
  | 'onCloseLineStyleModal'
  | 'onConfirmLineStyleModal'
  | 'onChangeSelectedLineStyle'
  | 'getBubbleLabel'
  | 'isInviteModalOpen'
  | 'onCloseInviteModal'
  | 'currentProjectId'
  | 'isNotificationModalOpen'
  | 'onCloseNotificationModal'
> {
  return {
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
  }
}

/**
 * 내보내기 모달(IFC 포함) 관련 props를 매핑한다.
 */
function buildExportModalProps(
  vm: ModalLayerViewModel,
): ModalLayerPropsSubset<
  | 'isExportModalOpen'
  | 'onCloseExportModal'
  | 'isExportSelectionModalOpen'
  | 'onCloseExportSelectionModal'
  | 'onOpenExportModal'
  | 'isIFCExportModalOpen'
  | 'onCloseIFCExportModal'
  | 'ifcElementChanges'
  | 'currentIfcUrl'
  | 'currentIfcAssetId'
> {
  return {
    isExportModalOpen: vm.isExportModalOpen,
    onCloseExportModal: vm.onCloseExportModal,
    isExportSelectionModalOpen: vm.isExportSelectionModalOpen,
    onCloseExportSelectionModal: vm.onCloseExportSelectionModal,
    onOpenExportModal: vm.handleOpenExportModal,
    isIFCExportModalOpen: vm.isIFCExportModalOpen,
    onCloseIFCExportModal: vm.onCloseIFCExportModal,
    ifcElementChanges: vm.ifcElementChanges,
    currentIfcUrl: vm.currentIfcUrl,
    currentIfcAssetId: vm.currentIfcAssetId,
  }
}

/**
 * 3D 생성 모달 관련 props를 매핑한다.
 */
function buildGenerateThreeDModalProps(
  vm: ModalLayerViewModel,
): ModalLayerPropsSubset<'isGenerate3DModalOpen' | 'onCloseGenerate3DModal' | 'onConfirmGenerate3D'> {
  return {
    isGenerate3DModalOpen: vm.isGenerate3DModalOpen,
    onCloseGenerate3DModal: vm.handleCloseGenerate3DModal,
    onConfirmGenerate3D: vm.handleConfirmGenerate3D,
  }
}

/**
 * EditorPage ViewModel을 모달 레이어 전용 props로 매핑한다.
 * 조합 컴포넌트는 배치/렌더링 책임만 갖고, 매핑 책임은 유틸로 분리한다.
 */
export function buildEditorModalLayerProps(vm: ModalLayerViewModel): EditorModalLayerProps {
  return {
    ...buildSpaceAndZoningModalProps(vm),
    ...buildLineAndInviteModalProps(vm),
    ...buildExportModalProps(vm),
    ...buildGenerateThreeDModalProps(vm),
  }
}

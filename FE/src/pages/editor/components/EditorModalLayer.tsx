import type { EditorModalLayerProps } from '../types/editorModalLayerProps'
import { Generate3DModal } from '@/features/editor/components/modals/Generate3DModal'
import ExportModals from './modal-sections/ExportModals'
import LineAndInviteModals from './modal-sections/LineAndInviteModals'
import SpaceAndZoningModals from './modal-sections/SpaceAndZoningModals'

/**
 * 공간/조닝 모달 블록 입력 props를 구성한다.
 */
function buildSpaceAndZoningModalProps(props: EditorModalLayerProps) {
  return {
    isAddModalOpen: props.isAddModalOpen,
    activeBubbleFloor: props.activeBubbleFloor,
    addSpaceFormData: props.addSpaceFormData,
    onCloseAddModal: props.onCloseAddModal,
    onConfirmAddSpace: props.onConfirmAddSpace,
    onChangeAddSpaceFormData: props.onChangeAddSpaceFormData,
    isZoningModalOpen: props.isZoningModalOpen,
    editingZoneId: props.editingZoneId,
    zoningFormData: props.zoningFormData,
    bubbles: props.bubbles,
    zoningAutoColorPreview: props.zoningAutoColorPreview,
    onCloseZoningModal: props.onCloseZoningModal,
    onConfirmZoningModal: props.onConfirmZoningModal,
    onChangeZoningFormData: props.onChangeZoningFormData,
    onToggleZoningBubble: props.onToggleZoningBubble,
  }
}

/**
 * 선 스타일/초대/알림 모달 블록 입력 props를 구성한다.
 */
function buildLineAndInviteModalProps(props: EditorModalLayerProps) {
  return {
    isLineStyleModalOpen: props.isLineStyleModalOpen,
    lineConnectionPair: props.lineConnectionPair,
    selectedLineStyle: props.selectedLineStyle,
    onCloseLineStyleModal: props.onCloseLineStyleModal,
    onConfirmLineStyleModal: props.onConfirmLineStyleModal,
    onChangeSelectedLineStyle: props.onChangeSelectedLineStyle,
    getBubbleLabel: props.getBubbleLabel,
    isInviteModalOpen: props.isInviteModalOpen,
    onCloseInviteModal: props.onCloseInviteModal,
    currentProjectId: props.currentProjectId,
    isNotificationModalOpen: props.isNotificationModalOpen,
    onCloseNotificationModal: props.onCloseNotificationModal,
  }
}

/**
 * 내보내기 모달 블록 입력 props를 구성한다.
 */
function buildExportModalProps(props: EditorModalLayerProps) {
  return {
    isExportModalOpen: props.isExportModalOpen,
    onCloseExportModal: props.onCloseExportModal,
    isExportSelectionModalOpen: props.isExportSelectionModalOpen,
    onCloseExportSelectionModal: props.onCloseExportSelectionModal,
    onOpenExportModal: props.onOpenExportModal,
    isIFCExportModalOpen: props.isIFCExportModalOpen,
    onCloseIFCExportModal: props.onCloseIFCExportModal,
    ifcElementChanges: props.ifcElementChanges,
    currentIfcUrl: props.currentIfcUrl,
    currentIfcAssetId: props.currentIfcAssetId,
  }
}

/**
 * EditorPage 상단 모달 레이어.
 * 화면 모드와 무관한 공통 모달을 한 곳에서 렌더링한다.
 */
export default function EditorModalLayer(props: EditorModalLayerProps) {
  const spaceAndZoningModalProps = buildSpaceAndZoningModalProps(props)
  const lineAndInviteModalProps = buildLineAndInviteModalProps(props)
  const exportModalProps = buildExportModalProps(props)

  return (
    <>
      {props.isGenerate3DModalOpen && (
        <Generate3DModal
          isOpen={props.isGenerate3DModalOpen}
          onClose={props.onCloseGenerate3DModal}
          onConfirm={props.onConfirmGenerate3D}
        />
      )}

      <SpaceAndZoningModals {...spaceAndZoningModalProps} />

      <LineAndInviteModals {...lineAndInviteModalProps} />

      <ExportModals {...exportModalProps} />
    </>
  )
}

import type { ModalLayerProps } from '../types/editorModalLayerProps'
import ExportModals from './modal-sections/ExportModals'
import LineAndInviteModals from './modal-sections/LineAndInviteModals'
import SpaceAndZoningModals from './modal-sections/SpaceAndZoningModals'

/**
 * EditorPage 상단 모달 레이어.
 * 화면 모드와 무관한 공통 모달을 한 곳에서 렌더링한다.
 */
export default function EditorModalLayer({
  isAddModalOpen,
  addSpaceFormData,
  onCloseAddModal,
  onConfirmAddSpace,
  onChangeAddSpaceFormData,
  isZoningModalOpen,
  editingZoneId,
  zoningFormData,
  bubbles,
  zoningAutoColorPreview,
  onCloseZoningModal,
  onConfirmZoningModal,
  onChangeZoningFormData,
  onToggleZoningBubble,
  isLineStyleModalOpen,
  lineConnectionPair,
  selectedLineStyle,
  onCloseLineStyleModal,
  onConfirmLineStyleModal,
  onChangeSelectedLineStyle,
  getBubbleLabel,
  isInviteModalOpen,
  onCloseInviteModal,
  isExportModalOpen,
  onCloseExportModal,
  isExportSelectionModalOpen,
  onCloseExportSelectionModal,
  onOpenExportModal,
  isIFCExportModalOpen,
  onCloseIFCExportModal,
  ifcElementChanges,
}: ModalLayerProps) {
  return (
    <>
      <SpaceAndZoningModals
        isAddModalOpen={isAddModalOpen}
        addSpaceFormData={addSpaceFormData}
        onCloseAddModal={onCloseAddModal}
        onConfirmAddSpace={onConfirmAddSpace}
        onChangeAddSpaceFormData={onChangeAddSpaceFormData}
        isZoningModalOpen={isZoningModalOpen}
        editingZoneId={editingZoneId}
        zoningFormData={zoningFormData}
        bubbles={bubbles}
        zoningAutoColorPreview={zoningAutoColorPreview}
        onCloseZoningModal={onCloseZoningModal}
        onConfirmZoningModal={onConfirmZoningModal}
        onChangeZoningFormData={onChangeZoningFormData}
        onToggleZoningBubble={onToggleZoningBubble}
      />

      <LineAndInviteModals
        isLineStyleModalOpen={isLineStyleModalOpen}
        lineConnectionPair={lineConnectionPair}
        selectedLineStyle={selectedLineStyle}
        onCloseLineStyleModal={onCloseLineStyleModal}
        onConfirmLineStyleModal={onConfirmLineStyleModal}
        onChangeSelectedLineStyle={onChangeSelectedLineStyle}
        getBubbleLabel={getBubbleLabel}
        isInviteModalOpen={isInviteModalOpen}
        onCloseInviteModal={onCloseInviteModal}
      />

      <ExportModals
        isExportModalOpen={isExportModalOpen}
        onCloseExportModal={onCloseExportModal}
        isExportSelectionModalOpen={isExportSelectionModalOpen}
        onCloseExportSelectionModal={onCloseExportSelectionModal}
        onOpenExportModal={onOpenExportModal}
        isIFCExportModalOpen={isIFCExportModalOpen}
        onCloseIFCExportModal={onCloseIFCExportModal}
        ifcElementChanges={ifcElementChanges}
      />
    </>
  )
}

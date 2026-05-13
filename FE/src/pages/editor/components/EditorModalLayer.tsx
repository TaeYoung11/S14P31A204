import type { EditorModalLayerProps } from '../types/editorModalLayerProps'
import { Generate3DModal } from '@/features/editor/components/modals/Generate3DModal'
import ExportModals from './modal-sections/ExportModals'
import LineAndInviteModals from './modal-sections/LineAndInviteModals'
import SpaceAndZoningModals from './modal-sections/SpaceAndZoningModals'

/**
 * EditorPage 상단 모달 레이어.
 * 화면 모드와 무관한 공통 모달을 한 곳에서 렌더링한다.
 */
export default function EditorModalLayer({
  isGenerate3DModalOpen,
  onCloseGenerate3DModal,
  onConfirmGenerate3D,
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
  currentProjectId,
  isNotificationModalOpen,
  onCloseNotificationModal,
  isExportModalOpen,
  onCloseExportModal,
  isExportSelectionModalOpen,
  onCloseExportSelectionModal,
  onOpenExportModal,
  isIFCExportModalOpen,
  onCloseIFCExportModal,
  ifcElementChanges,
  currentIfcUrl,
  currentIfcAssetId,
}: EditorModalLayerProps) {
  return (
    <>
      {isGenerate3DModalOpen && (
        <Generate3DModal
          isOpen={isGenerate3DModalOpen}
          onClose={onCloseGenerate3DModal}
          onConfirm={onConfirmGenerate3D}
        />
      )}

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
        currentProjectId={currentProjectId}
        isNotificationModalOpen={isNotificationModalOpen}
        onCloseNotificationModal={onCloseNotificationModal}
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
        currentIfcUrl={currentIfcUrl}
        currentIfcAssetId={currentIfcAssetId}
      />
    </>
  )
}

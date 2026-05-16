import { AddSpaceModal } from '@/features/editor/components/modals/AddSpaceModal'
import { ZoningModal } from '@/features/editor/components/modals/ZoningModal'
import type { EditorModalLayerProps } from '../../types/editorModalLayerProps'

type SpaceAndZoningModalsProps = Pick<
  EditorModalLayerProps,
  | 'isAddModalOpen'
  | 'activeBubbleFloor'
  | 'addSpaceFormData'
  | 'onCloseAddModal'
  | 'onConfirmAddSpace'
  | 'onChangeAddSpaceFormData'
  | 'isZoningModalOpen'
  | 'editingZoneId'
  | 'zoningFormData'
  | 'bubbles'
  | 'zoningAutoColorPreview'
  | 'onCloseZoningModal'
  | 'onConfirmZoningModal'
  | 'onChangeZoningFormData'
  | 'onToggleZoningBubble'
>

/** 공간 추가/조닝 관련 모달 묶음 */
export default function SpaceAndZoningModals({
  isAddModalOpen,
  activeBubbleFloor,
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
}: SpaceAndZoningModalsProps) {
  return (
    <>
      <AddSpaceModal
        isOpen={isAddModalOpen}
        activeFloorNumber={activeBubbleFloor}
        formData={addSpaceFormData}
        onClose={onCloseAddModal}
        onConfirm={onConfirmAddSpace}
        onChange={onChangeAddSpaceFormData}
      />

      <ZoningModal
        isOpen={isZoningModalOpen}
        isEditing={Boolean(editingZoneId)}
        activeFloorNumber={activeBubbleFloor}
        formData={zoningFormData}
        bubbles={bubbles}
        autoColorPreview={zoningAutoColorPreview}
        onClose={onCloseZoningModal}
        onConfirm={onConfirmZoningModal}
        onChange={onChangeZoningFormData}
        onToggleBubble={onToggleZoningBubble}
      />
    </>
  )
}

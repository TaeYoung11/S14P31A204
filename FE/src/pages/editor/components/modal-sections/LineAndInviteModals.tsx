import { InviteModal } from '@/features/editor/components/modals/InviteModal'
import { LineStyleModal } from '@/features/editor/components/modals/LineStyleModal'
import type { EditorModalLayerProps } from '../../types/editorModalLayerProps'

type LineAndInviteModalsProps = Pick<
  EditorModalLayerProps,
  | 'isLineStyleModalOpen'
  | 'lineConnectionPair'
  | 'selectedLineStyle'
  | 'onCloseLineStyleModal'
  | 'onConfirmLineStyleModal'
  | 'onChangeSelectedLineStyle'
  | 'getBubbleLabel'
  | 'isInviteModalOpen'
  | 'onCloseInviteModal'
>

/** 선 스타일/초대 관련 모달 묶음 */
export default function LineAndInviteModals({
  isLineStyleModalOpen,
  lineConnectionPair,
  selectedLineStyle,
  onCloseLineStyleModal,
  onConfirmLineStyleModal,
  onChangeSelectedLineStyle,
  getBubbleLabel,
  isInviteModalOpen,
  onCloseInviteModal,
}: LineAndInviteModalsProps) {
  return (
    <>
      <LineStyleModal
        isOpen={isLineStyleModalOpen}
        lineConnectionPair={lineConnectionPair}
        selectedStyle={selectedLineStyle}
        onClose={onCloseLineStyleModal}
        onConfirm={onConfirmLineStyleModal}
        onChangeStyle={onChangeSelectedLineStyle}
        getBubbleLabel={getBubbleLabel}
      />

      <InviteModal
        isOpen={isInviteModalOpen}
        onClose={onCloseInviteModal}
        onInvite={onCloseInviteModal}
      />
    </>
  )
}


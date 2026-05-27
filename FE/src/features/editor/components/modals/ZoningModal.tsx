import type { BubbleData, ZoningFormData } from '../../types'
import EditorModal from '../shared/EditorModal'
import { normalizeBubbleFloor } from '../../utils/bubbleFloorUtils'
import {
  ZoningBasicSection,
  ZoningBubblePickerSection,
} from './sections/ZoningModalSections'

interface ZoningModalProps {
  isOpen: boolean
  isEditing: boolean
  activeFloorNumber: number
  formData: ZoningFormData
  validationMessage?: string | null
  bubbles: BubbleData[]
  autoColorPreview: string
  onClose: () => void
  onConfirm: () => void
  onChange: (next: ZoningFormData) => void
  onToggleBubble: (bubbleId: string) => void
}

/** 조닝 생성/수정 모달 */
export function ZoningModal({
  isOpen,
  isEditing,
  activeFloorNumber,
  formData,
  validationMessage,
  bubbles,
  autoColorPreview,
  onClose,
  onConfirm,
  onChange,
  onToggleBubble,
}: ZoningModalProps) {
  const floorBubbles = bubbles.filter(
    (bubble) => normalizeBubbleFloor(bubble.floor) === normalizeBubbleFloor(activeFloorNumber),
  )
  const selectedCount = floorBubbles.filter((bubble) => formData.bubbleIds.includes(bubble.id)).length

  return (
    <EditorModal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? '조닝 영역 수정' : '조닝 영역 추가'}
      subtitle={isEditing
        ? `선택된 조닝의 속성을 수정합니다. (대상 층: ${activeFloorNumber}층)`
        : `공간을 묶어 투명 조닝 영역을 생성합니다. (대상 층: ${activeFloorNumber}층)`}
      confirmLabel={isEditing ? '조닝 수정하기' : '조닝 생성하기'}
      onConfirm={onConfirm}
      confirmDisabled={selectedCount === 0}
    >
      <ZoningBasicSection
        formData={formData}
        autoColorPreview={autoColorPreview}
        onChange={onChange}
      />
      <ZoningBubblePickerSection
        floorBubbles={floorBubbles}
        selectedBubbleIds={formData.bubbleIds}
        selectedCount={selectedCount}
        validationMessage={validationMessage}
        onToggleBubble={onToggleBubble}
      />
    </EditorModal>
  )
}

import type { AddSpaceFormData, BubbleData, ZoningFormData, ConnectionStyle } from '@/features/editor/types'

/** EditorPage 모달 레이어에 전달하는 props 타입 */
export interface EditorModalLayerProps {
  isAddModalOpen: boolean
  addSpaceFormData: AddSpaceFormData
  onCloseAddModal: () => void
  onConfirmAddSpace: () => void
  onChangeAddSpaceFormData: (next: AddSpaceFormData) => void

  isZoningModalOpen: boolean
  editingZoneId: string | null
  zoningFormData: ZoningFormData
  bubbles: BubbleData[]
  zoningAutoColorPreview: string
  onCloseZoningModal: () => void
  onConfirmZoningModal: () => void
  onChangeZoningFormData: (next: ZoningFormData) => void
  onToggleZoningBubble: (bubbleId: string) => void

  isLineStyleModalOpen: boolean
  lineConnectionPair: { from: string; to: string } | null
  selectedLineStyle: ConnectionStyle
  onCloseLineStyleModal: () => void
  onConfirmLineStyleModal: () => void
  onChangeSelectedLineStyle: (style: ConnectionStyle) => void
  getBubbleLabel: (bubbleId: string) => string

  isInviteModalOpen: boolean
  onCloseInviteModal: () => void

  isExportModalOpen: boolean
  onCloseExportModal: () => void

  isExportSelectionModalOpen: boolean
  onCloseExportSelectionModal: () => void
  onOpenExportModal: () => void

  isIFCExportModalOpen: boolean
  onCloseIFCExportModal: () => void
}

/** 기존 참조와의 호환을 위한 별칭 */
export type ModalLayerProps = EditorModalLayerProps

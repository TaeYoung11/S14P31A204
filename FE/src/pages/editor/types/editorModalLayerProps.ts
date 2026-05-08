/**
 * editorModalLayerProps — EditorPage 모달 레이어 props 타입 계약
 *
 * EditorModalLayer 컴포넌트가 받는 전체 모달 상태 및 핸들러를 정의한다.
 * buildEditorModalLayerProps 유틸이 EditorPageViewModel → EditorModalLayerProps 변환을 담당한다.
 */
import type { AddSpaceFormData, BubbleData, ZoningFormData, ConnectionStyle, IfcElementChange } from '@/features/editor/types'

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
  currentProjectId: string | undefined

  isNotificationModalOpen: boolean
  onCloseNotificationModal: () => void

  isExportModalOpen: boolean
  onCloseExportModal: () => void

  isExportSelectionModalOpen: boolean
  onCloseExportSelectionModal: () => void
  onOpenExportModal: () => void

  isIFCExportModalOpen: boolean
  onCloseIFCExportModal: () => void
  ifcElementChanges: IfcElementChange[]

  isGenerate3DModalOpen: boolean
  onCloseGenerate3DModal: () => void
  onConfirmGenerate3D: (storyHeightMm: number) => void
}


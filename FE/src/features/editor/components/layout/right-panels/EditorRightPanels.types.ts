import type { MouseEvent as ReactMouseEvent } from 'react'
import type {
  CollaborationUserType,
  EditorMode,
  FloorCommentAttachmentInput,
  FloorCommentNotification,
  FloorCommentPin,
  FloorLayer,
  FloorOpening,
  FloorWall,
  IfcElementChange,
  IfcElementInfo,
  PanelKey,
  PanelOffset,
  PanelResizeAxis,
  ZoneData,
} from '@/features/editor/types'
import type { IfcStoreyInfo } from '@/features/editor/components/canvas/thatopen/ifcPropertyParser'
import type { ThreeDLibraryPreset } from '@/features/editor/components/canvas/threeDLibrary.types'
import type { LlmEditPreview, LlmEditStatus } from '@/features/editor/types/llmEdit.types'
import type { BubbleConnectionInfo, BubbleInfo, BubbleZoneInfo } from '@/features/editor/components/panels/BubbleAttributePanel'

/**
 * 우측 패널 조합 입력 속성
 * - 협업/속성/조닝/어시스턴트/플로어 관련 상태와 핸들러를 포함한다.
 */
export interface EditorRightPanelsProps {
  mode: EditorMode
  isCollaborationMode?: boolean
  collaborationTab?: 'history' | 'thread'
  onCollaborationTabChange?: (tab: 'history' | 'thread') => void
  selectedPinId?: string | null
  selectedPin?: FloorCommentPin | null
  commentPins?: FloorCommentPin[]
  commentNotifications?: FloorCommentNotification[]
  unreadCommentNotifications?: FloorCommentNotification[]
  currentCollaborationUserType?: CollaborationUserType
  currentCollaborationUserName?: string
  onSelectPin?: (id: string) => void
  onCreateCommentReply?: (pinId: string, content: string, attachments?: FloorCommentAttachmentInput[]) => void
  selectedBubble: BubbleInfo | null
  selectedWall?: FloorWall | null
  selectedOpening?: FloorOpening | null
  selectedIfcElement?: IfcElementInfo | null
  ifcElementChanges?: IfcElementChange[]
  selectedBubbleConnections: BubbleConnectionInfo[]
  selectedBubbleZones: BubbleZoneInfo[]
  zoningListItems: ZoneData[]
  panelOffsets: Record<PanelKey, PanelOffset>
  panelOpenState: Record<PanelKey, boolean>
  panelHeights: Record<PanelKey, number>
  panelWidths: Record<PanelKey, number>
  panelZIndexes: Record<PanelKey, number>
  onLabelChange: (id: string, label: string) => void
  onTypeChange: (id: string, type: string) => void
  onWidthChange: (id: string, width: number) => void
  onHeightChange: (id: string, height: number) => void
  onThicknessChange?: (id: string, thickness: number) => void
  onWidthCommit?: (id: string, width: number) => void
  onHeightCommit?: (id: string, height: number) => void
  onRatioChange: (id: string, ratio: number) => void
  onColorChange: (id: string, color: string) => void
  onMaterialChange?: (id: string, material: string) => void
  onWallTypeChange?: (id: string, type: FloorWall['type']) => void
  onWallThicknessChange?: (id: string, thicknessMm: number) => void
  onWallHeightChange?: (id: string, heightMm: number) => void
  onWallMaterialChange?: (id: string, material: string) => void
  onOpeningSizeChange?: (id: string, widthMm: number, heightMm: number) => void
  onWindowSillHeightChange?: (id: string, sillHeightMm: number) => void
  onDoorSwingDirectionChange?: (id: string, swingDirection: NonNullable<FloorOpening['doorSwingDirection']>) => void
  onDoorHingeSideChange?: (id: string, hingeSide: NonNullable<FloorOpening['doorHingeSide']>) => void
  floorLayers?: FloorLayer[]
  activeFloorLayerId?: string | null
  isFloorPlanGenerated?: boolean
  isLayerOverlayMode?: boolean
  selectedOverlayLayerIds?: string[]
  overlayOpacityByLayerId?: Record<string, number>
  onAddFloorLayer?: () => void
  onRenameFloorLayer?: (layerId: string, name: string) => void
  onDeleteFloorLayer?: (layerId: string) => void
  onSelectFloorLayer?: (id: string) => void
  /** IFC 기반 3D에서 파싱된 건물 층 목록 */
  ifcStoreys?: IfcStoreyInfo[]
  /** 씬에 배치된 3D 라이브러리 요소 목록 */
  libraryElements?: ThreeDLibraryPreset[]
  /** IFC 모드에서 현재 선택된 층 expressId의 문자열 표현 */
  activeIfcStoreyId?: string | null
  /** IFC 층 선택 핸들러 */
  onSelectIfcStorey?: (id: string) => void
  /** IFC 겹쳐보기 중인 층 expressId 목록 */
  overlayIfcStoreyExpressIds?: number[]
  /** IFC 층 겹쳐보기 토글 핸들러 */
  onToggleIfcStoreyOverlay?: (id: string) => void
  /** 3D 계층구조 요소(localId) 선택 핸들러 */
  onSelectIfcElementByLocalId?: (localId: number) => void
  /** 3D 계층구조 라이브러리 요소 선택 핸들러 */
  onSelectLibraryElementById?: (id: string) => void
  onToggleLayerOverlayMode?: () => void
  onToggleOverlayLayer?: (layerId: string) => void
  onChangeOverlayLayerOpacity?: (layerId: string, opacity: number) => void
  onOpenZoningModal: () => void
  onOpenEditZoningModal: (zone: ZoneData) => void
  onDeleteZoning: (zoneId: string) => void
  llmProvider: 'mock' | 'api'
  llmPrompt: string
  llmStatus: LlmEditStatus
  llmIsLoading: boolean
  llmMessage: string
  llmSuggestions: string[]
  llmPreview: LlmEditPreview | null
  llmCanRun: boolean
  onLlmPromptChange: (value: string) => void
  onRunLlmEdit: () => void
  onApplyLlmEdit: () => void
  onDiscardLlmEdit: () => void
  floorProjectImportMessage: string
  onImportFloorProjectIfc: (rawIfc: string, sourceName: string) => Promise<void>
  onPanelDragStart: (panelKey: PanelKey, event: ReactMouseEvent<HTMLElement>) => void
  onPanelResizeStart: (panelKey: PanelKey, axis: PanelResizeAxis, event: ReactMouseEvent<HTMLButtonElement>) => void
  onTogglePanel: (panelKey: PanelKey) => void
  onResetPanelPositions?: () => void
}

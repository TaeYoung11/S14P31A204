import type { MouseEvent as ReactMouseEvent } from 'react'
import type {
  CollaborationUserType,
  BubbleFloor,
  BubbleFloorSummary,
  EditorMode,
  FloorCommentNotification,
  FloorCommentPin,
  FloorLayer,
  FloorOpening,
  FloorRoom,
  FloorWall,
  IfcElementInfo,
  PanelKey,
  PanelOffset,
  PanelResizeAxis,
  ZoneData,
} from '@/features/editor/types'
import type { ClarificationAlternative, ClarificationArtifact, LlmChatLogItem, LlmEditPreview, LlmEditStatus } from '@/features/editor/types/llmEdit.types'
import type { BubbleConnectionInfo, BubbleInfo, BubbleZoneInfo } from '@/features/editor/components/panels/BubbleAttributePanel'

/**
 * 우측 패널 조합 입력 속성
 * - 협업/속성/조닝/어시스턴트/플로어 관련 상태와 핸들러를 포함한다.
 */
export interface EditorRightPanelsProps {
  mode: EditorMode
  isCollaborationMode?: boolean
  isAgentPanelMode?: boolean
  selectedPinId?: string | null
  selectedPin?: FloorCommentPin | null
  commentPins?: FloorCommentPin[]
  commentNotifications?: FloorCommentNotification[]
  currentCollaborationUserType?: CollaborationUserType
  currentCollaborationUserId?: string | null
  currentCollaborationUserName: string
  onSelectPin?: (id: string) => void
  onCreateCommentReply?: (pinId: string, content: string) => void
  onResolvePin?: (pinId: string) => void
  onDeletePin?: (pinId: string) => void
  onResolveComment?: (pinId: string, commentId: string) => void
  resolvingPinId?: string | null
  deletingPinId?: string | null
  resolvingCommentId?: string | null
  selectedBubble: BubbleInfo | null
  isThreeDEditingLocked?: boolean
  selectedWall?: FloorWall | null
  selectedOpening?: FloorOpening | null
  selectedIfcElement?: IfcElementInfo | null
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
  onPositionChange?: (id: string, axis: 'x' | 'y' | 'z', value: number) => void
  onRotationChange?: (id: string, axis: 'x' | 'y' | 'z', degrees: number) => void
  onRoofShapeChange?: (id: string, shape: 'flat' | 'gable') => void
  onWidthCommit?: (id: string, width: number) => void
  onHeightCommit?: (id: string, height: number) => void
  onRatioChange: (id: string, ratio: number) => void
  onColorChange: (id: string, color: string) => void
  onBubbleFloorChange?: (id: string, floor: number) => void
  bubbleFloors?: BubbleFloor[]
  bubbleFloorSummaries?: BubbleFloorSummary[]
  activeBubbleFloor?: number
  onSelectBubbleFloor?: (floor: number) => void
  onAddBubbleFloor?: () => void
  onRenameBubbleFloor?: (floor: number, name: string) => void
  onDeleteBubbleFloor?: (floor: number) => void
  isBubbleReadOnly?: boolean
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
  floorRooms?: FloorRoom[]
  floorWallsForHierarchy?: FloorWall[]
  floorOpenings?: FloorOpening[]
  selectedRoomId?: string | null
  isFloorPlanGenerated?: boolean
  isLayerOverlayMode?: boolean
  selectedOverlayLayerIds?: string[]
  overlayOpacityByLayerId?: Record<string, number>
  onAddFloorLayer?: () => void
  onRenameFloorLayer?: (layerId: string, name: string) => void
  onDeleteFloorLayer?: (layerId: string) => void
  onSelectFloorLayer?: (id: string) => void
  onSelectRoom?: (id: string) => void
  onToggleLayerOverlayMode?: () => void
  onToggleOverlayLayer?: (layerId: string) => void
  onSelectSingleOverlayLayer?: (layerId: string) => void
  onChangeOverlayLayerOpacity?: (layerId: string, opacity: number) => void
  floorWalls?: FloorWall[]
  ifcElementHierarchy?: unknown
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
  selectedWallForChat?: { wallId: string } | null
  llmCanRun: boolean
  llmActiveJobId: string | null
  llmJobProgress: number | null
  llmClarificationArtifact: ClarificationArtifact | null
  llmChatLogs: LlmChatLogItem[]
  llmIsChatLogsLoading: boolean
  onLlmPromptChange: (value: string) => void
  onRunLlmEdit: () => void
  onApplyLlmEdit: () => void
  onDiscardLlmEdit: () => void
  onSelectLlmAlternative: (alternative: ClarificationAlternative) => void
  onClearSelectedWall?: () => void
  floorProjectImportMessage: string
  onImportFloorProjectIfc: (rawIfc: string, sourceName: string) => Promise<void>
  onPanelDragStart: (panelKey: PanelKey, event: ReactMouseEvent<HTMLElement>) => void
  onPanelResizeStart: (panelKey: PanelKey, axis: PanelResizeAxis, event: ReactMouseEvent<HTMLButtonElement>) => void
  onTogglePanel: (panelKey: PanelKey) => void
  onResetPanelPositions?: () => void
}

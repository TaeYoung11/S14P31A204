import type { MouseEvent as ReactMouseEvent } from 'react'
import { RotateCcw } from 'lucide-react'
import type {
  CollaborationUserType,
  FloorCommentAttachmentInput,
  EditorMode,
  FloorCommentNotification,
  FloorCommentPin,
  FloorLayer,
  FloorOpening,
  FloorWall,
  PanelKey,
  PanelOffset,
  PanelResizeAxis,
  ZoneData,
} from '../../types'
import type { LlmEditPreview, LlmEditStatus } from '../../types/llmEdit.types'
import type { BubbleConnectionInfo, BubbleInfo, BubbleZoneInfo } from '../panels/BubbleAttributePanel'
import { CollaborationPanel } from '../panels/CollaborationPanel'
import { AttributesPanel } from '../panels/AttributesPanel'
import { ZoningPanel } from '../panels/ZoningPanel'
import { AssistantPanel } from '../panels/AssistantPanel'
import { FloorViewPanel } from '../panels/FloorViewPanel'
import { HierarchyPanel } from '../panels/HierarchyPanel'

interface EditorRightPanelsProps {
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
  onWidthCommit?: (id: string, width: number) => void
  onHeightCommit?: (id: string, height: number) => void
  onRatioChange: (id: string, ratio: number) => void
  onColorChange: (id: string, color: string) => void
  onMaterialChange?: (id: string, material: string) => void
  onWallTypeChange?: (id: string, type: FloorWall['type']) => void
  onWallThicknessChange?: (id: string, thicknessMm: number) => void
  onWallHeightChange?: (id: string, heightMm: number) => void
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

/** 에디터 우측 패널 영역 — 협업 모드 / 일반 모드 분기 후 각 패널 조합 */
export function EditorRightPanels({
  mode,
  isCollaborationMode,
  collaborationTab,
  onCollaborationTabChange,
  selectedPinId,
  selectedPin,
  commentPins,
  commentNotifications,
  unreadCommentNotifications,
  currentCollaborationUserType,
  currentCollaborationUserName,
  onSelectPin,
  onCreateCommentReply,
  selectedBubble,
  selectedWall,
  selectedOpening,
  selectedBubbleConnections,
  selectedBubbleZones,
  zoningListItems,
  panelOffsets,
  panelOpenState,
  panelHeights,
  panelWidths,
  panelZIndexes,
  onLabelChange,
  onTypeChange,
  onWidthChange,
  onHeightChange,
  onWidthCommit,
  onHeightCommit,
  onRatioChange,
  onColorChange,
  onMaterialChange,
  onWallTypeChange,
  onWallThicknessChange,
  onWallHeightChange,
  onOpeningSizeChange,
  onWindowSillHeightChange,
  onDoorSwingDirectionChange,
  onDoorHingeSideChange,
  floorLayers,
  activeFloorLayerId,
  isFloorPlanGenerated,
  isLayerOverlayMode,
  selectedOverlayLayerIds,
  overlayOpacityByLayerId,
  onAddFloorLayer,
  onRenameFloorLayer,
  onDeleteFloorLayer,
  onSelectFloorLayer,
  onToggleLayerOverlayMode,
  onToggleOverlayLayer,
  onChangeOverlayLayerOpacity,
  onOpenZoningModal,
  onOpenEditZoningModal,
  onDeleteZoning,
  llmPrompt,
  llmProvider,
  llmStatus,
  llmIsLoading,
  llmMessage,
  llmSuggestions,
  llmPreview,
  llmCanRun,
  onLlmPromptChange,
  onRunLlmEdit,
  onApplyLlmEdit,
  onDiscardLlmEdit,
  floorProjectImportMessage,
  onImportFloorProjectIfc,
  onPanelDragStart,
  onPanelResizeStart,
  onTogglePanel,
  onResetPanelPositions,
}: EditorRightPanelsProps) {
  const visiblePanelKeys: PanelKey[] =
    mode === 'bubble'
      ? ['attributes', 'zoning', 'assistant']
      : mode === '3d'
        ? ['attributes', 'floorView', 'hierarchy', 'assistant']
        : mode === '2d'
          ? ['attributes', 'assistant']
          : []

  const hasAnyOpenPanel = visiblePanelKeys.some((key) => panelOpenState[key])
  const rightDockWidthClass = hasAnyOpenPanel ? 'w-[300px]' : 'w-[56px]'

  if (isCollaborationMode && mode !== 'bubble') {
    return (
      <div className="w-[340px] flex flex-col shrink-0 min-h-0 bg-white border border-[#E2E6EF] rounded-2xl shadow-sm overflow-hidden">
        <CollaborationPanel
          activeTab={collaborationTab ?? 'history'}
          onTabChange={onCollaborationTabChange ?? (() => {})}
          selectedPinId={selectedPinId ?? null}
          selectedPin={selectedPin ?? null}
          pins={commentPins ?? []}
          notifications={commentNotifications ?? []}
          unreadNotifications={unreadCommentNotifications ?? []}
          currentUserType={currentCollaborationUserType ?? 'DESIGNER'}
          currentUserName={currentCollaborationUserName ?? '설계자'}
          onSelectPin={onSelectPin ?? (() => {})}
          onCreateCommentReply={onCreateCommentReply ?? (() => {})}
        />
      </div>
    )
  }

  return (
    <div className={`${rightDockWidthClass} relative flex flex-col gap-4 shrink-0 min-h-0 overflow-y-auto overflow-x-visible pb-1 transition-[width] duration-200`}>
      <button
        onClick={onResetPanelPositions}
        className="absolute right-1 top-1 z-20 h-7 w-7 rounded-md border border-[#E2E6EF] bg-white/95 text-[#6F7C96] hover:bg-[#F3F6FD] hover:text-[#3B45B3] transition-colors flex items-center justify-center"
        title="패널 위치 초기화"
        aria-label="패널 위치 초기화"
      >
        <RotateCcw size={13} />
      </button>

      <AttributesPanel
        mode={mode}
        isOpen={panelOpenState.attributes}
        offset={panelOffsets.attributes}
        width={panelWidths.attributes}
        height={panelHeights.attributes}
        zIndex={panelZIndexes.attributes}
        selectedBubble={selectedBubble}
        selectedWall={selectedWall}
        selectedOpening={selectedOpening}
        connections={selectedBubbleConnections}
        zones={selectedBubbleZones}
        onLabelChange={onLabelChange}
        onTypeChange={onTypeChange}
        onWidthChange={onWidthChange}
        onHeightChange={onHeightChange}
        onWidthCommit={onWidthCommit}
        onHeightCommit={onHeightCommit}
        onRatioChange={onRatioChange}
        onColorChange={onColorChange}
        onMaterialChange={onMaterialChange}
        onWallTypeChange={onWallTypeChange}
        onWallThicknessChange={onWallThicknessChange}
        onWallHeightChange={onWallHeightChange}
        onOpeningSizeChange={onOpeningSizeChange}
        onWindowSillHeightChange={onWindowSillHeightChange}
        onDoorSwingDirectionChange={onDoorSwingDirectionChange}
        onDoorHingeSideChange={onDoorHingeSideChange}
        onDragStart={onPanelDragStart}
        onResizeStart={onPanelResizeStart}
        onToggle={onTogglePanel}
      />

      {mode === 'bubble' && (
        <ZoningPanel
          isOpen={panelOpenState.zoning}
          offset={panelOffsets.zoning}
          width={panelWidths.zoning}
          height={panelHeights.zoning}
          zIndex={panelZIndexes.zoning}
          zoningListItems={zoningListItems}
          onOpenZoningModal={onOpenZoningModal}
          onOpenEditZoningModal={onOpenEditZoningModal}
          onDeleteZoning={onDeleteZoning}
          onDragStart={onPanelDragStart}
          onResizeStart={onPanelResizeStart}
          onToggle={onTogglePanel}
        />
      )}

      {mode === '3d' && (
        <>
          <FloorViewPanel
            isOpen={panelOpenState.floorView}
            offset={panelOffsets.floorView}
            width={panelWidths.floorView}
            height={panelHeights.floorView}
            zIndex={panelZIndexes.floorView}
            layers={floorLayers}
            activeLayerId={activeFloorLayerId}
            isGenerated={isFloorPlanGenerated}
            isLayerOverlayMode={isLayerOverlayMode}
            selectedOverlayLayerIds={selectedOverlayLayerIds}
            overlayOpacityByLayerId={overlayOpacityByLayerId}
            onSelectLayer={onSelectFloorLayer}
            onAddLayer={onAddFloorLayer}
            onRenameLayer={onRenameFloorLayer}
            onDeleteLayer={onDeleteFloorLayer}
            onToggleLayerOverlayMode={onToggleLayerOverlayMode}
            onToggleOverlayLayer={onToggleOverlayLayer}
            onChangeOverlayLayerOpacity={onChangeOverlayLayerOpacity}
            onDragStart={onPanelDragStart}
            onResizeStart={onPanelResizeStart}
            onToggle={onTogglePanel}
          />
          <HierarchyPanel
            isOpen={panelOpenState.hierarchy}
            offset={panelOffsets.hierarchy}
            width={panelWidths.hierarchy}
            height={panelHeights.hierarchy}
            zIndex={panelZIndexes.hierarchy}
            onDragStart={onPanelDragStart}
            onResizeStart={onPanelResizeStart}
            onToggle={onTogglePanel}
          />
        </>
      )}

      {mode !== 'view' && (
        <AssistantPanel
          isOpen={panelOpenState.assistant}
          offset={panelOffsets.assistant}
          width={panelWidths.assistant}
          height={panelHeights.assistant}
          zIndex={panelZIndexes.assistant}
          provider={llmProvider}
          prompt={llmPrompt}
          status={llmStatus}
          isLoading={llmIsLoading}
          message={llmMessage}
          suggestions={llmSuggestions}
          preview={llmPreview}
          canRun={llmCanRun}
          onPromptChange={onLlmPromptChange}
          onRun={onRunLlmEdit}
          onApply={onApplyLlmEdit}
          onDiscard={onDiscardLlmEdit}
          floorProjectImportMessage={floorProjectImportMessage}
          onImportFloorProjectIfc={onImportFloorProjectIfc}
          onDragStart={onPanelDragStart}
          onResizeStart={onPanelResizeStart}
          onToggle={onTogglePanel}
        />
      )}
    </div>
  )
}

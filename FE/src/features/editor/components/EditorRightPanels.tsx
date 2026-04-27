import type { MouseEvent as ReactMouseEvent } from 'react'
import type { EditorMode, PanelKey, PanelOffset, PanelResizeAxis, ZoneData } from '../types'
import type { BubbleConnectionInfo, BubbleInfo, BubbleZoneInfo } from './BubbleAttributePanel'
import { CollaborationPanel } from './CollaborationPanel'
import { AttributesPanel } from './AttributesPanel'
import { ZoningPanel } from './ZoningPanel'
import { AssistantPanel } from './AssistantPanel'

interface EditorRightPanelsProps {
  mode: EditorMode
  isCollaborationMode?: boolean
  collaborationTab?: 'history' | 'thread'
  onCollaborationTabChange?: (tab: 'history' | 'thread') => void
  selectedPinId?: string | null
  onSelectPin?: (id: string | null) => void
  selectedBubble: BubbleInfo | null
  selectedBubbleConnections: BubbleConnectionInfo[]
  selectedBubbleZones: BubbleZoneInfo[]
  zoningListItems: ZoneData[]
  panelOffsets: Record<PanelKey, PanelOffset>
  panelOpenState: Record<PanelKey, boolean>
  panelHeights: Record<PanelKey, number>
  panelWidths: Record<PanelKey, number>
  onLabelChange: (id: string, label: string) => void
  onTypeChange: (id: string, type: string) => void
  onWidthChange: (id: string, width: number) => void
  onHeightChange: (id: string, height: number) => void
  onRatioChange: (id: string, ratio: number) => void
  onColorChange: (id: string, color: string) => void
  onOpenZoningModal: () => void
  onOpenEditZoningModal: (zone: ZoneData) => void
  onDeleteZoning: (zoneId: string) => void
  onPanelDragStart: (panelKey: PanelKey, event: ReactMouseEvent<HTMLButtonElement>) => void
  onPanelResizeStart: (panelKey: PanelKey, axis: PanelResizeAxis, event: ReactMouseEvent<HTMLButtonElement>) => void
  onTogglePanel: (panelKey: PanelKey) => void
}

/** 에디터 우측 패널 영역 — 협업 모드 / 일반 모드 분기 후 각 패널 조합 */
export function EditorRightPanels({
  mode,
  isCollaborationMode,
  collaborationTab,
  onCollaborationTabChange,
  selectedPinId,
  onSelectPin,
  selectedBubble,
  selectedBubbleConnections,
  selectedBubbleZones,
  zoningListItems,
  panelOffsets,
  panelOpenState,
  panelHeights,
  panelWidths,
  onLabelChange,
  onTypeChange,
  onWidthChange,
  onHeightChange,
  onRatioChange,
  onColorChange,
  onOpenZoningModal,
  onOpenEditZoningModal,
  onDeleteZoning,
  onPanelDragStart,
  onPanelResizeStart,
  onTogglePanel,
}: EditorRightPanelsProps) {
  if (isCollaborationMode) {
    return (
      <div className="w-[340px] flex flex-col shrink-0 min-h-0 bg-white border border-[#E2E6EF] rounded-2xl shadow-sm overflow-hidden">
        <CollaborationPanel
          activeTab={collaborationTab ?? 'history'}
          onTabChange={onCollaborationTabChange ?? (() => {})}
          selectedPinId={selectedPinId ?? null}
          onSelectPin={onSelectPin ?? (() => {})}
        />
      </div>
    )
  }

  return (
    <div className="w-[300px] flex flex-col gap-4 shrink-0 min-h-0 overflow-y-auto overflow-x-visible pb-1">
      <AttributesPanel
        mode={mode}
        isOpen={panelOpenState.attributes}
        offset={panelOffsets.attributes}
        width={panelWidths.attributes}
        height={panelHeights.attributes}
        selectedBubble={selectedBubble}
        connections={selectedBubbleConnections}
        zones={selectedBubbleZones}
        onLabelChange={onLabelChange}
        onTypeChange={onTypeChange}
        onWidthChange={onWidthChange}
        onHeightChange={onHeightChange}
        onRatioChange={onRatioChange}
        onColorChange={onColorChange}
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
          zoningListItems={zoningListItems}
          onOpenZoningModal={onOpenZoningModal}
          onOpenEditZoningModal={onOpenEditZoningModal}
          onDeleteZoning={onDeleteZoning}
          onDragStart={onPanelDragStart}
          onResizeStart={onPanelResizeStart}
          onToggle={onTogglePanel}
        />
      )}

      <AssistantPanel
        isOpen={panelOpenState.assistant}
        offset={panelOffsets.assistant}
        width={panelWidths.assistant}
        height={panelHeights.assistant}
        onDragStart={onPanelDragStart}
        onResizeStart={onPanelResizeStart}
        onToggle={onTogglePanel}
      />
    </div>
  )
}

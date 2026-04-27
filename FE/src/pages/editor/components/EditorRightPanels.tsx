import type { MouseEvent as ReactMouseEvent } from 'react'
import { ChevronDown, ChevronUp, GripVertical, Sparkles, X, History, MessageSquare, Plus } from 'lucide-react'
import { BubbleAttributePanel, type BubbleConnectionInfo, type BubbleInfo, type BubbleZoneInfo } from './BubbleAttributePanel'
import { TwoDAttributePanel } from './TwoDAttributePanel'
import { ThreeDAttributePanel } from './ThreeDAttributePanel'
import { CollaborationPanel } from './CollaborationPanel'
import type { EditorMode, PanelKey, PanelOffset, PanelResizeAxis, ZoneData } from '../types'

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

interface PanelResizeHandlesProps {
  panelKey: PanelKey
  theme: 'light' | 'dark'
  onPanelResizeStart: (panelKey: PanelKey, axis: PanelResizeAxis, event: ReactMouseEvent<HTMLButtonElement>) => void
}

function PanelResizeHandles({ panelKey, theme, onPanelResizeStart }: PanelResizeHandlesProps) {
  const horizontalBarClass =
    theme === 'dark'
      ? 'absolute left-1/2 bottom-0 -translate-x-1/2 h-1 w-12 rounded-full bg-white/20 group-hover:bg-white/40 transition-colors'
      : 'absolute left-1/2 bottom-0 -translate-x-1/2 h-1 w-12 rounded-full bg-[#E2E6EF] group-hover:bg-[#3B45B3]/35 transition-colors'
  const verticalBarClass =
    theme === 'dark'
      ? 'absolute right-0 top-1/2 -translate-y-1/2 h-12 w-1 rounded-full bg-white/20 group-hover:bg-white/40 transition-colors'
      : 'absolute right-0 top-1/2 -translate-y-1/2 h-12 w-1 rounded-full bg-[#E2E6EF] group-hover:bg-[#3B45B3]/35 transition-colors'
  const cornerClass =
    theme === 'dark'
      ? 'absolute right-0 bottom-0 w-3 h-3 cursor-nwse-resize bg-white/20 hover:bg-white/40 transition-colors'
      : 'absolute right-0 bottom-0 w-3 h-3 cursor-nwse-resize bg-[#E2E6EF] hover:bg-[#3B45B3]/35 transition-colors'

  return (
    <>
      <button
        onMouseDown={(event) => onPanelResizeStart(panelKey, 'y', event)}
        className="absolute bottom-0 left-0 w-full h-2 cursor-ns-resize group"
        aria-label={`${panelKey} 패널 세로 크기 조정`}
      >
        <span className={horizontalBarClass} />
      </button>
      <button
        onMouseDown={(event) => onPanelResizeStart(panelKey, 'x', event)}
        className="absolute right-0 top-0 h-full w-2 cursor-ew-resize group"
        aria-label={`${panelKey} 패널 가로 크기 조정`}
      >
        <span className={verticalBarClass} />
      </button>
      <button
        onMouseDown={(event) => onPanelResizeStart(panelKey, 'both', event)}
        className={cornerClass}
        aria-label={`${panelKey} 패널 대각선 크기 조정`}
      />
    </>
  )
}

/** 에디터 우측 패널 영역 */
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
          activeTab={collaborationTab || 'history'}
          onTabChange={onCollaborationTabChange || (() => {})}
          selectedPinId={selectedPinId || null}
          onSelectPin={onSelectPin || (() => {})}
        />
      </div>
    )
  }

  return (
    <div className="w-[300px] flex flex-col gap-4 shrink-0 min-h-0 overflow-y-auto overflow-x-visible pb-1">
      {/* 속성 관리자 패널 - Bubble, 2D, 3D 모드에서 사용 */}
      {(mode === 'bubble' || mode === '2d' || mode === '3d') && (
        <section
          className="relative bg-white border border-[#E2E6EF] rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-0 shrink-0"
          style={{
            transform: `translate(${panelOffsets.attributes.x}px, ${panelOffsets.attributes.y}px)`,
            width: panelWidths.attributes,
            height: panelOpenState.attributes ? panelHeights.attributes : undefined,
            maxHeight: 'calc(100vh - 180px)',
          }}
        >
          <div className="px-5 py-4 border-b border-[#F0F2F9] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onMouseDown={(event) => onPanelDragStart('attributes', event)}
                className="w-5 h-5 rounded-md bg-[#F3F5FA] text-[#9AA4B5] hover:text-[#505764] transition-colors flex items-center justify-center cursor-grab active:cursor-grabbing"
                aria-label="속성 관리자 패널 이동"
              >
                <GripVertical size={12} />
              </button>
              <h2 className="text-xs font-extrabold text-[#1C1C1E]">속성 관리자</h2>
            </div>
            <button
              onClick={() => onTogglePanel('attributes')}
              className="text-[#ADB5BD] hover:text-[#505764] transition-colors"
              aria-label={panelOpenState.attributes ? '속성 관리자 닫기' : '속성 관리자 열기'}
            >
              {panelOpenState.attributes ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
          {panelOpenState.attributes && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {mode === 'bubble' && (
                <BubbleAttributePanel
                  selectedBubble={selectedBubble}
                  onLabelChange={onLabelChange}
                  onTypeChange={onTypeChange}
                  onWidthChange={onWidthChange}
                  onHeightChange={onHeightChange}
                  onRatioChange={onRatioChange}
                  onColorChange={onColorChange}
                  connections={selectedBubbleConnections}
                  zones={selectedBubbleZones}
                />
              )}
              {mode === '2d' && <TwoDAttributePanel />}
              {mode === '3d' && <ThreeDAttributePanel />}
            </div>
          )}
          <PanelResizeHandles panelKey="attributes" theme="light" onPanelResizeStart={onPanelResizeStart} />
        </section>
      )}

      {/* 조닝 영역 패널 (Bubble 전용) */}
      {mode === 'bubble' && (
        <section
          className="relative bg-white border border-[#E2E6EF] rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-0 shrink-0"
          style={{
            transform: `translate(${panelOffsets.zoning.x}px, ${panelOffsets.zoning.y}px)`,
            width: panelWidths.zoning,
            height: panelOpenState.zoning ? panelHeights.zoning : undefined,
            maxHeight: 'calc(100vh - 180px)',
          }}
        >
          <div className="px-5 py-4 border-b border-[#F0F2F9] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onMouseDown={(event) => onPanelDragStart('zoning', event)}
                className="w-5 h-5 rounded-md bg-[#F3F5FA] text-[#9AA4B5] hover:text-[#505764] transition-colors flex items-center justify-center cursor-grab active:cursor-grabbing"
                aria-label="조닝 영역 패널 이동"
              >
                <GripVertical size={12} />
              </button>
              <h2 className="text-xs font-extrabold text-[#1C1C1E]">조닝 영역</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onOpenZoningModal}
                className="text-[10px] font-bold text-[#3B45B3] hover:text-[#2D3691] transition-colors"
              >
                + 추가
              </button>
              <button
                onClick={() => onTogglePanel('zoning')}
                className="text-[#ADB5BD] hover:text-[#505764] transition-colors"
                aria-label={panelOpenState.zoning ? '조닝 영역 닫기' : '조닝 영역 열기'}
              >
                {panelOpenState.zoning ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>
          </div>
          {panelOpenState.zoning && (
            <div className="p-4 flex flex-col gap-2 min-h-0 flex-1 overflow-y-auto">
              {zoningListItems.length === 0 ? (
                <div className="text-center text-[#ADB5BD] text-xs font-medium py-3">
                  생성된 조닝이 없습니다
                </div>
              ) : (
                zoningListItems.map((zone) =>
                  zone.source === 'auto' ? (
                    <button
                      key={zone.id}
                      type="button"
                      onClick={() => onOpenEditZoningModal(zone)}
                      className="w-full bg-[#F8F9FD] rounded-lg px-3 py-2.5 flex items-center justify-between gap-2 border border-transparent hover:border-[#D9DEF0] transition-colors text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/5"
                          style={{ backgroundColor: zone.color }}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#1C1C1E] truncate">{zone.name}</p>
                          <p className="text-[10px] font-medium text-[#6C757D]">{zone.bubbleIds.length}개 공간</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-black text-[#5D4AD8] bg-[#EEE9FF] px-2 py-1 rounded-md">자동</span>
                    </button>
                  ) : (
                    <div
                      key={zone.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onOpenEditZoningModal(zone)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onOpenEditZoningModal(zone)
                        }
                      }}
                      className="bg-[#F8F9FD] rounded-lg px-3 py-2.5 flex items-center justify-between gap-2 border border-transparent hover:border-[#D9DEF0] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/5"
                          style={{ backgroundColor: zone.color }}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#1C1C1E] truncate">{zone.name}</p>
                          <p className="text-[10px] font-medium text-[#6C757D]">{zone.bubbleIds.length}개 공간</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-black text-[#3B45B3] bg-[#EAF0FF] px-2 py-1 rounded-md">수동</span>
                        <button
                          onClick={(event) => {
                            event.stopPropagation()
                            onDeleteZoning(zone.id)
                          }}
                          className="text-[#ADB5BD] hover:text-[#E03131] transition-colors"
                          aria-label={`${zone.name} 삭제`}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  )
                )
              )}
            </div>
          )}
          <PanelResizeHandles panelKey="zoning" theme="light" onPanelResizeStart={onPanelResizeStart} />
        </section>
      )}

      {/* AI 어시스턴트 패널 - Bubble, 2D, 3D 모드에서 사용 */}
      {(mode === 'bubble' || mode === '2d' || mode === '3d') && (
        <section
          className="relative bg-[#3B45B3] rounded-2xl shadow-lg shadow-[#3B45B3]/20 overflow-hidden flex flex-col min-h-0 shrink-0"
          style={{
            transform: `translate(${panelOffsets.assistant.x}px, ${panelOffsets.assistant.y}px)`,
            width: panelWidths.assistant,
            height: panelOpenState.assistant ? panelHeights.assistant : undefined,
            maxHeight: 'calc(100vh - 180px)',
          }}
        >
          <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2 text-white">
              <button
                onMouseDown={(event) => onPanelDragStart('assistant', event)}
                className="w-5 h-5 rounded-md bg-white/10 text-white/70 hover:text-white transition-colors flex items-center justify-center cursor-grab active:cursor-grabbing"
                aria-label="AI 어시스턴트 패널 이동"
              >
                <GripVertical size={12} />
              </button>
              <Sparkles size={14} fill="white" />
              <h2 className="text-[11px] font-extrabold uppercase tracking-wider">AI 어시스턴트</h2>
            </div>
            <button
              onClick={() => onTogglePanel('assistant')}
              className="text-white/40 hover:text-white/80 transition-colors"
              aria-label={panelOpenState.assistant ? 'AI 어시스턴트 닫기' : 'AI 어시스턴트 열기'}
            >
              {panelOpenState.assistant ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
          {panelOpenState.assistant && (
            <div className="p-4 min-h-0 flex-1 overflow-y-auto">
              <div className="bg-white rounded-xl p-4 shadow-inner relative">
                <div className="text-[11px] leading-relaxed text-[#1C1C1E] font-medium">
                  거실 공간에 비해 창문 크기가 작습니다.
                  <br />
                  채광 효율을 위해 창문 너비를 1200mm에서 <span className="text-[#3B45B3] font-bold">1800mm</span>로 확장할까요?
                </div>
              </div>
            </div>
          )}
          <PanelResizeHandles panelKey="assistant" theme="dark" onPanelResizeStart={onPanelResizeStart} />
        </section>
      )}
    </div>
  )
}

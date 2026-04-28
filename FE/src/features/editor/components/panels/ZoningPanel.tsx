import type { MouseEvent as ReactMouseEvent } from 'react'
import { X } from 'lucide-react'
import type { PanelKey, PanelOffset, PanelResizeAxis, ZoneData } from '../../types'
import { PanelFrame } from '../shared/PanelFrame'

interface ZoningPanelProps {
  isOpen: boolean
  offset: PanelOffset
  width: number
  height: number
  zoningListItems: ZoneData[]
  onOpenZoningModal: () => void
  onOpenEditZoningModal: (zone: ZoneData) => void
  onDeleteZoning: (zoneId: string) => void
  onDragStart: (key: PanelKey, e: ReactMouseEvent<HTMLButtonElement>) => void
  onResizeStart: (key: PanelKey, axis: PanelResizeAxis, e: ReactMouseEvent<HTMLButtonElement>) => void
  onToggle: (key: PanelKey) => void
}

/** 조닝 영역 목록 패널 (버블 모드 전용) */
export function ZoningPanel({
  isOpen,
  offset,
  width,
  height,
  zoningListItems,
  onOpenZoningModal,
  onOpenEditZoningModal,
  onDeleteZoning,
  onDragStart,
  onResizeStart,
  onToggle,
}: ZoningPanelProps) {
  return (
    <PanelFrame
      panelKey="zoning"
      title="조닝 영역"
      isOpen={isOpen}
      offset={offset}
      width={width}
      height={height}
      headerExtra={
        <button
          onClick={onOpenZoningModal}
          className="text-[10px] font-bold text-[#3B45B3] hover:text-[#2D3691] transition-colors"
        >
          + 추가
        </button>
      }
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onToggle={onToggle}
    >
      <div className="p-4 flex flex-col gap-2">
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
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
                    onClick={(e) => {
                      e.stopPropagation()
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
    </PanelFrame>
  )
}

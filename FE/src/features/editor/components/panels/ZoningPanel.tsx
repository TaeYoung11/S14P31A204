import type { MouseEvent as ReactMouseEvent } from 'react'
import { LayoutGrid } from 'lucide-react'
import type { PanelKey, PanelOffset, PanelResizeAxis, ZoneData } from '../../types'
import { PanelFrame } from '../shared/PanelFrame'
import { ZoningSection } from './sections/ZoningSection'

interface ZoningPanelProps {
  isOpen: boolean
  offset: PanelOffset
  width: number
  height: number
  zIndex?: number
  zoningListItems: ZoneData[]
  onOpenZoningModal: () => void
  onOpenEditZoningModal: (zone: ZoneData) => void
  onDeleteZoning: (zoneId: string) => void
  onDragStart: (key: PanelKey, e: ReactMouseEvent<HTMLElement>) => void
  onResizeStart: (key: PanelKey, axis: PanelResizeAxis, e: ReactMouseEvent<HTMLButtonElement>) => void
  onToggle: (key: PanelKey) => void
}

/** 조닝 영역 목록 패널 (버블 모드 전용) */
export function ZoningPanel({
  isOpen,
  offset,
  width,
  height,
  zIndex,
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
      titleIcon={<LayoutGrid size={14} className="text-[#3B45B3]" />}
      isOpen={isOpen}
      offset={offset}
      width={width}
      height={height}
      zIndex={zIndex}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onToggle={onToggle}
    >
      <div className="p-4">
        <ZoningSection
          zoningListItems={zoningListItems}
          onOpenZoningModal={onOpenZoningModal}
          onOpenEditZoningModal={onOpenEditZoningModal}
          onDeleteZoning={onDeleteZoning}
        />
      </div>
    </PanelFrame>
  )
}

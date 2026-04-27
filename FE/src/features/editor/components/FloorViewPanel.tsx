import React from 'react'
import { Layers } from 'lucide-react'
import type { PanelKey, PanelOffset, PanelResizeAxis } from '../types'
import { PanelFrame } from './PanelFrame'

interface FloorViewPanelProps {
  isOpen: boolean
  offset: PanelOffset
  width: number
  height: number
  onDragStart: (key: PanelKey, e: React.MouseEvent<HTMLButtonElement>) => void
  onResizeStart: (key: PanelKey, axis: PanelResizeAxis, e: React.MouseEvent<HTMLButtonElement>) => void
  onToggle: (key: PanelKey) => void
}

export function FloorViewPanel({
  isOpen,
  offset,
  width,
  height,
  onDragStart,
  onResizeStart,
  onToggle,
}: FloorViewPanelProps) {
  const floors = [
    { id: 'roof', name: 'Roof', active: false },
    { id: '3f', name: '3F', active: false },
    { id: '2f', name: '2F', active: false },
    { id: '1f', name: '1F', active: true },
    { id: 'b1', name: 'B1', active: false },
  ]

  return (
    <PanelFrame
      panelKey="floorView"
      title="층보기"
      titleIcon={<Layers size={14} className="text-[#3B45B3]" />}
      isOpen={isOpen}
      offset={offset}
      width={width}
      height={height}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onToggle={onToggle}
    >
      <div className="p-4 flex flex-col gap-2">
        {floors.map((floor) => (
          <button
            key={floor.id}
            className={`w-full px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${
              floor.active
                ? 'bg-[#3B45B3] text-white shadow-md'
                : 'bg-[#F8F9FD] text-[#8E95A3] hover:bg-[#F0F2F9] hover:text-[#1C1C1E]'
            }`}
          >
            {floor.name}
            {floor.active && <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />}
          </button>
        ))}
      </div>
    </PanelFrame>
  )
}

import React from 'react'
import { Layers, Plus } from 'lucide-react'
import type { FloorLayer, PanelKey, PanelOffset, PanelResizeAxis } from '../types'
import { PanelFrame } from './PanelFrame'

interface FloorViewPanelProps {
  isOpen: boolean
  offset: PanelOffset
  width: number
  height: number
  layers?: FloorLayer[]
  activeLayerId?: string | null
  isGenerated?: boolean
  onSelectLayer?: (id: string) => void
  onAddLayer?: () => void
  onDragStart: (key: PanelKey, e: React.MouseEvent<HTMLButtonElement>) => void
  onResizeStart: (key: PanelKey, axis: PanelResizeAxis, e: React.MouseEvent<HTMLButtonElement>) => void
  onToggle: (key: PanelKey) => void
}

export function FloorViewPanel({
  isOpen,
  offset,
  width,
  height,
  layers = [],
  activeLayerId = null,
  isGenerated = false,
  onSelectLayer,
  onAddLayer,
  onDragStart,
  onResizeStart,
  onToggle,
}: FloorViewPanelProps) {
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
      <div className="px-3 py-2 flex items-center justify-between border-b border-[#F0F2F9]">
        <button
          onClick={isGenerated ? onAddLayer : undefined}
          disabled={!isGenerated}
          title={isGenerated ? '새 층 추가' : '평면도 생성 후 층을 추가할 수 있습니다'}
          className={`ml-auto transition-colors rounded p-0.5 ${
            isGenerated
              ? 'text-[#ADB5BD] hover:text-[#3B45B3] hover:bg-[#F0F2FF]'
              : 'text-[#D9DEF0] cursor-not-allowed'
          }`}
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="p-3 flex flex-col gap-1">
        {isGenerated && layers.length > 0 ? (
          layers.map((layer, index) => {
            const isActive = activeLayerId === layer.id
            const numMatch = layer.name.match(/(\d+)/)
            const shortName = numMatch ? `${numMatch[1]}F` : `${index + 1}F`
            return (
              <button
                key={layer.id}
                onClick={() => onSelectLayer?.(layer.id)}
                className={`w-full px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${
                  isActive
                    ? 'bg-[#3B45B3] text-white shadow-md'
                    : 'bg-[#F8F9FD] text-[#8E95A3] hover:bg-[#F0F2F9] hover:text-[#1C1C1E]'
                }`}
              >
                {shortName}
                {isActive && <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />}
              </button>
            )
          })
        ) : (
          <p className="text-[10px] text-[#ADB5BD] text-center py-3">
            {isGenerated ? '층이 없습니다' : '평면도를 먼저 생성하세요'}
          </p>
        )}
      </div>
    </PanelFrame>
  )
}

import React from 'react'
import { Eye, EyeOff, Layers, Pencil, Plus, Trash2 } from 'lucide-react'
import type { FloorLayer, PanelKey, PanelOffset, PanelResizeAxis } from '../../types'
import { PanelFrame } from '../shared/PanelFrame'

interface FloorViewPanelProps {
  isOpen: boolean
  offset: PanelOffset
  width: number
  height: number
  zIndex?: number
  layers?: FloorLayer[]
  activeLayerId?: string | null
  isGenerated?: boolean
  isLayerOverlayMode?: boolean
  selectedOverlayLayerIds?: string[]
  overlayOpacityByLayerId?: Record<string, number>
  onSelectLayer?: (id: string) => void
  onAddLayer?: () => void
  onRenameLayer?: (layerId: string, name: string) => void
  onDeleteLayer?: (layerId: string) => void
  onToggleLayerOverlayMode?: () => void
  onToggleOverlayLayer?: (layerId: string) => void
  onChangeOverlayLayerOpacity?: (layerId: string, opacity: number) => void
  onDragStart: (key: PanelKey, e: React.MouseEvent<HTMLElement>) => void
  onResizeStart: (key: PanelKey, axis: PanelResizeAxis, e: React.MouseEvent<HTMLButtonElement>) => void
  onToggle: (key: PanelKey) => void
}

export function FloorViewPanel({
  isOpen,
  offset,
  width,
  height,
  zIndex,
  layers = [],
  activeLayerId = null,
  isGenerated = false,
  isLayerOverlayMode = false,
  selectedOverlayLayerIds = [],
  overlayOpacityByLayerId = {},
  onSelectLayer,
  onAddLayer,
  onRenameLayer,
  onDeleteLayer,
  onToggleLayerOverlayMode,
  onToggleOverlayLayer,
  onChangeOverlayLayerOpacity,
  onDragStart,
  onResizeStart,
  onToggle,
}: FloorViewPanelProps) {
  const selectedOverlaySet = new Set(selectedOverlayLayerIds)
  const canDeleteAnyLayer = layers.length > 1
  const [editingLayerId, setEditingLayerId] = React.useState<string | null>(null)
  const [editingName, setEditingName] = React.useState('')

  const startRenameLayer = (layer: FloorLayer) => {
    setEditingLayerId(layer.id)
    setEditingName(layer.name)
  }

  const cancelRenameLayer = () => {
    setEditingLayerId(null)
    setEditingName('')
  }

  const commitRenameLayer = (layerId: string) => {
    onRenameLayer?.(layerId, editingName)
    cancelRenameLayer()
  }

  const handleDeleteLayer = (layer: FloorLayer) => {
    if (!canDeleteAnyLayer) return
    const ok = window.confirm(`"${layer.name}" 층을 삭제하시겠습니까?`)
    if (!ok) return
    onDeleteLayer?.(layer.id)
  }

  return (
    <PanelFrame
      panelKey="floorView"
      title="층보기"
      titleIcon={<Layers size={14} className="text-[#3B45B3]" />}
      isOpen={isOpen}
      offset={offset}
      width={width}
      height={height}
      zIndex={zIndex}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onToggle={onToggle}
    >
      <div className="flex items-center justify-between border-b border-[#F0F2F9] px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-[#6F7C96]">층보기</span>
          <span className="rounded bg-[#F3F6FD] px-1.5 py-0.5 text-[9px] font-bold text-[#7A88A3]">
            Shift+L
          </span>
        </div>
        <button
          onClick={isGenerated ? onAddLayer : undefined}
          disabled={!isGenerated}
          title={isGenerated ? '새 층 추가' : '평면도 생성 후 층 추가 가능'}
          className={`rounded-md p-1 ${
            isGenerated
              ? 'text-[#6F7C96] hover:bg-[#EEF1F8] hover:text-[#3B45B3]'
              : 'cursor-not-allowed text-[#D9DEE8]'
          }`}
        >
          <Plus size={14} />
        </button>
      </div>

      {!isGenerated ? (
        <div className="px-3 py-5 text-center text-[10px] text-[#ADB5BD]">
          평면도를 먼저 생성하세요.
        </div>
      ) : (
        <div className="max-h-[300px] overflow-y-auto p-3">
          <div className="space-y-2">
            {layers.map((layer, index) => {
              const isActive = activeLayerId === layer.id
              const isOverlaySelected = selectedOverlaySet.has(layer.id)
              const opacity = overlayOpacityByLayerId[layer.id] ?? 0.35
              const isOverlayToggleDisabled = isActive
              const displayName = layer.name || `${index + 1}층 평면도`
              const isEditing = editingLayerId === layer.id
              return (
                <div
                  key={layer.id}
                  className={`rounded-xl border px-2.5 py-2 ${
                    isActive ? 'border-[#C8D2FF] bg-[#F4F6FF]' : 'border-[#EEF1F8] bg-[#FCFDFF]'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <button onClick={() => onSelectLayer?.(layer.id)} className="min-w-0 flex-1 text-left">
                      {isEditing ? (
                        <input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={() => commitRenameLayer(layer.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              commitRenameLayer(layer.id)
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault()
                              cancelRenameLayer()
                            }
                          }}
                          autoFocus
                          className="w-full rounded border border-[#C8D2FF] bg-white px-1.5 py-0.5 text-[11px] font-bold text-[#1C1C1E] outline-none"
                        />
                      ) : (
                        <p className={`truncate text-[11px] font-bold ${isActive ? 'text-[#3B45B3]' : 'text-[#1C1C1E]'}`}>
                          {displayName}
                        </p>
                      )}
                      <p className="text-[9px] text-[#9AA4BA]">{isActive ? '활성 층' : '비활성 층'}</p>
                    </button>

                    <button
                      onClick={() => {
                        if (isOverlayToggleDisabled) return
                        if (!isLayerOverlayMode) onToggleLayerOverlayMode?.()
                        onToggleOverlayLayer?.(layer.id)
                      }}
                      disabled={isOverlayToggleDisabled}
                      title={isOverlayToggleDisabled ? '활성 층은 겹쳐보기 대상에서 제외' : '겹쳐보기 토글'}
                      className={`rounded-md p-1 ${
                        isOverlayToggleDisabled
                          ? 'cursor-not-allowed text-[#D4DAE8]'
                          : isOverlaySelected
                            ? 'bg-[#3B45B3] text-white'
                            : 'text-[#7C8AA4] hover:bg-[#E8ECF8] hover:text-[#3B45B3]'
                      }`}
                    >
                      {isOverlaySelected ? <Eye size={12} /> : <EyeOff size={12} />}
                    </button>

                    <button
                      onClick={() => startRenameLayer(layer)}
                      title="층 이름 수정"
                      className="rounded-md p-1 text-[#7C8AA4] hover:bg-[#E8ECF8] hover:text-[#3B45B3]"
                    >
                      <Pencil size={12} />
                    </button>

                    <button
                      onClick={() => handleDeleteLayer(layer)}
                      disabled={!canDeleteAnyLayer}
                      title={canDeleteAnyLayer ? '층 삭제' : '최소 1개 층은 유지됩니다'}
                      className={`rounded-md p-1 ${
                        canDeleteAnyLayer
                          ? 'text-[#B56A6A] hover:bg-[#FDEEEE] hover:text-[#C23E3E]'
                          : 'cursor-not-allowed text-[#D9DEE8]'
                      }`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>

                  {isLayerOverlayMode && !isActive && isOverlaySelected && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="w-9 text-[9px] text-[#8E95A3]">투명도</span>
                      <input
                        type="range"
                        min={10}
                        max={100}
                        step={5}
                        value={Math.round(opacity * 100)}
                        onChange={(e) => onChangeOverlayLayerOpacity?.(layer.id, Number(e.target.value) / 100)}
                        className="h-1.5 flex-1 accent-[#3B45B3]"
                      />
                      <span className="w-8 text-right text-[9px] font-bold text-[#6F7C96]">
                        {Math.round(opacity * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="mt-3 flex items-center justify-between rounded-lg bg-[#F8F9FD] px-2.5 py-2">
            <span className="text-[10px] font-bold text-[#4B5873]">층 겹쳐보기</span>
            <button
              onClick={onToggleLayerOverlayMode}
              title={`층 겹쳐보기 ${isLayerOverlayMode ? '끄기' : '켜기'} (Shift+L)`}
              className={`rounded-md p-1 transition-colors ${
                isLayerOverlayMode
                  ? 'bg-[#3B45B3] text-white'
                  : 'text-[#7C8AA4] hover:bg-[#E8ECF8] hover:text-[#3B45B3]'
              }`}
            >
              {isLayerOverlayMode ? <Eye size={12} /> : <EyeOff size={12} />}
            </button>
          </div>
        </div>
      )}
    </PanelFrame>
  )
}

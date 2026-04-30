import { Layers, Eye, EyeOff } from 'lucide-react'
import type { FloorLayer } from '../../types'

interface LayerOverlayPanelProps {
  isVisible?: boolean
  layers?: FloorLayer[]
  activeLayerId?: string | null
  selectedOverlayLayerIds?: string[]
  opacityByLayerId?: Record<string, number>
  onToggleVisible?: () => void
  onToggleOverlayLayer?: (layerId: string) => void
  onChangeLayerOpacity?: (layerId: string, opacity: number) => void
}

/** Shift+L 층 겹쳐보기 제어 패널 (버블/2D/3D 공통) */
export function LayerOverlayPanel({
  isVisible = false,
  layers = [],
  activeLayerId = null,
  selectedOverlayLayerIds = [],
  opacityByLayerId = {},
  onToggleVisible,
  onToggleOverlayLayer,
  onChangeLayerOpacity,
}: LayerOverlayPanelProps) {
  if (layers.length === 0) return null

  const selectedSet = new Set(selectedOverlayLayerIds)
  const selectableLayers = layers.filter((layer) => layer.id !== activeLayerId)

  return (
    <div className="absolute top-6 right-6 z-20 w-[280px] rounded-2xl border border-[#E2E6EF] bg-white/95 shadow-sm backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-[#F0F2F9] px-4 py-3">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-[#3B45B3]" />
          <div>
            <p className="text-[11px] font-extrabold text-[#1C1C1E]">층 겹쳐보기</p>
            <p className="text-[10px] text-[#8A95AC]">단축키 `Shift+L`</p>
          </div>
        </div>
        <button
          onClick={onToggleVisible}
          className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold transition-colors ${isVisible ? 'bg-[#3B45B3] text-white' : 'bg-[#EEF1F8] text-[#6B7A99] hover:bg-[#E2E7F5]'}`}
        >
          {isVisible ? <Eye size={11} /> : <EyeOff size={11} />}
          {isVisible ? 'ON' : 'OFF'}
        </button>
      </div>

      {isVisible && (
        <div className="max-h-[300px] overflow-y-auto p-3">
          {selectableLayers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#D9DEF0] bg-[#FAFBFF] px-3 py-3 text-center text-[10px] text-[#8E95A3]">
              활성층 외 비교할 층이 없습니다.
            </div>
          ) : (
            <div className="space-y-2">
              {selectableLayers.map((layer) => {
                const checked = selectedSet.has(layer.id)
                const opacity = opacityByLayerId[layer.id] ?? 0.35
                return (
                  <div key={layer.id} className="rounded-xl border border-[#EEF1F8] bg-[#FCFDFF] px-3 py-2">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleOverlayLayer?.(layer.id)}
                        className="h-3.5 w-3.5 rounded border-[#C9D2E8] text-[#3B45B3] focus:ring-[#3B45B3]"
                      />
                      <span className={`text-[11px] font-bold ${checked ? 'text-[#3B45B3]' : 'text-[#1C1C1E]'}`}>
                        {layer.name}
                      </span>
                    </label>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="w-10 text-[10px] text-[#8E95A3]">투명도</span>
                      <input
                        type="range"
                        min={10}
                        max={100}
                        step={5}
                        value={Math.round(opacity * 100)}
                        disabled={!checked}
                        onChange={(e) => onChangeLayerOpacity?.(layer.id, Number(e.target.value) / 100)}
                        className="h-1.5 flex-1 accent-[#3B45B3] disabled:opacity-40"
                      />
                      <span className="w-10 text-right text-[10px] font-bold text-[#6F7C96]">
                        {Math.round(opacity * 100)}%
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

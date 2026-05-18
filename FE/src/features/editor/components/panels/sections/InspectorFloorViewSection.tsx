import { Eye, EyeOff, Plus } from 'lucide-react'
import type { FloorViewSectionProps } from '../../layout/right-panels/buildRightPanelSectionProps'

interface InspectorFloorViewSectionProps {
  panelProps: FloorViewSectionProps | null
}

/**
 * 인스펙터의 2D/3D 층 보기 섹션.
 * 활성층 선택, 오버레이 토글, 층 추가 액션을 렌더링한다.
 */
export function InspectorFloorViewSection({ panelProps }: InspectorFloorViewSectionProps) {
  if (!panelProps) {
    return <p className="text-[11px] text-[#94A3B8]">층 정보가 없습니다.</p>
  }

  const layers = panelProps.layers ?? []
  const selectedOverlaySet = new Set(panelProps.selectedOverlayLayerIds ?? [])

  if (!panelProps.isGenerated) {
    return <p className="py-2 text-center text-[11px] text-[#94A3B8]">도면 생성 후 층을 확인할 수 있습니다.</p>
  }

  return (
    <div className="space-y-1.5">
      {layers.map((layer, index) => {
        const isActive = panelProps.activeLayerId === layer.id
        const isOverlaySelected = selectedOverlaySet.has(layer.id)
        return (
          <div
            key={layer.id}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 ${isActive ? 'border-[#C8D2FF] bg-[#F4F6FF]' : 'border-[#EEF2F7] bg-[#FCFDFF]'
              }`}
          >
            <button
              type="button"
              onClick={() => panelProps.onSelectLayer?.(layer.id)}
              className="min-w-0 flex-1 text-left"
            >
              <p className={`truncate text-[11px] font-bold ${isActive ? 'text-[#3B45B3]' : 'text-[#334155]'}`}>
                {layer.name || `${index + 1}F`}
              </p>
            </button>
            <button
              type="button"
              onClick={() => {
                if (isActive) return
                if (!panelProps.isLayerOverlayMode) panelProps.onToggleLayerOverlayMode?.()
                panelProps.onToggleOverlayLayer?.(layer.id)
              }}
              disabled={isActive}
              className={`rounded p-1 ${isActive
                  ? 'cursor-not-allowed text-[#CBD5E1]'
                  : isOverlaySelected
                    ? 'bg-[#3B45B3] text-white'
                    : 'text-[#64748B] hover:bg-[#EEF2FF] hover:text-[#3B45B3]'
                }`}
              aria-label="층 오버레이"
            >
              {isOverlaySelected ? <Eye size={12} /> : <EyeOff size={12} />}
            </button>
          </div>
        )
      })}
      <button
        type="button"
        onClick={panelProps.onAddLayer}
        className="mt-1 inline-flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-[#CBD5E1] py-1.5 text-[11px] font-bold text-[#64748B] hover:border-[#3B45B3] hover:text-[#3B45B3]"
      >
        <Plus size={12} />
        층 추가
      </button>
    </div>
  )
}


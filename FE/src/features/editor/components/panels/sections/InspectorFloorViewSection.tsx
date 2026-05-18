import { useState } from 'react'
import { Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react'
import type { FloorViewSectionProps } from '../../layout/right-panels/buildRightPanelSectionProps'
import type { FloorLayer } from '../../../types'
import { DeleteConfirmModal } from '@/shared/components/DeleteConfirmModal'

interface InspectorFloorViewSectionProps {
  panelProps: FloorViewSectionProps | null
}

/**
 * 인스펙터의 2D/3D 층 보기 섹션.
 * 활성층 선택, 오버레이 토글, 층 추가 액션을 렌더링한다.
 */
export function InspectorFloorViewSection({ panelProps }: InspectorFloorViewSectionProps) {
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [pendingDeleteLayer, setPendingDeleteLayer] = useState<FloorLayer | null>(null)
  const layers = panelProps?.layers ?? []
  const selectedOverlaySet = new Set(panelProps?.selectedOverlayLayerIds ?? [])
  const canDeleteAnyLayer = layers.length > 1

  if (!panelProps) {
    return <p className="text-[11px] text-[#94A3B8]">층 정보가 없습니다.</p>
  }

  const cancelRenameLayer = () => {
    setEditingLayerId(null)
    setEditingName('')
  }

  const commitRenameLayer = (layerId: string) => {
    panelProps.onRenameLayer?.(layerId, editingName)
    cancelRenameLayer()
  }

  const handleDeleteLayer = (layer: FloorLayer) => {
    if (!canDeleteAnyLayer) return
    setPendingDeleteLayer(layer)
  }

  const closeDeleteLayerModal = () => {
    setPendingDeleteLayer(null)
  }

  const confirmDeleteLayer = () => {
    if (!pendingDeleteLayer) return
    panelProps.onDeleteLayer?.(pendingDeleteLayer.id)
    closeDeleteLayerModal()
  }

  if (!panelProps.isGenerated && layers.length === 0) {
    return <p className="py-2 text-center text-[11px] text-[#94A3B8]">도면 생성 후 층을 확인할 수 있습니다.</p>
  }

  return (
    <>
      <div className="space-y-2">
        {layers.map((layer, index) => {
          const isActive = panelProps.activeLayerId === layer.id
          const isOverlaySelected = selectedOverlaySet.has(layer.id)
          const opacity = panelProps.overlayOpacityByLayerId?.[layer.id] ?? 0.35
          const displayName = layer.name || `${index + 1}F`
          const isEditing = editingLayerId === layer.id
          const isOverlayToggleDisabled = isActive

          return (
            <div
              key={layer.id}
              className={`rounded-md border px-2 py-1.5 ${
                isActive ? 'border-[#C8D2FF] bg-[#F4F6FF]' : 'border-[#EEF2F7] bg-[#FCFDFF]'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => panelProps.onSelectLayer?.(layer.id)} className="min-w-0 flex-1 text-left">
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
                    <p className={`truncate text-[11px] font-bold ${isActive ? 'text-[#3B45B3]' : 'text-[#334155]'}`}>
                      {displayName}
                    </p>
                  )}
                  <p className="text-[9px] text-[#94A3B8]">{isActive ? '활성 층' : '비활성 층'}</p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (isOverlayToggleDisabled) return
                    if (panelProps.isLayerOverlayMode) {
                      panelProps.onToggleOverlayLayer?.(layer.id)
                      return
                    }
                    panelProps.onSelectSingleOverlayLayer?.(layer.id)
                  }}
                  disabled={isOverlayToggleDisabled}
                  className={`rounded p-1 ${
                    isOverlayToggleDisabled
                      ? 'cursor-not-allowed text-[#CBD5E1]'
                      : isOverlaySelected
                        ? 'bg-[#3B45B3] text-white'
                        : 'text-[#64748B] hover:bg-[#EEF2FF] hover:text-[#3B45B3]'
                  }`}
                  aria-label="층 겹쳐보기"
                >
                  {isOverlaySelected ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEditingLayerId(layer.id)
                    setEditingName(displayName)
                  }}
                  className="rounded p-1 text-[#64748B] hover:bg-[#EEF2FF] hover:text-[#3B45B3]"
                  aria-label="층 이름 수정"
                >
                  <Pencil size={12} />
                </button>

                <button
                  type="button"
                  onClick={() => handleDeleteLayer(layer)}
                  disabled={!canDeleteAnyLayer}
                  className={`rounded p-1 ${
                    canDeleteAnyLayer
                      ? 'text-[#B56A6A] hover:bg-[#FDEEEE] hover:text-[#C23E3E]'
                      : 'cursor-not-allowed text-[#CBD5E1]'
                  }`}
                  aria-label="층 삭제"
                >
                  <Trash2 size={12} />
                </button>
              </div>

              {panelProps.isLayerOverlayMode && !isActive && isOverlaySelected && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="w-10 text-[9px] text-[#8E95A3]">투명도</span>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={Math.round(opacity * 100)}
                    onChange={(e) => panelProps.onChangeOverlayLayerOpacity?.(layer.id, Number(e.target.value) / 100)}
                    className="h-1.5 flex-1 accent-[#3B45B3]"
                  />
                  <span className="w-8 text-right text-[9px] font-bold text-[#6F7C96]">{Math.round(opacity * 100)}%</span>
                </div>
              )}
            </div>
          )
        })}

        <div className="flex items-center justify-between rounded-md bg-[#F8FAFC] px-2 py-1.5">
          <span className="text-[10px] font-bold text-[#4B5873]">층 겹쳐보기</span>
          <button
            type="button"
            onClick={panelProps.onToggleLayerOverlayMode}
            className={`rounded p-1 ${
              panelProps.isLayerOverlayMode
                ? 'bg-[#3B45B3] text-white'
                : 'text-[#64748B] hover:bg-[#EEF2FF] hover:text-[#3B45B3]'
            }`}
            aria-label="층 겹쳐보기 토글"
          >
            {panelProps.isLayerOverlayMode ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>
        </div>

        <button
          type="button"
          onClick={panelProps.onAddLayer}
          className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-[#CBD5E1] py-1.5 text-[11px] font-bold text-[#64748B] hover:border-[#3B45B3] hover:text-[#3B45B3]"
        >
          <Plus size={12} />
          새 층 추가
        </button>
      </div>

      <DeleteConfirmModal
        isOpen={pendingDeleteLayer !== null}
        title="층 삭제"
        message={`"${pendingDeleteLayer?.name ?? ''}" 층을 삭제하시겠습니까?`}
        onClose={closeDeleteLayerModal}
        onConfirm={confirmDeleteLayer}
      />
    </>
  )
}

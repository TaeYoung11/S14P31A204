import { Check, Pencil, Trash2, X } from 'lucide-react'
import type { BubbleFloor, BubbleFloorSummary } from '../../../types'
import { formatBubbleFloorLabel } from '../../../utils/bubbleFloorUtils'
import { getBubbleFloorInputPattern, isBubbleFloorInputText } from '../../../utils/floorPolicy'

interface BubbleFloorListItemProps {
  floorMeta: BubbleFloor
  summary: BubbleFloorSummary | undefined
  isActive: boolean
  isEditing: boolean
  editingName: string
  canDeleteFloor: boolean
  isReadOnly: boolean
  onSelectFloor?: (floor: number) => void
  onStartRename: (floorMeta: BubbleFloor) => void
  onCommitRename: (floor: number) => void
  onCancelRename: () => void
  onChangeEditingName: (value: string) => void
  onRequestDelete?: () => void
}

/**
 * 버블 층 목록의 단일 행 UI.
 * 선택/이름수정/삭제 액션을 분리해 상위 섹션의 가독성을 유지한다.
 */
export function BubbleFloorListItem({
  floorMeta,
  summary,
  isActive,
  isEditing,
  editingName,
  canDeleteFloor,
  isReadOnly,
  onSelectFloor,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onChangeEditingName,
  onRequestDelete,
}: BubbleFloorListItemProps) {
  const bubbleCount = summary?.bubbleCount ?? 0
  const totalAreaM2 = summary?.totalAreaM2 ?? 0

  return (
    <div
      className={`rounded-md border px-2 py-1.5 ${
        isActive ? 'border-[#C8D2FF] bg-[#F4F6FF]' : 'border-[#EEF2F7] bg-[#FCFDFF]'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <>
              <input
                type="text"
                inputMode="numeric"
                pattern={getBubbleFloorInputPattern()}
                value={editingName}
                onChange={(event) => {
                  const next = event.target.value.trim()
                  if (next === '' || isBubbleFloorInputText(next)) {
                    onChangeEditingName(next)
                  }
                }}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    onCommitRename(floorMeta.floor)
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    onCancelRename()
                  }
                }}
                autoFocus
                className="w-full rounded border border-[#C8D2FF] bg-white px-1.5 py-0.5 text-[11px] font-bold text-[#1C1C1E] outline-none"
              />
              <p className="mt-1 text-[9px] text-[#94A3B8]">
                {`버블 ${bubbleCount}개 · 총면적 ${totalAreaM2.toFixed(1)}m²`}
              </p>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onSelectFloor?.(floorMeta.floor)}
              className="w-full text-left"
            >
              <p className={`truncate text-[11px] font-bold ${isActive ? 'text-[#3B45B3]' : 'text-[#334155]'}`}>
                {formatBubbleFloorLabel(floorMeta.name)}
              </p>
              <p className="text-[9px] text-[#94A3B8]">
                {`버블 ${bubbleCount}개 · 총면적 ${totalAreaM2.toFixed(1)}m²`}
              </p>
            </button>
          )}
        </div>

        {isEditing ? (
          <>
            <button
              type="button"
              onClick={() => onCommitRename(floorMeta.floor)}
              className="rounded p-1 text-[#3B45B3] hover:bg-[#E9EEFF]"
              title="이름 저장"
            >
              <Check size={12} />
            </button>
            <button
              type="button"
              onClick={onCancelRename}
              className="rounded p-1 text-[#7A869F] hover:bg-[#EEF2F7]"
              title="수정 취소"
            >
              <X size={12} />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onStartRename(floorMeta)}
              disabled={isReadOnly}
              className={`rounded p-1 ${
                isReadOnly
                  ? 'cursor-not-allowed text-[#D4DAE8]'
                  : 'text-[#64748B] hover:bg-[#EEF2FF] hover:text-[#3B45B3]'
              }`}
              title="층 이름 수정"
            >
              <Pencil size={12} />
            </button>
            <button
              type="button"
              onClick={() => {
                if (!canDeleteFloor || isReadOnly) return
                onRequestDelete?.()
              }}
              disabled={!canDeleteFloor || isReadOnly}
              className={`rounded p-1 ${
                !canDeleteFloor || isReadOnly
                  ? 'cursor-not-allowed text-[#D4DAE8]'
                  : 'text-[#B56A6A] hover:bg-[#FDEEEE] hover:text-[#C23E3E]'
              }`}
              title={canDeleteFloor ? '층 삭제' : '최소 1개 층은 유지됩니다'}
            >
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

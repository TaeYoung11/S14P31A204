import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { BubbleFloor, BubbleFloorSummary } from '../../../types'
import { toEditableBubbleFloorName } from '../../../utils/bubbleFloorUtils'
import { buildSummaryByFloorMap } from '../../../utils/bubbleFloorMutations'
import { BubbleFloorListItem } from './BubbleFloorListItem'

export interface BubbleFloorSectionProps {
  floors: BubbleFloor[]
  summaries: BubbleFloorSummary[]
  activeFloor: number
  isReadOnly: boolean
  onSelectFloor?: (floor: number) => void
  onAddFloor?: () => void
  onRenameFloor?: (floor: number, name: string) => void
  onDeleteFloor?: (floor: number) => void
}

/**
 * 버블 모드의 층 목록을 표시하고 선택/추가/이름수정/삭제 액션을 제공한다.
 * - 이름 수정 입력은 숫자만 허용한다.
 * - 삭제는 최소 1개 층 유지 조건을 강제한다.
 */
export function BubbleFloorSection({
  floors,
  summaries,
  activeFloor,
  isReadOnly,
  onSelectFloor,
  onAddFloor,
  onRenameFloor,
  onDeleteFloor,
}: BubbleFloorSectionProps) {
  const [editingFloor, setEditingFloor] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const canDeleteFloor = floors.length > 1
  const summaryByFloor = useMemo(() => buildSummaryByFloorMap(summaries), [summaries])

  const startRename = (floorMeta: BubbleFloor) => {
    if (isReadOnly) return
    setEditingFloor(floorMeta.floor)
    setEditingName(toEditableBubbleFloorName(floorMeta.name, floorMeta.floor))
  }

  const cancelRename = () => {
    setEditingFloor(null)
    setEditingName('')
  }

  const commitRename = (floor: number) => {
    onRenameFloor?.(floor, editingName)
    cancelRename()
  }

  return (
    <div className="space-y-1.5">
      {floors.map((floorMeta) => {
        const isActive = floorMeta.floor === activeFloor
        const isEditing = editingFloor === floorMeta.floor
        const summary = summaryByFloor.get(floorMeta.floor)
        return (
          <BubbleFloorListItem
            key={`bubble-floor-item-${floorMeta.floor}`}
            floorMeta={floorMeta}
            summary={summary}
            isActive={isActive}
            isEditing={isEditing}
            editingName={editingName}
            canDeleteFloor={canDeleteFloor}
            isReadOnly={isReadOnly}
            onSelectFloor={onSelectFloor}
            onStartRename={startRename}
            onCommitRename={commitRename}
            onCancelRename={cancelRename}
            onChangeEditingName={setEditingName}
            onDeleteFloor={onDeleteFloor}
          />
        )
      })}

      <button
        type="button"
        onClick={onAddFloor}
        disabled={isReadOnly}
        className={`mt-1 inline-flex w-full items-center justify-center gap-1 rounded-md border border-dashed py-1.5 text-[11px] font-bold ${
          isReadOnly
            ? 'cursor-not-allowed border-[#D8DEEC] text-[#BEC7D8]'
            : 'border-[#CBD5E1] text-[#64748B] hover:border-[#3B45B3] hover:text-[#3B45B3]'
        }`}
      >
        <Plus size={12} />
        층 추가
      </button>
    </div>
  )
}

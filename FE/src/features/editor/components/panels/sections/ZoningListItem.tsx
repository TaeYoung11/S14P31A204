import { X } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import type { ZoneData } from '../../../types'

interface ZoningListItemProps {
  zone: ZoneData
  onEdit: (zone: ZoneData) => void
  onDelete: (zoneId: string) => void
}

/**
 * 조닝 한 행(Row)을 렌더링한다.
 * - 자동/수동과 무관하게 수정 + 삭제를 동일하게 제공한다.
 */
export function ZoningListItem({ zone, onEdit, onDelete }: ZoningListItemProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onEdit(zone)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onEdit(zone)}
      onKeyDown={handleKeyDown}
      className="cursor-pointer rounded-lg border border-transparent bg-[#F8F9FD] px-3 py-2.5 transition-colors hover:border-[#D9DEF0]"
    >
      <div className="flex items-center justify-between gap-2">
        <ZoneSummary zone={zone} />
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onDelete(zone.id)
            }}
            className="text-[#ADB5BD] transition-colors hover:text-[#E03131]"
            aria-label={`${zone.name} 삭제`}
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

interface ZoneSummaryProps {
  zone: ZoneData
}

function ZoneSummary({ zone }: ZoneSummaryProps) {
  return <ZoneSummaryLeft zone={zone} />
}

function ZoneSummaryLeft({ zone }: { zone: ZoneData }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/5"
        style={{ backgroundColor: zone.color }}
      />
      <div className="min-w-0">
        <p className="truncate text-xs font-bold text-[#1C1C1E]">{zone.name}</p>
        <p className="text-[10px] font-medium text-[#6C757D]">{zone.bubbleIds.length}개 공간</p>
      </div>
    </div>
  )
}

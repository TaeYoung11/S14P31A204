import type { ZoneData } from '../../../types'
import { ZoningListItem } from './ZoningListItem'

export interface ZoningSectionProps {
  zoningListItems: ZoneData[]
  onOpenZoningModal: () => void
  onOpenEditZoningModal: (zone: ZoneData) => void
  onDeleteZoning: (zoneId: string) => void
}

/**
 * 버블 모드 조닝 목록/추가/수정/삭제 섹션.
 */
export function ZoningSection({
  zoningListItems,
  onOpenZoningModal,
  onOpenEditZoningModal,
  onDeleteZoning,
}: ZoningSectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onOpenZoningModal}
          className="text-[10px] font-bold text-[#3B45B3] transition-colors hover:text-[#2D3691]"
        >
          + 조닝 추가
        </button>
        <span className="text-[10px] font-bold text-[#7A849C]">{zoningListItems.length}개</span>
      </div>

      {zoningListItems.length === 0 ? (
        <div className="py-3 text-center text-xs font-medium text-[#ADB5BD]">
          현재 층에 생성된 조닝이 없습니다
        </div>
      ) : (
        zoningListItems.map((zone) => (
          <ZoningListItem
            key={zone.id}
            zone={zone}
            onEdit={onOpenEditZoningModal}
            onDelete={onDeleteZoning}
          />
        ))
      )}
    </div>
  )
}

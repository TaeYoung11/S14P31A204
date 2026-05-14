import type { BubbleInfo, BubbleZoneInfo } from '../BubbleAttributePanel.types'

interface BubbleZonesSectionProps {
  selectedBubble: BubbleInfo
  zones: BubbleZoneInfo[]
}

/** 버블이 속한 조닝 목록을 표시한다. */
export function BubbleZonesSection({ selectedBubble, zones }: BubbleZonesSectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[10px] font-bold text-[#3B45B3]">소속 조닝</h3>
      {zones.length === 0 ? (
        <div className="bg-[#F8F9FD] rounded-lg px-3 py-2.5 text-[11px] font-medium text-[#ADB5BD]">
          아직 소속된 조닝이 없습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {zones.map((zone) => (
            <div
              key={`${selectedBubble.id}-${zone.id}`}
              className="bg-[#F8F9FD] rounded-lg px-3 py-2.5 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/5"
                  style={{ backgroundColor: zone.color }}
                />
                <span className="text-xs font-bold text-[#1C1C1E] truncate">{zone.name}</span>
              </div>
              <span
                className={`text-[10px] font-black px-2 py-1 rounded-md ${
                  zone.source === 'auto'
                    ? 'text-[#5D4AD8] bg-[#EEE9FF]'
                    : 'text-[#3B45B3] bg-[#EAF0FF]'
                }`}
              >
                {zone.source === 'auto' ? '자동' : '수동'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


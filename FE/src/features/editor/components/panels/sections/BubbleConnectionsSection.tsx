import type { ConnectionStyle } from '../../../types'
import type { BubbleConnectionInfo, BubbleInfo } from '../BubbleAttributePanel.types'

interface BubbleConnectionsSectionProps {
  selectedBubble: BubbleInfo
  connections: BubbleConnectionInfo[]
}

const CONNECTION_STYLE_META: Record<ConnectionStyle, { label: string; strength: string; strengthClass: string }> = {
  bold: {
    label: '직접 인접',
    strength: '강',
    strengthClass: 'bg-[#E7EBFF] text-[#3B45B3]',
  },
  thin: {
    label: '일반 연결',
    strength: '중',
    strengthClass: 'bg-[#EDF2FF] text-[#3B45B3]',
  },
  dashed: {
    label: '간접 연결',
    strength: '약',
    strengthClass: 'bg-[#F1F3F5] text-[#6C757D]',
  },
}

/** 선택 버블의 연결 관계 목록을 표시한다. */
export function BubbleConnectionsSection({ selectedBubble, connections }: BubbleConnectionsSectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[10px] font-bold text-[#3B45B3]">연결 관계</h3>
      {connections.length === 0 ? (
        <div className="bg-[#F8F9FD] rounded-lg px-3 py-2.5 text-[11px] font-medium text-[#ADB5BD]">
          아직 연결된 공간 관계가 없습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {connections.map((connection) => {
            const meta = CONNECTION_STYLE_META[connection.style]
            return (
              <div
                key={`${selectedBubble.id}-${connection.targetId}-${connection.style}`}
                className="bg-[#F8F9FD] rounded-lg px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#1C1C1E]">{connection.targetLabel}</span>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${meta.strengthClass}`}>
                    {meta.strength}
                  </span>
                </div>
                <p className="mt-1 text-[10px] font-medium text-[#6C757D]">{meta.label}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}


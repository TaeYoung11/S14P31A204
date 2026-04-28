import { ColorSelector } from '../shared/ColorSelector'
import { ROOM_TYPES } from '../../constants'
import type { ConnectionStyle } from '../../types'

export interface BubbleInfo {
  id: string
  label: string
  type: string
  widthMm: number
  heightMm: number
  ratio: number
  color: string
}

export interface BubbleConnectionInfo {
  targetId: string
  targetLabel: string
  style: ConnectionStyle
}

export interface BubbleZoneInfo {
  id: string
  name: string
  color: string
  source?: 'auto' | 'manual'
}

interface BubbleAttributePanelProps {
  selectedBubble: BubbleInfo | null
  onLabelChange: (id: string, label: string) => void
  onTypeChange: (id: string, type: string) => void
  onWidthChange: (id: string, width: number) => void
  onHeightChange: (id: string, height: number) => void
  onRatioChange: (id: string, ratio: number) => void
  onColorChange: (id: string, color: string) => void
  connections?: BubbleConnectionInfo[]
  zones?: BubbleZoneInfo[]
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

export function BubbleAttributePanel({
  selectedBubble,
  onLabelChange,
  onTypeChange,
  onWidthChange,
  onHeightChange,
  onRatioChange,
  onColorChange,
  connections = [],
  zones = [],
}: BubbleAttributePanelProps) {
  if (!selectedBubble) {
    return (
      <div className="p-5 text-center text-[#ADB5BD] text-xs font-medium">
        공간을 선택하세요
      </div>
    )
  }

  return (
    <div className="p-5 flex flex-col gap-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] font-bold text-[#ADB5BD] uppercase">방 이름</span>
          <input
            type="text"
            value={selectedBubble.label}
            onChange={(event) => onLabelChange(selectedBubble.id, event.target.value)}
            className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] font-bold text-[#ADB5BD] uppercase">방 종류</span>
          <select
            value={selectedBubble.type}
            onChange={(event) => onTypeChange(selectedBubble.id, event.target.value)}
            className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none"
          >
            {ROOM_TYPES.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-bold text-[#ADB5BD] uppercase">가로 (mm)</span>
            <input
              type="number"
              min={1}
              step={1}
              value={Math.round(selectedBubble.widthMm)}
              onChange={(event) => {
                const value = Number.parseFloat(event.target.value)
                if (!Number.isNaN(value) && value > 0) onWidthChange(selectedBubble.id, value)
              }}
              className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-bold text-[#ADB5BD] uppercase">세로 (mm)</span>
            <input
              type="number"
              min={1}
              step={1}
              value={Math.round(selectedBubble.heightMm)}
              onChange={(event) => {
                const value = Number.parseFloat(event.target.value)
                if (!Number.isNaN(value) && value > 0) onHeightChange(selectedBubble.id, value)
              }}
              className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="bubble-ratio"
            className="text-[9px] font-bold text-[#ADB5BD] uppercase"
          >
            면적 (m²)
          </label>
          <input
            id="bubble-ratio"
            type="number"
            min={1}
            step={0.5}
            value={selectedBubble.ratio}
            onChange={e => {
              const v = parseFloat(e.target.value)
              if (!isNaN(v) && v > 0) onRatioChange(selectedBubble.id, v)
            }}
            className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none"
          />
        </div>

        <ColorSelector
          value={selectedBubble.color}
          onChange={color => onColorChange(selectedBubble.id, color)}
        />

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
      </div>

      <div className="pt-4 border-t border-[#F0F2F9] flex items-center justify-between">
        <span className="text-[10px] font-bold text-[#ADB5BD]">계산 면적</span>
        <span className="text-sm font-black text-[#3B45B3]">{selectedBubble.ratio.toFixed(2)} m²</span>
      </div>
    </div>
  )
}

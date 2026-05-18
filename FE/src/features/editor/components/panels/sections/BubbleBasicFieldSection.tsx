import { ColorSelector } from '../../shared/ColorSelector'
import { ROOM_TYPES } from '../../../constants'
import { formatBubbleFloorLabel } from '../../../utils/bubbleFloorUtils'
import { isAllowedBubbleFloorNumber } from '../../../utils/floorPolicy'
import type { BubbleBasicFieldSectionModel } from '../BubbleAttributePanel.types'

/**
 * 버블 기본 속성(이름/종류/층/치수/면적/색상) 편집 섹션.
 * 화면 렌더링만 담당하고 계산/검증은 유틸 함수를 재사용한다.
 */
export function BubbleBasicFieldSection({
  selectedBubble,
  bubbleFloors,
  onLabelChange,
  onTypeChange,
  onRatioChange,
  onColorChange,
  onFloorChange,
}: BubbleBasicFieldSectionModel) {
  return (
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
          <span className="text-[9px] font-bold text-[#ADB5BD] uppercase">층</span>
          <select
            value={selectedBubble.floor ?? 1}
            onChange={(event) => {
              const value = Number.parseInt(event.target.value, 10)
              if (!isAllowedBubbleFloorNumber(value)) return
              onFloorChange?.(selectedBubble.id, value)
            }}
            className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none"
          >
            {(bubbleFloors.length > 0 ? bubbleFloors : [{ floor: selectedBubble.floor ?? 1, name: String(selectedBubble.floor ?? 1) }])
              .map((floorMeta) => (
                <option key={`bubble-floor-option-${floorMeta.floor}`} value={floorMeta.floor}>
                  {formatBubbleFloorLabel(floorMeta.name)}
                </option>
              ))}
          </select>
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
            onChange={(event) => {
              const value = Number.parseFloat(event.target.value)
              if (!Number.isNaN(value) && value > 0) onRatioChange(selectedBubble.id, value)
            }}
            className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none"
          />
        </div>
      </div>

      <ColorSelector
        value={selectedBubble.color}
        onChange={(color) => onColorChange(selectedBubble.id, color)}
      />
    </div>
  )
}

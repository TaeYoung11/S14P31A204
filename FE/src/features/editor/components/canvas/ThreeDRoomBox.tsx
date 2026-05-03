import type { FloorRoom } from '../../types'
import { hexToRgba } from '../../utils/bubbleCalc'

interface ThreeDRoomBoxProps {
  room: FloorRoom
  height: number
  isSelected?: boolean
  isOutsideSite?: boolean
  onSelect?: (id: string | null) => void
  selectedTool?: string
  isPanActive?: boolean
  isOverlay?: boolean
  overlayOpacity?: number
}

/** CSS 3D Transform 기반 방 박스 렌더러 — 상단·하단·4면 벽체로 구성 */
export default function ThreeDRoomBox({
  room,
  height,
  isSelected,
  isOutsideSite = false,
  onSelect,
  selectedTool = 'selection',
  isPanActive = false,
  isOverlay = false,
  overlayOpacity = 0.35,
}: ThreeDRoomBoxProps) {
  const color = room.color || '#3B45B3'
  const lightColor = hexToRgba(color, 0.4)
  const darkColor = hexToRgba(color, 0.8)

  const isHand = selectedTool === 'hand' || isPanActive

  return (
    <div
      className={`absolute preserve-3d transition-all duration-500 group ${
        isHand ? 'cursor-inherit' : 'cursor-pointer'
      } ${isSelected && !isHand ? 'translate-z-6' : !isHand ? 'hover:translate-z-4' : ''}`}
      style={{
        left: room.x,
        top: room.y,
        width: room.width,
        height: room.height,
        pointerEvents: isOverlay ? 'none' : 'auto',
        opacity: isOverlay ? Math.min(Math.max(overlayOpacity, 0.1), 0.9) : 1,
      }}
      onClick={(e) => {
        if (isOverlay) return
        if (isHand) return
        e.stopPropagation()
        onSelect?.(isSelected ? null : room.bubbleId)
      }}
    >
      <div
        className="absolute inset-0 shadow-inner"
        style={{
          backgroundColor: isOverlay ? hexToRgba(color, 0.06) : isSelected ? hexToRgba(color, 0.2) : hexToRgba(color, 0.1),
          border: `1px solid ${isOverlay ? hexToRgba('#3B45B3', 0.45) : isOutsideSite ? '#DC2626' : isSelected ? color : hexToRgba(color, 0.2)}`,
        }}
      />

      <div
        className="absolute inset-0 flex items-center justify-center overflow-hidden"
        style={{
          transform: `translateZ(${height}px)`,
          backgroundColor: isOverlay ? hexToRgba(color, 0.03) : isSelected ? hexToRgba(color, 0.1) : hexToRgba(color, 0.05),
          border: isOverlay ? `1px dashed ${hexToRgba('#3B45B3', 0.7)}` : isOutsideSite ? '2px solid #DC2626' : isSelected ? '3px solid #3B45B3' : `2px solid ${color}`,
          boxShadow: isSelected ? '0 0 15px rgba(59,69,179,0.4)' : 'none',
        }}
      >
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[10px] font-black text-[#1C1C1E]">{room.label}</span>
          <span className="text-[8px] font-bold text-[#ADB5BD]">{room.area.toFixed(1)}m²</span>
          {isOutsideSite && <span className="text-[8px] font-black text-[#DC2626]">대지 밖</span>}
        </div>
      </div>

      <div
        className="absolute w-full origin-bottom"
        style={{ height, bottom: 0, transform: 'rotateX(-90deg)', background: `linear-gradient(to top, ${darkColor}, ${lightColor})`, border: `1px solid ${hexToRgba('#000', 0.1)}` }}
      />
      <div
        className="absolute w-full origin-top"
        style={{ height, top: 0, transform: 'rotateX(90deg)', background: `linear-gradient(to bottom, ${darkColor}, ${lightColor})` }}
      />
      <div
        className="absolute h-full origin-right"
        style={{ width: height, right: 0, top: 0, transform: 'rotateY(90deg)', background: `linear-gradient(to right, ${darkColor}, ${lightColor})` }}
      />
      <div
        className="absolute h-full origin-left"
        style={{ width: height, left: 0, top: 0, transform: 'rotateY(-90deg)', background: `linear-gradient(to left, ${darkColor}, ${lightColor})` }}
      />

      <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
    </div>
  )
}

import type { BubbleLabelEditInfo } from '../canvas/BubbleCanvas'

interface LabelEditOverlayProps {
  info: BubbleLabelEditInfo
  onConfirm: (id: string, label: string) => void
  onCancel: () => void
}

/**
 * 버블 라벨 인라인 편집 오버레이
 * - Enter/blur 저장
 * - Escape 취소
 */
export function LabelEditOverlay({ info, onConfirm, onCancel }: LabelEditOverlayProps) {
  return (
    <div
      style={{
        position: 'absolute',
        left: info.x + info.width * 0.15,
        top: info.y + info.height * 0.35,
        width: info.width * 0.7,
        zIndex: 100,
        pointerEvents: 'auto',
      }}
    >
      <input
        autoFocus
        type="text"
        defaultValue={info.label}
        onBlur={(e) => onConfirm(info.id, e.target.value.trim() || info.label)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            e.preventDefault()
            onCancel()
          }
        }}
        className="w-full text-center text-sm font-bold bg-white/95 border-2 border-[#3B45B3] rounded-lg px-2 py-1 outline-none shadow-lg"
      />
    </div>
  )
}

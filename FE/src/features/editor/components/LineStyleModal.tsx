import type { ConnectionPair, ConnectionStyle } from '../types'
import { LINE_STYLE_OPTIONS } from '../constants'
import EditorModal from './EditorModal'

interface LineStyleModalProps {
  isOpen: boolean
  lineConnectionPair: ConnectionPair | null
  selectedStyle: ConnectionStyle
  onClose: () => void
  onConfirm: () => void
  onChangeStyle: (style: ConnectionStyle) => void
  getBubbleLabel: (bubbleId: string) => string
}

/** 공간 간 연결선 스타일 선택 모달 */
export function LineStyleModal({
  isOpen,
  lineConnectionPair,
  selectedStyle,
  onClose,
  onConfirm,
  onChangeStyle,
  getBubbleLabel,
}: LineStyleModalProps) {
  return (
    <EditorModal
      isOpen={isOpen}
      onClose={onClose}
      title="선 스타일 설정"
      subtitle="공간 간의 관계 유형을 선택하세요"
      confirmLabel="적용하기"
      onConfirm={onConfirm}
      confirmDisabled={!lineConnectionPair}
    >
      <div className="rounded-xl bg-[#F6F8FC] px-4 py-3">
        {lineConnectionPair ? (
          <p className="text-[11px] font-bold text-[#4A5A74]">
            선택된 연결: {getBubbleLabel(lineConnectionPair.from)} ↔ {getBubbleLabel(lineConnectionPair.to)}
          </p>
        ) : (
          <p className="text-[11px] font-bold text-[#8A97AD]">
            선 연결을 만들려면 캔버스에서 공간 2개를 순서대로 선택하세요.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {LINE_STYLE_OPTIONS.map((option) => {
          const isSelected = selectedStyle === option.value

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChangeStyle(option.value)}
              className={`w-full rounded-[18px] border px-4 py-4 flex items-center justify-between transition-all ${isSelected
                  ? 'border-[2px] border-[#6268F2] bg-white shadow-[0_6px_22px_rgba(98,104,242,0.08)]'
                  : 'border border-transparent bg-[#F6F8FC] hover:border-[#E1E8F5]'
                }`}
            >
              <div className="flex items-center gap-4">
                <div className="w-[52px] h-[52px] rounded-[12px] border border-[#D8E1EF] bg-[#F9FBFF] flex items-center justify-center shadow-sm shrink-0">
                  {option.value === 'bold' && (
                    <div className="flex flex-col gap-1.5">
                      <div className="w-7 h-[3px] bg-[#3B45B3] rounded-full" />
                      <div className="w-7 h-[3px] bg-[#3B45B3] rounded-full" />
                    </div>
                  )}
                  {option.value === 'thin' && <div className="w-7 h-[3px] bg-[#3B45B3] rounded-full" />}
                  {option.value === 'dashed' && (
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#3B45B3]" />
                      <div className="w-1.5 h-1.5 rounded-full bg-[#3B45B3]" />
                      <div className="w-1.5 h-1.5 rounded-full bg-[#3B45B3]" />
                    </div>
                  )}
                </div>
                <div className="text-left flex-1">
                  <p className="text-[14px] font-black text-[#1B2235]">{option.title}</p>
                  <p className={`mt-1 text-[11px] leading-[1.25] font-bold ${isSelected ? 'text-[#5F63F2]' : 'text-[#6B7C95]'}`}>
                    {option.description}
                  </p>
                </div>
              </div>
              <div
                className={`w-[28px] h-[28px] rounded-full border-[3px] flex items-center justify-center transition-colors shrink-0 ${isSelected ? 'border-[#5F63F2]' : 'border-[#C0CCDB]'
                  }`}
              >
                {isSelected && <div className="w-[12px] h-[12px] rounded-full bg-[#5F63F2]" />}
              </div>
            </button>
          )
        })}
      </div>
    </EditorModal>
  )
}

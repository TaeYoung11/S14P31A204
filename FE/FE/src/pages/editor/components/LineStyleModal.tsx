// 선 스타일 선택 모달
// 버블 간 연결선을 생성할 때 표시된다.
// 드래그 연결 완료 후 / 버블 선택 후 사이드바 버튼 클릭 두 가지 진입 경로를 지원한다.

import { X, PlusCircle } from 'lucide-react'

interface LineStyleModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectType: (type: string) => void
  selectedBubbleId: string | null
  /** 드래그 연결로 양 끝 버블이 이미 확정된 상태 */
  hasPendingConnection?: boolean
}

/** 연결선 종류 옵션 — 건축 공간 구성에서의 의미 포함 */
const LINE_STYLES = [
  {
    type:        'bold',
    label:       '굵은 실선',
    description: '직접 인접 필수 (예: 주방 ↔ 식당)',
    preview:     <div className="w-10 h-[4px] bg-[#3B45B3] rounded-full" />,
  },
  {
    type:        'thin',
    label:       '얇은 실선',
    description: '일반 연결 (예: 거실 ↔ 침실)',
    preview:     <div className="w-10 h-[1.5px] bg-[#3B45B3] rounded-full" />,
  },
  {
    type:        'dashed',
    label:       '점선',
    description: '선호 인접 / 간접 연결 (예: 거실 ↔ 발코니)',
    preview:     <div className="w-10 border-b-2 border-dashed border-[#ADB5BD]" />,
  },
]

export default function LineStyleModal({
  isOpen,
  onClose,
  onSelectType,
  selectedBubbleId,
  hasPendingConnection = false,
}: LineStyleModalProps) {
  if (!isOpen) return null

  const guide = hasPendingConnection
    ? '두 공간이 선택되었습니다. 연결선 종류를 선택하세요.'
    : selectedBubbleId
    ? '선택된 공간에서 시작합니다. 스타일 선택 후 연결할 공간을 클릭하세요.'
    : '공간을 먼저 선택하면 버블 연결선이 생성됩니다.'

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-[400px] overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="px-8 pt-8 pb-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-[18px] font-black text-[#1C1C1E]">선 스타일 선택</h2>
            <button onClick={onClose} className="text-[#ADB5BD] hover:text-[#1C1C1E] transition-colors">
              <X size={20} />
            </button>
          </div>
          <p className="text-[11px] font-bold text-[#ADB5BD] mb-8">{guide}</p>

          <div className="flex flex-col gap-3">
            {LINE_STYLES.map(({ type, label, description, preview }) => (
              <button
                key={type}
                onClick={() => onSelectType(type)}
                className="w-full flex items-center justify-between p-4 bg-[#F8F9FD] hover:bg-[#F0F2FF] rounded-2xl group transition-all"
              >
                <div className="flex items-center gap-4">
                  {preview}
                  <div className="flex flex-col items-start gap-0.5">
                    <span className="text-xs font-bold text-[#1C1C1E]">{label}</span>
                    <span className="text-[10px] font-medium text-[#ADB5BD]">{description}</span>
                  </div>
                </div>
                <PlusCircle size={16} className="text-[#ADB5BD] group-hover:text-[#3B45B3] shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

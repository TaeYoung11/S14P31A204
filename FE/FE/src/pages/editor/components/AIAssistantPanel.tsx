// AI 어시스턴트 패널
// AI가 분석한 설계 개선 제안을 카드 형태로 표시한다.

import { Minus, Sparkles } from 'lucide-react'

export default function AIAssistantPanel() {
  return (
    <section className="bg-[#3B45B3] rounded-2xl shadow-lg shadow-[#3B45B3]/20 overflow-hidden flex flex-col mt-auto">
      <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <Sparkles size={14} fill="white" />
          <h2 className="text-[11px] font-extrabold uppercase tracking-wider">AI 어시스턴트</h2>
        </div>
        <Minus size={14} className="text-white/40" />
      </div>

      {/* AI 제안 메시지 카드 */}
      <div className="p-4">
        <div className="bg-white rounded-xl p-4 shadow-inner">
          <p className="text-[11px] leading-relaxed text-[#1C1C1E] font-medium">
            거실 공간에 비해 창문 크기가 작습니다.
            <br />
            채광 효율을 위해 창문 너비를 1200mm에서{' '}
            <span className="text-[#3B45B3] font-bold">1800mm</span>로 확장할까요?
          </p>
        </div>
      </div>
    </section>
  )
}

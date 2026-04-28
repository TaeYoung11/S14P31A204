import { Eye, Lock, ChevronDown, ChevronRight, Plus, Minus } from 'lucide-react'
import type { FloorLayer } from '../../types'

interface TwoDLeftPanelsProps {
  /** 생성된 층 목록 (빈 배열이면 미생성 상태 UI) */
  layers?: FloorLayer[]
  /** 현재 활성 층 id */
  activeLayerId?: string | null
  /** 평면도가 생성되었는지 여부 */
  isGenerated?: boolean
  /** 층 추가 버튼 핸들러 */
  onAddLayer?: () => void
  /** 층 선택 핸들러 */
  onSelectLayer?: (id: string) => void
}

export function TwoDLeftPanels({
  layers = [],
  activeLayerId = null,
  isGenerated = false,
  onAddLayer,
  onSelectLayer,
}: TwoDLeftPanelsProps) {
  return (
    <div className="absolute top-6 left-6 flex flex-col gap-4 z-10 bottom-24 pointer-events-none">
      {/* ── 층 보기 패널 ──────────────────────────────────────────────────── */}
      <div className="w-[200px] bg-white border border-[#E2E6EF] rounded-2xl shadow-sm overflow-hidden pointer-events-auto">
        <div className="px-4 py-3 flex items-center justify-between border-b border-[#F0F2F9]">
          <span className="text-[11px] font-extrabold text-[#1C1C1E]">층 보기</span>
          <button
            onClick={isGenerated ? onAddLayer : undefined}
            disabled={!isGenerated}
            title={isGenerated ? '새 층 추가' : '평면도 생성 후 층을 추가할 수 있습니다'}
            className={`transition-colors rounded ${
              isGenerated
                ? 'text-[#ADB5BD] hover:text-[#3B45B3] hover:bg-[#F0F2FF] p-0.5'
                : 'text-[#D9DEF0] cursor-not-allowed'
            }`}
          >
            <Plus size={14} />
          </button>
        </div>

        <div className="p-2 flex flex-col gap-1">
          {isGenerated ? (
            /* ── 생성 완료: 동적 층 목록 ───────────────────────────────────── */
            layers.map((layer) => {
              const isActive = activeLayerId === layer.id
              return (
                <button
                  key={layer.id}
                  onClick={() => onSelectLayer?.(layer.id)}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg group transition-colors ${
                    isActive ? 'bg-[#F0F2FF]' : 'hover:bg-[#F8F9FD]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Eye
                      size={12}
                      className={isActive ? 'text-[#3B45B3]' : 'text-[#3B45B3]'}
                    />
                    <span
                      className={`text-[11px] font-bold ${
                        isActive ? 'text-[#3B45B3]' : 'text-[#1C1C1E]'
                      }`}
                    >
                      {layer.name}
                    </span>
                  </div>
                  <Lock size={12} className="text-[#ADB5BD] group-hover:text-[#505764]" />
                </button>
              )
            })
          ) : (
            /* ── 미생성: 기존 정적 UI 유지 ─────────────────────────────────── */
            <>
              <div className="flex items-center justify-between px-2 py-1.5 hover:bg-[#F8F9FD] rounded-lg group">
                <div className="flex items-center gap-2">
                  <Eye size={12} className="text-[#3B45B3]" />
                  <span className="text-[11px] font-bold text-[#ADB5BD]">1층 평면도</span>
                </div>
                <Lock size={12} className="text-[#ADB5BD] group-hover:text-[#505764]" />
              </div>
              <div className="flex items-center justify-between px-2 py-1.5 hover:bg-[#F8F9FD] rounded-lg group">
                <div className="flex items-center gap-2">
                  <Eye size={12} className="text-[#3B45B3]" />
                  <span className="text-[11px] font-bold text-[#1C1C1E]">대지 면적</span>
                </div>
                <Lock size={12} className="text-[#ADB5BD] group-hover:text-[#505764]" />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex-1" />

      {/* ── 계층 구조 패널 (기존 유지) ────────────────────────────────────── */}
      <div className="w-[200px] bg-white border border-[#E2E6EF] rounded-2xl shadow-sm overflow-hidden pointer-events-auto">
        <div className="px-4 py-3 flex items-center justify-between border-b border-[#F0F2F9]">
          <span className="text-[11px] font-extrabold text-[#1C1C1E]">계층 구조</span>
          <button className="text-[#ADB5BD] hover:text-[#505764] transition-colors">
            <Minus size={14} />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-2">
          {/* 거실 항목 (정적 예시) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <ChevronDown size={12} className="text-[#1C1C1E]" />
              <div className="w-1 h-3 bg-[#1C1C1E] rounded-sm" />
              <div className="w-1 h-3 bg-[#1C1C1E] rounded-sm mr-1" />
              <span className="text-[11px] font-bold text-[#1C1C1E]">[Living Room]</span>
            </div>

            <div className="pl-6 flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <Minus size={12} className="text-[#ADB5BD]" />
                <div className="w-0.5 h-3 bg-[#1C1C1E] rounded-sm mr-1" />
                <span className="text-[11px] font-bold text-[#1C1C1E]">_01</span>
              </div>
              <div className="pl-5 flex items-center gap-1.5">
                <div className="w-2 h-2 border border-[#ADB5BD] rounded-sm" />
                <span className="text-[10px] font-medium text-[#6B7A99]">여닫이 문</span>
              </div>
            </div>
          </div>

          {/* 하위 항목 01 */}
          <div className="flex items-center gap-1.5 mt-2">
            <ChevronRight size={12} className="text-[#ADB5BD]" />
            <div className="w-1 h-3 bg-[#ADB5BD] rounded-sm" />
            <div className="w-1 h-3 bg-[#ADB5BD] rounded-sm mr-1" />
            <span className="text-[11px] font-bold text-[#1C1C1E]">01</span>
          </div>
        </div>
      </div>
    </div>
  )
}

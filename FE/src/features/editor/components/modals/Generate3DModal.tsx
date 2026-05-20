import { Box, X } from 'lucide-react'
import { useGenerate3DModal } from '../../hooks/useGenerate3DModal'

/** 층고 기본값(mm) — 일반 주거 기준 */
const DEFAULT_STORY_HEIGHT_MM = 2700
/** 허용 최소 층고(mm) */
const MIN_STORY_HEIGHT_MM = 1000
/** 허용 최대 층고(mm) */
const MAX_STORY_HEIGHT_MM = 9000

interface Generate3DModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (storyHeightMm: number) => void
}

/**
 * 2D 평면도 → 3D 모델 생성 모달.
 * 층고(mm) 입력 후 확인 시 3D 변환을 시작한다.
 */
export function Generate3DModal({ isOpen, onClose, onConfirm }: Generate3DModalProps) {
  const {
    storyHeightInput,
    isValid,
    setStoryHeightInput,
    handleConfirm,
    handleClose,
  } = useGenerate3DModal({
    defaultStoryHeightMm: DEFAULT_STORY_HEIGHT_MM,
    minStoryHeightMm: MIN_STORY_HEIGHT_MM,
    maxStoryHeightMm: MAX_STORY_HEIGHT_MM,
    onClose,
    onConfirm,
  })

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* 배경 오버레이 */}
      <div
        className="absolute inset-0 bg-[#0A0A0B]/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* 모달 콘텐츠 */}
      <div className="relative w-[420px] rounded-[32px] bg-[#F8F9FD] shadow-[0_32px_80px_rgba(0,0,0,0.24)] animate-in fade-in zoom-in-95 duration-200">
        {/* 닫기 버튼 */}
        <button
          onClick={handleClose}
          className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full text-[#6B7A99] transition-colors hover:bg-[#E8ECF8] hover:text-[#1C1C1E]"
        >
          <X size={16} />
        </button>

        <div className="flex flex-col items-center gap-6 px-8 pb-8 pt-8">
          {/* 아이콘 */}
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F0F2FF] shadow-sm">
            <Box size={30} className="text-[#3B45B3]" />
          </div>

          {/* 제목 */}
          <div className="flex flex-col items-center gap-1.5 text-center">
            <h3 className="text-[16px] font-extrabold tracking-[-0.01em] text-[#1C1C1E]">
              3D 모델 생성
            </h3>
            <p className="text-[12px] leading-relaxed text-[#637190]">
              현재 2D 평면도를 기반으로 3D 건축 모델을 생성합니다.
            </p>
          </div>

          {/* 층고 입력 */}
          <div className="w-full rounded-2xl border border-[#E2E6EF] bg-white px-5 py-4">
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-[#6B7A99]">
              층고 (기본 재질: Concrete)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={storyHeightInput}
                onChange={(e) => setStoryHeightInput(e.target.value)}
                min={MIN_STORY_HEIGHT_MM}
                max={MAX_STORY_HEIGHT_MM}
                step={100}
                className="w-full rounded-xl border border-[#D8DCE8] bg-[#F8F9FD] px-3 py-2 text-[14px] font-medium text-[#1C1C1E] outline-none transition-colors focus:border-[#3B45B3] focus:ring-2 focus:ring-[#3B45B3]/10"
              />
              <span className="shrink-0 text-[13px] font-semibold text-[#6B7A99]">mm</span>
            </div>
            {!isValid && storyHeightInput !== '' && (
              <p className="mt-1.5 text-[11px] text-[#D14343]">
                층고는 {MIN_STORY_HEIGHT_MM}~{MAX_STORY_HEIGHT_MM}mm 범위여야 합니다.
              </p>
            )}
            <p className="mt-1.5 text-[11px] text-[#9CA3AF]">
              기본값: 2,700mm (일반 주거 기준)
            </p>
          </div>

          {/* 버튼 */}
          <div className="flex w-full gap-3">
            <button
              onClick={handleClose}
              className="project-secondary-button flex-1 py-3"
            >
              취소
            </button>
            <button
              onClick={handleConfirm}
              disabled={!isValid}
              className="project-primary-button flex-1 py-3"
            >
              <Box size={14} />
              3D 생성
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

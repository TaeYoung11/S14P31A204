import { useState, useEffect } from 'react'

/** 전체 파일 크기 (시뮬레이션용 고정값) */
const TOTAL_SIZE_MB = 64.8
/** SVG 원형 프로그레스 둘레 — 반지름 100 기준 (2π × 100 ≈ 628) */
const CIRCLE_CIRCUMFERENCE = 628

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
}

/** 파일 내보내기 진행 상태 모달 — 원형 프로그레스 바 애니메이션 포함 */
export function ExportModal({ isOpen, onClose }: ExportModalProps) {
  const [progress, setProgress] = useState(0)

  // 파일 크기는 progress에서 직접 계산 (별도 state 불필요)
  const currentSizeMb = (progress / 100) * TOTAL_SIZE_MB

  /** 모달이 열릴 때마다 progress를 0으로 초기화 후 시뮬레이션, 완료 시 자동 닫힘 */
  useEffect(() => {
    if (!isOpen) return

    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = prev + Math.random() * 5
        if (next >= 100) {
          clearInterval(interval)
          setTimeout(onClose, 1000)
          return 100
        }
        return next
      })
    }, 150)

    return () => clearInterval(interval)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* 배경 오버레이 */}
      <div className="absolute inset-0 bg-[#0A0A0B]/60 backdrop-blur-sm transition-opacity" />

      {/* 모달 콘텐츠 */}
      <div className="relative w-[500px] bg-[#F8F9FD] rounded-[48px] shadow-[0_40px_100px_rgba(0,0,0,0.3)] overflow-hidden animate-in fade-in zoom-in-95 duration-300 p-12 flex flex-col items-center">

        {/* 원형 진행 표시기 */}
        <div className="relative w-64 h-64 mb-12 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90">
            {/* 배경 트랙 */}
            <circle cx="128" cy="128" r="100" stroke="#F0F2F9" strokeWidth="16" fill="transparent" strokeLinecap="round" />
            {/* 진행률 원 */}
            <circle
              cx="128"
              cy="128"
              r="100"
              stroke="#3B45B3"
              strokeWidth="16"
              fill="transparent"
              strokeDasharray={`${(progress / 100) * CIRCLE_CIRCUMFERENCE} ${CIRCLE_CIRCUMFERENCE}`}
              strokeDashoffset="0"
              strokeLinecap="round"
              className="transition-all duration-300 ease-out"
            />
          </svg>

          {/* 진행률 텍스트 */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[44px] font-black text-[#3B45B3] leading-none mb-1">
              {Math.round(progress)}%
            </span>
            <span className="text-[11px] font-extrabold text-[#ADB5BD] tracking-[0.2em]">완료</span>
          </div>
        </div>

        {/* 안내 텍스트 */}
        <div className="text-center mb-16">
          <h2 className="text-[28px] font-black text-[#1C1C1E] mb-4 tracking-tight">내보내는 중...</h2>
          <p className="text-[15px] font-bold text-[#8E95A3] leading-relaxed">
            데이터를 패키징하고 있습니다.<br />
            잠시만 기다려 주세요.
          </p>
        </div>

        {/* 하단 진행 정보 */}
        <div className="w-full flex items-center justify-between px-2 pt-8 border-t border-[#E2E6EF]">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 bg-[#3B45B3] rounded-full animate-pulse" />
            <span className="text-[11px] font-black text-[#ADB5BD] tracking-wider uppercase">에셋 아카이빙 중</span>
          </div>
          <div className="text-[11px] font-black text-[#8E95A3]">
            <span className="text-[#1C1C1E]">{currentSizeMb.toFixed(1)} MB</span>
            <span className="mx-1">/</span>
            <span>{TOTAL_SIZE_MB} MB</span>
          </div>
        </div>
      </div>
    </div>
  )
}

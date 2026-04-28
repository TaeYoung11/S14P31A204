import { useState, useEffect } from 'react'
import { CheckCircle2, Download, FileCode2, Cpu, Layers, Box } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/** 전체 파일 크기 (시뮬레이션용 고정값) */
const TOTAL_SIZE_MB = 64.8

// ── 내보내기 단계 정의 ────────────────────────────────────────────────────────

interface ExportStep {
  icon: LucideIcon
  label: string
}

/** IFC 내보내기 처리 단계 목록 */
const STEPS: ExportStep[] = [
  { icon: Layers,    label: '평면도 레이어 파싱 중...' },
  { icon: Box,       label: '3D 메시 생성 중...' },
  { icon: Cpu,       label: 'IFC 스키마 적용 중...' },
  { icon: FileCode2, label: '파일 패키징 중...' },
]

// ── Props ─────────────────────────────────────────────────────────────────────

interface IFCExportModalProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * IFC 파일 내보내기 모달
 * 4단계 진행 상태(원형 프로그레스 + 단계 표시기)를 애니메이션으로 표현하며,
 * 완료 시 다운로드 버튼을 노출한다.
 */
export function IFCExportModal({ isOpen, onClose }: IFCExportModalProps) {
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)

  // 파일 크기는 progress에서 직접 계산 (별도 state 불필요)
  const fileSizeMb = (progress / 100) * TOTAL_SIZE_MB

  /** 모달이 열릴 때마다 progress·완료 상태를 초기화 후 시뮬레이션 시작 */
  useEffect(() => {
    if (!isOpen) return

    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = prev + Math.random() * 3 + 1
        if (next >= 100) {
          clearInterval(interval)
          setDone(true)
          return 100
        }
        return next
      })
    }, 120)

    return () => clearInterval(interval)
  }, [isOpen])

  if (!isOpen) return null

  const stepIndex = progress < 25 ? 0 : progress < 55 ? 1 : progress < 80 ? 2 : 3
  const circumference = 2 * Math.PI * 90
  const dashOffset = circumference - (progress / 100) * circumference
  const CurrentStepIcon = STEPS[stepIndex].icon

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* 배경 오버레이 */}
      <div className="absolute inset-0 bg-[#0A0A0B]/70 backdrop-blur-md" />

      {/* 모달 */}
      <div className="relative w-[520px] bg-white rounded-[40px] shadow-[0_50px_120px_rgba(0,0,0,0.35)] overflow-hidden animate-in fade-in zoom-in-95 duration-300">

        {/* 상단 진행 그라디언트 바 */}
        <div className="h-1.5 w-full bg-gradient-to-r from-[#3B45B3] via-[#6C74E8] to-[#3B45B3] bg-[length:200%_100%] animate-pulse" />

        <div className="px-12 pt-10 pb-12 flex flex-col items-center">

          {/* 헤더 */}
          <div className="flex items-center gap-3 mb-10 self-start">
            <div className="w-10 h-10 bg-[#F0F2FF] rounded-2xl flex items-center justify-center">
              <FileCode2 size={20} className="text-[#3B45B3]" />
            </div>
            <div>
              <p className="text-[11px] font-black text-[#ADB5BD] tracking-[0.2em] uppercase">BIM Platform</p>
              <h2 className="text-[17px] font-black text-[#1C1C1E] leading-tight tracking-tight">IFC 파일 내보내기</h2>
            </div>
          </div>

          {/* 원형 진행 표시기 */}
          <div className="relative w-56 h-56 mb-8">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 200 200">
              {/* 배경 트랙 */}
              <circle cx="100" cy="100" r="90" fill="none" stroke="#F0F2F9" strokeWidth="12" strokeLinecap="round" />
              {/* 진행률 원 */}
              <circle
                cx="100"
                cy="100"
                r="90"
                fill="none"
                stroke="#3B45B3"
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                className="transition-all duration-200 ease-out drop-shadow-[0_0_6px_rgba(59,69,179,0.5)]"
              />
            </svg>

            {/* 중앙 콘텐츠 */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {done ? (
                <div className="flex flex-col items-center gap-1 animate-in zoom-in-75 duration-300">
                  <CheckCircle2 size={44} className="text-[#3B45B3]" strokeWidth={2.5} />
                  <span className="text-[12px] font-black text-[#3B45B3] tracking-widest">완료</span>
                </div>
              ) : (
                <>
                  <span className="text-[46px] font-black text-[#1C1C1E] leading-none tabular-nums">
                    {Math.round(progress)}
                  </span>
                  <span className="text-[13px] font-bold text-[#ADB5BD]">%</span>
                </>
              )}
            </div>
          </div>

          {/* 상태 텍스트 */}
          {done ? (
            <div className="text-center mb-8 animate-in fade-in duration-300">
              <p className="text-[22px] font-black text-[#1C1C1E] mb-1 tracking-tight">내보내기 완료!</p>
              <p className="text-[14px] font-medium text-[#8E95A3]">IFC 파일이 준비되었습니다.</p>
            </div>
          ) : (
            <div className="flex items-center gap-2 mb-8">
              <CurrentStepIcon size={15} className="text-[#3B45B3] animate-pulse shrink-0" />
              <p className="text-[13px] font-bold text-[#6B7A99]">{STEPS[stepIndex].label}</p>
            </div>
          )}

          {/* 단계 표시기 */}
          <div className="flex items-center gap-2 mb-10">
            {STEPS.map((step, i) => {
              const isActive = i === stepIndex && !done
              const isCompleted = done || i < stepIndex
              return (
                <div key={step.label} className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    isCompleted ? 'bg-[#3B45B3]' : isActive ? 'bg-[#3B45B3] scale-125' : 'bg-[#E2E6EF]'
                  }`} />
                  {i < STEPS.length - 1 && (
                    <div className={`w-8 h-px transition-all duration-500 ${isCompleted ? 'bg-[#3B45B3]' : 'bg-[#E2E6EF]'}`} />
                  )}
                </div>
              )
            })}
          </div>

          {/* 하단 액션 */}
          {done ? (
            <div className="flex items-center gap-4 w-full">
              <button
                onClick={onClose}
                className="flex-1 py-4 border-2 border-[#E2E6EF] text-[#8E95A3] text-[14px] font-black rounded-2xl hover:border-[#D0D5DD] hover:text-[#505764] transition-all"
              >
                닫기
              </button>
              <button
                onClick={() => {
                  // TODO: 실제 API 연동 시 서버에서 받은 Blob URL로 교체
                  const a = document.createElement('a')
                  a.href = '#'
                  a.download = 'project_export.ifc'
                  a.click()
                  onClose()
                }}
                className="flex-[2] py-4 bg-[#3B45B3] text-white text-[14px] font-black rounded-2xl shadow-xl shadow-[#3B45B3]/30 hover:bg-[#2D3691] hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2"
              >
                <Download size={16} />
                IFC 파일 다운로드
              </button>
            </div>
          ) : (
            <div className="w-full flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-[#3B45B3] rounded-full animate-pulse" />
                <span className="text-[11px] font-black text-[#ADB5BD] uppercase tracking-widest">처리 중</span>
              </div>
              <span className="text-[12px] font-black text-[#8E95A3] tabular-nums">
                <span className="text-[#1C1C1E]">{fileSizeMb.toFixed(1)} MB</span>
                <span className="mx-1 text-[#E2E6EF]">/</span>
                {TOTAL_SIZE_MB} MB
              </span>
            </div>
          )}
        </div>

        {/* 하단 정보 */}
        <div className="px-12 py-4 bg-[#F8F9FD] border-t border-[#F0F2F9] flex items-center justify-between">
          <span className="text-[10px] font-black text-[#C5CAD3] uppercase tracking-[0.2em]">IFC 4.0 표준 · BIM Platform v2.1</span>
          {!done && (
            <button
              onClick={onClose}
              className="text-[10px] font-black text-[#ADB5BD] hover:text-[#6B7A99] transition-colors uppercase tracking-wider"
            >
              취소
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

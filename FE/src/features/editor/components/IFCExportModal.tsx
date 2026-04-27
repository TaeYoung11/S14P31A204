import { useState, useEffect } from 'react'
import { CheckCircle2, Download, X, FileCode2, Cpu, Layers, Box } from 'lucide-react'

interface IFCExportModalProps {
  isOpen: boolean
  onClose: () => void
}

const STEPS = [
  { icon: Layers,   label: '평면도 레이어 파싱 중...',   duration: 800 },
  { icon: Box,      label: '3D 메시 생성 중...',           duration: 900 },
  { icon: Cpu,      label: 'IFC 스키마 적용 중...',        duration: 700 },
  { icon: FileCode2, label: '파일 패키징 중...',           duration: 600 },
]

export function IFCExportModal({ isOpen, onClose }: IFCExportModalProps) {
  const [progress, setProgress] = useState(0)
  const [stepIndex, setStepIndex] = useState(0)
  const [done, setDone] = useState(false)
  const [fileSize, setFileSize] = useState(0)
  const totalSize = 64.8

  useEffect(() => {
    if (!isOpen) {
      // reset on close
      setProgress(0)
      setStepIndex(0)
      setDone(false)
      setFileSize(0)
      return
    }

    // Simulate progress
    const interval = setInterval(() => {
      setProgress((prev) => {
        const inc = Math.random() * 3 + 1
        const next = prev + inc
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

  // Update step based on progress
  useEffect(() => {
    if (progress < 25) setStepIndex(0)
    else if (progress < 55) setStepIndex(1)
    else if (progress < 80) setStepIndex(2)
    else setStepIndex(3)
    setFileSize((progress / 100) * totalSize)
  }, [progress])

  if (!isOpen) return null

  const circumference = 2 * Math.PI * 90 // r=90
  const dashOffset = circumference - (progress / 100) * circumference

  const CurrentStepIcon = STEPS[stepIndex].icon

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[#0A0A0B]/70 backdrop-blur-md" />

      {/* Modal */}
      <div className="relative w-[520px] bg-white rounded-[40px] shadow-[0_50px_120px_rgba(0,0,0,0.35)] overflow-hidden animate-in fade-in zoom-in-95 duration-300">

        {/* Top gradient bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-[#3B45B3] via-[#6C74E8] to-[#3B45B3] bg-[length:200%_100%] animate-pulse" />

        <div className="px-12 pt-10 pb-12 flex flex-col items-center">

          {/* Header */}
          <div className="flex items-center gap-3 mb-10 self-start">
            <div className="w-10 h-10 bg-[#F0F2FF] rounded-2xl flex items-center justify-center">
              <FileCode2 size={20} className="text-[#3B45B3]" />
            </div>
            <div>
              <p className="text-[11px] font-black text-[#ADB5BD] tracking-[0.2em] uppercase">BIM Platform</p>
              <h2 className="text-[17px] font-black text-[#1C1C1E] leading-tight tracking-tight">IFC 파일 내보내기</h2>
            </div>
          </div>

          {/* Circular Progress */}
          <div className="relative w-56 h-56 mb-8">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 200 200">
              {/* Track */}
              <circle cx="100" cy="100" r="90" fill="none" stroke="#F0F2F9" strokeWidth="12" strokeLinecap="round" />
              {/* Glow ring */}
              <circle
                cx="100" cy="100" r="90"
                fill="none"
                stroke="#3B45B3"
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                className="transition-all duration-200 ease-out drop-shadow-[0_0_6px_rgba(59,69,179,0.5)]"
              />
            </svg>

            {/* Center content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {done ? (
                <div className="flex flex-col items-center gap-1 animate-in zoom-in-75 duration-300">
                  <CheckCircle2 size={44} className="text-[#3B45B3]" strokeWidth={2.5} />
                  <span className="text-[12px] font-black text-[#3B45B3] tracking-widest">COMPLETE</span>
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

          {/* Status text */}
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

          {/* Step indicators */}
          <div className="flex items-center gap-2 mb-10">
            {STEPS.map((step, i) => {
              const isActive = i === stepIndex && !done
              const isDone = done || i < stepIndex
              return (
                <div key={step.label} className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    isDone ? 'bg-[#3B45B3]' : isActive ? 'bg-[#3B45B3] scale-125' : 'bg-[#E2E6EF]'
                  }`} />
                  {i < STEPS.length - 1 && (
                    <div className={`w-8 h-px transition-all duration-500 ${isDone ? 'bg-[#3B45B3]' : 'bg-[#E2E6EF]'}`} />
                  )}
                </div>
              )
            })}
          </div>

          {/* Bottom actions */}
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
                  // Simulate download
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
                <span className="text-[11px] font-black text-[#ADB5BD] uppercase tracking-widest">Processing</span>
              </div>
              <span className="text-[12px] font-black text-[#8E95A3] tabular-nums">
                <span className="text-[#1C1C1E]">{fileSize.toFixed(1)} MB</span>
                <span className="mx-1 text-[#E2E6EF]">/</span>
                {totalSize} MB
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-12 py-4 bg-[#F8F9FD] border-t border-[#F0F2F9] flex items-center justify-between">
          <span className="text-[10px] font-black text-[#C5CAD3] uppercase tracking-[0.2em]">IFC 4.0 Standard · BIM Platform v2.1</span>
          {!done && (
            <button onClick={onClose} className="text-[10px] font-black text-[#ADB5BD] hover:text-[#6B7A99] transition-colors uppercase tracking-wider">
              취소
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
}

export function ExportModal({ isOpen, onClose }: ExportModalProps) {
  const [progress, setProgress] = useState(0)
  const [currentSize, setCurrentSize] = useState(0)
  const totalSize = 64.8

  useEffect(() => {
    if (isOpen) {
      setProgress(0)
      setCurrentSize(0)
      
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval)
            setTimeout(onClose, 1000)
            return 100
          }
          const next = prev + Math.random() * 5
          return next > 100 ? 100 : next
        })
      }, 150)

      return () => clearInterval(interval)
    }
  }, [isOpen, onClose])

  useEffect(() => {
    setCurrentSize((progress / 100) * totalSize)
  }, [progress])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* 배경 오버레이 */}
      <div className="absolute inset-0 bg-[#0A0A0B]/60 backdrop-blur-sm transition-opacity" />

      {/* 모달 콘텐츠 */}
      <div className="relative w-[500px] bg-[#F8F9FD] rounded-[48px] shadow-[0_40px_100px_rgba(0,0,0,0.3)] overflow-hidden animate-in fade-in zoom-in-95 duration-300 p-12 flex flex-col items-center">

        {/* 원형 진행 표시기 */}
        <div className="relative w-64 h-64 mb-12 flex items-center justify-center">
          {/* 배경 원 */}
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="128"
              cy="128"
              r="100"
              stroke="#F0F2F9"
              strokeWidth="16"
              fill="transparent"
              strokeLinecap="round"
            />
            {/* 진행률 원 */}
            <circle
              cx="128"
              cy="128"
              r="100"
              stroke="#3B45B3"
              strokeWidth="16"
              fill="transparent"
              strokeDasharray={`${(progress / 100) * 628} 628`}
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
            <span className="text-[11px] font-extrabold text-[#ADB5BD] tracking-[0.2em]">COMPLETED</span>
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
            <span className="text-[11px] font-black text-[#ADB5BD] tracking-wider uppercase">Archiving Assets</span>
          </div>
          <div className="text-[11px] font-black text-[#8E95A3]">
            <span className="text-[#1C1C1E]">{currentSize.toFixed(1)} MB</span>
            <span className="mx-1">/</span>
            <span>{totalSize} MB</span>
          </div>
        </div>
      </div>
    </div>
  )
}

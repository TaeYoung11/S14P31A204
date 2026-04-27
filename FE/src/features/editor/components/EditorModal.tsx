import { X } from 'lucide-react'
import { useEffect } from 'react'

interface EditorModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: React.ReactNode
  confirmLabel: string
  onConfirm: () => void
  confirmDisabled?: boolean
}

export default function EditorModal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  confirmLabel,
  onConfirm,
  confirmDisabled = false,
}: EditorModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-[28px] shadow-[0_24px_64px_rgba(19,25,52,0.22)] w-full max-w-[460px] overflow-hidden animate-in fade-in zoom-in duration-200">

        {/* 헤더 */}
        <div className="px-7 pt-7 pb-5 border-b border-[#EEF1FA] bg-gradient-to-b from-[#F7F8FF] to-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[20px] leading-none font-black tracking-[-0.02em] text-[#1C1C1E]">{title}</h2>
              {subtitle && <p className="mt-2 text-[11px] font-bold text-[#8A92A5]">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white border border-[#E3E7F2] text-[#AAB2C4] hover:text-[#1C1C1E] hover:border-[#CDD5E6] transition-colors flex items-center justify-center shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 바디 */}
        <div className="px-7 py-6 space-y-5 max-h-[62vh] overflow-y-auto">
          {children}
        </div>

        {/* 푸터 */}
        <div className="px-7 pb-7 pt-3 border-t border-[#EEF1FA] grid grid-cols-2 gap-3">
          <button
            onClick={onClose}
            className="h-11 rounded-xl border border-[#D5DBE9] text-[13px] font-black text-[#7A8599] hover:text-[#1C1C1E] hover:border-[#BBC5D9] transition-colors"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            disabled={confirmDisabled}
            className="h-11 rounded-xl bg-[#3B45B3] disabled:bg-[#ADB5BD] text-white text-[13px] font-black shadow-lg shadow-[#3B45B3]/20 hover:bg-[#2D3691] disabled:shadow-none transition-all"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

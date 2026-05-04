import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import DaumPostcode from 'react-daum-postcode'
import type { Address } from 'react-daum-postcode'

interface ProjectSitePostcodeOverlayProps {
  isOpen: boolean
  onClose: () => void
  onComplete: (data: Address) => void
}

/**
 * 카카오 우편번호 검색 오버레이.
 * - 모달 외부 클릭 시 닫힘
 * - 주소 선택 완료 시 상위 훅의 핸들러에 전달
 */
export function ProjectSitePostcodeOverlay({
  isOpen,
  onClose,
  onComplete,
}: ProjectSitePostcodeOverlayProps) {
  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[550px] overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#e5e7eb] px-5 py-4">
          <span className="text-sm font-semibold text-[#111827]">주소 검색</span>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#6b7280] hover:bg-[#f3f4f6]"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <DaumPostcode onComplete={onComplete} />
      </div>
    </div>,
    document.body,
  )
}

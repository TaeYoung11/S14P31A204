import { Search, X } from 'lucide-react'
import DaumPostcode from 'react-daum-postcode'
import Modal from '@/shared/components/Modal'
import Spinner from '@/shared/components/Spinner'
import { useProjectSiteModal } from '@/features/project/hooks/useProjectSiteModal'

interface ProjectSiteModalProps {
  isOpen: boolean
  projectId: string | null
  projectName?: string
  onClose: () => void
}

export default function ProjectSiteModal({
  isOpen,
  projectId,
  projectName,
  onClose,
}: ProjectSiteModalProps) {
  const {
    mapContainerRef,
    showPostcode,
    setShowPostcode,
    selectedAddress,
    polygonCoords,
    sdkError,
    searchError,
    registerError,
    isRegistering,
    handleAddressSelect,
  } = useProjectSiteModal({ isOpen, projectId, onClose })

  const normalizePath = (coords: number[][]): string => {
    const lngs = coords.map(([lng]) => lng)
    const lats = coords.map(([, lat]) => lat)
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const W = 260, H = 240, pad = 16
    const dLng = maxLng - minLng || 1
    const dLat = maxLat - minLat || 1
    return coords.map(([lng, lat]) => {
      const x = pad + ((lng - minLng) / dLng) * (W - 2 * pad)
      const y = H - pad - ((lat - minLat) / dLat) * (H - 2 * pad)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="대지 정보 입력"
      maxWidth="max-w-[1100px]"
    >
      <div className="space-y-5">
        <div className="rounded-2xl bg-[linear-gradient(135deg,#eef2ff,white_60%)] px-5 py-4">
          <p className="mt-2 text-lg font-semibold text-[#111827]">
            {projectName ?? '새 프로젝트'}
          </p>
        </div>

        <div className="space-y-5">
          <div className="flex gap-2">
            <div className="flex-1 rounded-2xl border border-[#dbe2f0] px-4 py-3 text-sm text-[#475569] bg-[#f8fafc]">
              {selectedAddress || '주소 검색 버튼을 눌러 주소를 선택해주세요.'}
            </div>
            <button
              type="button"
              className="inline-flex min-w-[112px] items-center justify-center gap-2 rounded-2xl bg-[#111827] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#1f2937] disabled:opacity-70"
              onClick={() => setShowPostcode(true)}
              disabled={isRegistering}
            >
              <Search className="h-4 w-4" />
              주소 검색
            </button>
          </div>

          {showPostcode && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
              onClick={() => setShowPostcode(false)}
            >
              <div
                className="relative w-full max-w-[550px] overflow-hidden rounded-2xl bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e7eb]">
                  <span className="text-sm font-semibold text-[#111827]">주소 검색</span>
                  <button
                    type="button"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-[#6b7280] hover:bg-[#f3f4f6]"
                    onClick={() => setShowPostcode(false)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <DaumPostcode onComplete={handleAddressSelect} />
              </div>
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="relative overflow-hidden rounded-3xl border border-[#dbe2f0] bg-[#f8fafc]">
              <div ref={mapContainerRef} className="h-[320px] w-full bg-[#eef2ff]" />
              {isRegistering && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/60">
                  <Spinner size="lg" />
                </div>
              )}
            </div>

            <div className="flex flex-col items-center justify-center rounded-3xl border border-[#dbe2f0] bg-[#f8fafc] p-4">
              {polygonCoords ? (
                <>
                  <p className="mb-2 text-xs font-semibold text-[#6366f1]">필지 경계</p>
                  <svg viewBox="0 0 260 240" className="w-full">
                    <polygon
                      points={normalizePath(polygonCoords)}
                      fill="#4f46e5"
                      fillOpacity={0.15}
                      stroke="#4f46e5"
                      strokeWidth={1.5}
                    />
                  </svg>
                </>
              ) : (
                <p className="text-center text-sm text-[#9ca3af]">
                  주소 선택 후<br />필지 경계가 표시됩니다.
                </p>
              )}
            </div>
          </div>

          {(sdkError || searchError || registerError) && (
            <p className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">
              {sdkError || searchError || (registerError as Error).message}
            </p>
          )}

          <div className="flex items-center justify-end">
            <button
              type="button"
              className="rounded-2xl border border-[#dbe2f0] px-5 py-3 text-sm font-medium text-[#475569] transition-colors hover:bg-[#f8fafc]"
              onClick={onClose}
            >
              {polygonCoords ? '닫기' : '나중에 입력'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

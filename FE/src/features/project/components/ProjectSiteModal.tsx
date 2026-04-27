import { MapPin, Search } from 'lucide-react'
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
    address,
    selectedAddress,
    latitude,
    longitude,
    sdkError,
    searchError,
    submitError,
    isSearching,
    isSubmitting,
    setAddress,
    handleSearchAddress,
    handleSubmit,
  } = useProjectSiteModal({ isOpen, projectId, onClose })

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

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex gap-2">
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="flex-1 rounded-2xl border border-[#dbe2f0] px-4 py-3 text-sm text-[#0f172a] outline-none transition-colors focus:border-[#6366f1]"
              placeholder="예: 서울특별시 강남구 테헤란로 212"
            />
            <button
              type="button"
              className="inline-flex min-w-[112px] items-center justify-center gap-2 rounded-2xl bg-[#111827] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#1f2937] disabled:opacity-70"
              onClick={handleSearchAddress}
              disabled={isSearching}
            >
              {isSearching ? <Spinner size="sm" /> : <Search className="h-4 w-4" />}
              주소 검색
            </button>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="overflow-hidden rounded-3xl border border-[#dbe2f0] bg-[#f8fafc]">
              <div ref={mapContainerRef} className="h-[320px] w-full bg-[#eef2ff]" />
            </div>

            <div className="space-y-4 rounded-3xl border border-[#e2e8f0] bg-white p-5">
              <div>
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#111827]">
                  <MapPin className="h-4 w-4 text-[#6366f1]" />
                  선택된 주소
                </p>
                <p className="min-h-[48px] rounded-2xl bg-[#f8fafc] px-4 py-3 text-sm leading-6 text-[#475569]">
                  {selectedAddress || '주소를 검색하면 선택 결과가 여기에 표시됩니다.'}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div className="rounded-2xl bg-[#f8fafc] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">
                    Latitude
                  </p>
                  <p className="mt-1 text-sm font-medium text-[#111827]">
                    {latitude ?? '-'}
                  </p>
                </div>
                <div className="rounded-2xl bg-[#f8fafc] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">
                    Longitude
                  </p>
                  <p className="mt-1 text-sm font-medium text-[#111827]">
                    {longitude ?? '-'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {(sdkError || searchError || submitError) && (
            <p className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">
              {sdkError || searchError || (submitError as Error).message}
            </p>
          )}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              className="rounded-2xl border border-[#dbe2f0] px-5 py-3 text-sm font-medium text-[#475569] transition-colors hover:bg-[#f8fafc]"
              onClick={onClose}
            >
              나중에 입력
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-2xl bg-[#4f46e5] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#4338ca] disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isSubmitting}
            >
              {isSubmitting ? <Spinner size="sm" /> : <MapPin className="h-4 w-4" />}
              대지 정보 저장
            </button>
          </div>
        </form>
      </div>
    </Modal>
  )
}

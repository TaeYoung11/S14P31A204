import { Search } from 'lucide-react'
import Modal from '@/shared/components/Modal'
import Spinner from '@/shared/components/Spinner'
import { ProjectSitePolygonPreviewCard } from '@/features/project/components/site-modal/ProjectSitePolygonPreviewCard'
import { ProjectSitePostcodeOverlay } from '@/features/project/components/site-modal/ProjectSitePostcodeOverlay'
import { useProjectSiteModal } from '@/features/project/hooks/useProjectSiteModal'
import { formatAreaM2, formatAreaPyeong } from '@/features/project/utils/siteGeometry'

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
    siteAreaM2,
    siteAreaPyeong,
    sdkError,
    searchError,
    registerError,
    isRegistering,
    handleAddressSelect,
  } = useProjectSiteModal({ isOpen, projectId, onClose })
  const isCloseDisabled = isRegistering
  const handleRequestClose = () => {
    if (isCloseDisabled) return
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleRequestClose}
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

          <ProjectSitePostcodeOverlay
            isOpen={showPostcode}
            onClose={() => setShowPostcode(false)}
            onComplete={handleAddressSelect}
          />

          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="relative overflow-hidden rounded-3xl border border-[#dbe2f0] bg-[#f8fafc]">
              <div ref={mapContainerRef} className="h-[320px] w-full bg-[#eef2ff]" />
              {isRegistering && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/60">
                  <Spinner size="lg" />
                </div>
              )}
            </div>

            <ProjectSitePolygonPreviewCard polygonCoords={polygonCoords} />
          </div>

          {siteAreaM2 && siteAreaPyeong && (
            <div className="flex items-center justify-between rounded-2xl border border-[#dbe2f0] bg-[#f8fafc] px-4 py-3">
              <p className="text-xs font-semibold text-[#374151]">대지 면적</p>
              <p className="text-sm font-bold text-[#111827]">
                {formatAreaM2(siteAreaM2)} ({formatAreaPyeong(siteAreaM2)})
              </p>
            </div>
          )}

          {(sdkError || searchError || registerError) && (
            <p className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">
              {sdkError || searchError || (registerError as Error).message}
            </p>
          )}

          <div className="flex items-center justify-end">
            <button
              type="button"
              className="rounded-2xl border border-[#dbe2f0] px-5 py-3 text-sm font-medium text-[#475569] transition-colors hover:bg-[#f8fafc]"
              onClick={handleRequestClose}
              disabled={isCloseDisabled}
            >
              {isCloseDisabled ? '저장 중...' : polygonCoords ? '닫기' : '나중에 입력'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

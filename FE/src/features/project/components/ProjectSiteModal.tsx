import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import Modal from '@/shared/components/Modal'
import Spinner from '@/shared/components/Spinner'
import { ProjectSitePolygonPreviewCard } from '@/features/project/components/site-modal/ProjectSitePolygonPreviewCard'
import { ProjectSitePostcodeOverlay } from '@/features/project/components/site-modal/ProjectSitePostcodeOverlay'
import { ProjectSiteCreateAction } from '@/features/project/components/site-modal/ProjectSiteCreateAction'
import { useProjectSiteModal } from '@/features/project/hooks/useProjectSiteModal'
import { useProjectSiteModalActions } from '@/features/project/hooks/useProjectSiteModalActions'
import { formatAreaM2, formatAreaPyeong } from '@/features/project/utils/siteGeometry'

interface ProjectSiteModalProps {
  isOpen: boolean
  projectId: string | null
  projectName?: string
  onComplete: () => void | Promise<void>
  onCancel: () => void | Promise<void>
  isCancellingProject?: boolean
  cancelErrorMessage?: string
  onClearCancelError?: () => void
}

/**
 * 프로젝트 생성 직후 대지 정보를 입력받는 모달.
 * - 대지 좌표(폴리곤)가 확보되기 전에는 생성 확정 버튼을 노출하지 않는다.
 * - 모달 닫기(X/ESC/오버레이)는 생성 취소 흐름으로 연결된다.
 */
export default function ProjectSiteModal({
  isOpen,
  projectId,
  projectName,
  onComplete,
  onCancel,
  isCancellingProject = false,
  cancelErrorMessage = '',
  onClearCancelError,
}: ProjectSiteModalProps) {
  const [actionErrorMessage, setActionErrorMessage] = useState('')
  const isExternalInteractionLocked = isCancellingProject
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
  } = useProjectSiteModal({ isOpen, projectId, isInteractionLocked: isExternalInteractionLocked })

  /** 등록/취소 API 진행 중에는 사용자 입력을 잠시 막아 중복 요청을 방지한다. */
  const isCloseDisabled = isRegistering || isCancellingProject
  /** 폴리곤 존재 여부는 생성 버튼 노출 조건과 완료 액션 검증 조건으로 함께 사용한다. */
  const hasPolygon = Boolean(polygonCoords)
  const { handleRequestClose, handleComplete } = useProjectSiteModalActions({
    hasPolygon,
    isCloseDisabled,
    onCancel,
    onComplete,
    onActionError: setActionErrorMessage,
  })
  /** 사용자에게 표시할 단일 에러 메시지 */
  const errorMessage = cancelErrorMessage
    || (registerError as Error | null)?.message
    || searchError
    || sdkError
    || actionErrorMessage

  /** 주소 검색 재시작 시 이전 취소 오류 메시지를 제거한다. */
  const handleOpenPostcode = () => {
    setActionErrorMessage('')
    onClearCancelError?.()
    setShowPostcode(true)
  }

  /** 취소/저장 처리 중에는 주소 검색 오버레이를 강제로 닫아 추가 입력을 막는다. */
  useEffect(() => {
    if (!isCloseDisabled) return
    setShowPostcode(false)
  }, [isCloseDisabled, setShowPostcode])

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
              onClick={handleOpenPostcode}
              disabled={isCloseDisabled}
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

          {errorMessage && (
            <p className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">
              {errorMessage}
            </p>
          )}

          {hasPolygon && <ProjectSiteCreateAction isProcessing={isCloseDisabled} onComplete={handleComplete} />}
        </div>
      </div>
    </Modal>
  )
}

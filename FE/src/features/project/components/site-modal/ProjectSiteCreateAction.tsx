interface ProjectSiteCreateActionProps {
  isProcessing: boolean
  onComplete: () => void
}

/**
 * 대지 정보 입력 완료 후 프로젝트 생성을 확정하는 액션 버튼.
 * 버튼 자체는 대지 폴리곤이 존재할 때만 상위 컴포넌트에서 렌더링한다.
 */
export function ProjectSiteCreateAction({ isProcessing, onComplete }: ProjectSiteCreateActionProps) {
  return (
    <div className="flex items-center justify-end">
      <button
        type="button"
        className="project-primary-button px-5 py-3"
        onClick={onComplete}
        disabled={isProcessing}
      >
        {isProcessing ? '처리 중...' : '프로젝트 생성'}
      </button>
    </div>
  )
}

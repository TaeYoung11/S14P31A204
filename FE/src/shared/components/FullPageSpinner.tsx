import Spinner from '@/shared/components/Spinner'

interface FullPageSpinnerProps {
  backgroundClassName?: string
}

/**
 * 라우트 가드/초기 세션 검증에서 공통으로 사용하는 전체 화면 로딩 UI.
 * 동일한 마크업을 중복하지 않기 위해 분리했다.
 */
export default function FullPageSpinner({ backgroundClassName = 'bg-white' }: FullPageSpinnerProps) {
  return (
    <div className={`flex min-h-screen items-center justify-center ${backgroundClassName}`}>
      <Spinner size="lg" />
    </div>
  )
}

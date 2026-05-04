import Spinner from './Spinner'

/**
 * 라우트 단위 lazy 컴포넌트 로딩 fallback.
 * 화면 전환 중 전체 페이지 영역에서 일관된 로딩 UI를 표시한다.
 */
export default function RouteLoadingFallback() {
  return (
    <div className="min-h-screen w-full bg-[#F0F2F9] flex items-center justify-center">
      <div className="flex items-center gap-3 text-[#4B5563]">
        <Spinner size="md" />
        <span className="text-sm font-medium">화면을 불러오는 중입니다...</span>
      </div>
    </div>
  )
}

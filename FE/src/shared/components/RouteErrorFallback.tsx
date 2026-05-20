import { isRouteErrorResponse, useRouteError } from 'react-router-dom'

const isDynamicImportError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Outdated Optimize Dep') ||
    message.includes('Importing a module script failed')
}

export default function RouteErrorFallback() {
  const error = useRouteError()
  const title = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : isDynamicImportError(error)
      ? '화면 리소스를 다시 불러와야 합니다'
      : '화면을 불러오지 못했습니다'
  const description = isDynamicImportError(error)
    ? '개발 서버 캐시가 갱신되는 동안 일부 모듈 로딩이 실패했습니다. 새로고침하면 현재 화면을 다시 시도합니다.'
    : '잠시 후 다시 시도하거나 문제가 반복되면 이전 화면으로 돌아가 주세요.'

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f8fc] px-6 text-[#111827]">
      <div className="w-full max-w-[460px] rounded-2xl border border-[#e5e7eb] bg-white p-7 text-center shadow-sm">
        <h1 className="text-[18px] font-extrabold">{title}</h1>
        <p className="mt-3 text-[13px] leading-6 text-[#6b7280]">{description}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-[#3B45B3] px-4 py-2 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-[#2D3599]"
          >
            새로고침
          </button>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="rounded-xl border border-[#d1d5db] px-4 py-2 text-[13px] font-bold text-[#374151] transition-colors hover:bg-[#f3f4f6]"
          >
            이전으로
          </button>
        </div>
      </div>
    </div>
  )
}

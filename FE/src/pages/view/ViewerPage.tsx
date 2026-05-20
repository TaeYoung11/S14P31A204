import { Link, useParams } from 'react-router-dom'
import { Eye, LockKeyhole } from 'lucide-react'

// 공유 링크 뷰어 페이지 - 비로그인 접근 가능 (Public)
// URL: /view/:token
export default function ViewerPage() {
  const { token } = useParams<{ token: string }>()

  return (
    <main className="public-state-shell">
      <section className="mx-auto grid max-w-[920px] gap-5 rounded-2xl border border-white/80 bg-white/90 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.10)] backdrop-blur md:grid-cols-[1fr_0.8fr]">
        <div className="flex min-h-[360px] flex-col justify-between">
          <div>
            <p className="project-muted">Shared Viewer</p>
            <h1 className="mt-1 text-[clamp(1.8rem,5vw,2.6rem)] font-black leading-tight text-[#0f172a]">
              공유 프로젝트 뷰어
            </h1>
            <p className="mt-3 max-w-[500px] text-sm font-medium leading-6 text-[#64748b]">
              공유 링크로 프로젝트를 확인하는 공개 화면입니다.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            <Link to="/login" className="project-primary-button">
              로그인
            </Link>
            <Link to="/" className="project-secondary-button">
              홈으로
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5 shadow-[0_12px_38px_rgba(15,23,42,0.07)]">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#4f46e5]">
            <Eye className="h-7 w-7" />
          </div>
          <h2 className="mt-6 text-lg font-black text-[#111827]">링크 정보</h2>
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3">
              <p className="text-xs font-black text-[#94a3b8]">토큰</p>
              <p className="mt-1 truncate text-sm font-bold text-[#334155]">{token ?? '-'}</p>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-[#dbeafe] bg-[#eff6ff] px-4 py-3">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[#4f46e5]" />
              <p className="text-xs font-semibold leading-5 text-[#1d4ed8]">
                링크 권한 확인 후 프로젝트 뷰어가 열립니다.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

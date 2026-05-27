import { Link } from 'react-router-dom'
import { ArrowLeft, SearchX } from 'lucide-react'

// 정의되지 않은 경로 접근 시 표시되는 404 페이지
export default function NotFoundPage() {
  return (
    <main className="public-state-shell flex items-center justify-center">
      <section className="w-full max-w-[560px] rounded-2xl border border-white/80 bg-white/90 p-8 text-center shadow-[0_18px_60px_rgba(15,23,42,0.10)] backdrop-blur">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#4f46e5]">
          <SearchX className="h-8 w-8" />
        </div>
        <p className="mt-6 text-sm font-black text-[#4f46e5]">404</p>
        <h1 className="mt-2 text-[clamp(1.8rem,5vw,2.8rem)] font-black text-[#0f172a]">
          페이지를 찾을 수 없습니다.
        </h1>
        <p className="mx-auto mt-3 max-w-[420px] text-sm font-medium leading-6 text-[#64748b]">
          주소가 변경되었거나 접근할 수 없는 화면입니다.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <Link to="/" className="project-primary-button">
            <ArrowLeft className="h-4 w-4" />
            홈으로
          </Link>
          <Link to="/projects" className="project-secondary-button">
            프로젝트 목록
          </Link>
        </div>
      </section>
    </main>
  )
}

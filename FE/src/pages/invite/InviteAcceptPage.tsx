import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, MailOpen, UserPlus } from 'lucide-react'
import { useAuthStore } from '@/shared/stores/authStore'

// 초대 수락 페이지 - 비로그인 접근 가능 (Public)
// URL: /invite/accept?token=<초대토큰>
export default function InviteAcceptPage() {
  const [searchParams] = useSearchParams()
  const isAuthenticated = Boolean(useAuthStore((state) => state.token))
  const token = searchParams.get('token')
  const invitePath = `/invite/accept${token ? `?token=${encodeURIComponent(token)}` : ''}`
  const loginPath = `/login?redirect=${encodeURIComponent(invitePath)}`

  return (
    <main className="public-state-shell">
      <section className="mx-auto max-w-[680px] rounded-2xl border border-white/80 bg-white/90 p-6 text-center shadow-[0_18px_60px_rgba(15,23,42,0.10)] backdrop-blur md:p-8">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#4f46e5]">
          <MailOpen className="h-8 w-8" />
        </div>
        <div className="mt-6 inline-flex items-center gap-2 text-xs font-black text-[#4f46e5]">
          <UserPlus className="h-3.5 w-3.5" />
          Project Invitation
        </div>
        <h1 className="mt-3 text-[clamp(1.8rem,5vw,2.6rem)] font-black leading-tight text-[#0f172a]">
          프로젝트 초대 수락
        </h1>
        <p className="mx-auto mt-4 max-w-[520px] text-sm font-medium leading-6 text-[#64748b]">
          로그인 후 초대된 프로젝트 작업 공간으로 이동할 수 있습니다.
        </p>

        <div className="mx-auto mt-7 max-w-[460px] rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] px-4 py-3 text-left">
          <p className="text-xs font-black text-[#94a3b8]">초대 토큰</p>
          <p className="mt-1 truncate text-sm font-bold text-[#334155]">{token ?? '토큰이 없습니다.'}</p>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <Link to={isAuthenticated ? '/projects' : loginPath} className="project-primary-button">
            <CheckCircle2 className="h-4 w-4" />
            {isAuthenticated ? '프로젝트 목록으로 이동' : '로그인하고 수락'}
          </Link>
          <Link to="/projects" className="project-secondary-button">
            프로젝트 목록
          </Link>
        </div>
      </section>
    </main>
  )
}

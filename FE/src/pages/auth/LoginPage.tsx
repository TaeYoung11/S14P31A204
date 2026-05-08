// 로그인 화면의 이메일 도메인 선택 폼과 인증 제출 UI를 렌더링합니다.
import { Link } from 'react-router-dom'
import { ChevronDown, Eye, EyeOff } from 'lucide-react'
import { useLoginPage } from '@/features/auth/hooks/useLoginPage'
import AuthLayout from '@/shared/components/AuthLayout'
import Spinner from '@/shared/components/Spinner'

export default function LoginPage() {
  const {
    emailLocalPart,
    emailDomain,
    isCustomEmailDomain,
    emailDomainOptions,
    password,
    showPw,
    rememberEmail,
    loginError,
    isLoggingIn,
    loginNotice,
    setEmailLocalPart,
    setEmailDomain,
    selectEmailDomain,
    setPassword,
    setRememberEmail,
    togglePasswordVisibility,
    handleSubmit,
  } = useLoginPage()

  return (
    <AuthLayout fitViewport>
      <div className="mb-5 flex justify-end text-xs text-[#6b7280] xl:mb-6">
        <span>처음 오셨나요?</span>
        <Link to="/register" className="ml-1 font-medium text-[#4f46e5] hover:underline">
          회원가입
        </Link>
      </div>

      <div className="mb-5 xl:mb-6">
        <h2 className="mb-2 text-[28px] font-bold tracking-[-0.025em] text-[#111827]">BATANG 로그인</h2>
        <p className="text-[13px] leading-[1.6] text-[#6b7280]">프로젝트와 협업 기록을 이어서 관리하세요.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5" autoComplete="on" noValidate>
        {loginNotice && (
          <p className="rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2.5 text-xs text-[#15803d]">{loginNotice}</p>
        )}

        <div>
          <label htmlFor="login-email-id" className="auth-label">
            이메일
          </label>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(132px,0.8fr)] items-center rounded-[10px] border border-[#d1d5db] bg-white transition-colors focus-within:border-[#4f46e5] focus-within:ring-2 focus-within:ring-[#4f46e5]/10">
            <input
              id="login-email-id"
              type="text"
              className="h-[42px] min-w-0 rounded-l-[10px] border-0 bg-transparent px-3 text-sm text-[#111827] outline-none placeholder:text-[#9ca3af]"
              placeholder="아이디"
              value={emailLocalPart}
              onChange={(e) => setEmailLocalPart(e.target.value.replace(/\s/g, ''))}
              required
              autoComplete="username"
            />
            <span className="inline-flex h-6 items-center border-x border-[#e5e7eb] px-2.5 text-[13px] font-semibold text-[#6b7280]">@</span>
            {isCustomEmailDomain ? (
              <div className="relative min-w-0">
                <input
                  type="text"
                  className="h-[42px] w-full min-w-0 rounded-r-[10px] border-0 bg-transparent px-3 pr-14 text-sm font-medium text-[#374151] outline-none placeholder:text-[#9ca3af]"
                  placeholder="example.com"
                  value={emailDomain}
                  onChange={(e) => setEmailDomain(e.target.value.replace(/\s/g, ''))}
                  required
                  autoComplete="off"
                  aria-label="직접 입력 이메일 도메인"
                />
                <button
                  type="button"
                  onClick={() => selectEmailDomain('gmail.com')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-1 text-[11px] font-medium text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#4f46e5]"
                  aria-label="도메인 선택으로 돌아가기"
                >
                  선택
                </button>
              </div>
            ) : (
              <div className="relative min-w-0">
                <select
                  className="h-[42px] w-full min-w-0 appearance-none rounded-r-[10px] border-0 bg-transparent py-0 pl-3 pr-12 text-sm font-medium text-[#374151] outline-none"
                  value={emailDomain}
                  onChange={(e) => selectEmailDomain(e.target.value as (typeof emailDomainOptions)[number] | 'custom')}
                  aria-label="이메일 도메인 선택"
                >
                  {emailDomainOptions.map((domain) => (
                    <option key={domain} value={domain}>
                      {domain}
                    </option>
                  ))}
                  <option value="custom">직접 입력</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
              </div>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="login-password" className="auth-label">
            비밀번호
          </label>
          <div className="relative">
            <input
              id="login-password"
              type={showPw ? 'text' : 'password'}
              className="h-11 w-full rounded-[10px] border border-[#d1d5db] bg-white px-3.5 pr-11 text-sm text-[#111827] outline-none transition-colors placeholder:text-[#9ca3af] focus:border-[#4f46e5] focus:ring-2 focus:ring-[#4f46e5]/10"
              placeholder="비밀번호를 입력해 주세요"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center text-[#9ca3af] transition-colors hover:text-[#6b7280]"
              onClick={togglePasswordVisibility}
              aria-label={showPw ? '비밀번호 숨기기' : '비밀번호 보기'}
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between py-1">
          <label className="inline-flex select-none items-center gap-2 text-[13px] text-[#374151]">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-[#d1d5db] text-[#4f46e5] focus:ring-[#4f46e5]/20"
              checked={rememberEmail}
              onChange={(e) => setRememberEmail(e.target.checked)}
            />
            이메일 기억하기
          </label>
          <button type="button" className="text-xs text-[#6b7280] transition-colors hover:text-[#4f46e5]">
            비밀번호 찾기
          </button>
        </div>

        {loginError && <p className="text-right text-xs font-medium text-[#dc2626]">{(loginError as Error).message}</p>}

        <button
          id="login-submit"
          type="submit"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-[#4f46e5] text-sm font-semibold text-white shadow-[0_4px_14px_rgba(79,70,229,0.28)] transition-colors hover:bg-[#4338ca] disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isLoggingIn}
        >
          {isLoggingIn ? (
            <>
              <Spinner size="sm" /> 로그인 중...
            </>
          ) : (
            '로그인'
          )}
        </button>

        <p className="pt-2 text-center text-[13px] text-[#6b7280]">
          계정이 없으신가요?
          <Link to="/register" className="ml-1 font-semibold text-[#4f46e5] hover:underline">
            회원가입
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}

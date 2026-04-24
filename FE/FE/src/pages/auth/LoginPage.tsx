import { Link } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useLoginPage } from '@/features/auth/hooks/useLoginPage'
import AuthLayout from '@/shared/components/AuthLayout'
import Spinner from '@/shared/components/Spinner'

export default function LoginPage() {
  const {
    email,
    password,
    showPw,
    rememberEmail,
    loginError,
    isLoggingIn,
    setEmail,
    setPassword,
    setRememberEmail,
    togglePasswordVisibility,
    handleSubmit,
  } = useLoginPage()

  return (
    <AuthLayout>
      <div className="mb-6">
        <h2 className="auth-heading">BATANG 로그인</h2>
        <p className="auth-subtext">BATANG 워크스페이스에 로그인하세요.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="login-email" className="auth-label">
            이메일
          </label>
          <input
            id="login-email"
            type="email"
            className="input-auth"
            placeholder="your@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div>
          <label htmlFor="login-password" className="auth-label">
            비밀번호
          </label>
          <div className="relative">
            <input
              id="login-password"
              type={showPw ? 'text' : 'password'}
              className="input-auth pr-11"
              placeholder="비밀번호를 입력하세요"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              id="toggle-password-visible"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] transition-colors hover:text-[#6b7280]"
              onClick={togglePasswordVisibility}
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-[#6b7280]">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-[#d1d5db] text-[#4f46e5] focus:ring-[#4f46e5]/20"
            checked={rememberEmail}
            onChange={(e) => setRememberEmail(e.target.checked)}
          />
          아이디 기억하기
        </label>

        {loginError && <p className="form-error">{(loginError as Error).message}</p>}

        <button id="login-submit" type="submit" className="auth-submit" disabled={isLoggingIn}>
          {isLoggingIn ? (
            <>
              <Spinner size="sm" /> 로그인 중...
            </>
          ) : (
            '로그인'
          )}
        </button>
      </form>

      <div className="mt-4 text-center">
        <p className="text-sm text-[#6b7280]">
          아직 계정이 없으신가요?{' '}
          <Link to="/register" className="link-auth">
            회원가입
          </Link>
        </p>
      </div>

      <div className="mt-4 rounded-lg border border-[#e5e7eb] bg-[#f8f9fa] p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">테스트 계정</p>
        <div className="space-y-0.5">
          <p className="text-xs text-[#6b7280]">
            <span className="font-medium text-[#374151]">설계자:</span> designer@batang.io
          </p>
          <p className="text-xs text-[#6b7280]">
            <span className="font-medium text-[#374151]">클라이언트:</span> client@batang.io
          </p>
          <p className="text-xs text-[#6b7280]">
            <span className="font-medium text-[#374151]">비밀번호:</span> password123
          </p>
        </div>
      </div>
    </AuthLayout>
  )
}

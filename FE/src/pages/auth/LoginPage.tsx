import { Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { useLoginPage } from '@/features/auth/hooks/useLoginPage'
import AuthLayout from '@/shared/components/AuthLayout'
import EmailDomainField from '@/shared/components/auth/EmailDomainField'
import PasswordVisibilityButton from '@/shared/components/auth/PasswordVisibilityButton'
import Spinner from '@/shared/components/Spinner'

/** 로그인 화면: 이메일 도메인 입력, 비밀번호 입력, 이메일 기억하기 옵션을 제공한다. */
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
    loginValidationError,
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
      <div className="auth-form-shell auth-appear">
        <div className="auth-switch-row mb-5 flex justify-end text-xs text-[#6b7280] xl:mb-6">
          <span>처음 오셨나요?</span>
          <Link to="/register" className="ml-1 font-semibold text-[#4f46e5] hover:underline">
            회원가입
          </Link>
        </div>

        <div className="mb-5 xl:mb-6">
          <span className="auth-kicker">WELCOME BACK</span>
          <h2 className="auth-heading mt-2">BATANG 로그인</h2>
          <p className="auth-subtext">프로젝트와 협업 기록을 이어서 관리하세요.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5" autoComplete="on" noValidate>
          {loginNotice && (
            <div className="auth-notice-success" role="status">
              <span className="auth-notice-success-icon" aria-hidden="true">
                <CheckCircle2 className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-black text-[#14532d]">회원 탈퇴 완료</p>
                <p className="mt-1 text-xs leading-5 text-[#166534]/80">{loginNotice}</p>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="login-email-id" className="auth-label">
              이메일
            </label>
            <EmailDomainField
              id="login-email-id"
              localPart={emailLocalPart}
              domain={emailDomain}
              domainOptions={emailDomainOptions}
              isCustomDomain={isCustomEmailDomain}
              onLocalPartChange={setEmailLocalPart}
              onDomainChange={setEmailDomain}
              onSelectDomain={selectEmailDomain}
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
                placeholder="비밀번호를 입력해 주세요"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <PasswordVisibilityButton isVisible={showPw} onToggle={togglePasswordVisibility} />
            </div>
          </div>

          <div className="flex items-center py-1">
            <label className="auth-checkbox-label">
              <input
                type="checkbox"
                className="auth-checkbox-input"
                checked={rememberEmail}
                onChange={(e) => setRememberEmail(e.target.checked)}
              />
              <span className="auth-checkbox-box" aria-hidden="true" />
              이메일 기억하기
            </label>
          </div>

          {(loginValidationError || loginError) && (
            <p className="text-right text-xs font-medium text-[#dc2626]">
              {loginValidationError || (loginError as Error).message}
            </p>
          )}

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
      </div>
    </AuthLayout>
  )
}

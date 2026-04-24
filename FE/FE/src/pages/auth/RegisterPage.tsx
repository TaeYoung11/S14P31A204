import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useRegisterPage } from '@/features/auth/hooks/useRegisterPage'
import AuthLayout from '@/shared/components/AuthLayout'
import Modal from '@/shared/components/Modal'
import Spinner from '@/shared/components/Spinner'

export default function RegisterPage() {
  const {
    form,
    validationError,
    isEmailVerificationOpen,
    emailVerificationCode,
    emailVerificationInput,
    emailVerificationError,
    emailVerificationNotice,
    isEmailVerified,
    isRegistering,
    registerError,
    update,
    handleSubmit,
    handleOpenEmailVerification,
    handleConfirmEmailVerification,
    setEmailVerificationInput,
    clearEmailVerificationError,
    closeEmailVerificationModal,
    selectUserType,
  } = useRegisterPage()

  return (
    <AuthLayout>
      <div className="mb-6">
        <h2 className="auth-heading">BATANG 회원가입</h2>
        <p className="auth-subtext">BATANG에서 새로운 프로젝트 협업을 시작하세요.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="auth-label mb-2">계정 유형</label>
          <div className="grid grid-cols-2 gap-3">
            {(['DESIGNER', 'CLIENT'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => selectUserType(type)}
                className={`rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                  form.user_type === type
                    ? 'border-[#111827] bg-[#111827] text-white'
                    : 'border-[#e5e7eb] bg-white text-[#374151] hover:border-[#d1d5db]'
                }`}
              >
                {type === 'DESIGNER' ? '설계자' : '클라이언트'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="reg-name" className="auth-label">
            이름
          </label>
          <input
            id="reg-name"
            type="text"
            className="input-auth"
            placeholder="이름을 입력해주세요"
            value={form.name}
            onChange={update('name')}
            required
          />
        </div>

        <div>
          <label htmlFor="reg-email" className="auth-label">
            이메일
          </label>
          <div className="flex items-stretch gap-2">
            <div className="relative flex-1">
              <input
                id="reg-email"
                type="email"
                className={`input-auth pr-11 ${
                  isEmailVerified ? 'border-[#22c55e] bg-[#f0fdf4] focus:border-[#22c55e] focus:ring-[#22c55e]/10' : ''
                }`}
                placeholder="your@example.com"
                value={form.email}
                onChange={update('email')}
                required
                autoComplete="email"
              />
              {isEmailVerified && (
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[#16a34a]">
                  <Check className="h-5 w-5" />
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleOpenEmailVerification}
              className="shrink-0 rounded-lg bg-[#111827] px-4 text-sm font-medium text-white transition-colors hover:bg-[#1f2937]"
            >
              인증하기
            </button>
          </div>
          {emailVerificationNotice && (
            <p className={`mt-2 text-right text-xs ${isEmailVerified ? 'text-[#16a34a]' : 'text-[#6b7280]'}`}>
              {emailVerificationNotice}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="reg-password" className="auth-label">
            비밀번호
          </label>
          <input
            id="reg-password"
            type="password"
            className="input-auth"
            placeholder="8자 이상 입력해주세요"
            value={form.password}
            onChange={update('password')}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        <div>
          <label htmlFor="reg-password-confirm" className="auth-label">
            비밀번호 확인
          </label>
          <input
            id="reg-password-confirm"
            type="password"
            className="input-auth"
            placeholder="비밀번호를 한 번 더 입력해주세요"
            value={form.passwordConfirm}
            onChange={update('passwordConfirm')}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        {(validationError || registerError) && (
          <p className="form-error">{validationError || (registerError as Error)?.message}</p>
        )}

        <button id="register-submit" type="submit" className="auth-submit" disabled={isRegistering}>
          {isRegistering ? (
            <>
              <Spinner size="sm" /> 가입 중...
            </>
          ) : (
            '회원가입'
          )}
        </button>
      </form>

      <Modal
        isOpen={isEmailVerificationOpen}
        onClose={closeEmailVerificationModal}
        title="이메일 인증"
        maxWidth="max-w-[460px]"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-[#e5e7eb] bg-[#f8fafc] px-4 py-3">
            <p className="text-xs font-medium text-[#6b7280]">인증번호를 전송한 이메일</p>
            <p className="mt-1 text-sm font-semibold text-[#111827]">{form.email}</p>
          </div>

          <div>
            <label htmlFor="email-verification-code" className="auth-label">
              이메일 인증번호
            </label>
            <input
              id="email-verification-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              className="input-base"
              placeholder="인증번호 6자리를 입력해주세요"
              value={emailVerificationInput}
              onChange={(e) => {
                setEmailVerificationInput(e.target.value.replace(/\D/g, ''))
                clearEmailVerificationError()
              }}
            />
            {emailVerificationError && (
              <p className="mt-1 text-[11px] leading-4 text-[#dc2626]">{emailVerificationError}</p>
            )}
          </div>

          <div className="rounded-lg border border-dashed border-[#cbd5e1] bg-[#f8fafc] px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#64748b]">Mock code</p>
            <p className="mt-1 text-sm font-semibold tracking-[0.28em] text-[#111827]">
              {emailVerificationCode || '------'}
            </p>
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={handleOpenEmailVerification} className="btn-secondary flex-1">
              재전송
            </button>
            <button type="button" onClick={handleConfirmEmailVerification} className="btn-primary flex-1">
              확인
            </button>
          </div>
        </div>
      </Modal>

      <div className="mt-4 text-center">
        <p className="text-sm text-[#6b7280]">
          이미 계정이 있으신가요?{' '}
          <Link to="/login" className="link-auth">
            로그인
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}

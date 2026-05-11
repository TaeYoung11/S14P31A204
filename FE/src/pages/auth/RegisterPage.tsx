import { Link } from 'react-router-dom'
import { Check, ChevronDown, Eye, EyeOff } from 'lucide-react'
import { useRegisterPage } from '@/features/auth/hooks/useRegisterPage'
import AuthLayout from '@/shared/components/AuthLayout'
import Modal from '@/shared/components/Modal'
import Spinner from '@/shared/components/Spinner'

export default function RegisterPage() {
  const {
    form,
    emailLocalPart,
    emailDomain,
    isCustomEmailDomain,
    emailDomainOptions,
    validationError,
    isEmailVerificationOpen,
    emailVerificationInput,
    emailVerificationError,
    emailVerificationNotice,
    isEmailVerified,
    isEmailVerificationValid,
    isEmailCodeExpired,
    isPasswordReady,
    isPasswordConfirmTouched,
    isPasswordMatched,
    isRegistering,
    registerError,
    isSendingEmailCode,
    isVerifyingEmailCode,
    showPassword,
    showPasswordConfirm,
    update,
    handleEmailLocalPartChange,
    handleEmailDomainChange,
    selectEmailDomain,
    handleSubmit,
    handleOpenEmailVerification,
    handleConfirmEmailVerification,
    setEmailVerificationInput,
    clearEmailVerificationError,
    closeEmailVerificationModal,
    selectUserType,
    togglePasswordVisibility,
    togglePasswordConfirmVisibility,
  } = useRegisterPage()

  return (
    <AuthLayout fitViewport>
      <div className="mb-6">
        <h2 className="auth-heading">BATANG 회원가입</h2>
        <p className="auth-subtext">프로젝트 협업을 시작할 계정을 만들어 주세요.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="auth-label mb-2">사용자 유형</label>
          <div className="grid grid-cols-2 border-b border-[#e5e7eb]">
            {(['DESIGNER', 'CUSTOMER'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => selectUserType(type)}
                className={`border-b-2 px-4 pb-2 pt-1 text-sm font-semibold transition-colors ${
                  form.userType === type
                    ? 'border-[#4f46e5] text-[#111827]'
                    : 'border-transparent text-[#9ca3af] hover:text-[#374151]'
                }`}
              >
                {type === 'DESIGNER' ? '디자이너' : '고객'}
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
            placeholder="이름을 입력해 주세요"
            value={form.name}
            onChange={update('name')}
            required
            autoComplete="name"
          />
        </div>

        <div>
          <label htmlFor="reg-email-id" className="auth-label">
            이메일
          </label>
          <div className="flex items-stretch gap-2">
            <div className={`relative grid flex-1 grid-cols-[minmax(0,0.9fr)_auto_minmax(150px,1.1fr)] items-center rounded-lg border bg-white transition-colors focus-within:border-[#4f46e5] focus-within:ring-2 focus-within:ring-[#4f46e5]/10 ${
              isEmailVerified ? 'border-[#22c55e] bg-[#f0fdf4]' : 'border-[#d1d5db]'
            }`}
            >
              <input
                id="reg-email-id"
                type="text"
                className="h-11 min-w-0 rounded-l-lg border-0 bg-transparent px-3 text-sm outline-none"
                placeholder="아이디"
                value={emailLocalPart}
                onChange={(e) => handleEmailLocalPartChange(e.target.value)}
                required
                autoComplete="username"
              />
              <span className="border-x border-[#e5e7eb] px-2 text-sm font-semibold text-[#6b7280]">@</span>
              {isCustomEmailDomain ? (
                <div className="relative min-w-0">
                  <input
                    type="text"
                    className="h-11 w-full min-w-0 border-0 bg-transparent px-3 pr-14 text-sm font-medium text-[#374151] outline-none"
                    placeholder="example.com"
                    value={emailDomain}
                    onChange={(e) => handleEmailDomainChange(e.target.value)}
                    required
                    autoComplete="off"
                    aria-label="직접 입력 이메일 도메인"
                  />
                  {!isEmailVerified && (
                    <button
                      type="button"
                      onClick={() => selectEmailDomain('gmail.com')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-1 text-[11px] font-medium text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#4f46e5]"
                      aria-label="도메인 선택으로 돌아가기"
                    >
                      선택
                    </button>
                  )}
                </div>
              ) : (
                <div className="relative min-w-0">
                  <select
                    className="h-11 w-full min-w-0 appearance-none border-0 bg-transparent py-0 pl-3 pr-12 text-sm font-medium text-[#374151] outline-none"
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
              {isEmailVerificationValid && (
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[#16a34a]">
                  <Check className="h-5 w-5" />
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleOpenEmailVerification}
              disabled={isSendingEmailCode}
              className="shrink-0 rounded-lg bg-[#111827] px-4 text-sm font-medium text-white transition-colors hover:bg-[#1f2937] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSendingEmailCode ? '전송 중...' : isEmailVerificationValid ? '재인증' : '인증'}
            </button>
          </div>
          {emailVerificationNotice && (
            <p className={`mt-2 text-right text-xs ${isEmailVerificationValid ? 'text-[#16a34a]' : isEmailVerified || isEmailCodeExpired ? 'text-[#dc2626]' : 'text-[#6b7280]'}`}>
              {emailVerificationNotice}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="reg-password" className="auth-label">
            비밀번호
          </label>
          <div className="relative">
            <input
              id="reg-password"
              type={showPassword ? 'text' : 'password'}
              className="input-auth pr-11"
              placeholder="8자 이상 입력해 주세요"
              value={form.password}
              onChange={update('password')}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] transition-colors hover:text-[#6b7280]"
              onClick={togglePasswordVisibility}
              aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {form.password.length > 0 && (
            <p className={`mt-1 text-[11px] ${isPasswordReady ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
              {isPasswordReady ? '사용 가능한 비밀번호입니다.' : '비밀번호는 8자 이상이어야 합니다.'}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="reg-password-confirm" className="auth-label">
            비밀번호 확인
          </label>
          <div className="relative">
            <input
              id="reg-password-confirm"
              type={showPasswordConfirm ? 'text' : 'password'}
              className="input-auth pr-11"
              placeholder="비밀번호를 한 번 더 입력해 주세요"
              value={form.passwordConfirm}
              onChange={update('passwordConfirm')}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] transition-colors hover:text-[#6b7280]"
              onClick={togglePasswordConfirmVisibility}
              aria-label={showPasswordConfirm ? '비밀번호 확인 숨기기' : '비밀번호 확인 보기'}
            >
              {showPasswordConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {isPasswordConfirmTouched && (
            <p className={`mt-1 text-[11px] ${isPasswordMatched ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
              {isPasswordMatched ? '비밀번호가 일치합니다.' : '비밀번호가 일치하지 않습니다.'}
            </p>
          )}
        </div>

        {(validationError || registerError) && (
          <p className="text-right text-xs font-medium text-[#dc2626]">{validationError || (registerError as Error)?.message}</p>
        )}

        <button id="register-submit" type="submit" className="auth-submit" disabled={isRegistering}>
          {isRegistering ? (
            <>
              <Spinner size="sm" /> 회원가입 중...
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
            <p className="text-xs font-medium text-[#6b7280]">인증 코드를 전송한 이메일</p>
            <p className="mt-1 text-sm font-semibold text-[#111827]">{form.email}</p>
            {emailVerificationNotice && (
              <p className={`mt-2 text-xs ${isEmailCodeExpired ? 'text-[#dc2626]' : 'text-[#4b5563]'}`}>
                {emailVerificationNotice}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="email-verification-code" className="auth-label">
              인증 코드
            </label>
            <input
              id="email-verification-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              className="input-base"
              placeholder="인증 코드 6자리를 입력해 주세요"
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

          <div className="flex gap-2">
            <button type="button" onClick={handleOpenEmailVerification} className="btn-secondary flex-1" disabled={isSendingEmailCode}>
              {isSendingEmailCode ? '재전송 중...' : '재전송'}
            </button>
            <button type="button" onClick={handleConfirmEmailVerification} className="btn-primary flex-1" disabled={isVerifyingEmailCode || isEmailCodeExpired}>
              {isVerifyingEmailCode ? '확인 중...' : '확인'}
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

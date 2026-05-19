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
      <div className="auth-form-shell auth-register-shell auth-appear">
        <div className="auth-switch-row mb-4 flex justify-end text-xs text-[#6b7280]">
          <span>이미 계정이 있나요?</span>
          <Link to="/login" className="ml-1 font-semibold text-[#4f46e5] hover:underline">
            로그인
          </Link>
        </div>

        <div className="auth-register-heading mb-4">
          <span className="auth-kicker">START YOUR WORKSPACE</span>
          <h2 className="auth-heading">계정 만들기</h2>
          <p className="auth-subtext">도면과 모델을 함께 다룰 협업 공간을 준비하세요.</p>
        </div>

      <form onSubmit={handleSubmit} className="auth-register-form space-y-3">
        <div>
          <label className="auth-label mb-2">사용자 유형</label>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#eef2ff] p-1">
            {(['DESIGNER', 'CUSTOMER'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => selectUserType(type)}
                className={`auth-type-option ${
                  form.userType === type
                    ? 'bg-white text-[#111827] shadow-[0_10px_24px_rgba(79,70,229,0.16)]'
                    : 'text-[#64748b] hover:text-[#111827]'
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
            placeholder="이름"
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
          <div className="flex flex-col items-stretch gap-2 sm:flex-row">
            <div className={`auth-email-field ${
              isEmailVerified ? 'border-[#22c55e] bg-[#f0fdf4]' : 'border-[#d1d5db]'
            }`}
            >
              <input
                id="reg-email-id"
                type="text"
                className="h-11 min-w-0 rounded-l-xl border-0 bg-transparent px-3 text-sm outline-none"
                placeholder="아이디"
                value={emailLocalPart}
                onChange={(e) => handleEmailLocalPartChange(e.target.value)}
                required
                autoComplete="username"
              />
              <span className="border-x border-[#e5e7eb] px-2 text-sm font-semibold text-[#64748b]">@</span>
              {isCustomEmailDomain ? (
                <div className="relative min-w-0">
                  <input
                    type="text"
                    className="h-11 w-full min-w-0 border-0 bg-transparent px-3 pr-14 text-sm font-medium text-[#334155] outline-none"
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
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-1 text-[11px] font-medium text-[#64748b] transition-colors hover:bg-[#f3f4f6] hover:text-[#4f46e5]"
                      aria-label="도메인 선택으로 돌아가기"
                    >
                      선택
                    </button>
                  )}
                </div>
              ) : (
                <div className="relative min-w-0">
                  <select
                    className="h-11 w-full min-w-0 appearance-none border-0 bg-transparent py-0 pl-3 pr-12 text-sm font-medium text-[#334155] outline-none"
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
                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
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
              className="auth-inline-button"
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
              placeholder="8자 이상"
              value={form.password}
              onChange={update('password')}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] transition-colors hover:text-[#64748b]"
              onClick={togglePasswordVisibility}
              aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {form.password.length > 0 && (
            <p className={`mt-1 text-[11px] ${isPasswordReady ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
              {isPasswordReady ? '사용 가능' : '8자 이상 필요'}
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
              placeholder="비밀번호 확인"
              value={form.passwordConfirm}
              onChange={update('passwordConfirm')}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] transition-colors hover:text-[#64748b]"
              onClick={togglePasswordConfirmVisibility}
              aria-label={showPasswordConfirm ? '비밀번호 확인 숨기기' : '비밀번호 확인 보기'}
            >
              {showPasswordConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {isPasswordConfirmTouched && (
            <p className={`mt-1 text-[11px] ${isPasswordMatched ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
              {isPasswordMatched ? '일치합니다' : '일치하지 않습니다'}
            </p>
          )}
        </div>

        {(validationError || registerError) && (
          <p className="text-right text-xs font-medium text-[#dc2626]">{validationError || (registerError as Error)?.message}</p>
        )}

        <button id="register-submit" type="submit" className="auth-submit" disabled={isRegistering}>
          {isRegistering ? (
            <>
              <Spinner size="sm" /> 처리 중...
            </>
          ) : (
            '시작하기'
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
            <p className="text-xs font-medium text-[#64748b]">전송 이메일</p>
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
              placeholder="6자리 코드"
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

      </div>
    </AuthLayout>
  )
}

import { Link } from 'react-router-dom'
import { AlertCircle, MailCheck, Timer } from 'lucide-react'
import { useRegisterPage } from '@/features/auth/hooks/useRegisterPage'
import AuthLayout from '@/shared/components/AuthLayout'
import EmailDomainField from '@/shared/components/auth/EmailDomainField'
import PasswordVisibilityButton from '@/shared/components/auth/PasswordVisibilityButton'
import Modal from '@/shared/components/Modal'
import Spinner from '@/shared/components/Spinner'

/** 회원가입 화면: 사용자 유형 선택, 이메일 인증, 비밀번호 검증을 처리한다. */
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
          <Link to="/login" className="ml-1 font-semibold text-[#3B45B3] hover:underline">
            로그인
          </Link>
        </div>

        <div className="auth-register-heading mb-4">
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
                  className={`auth-type-option ${form.userType === type
                      ? 'bg-white text-[#111827] shadow-[0_10px_24px_rgba(59,69,179,0.16)]'
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
              <EmailDomainField
                id="reg-email-id"
                localPart={emailLocalPart}
                domain={emailDomain}
                domainOptions={emailDomainOptions}
                isCustomDomain={isCustomEmailDomain}
                isVerified={isEmailVerificationValid}
                className={isEmailVerificationValid ? 'border-[#22c55e] bg-[#f0fdf4]' : 'border-[#d1d5db]'}
                inputClassName="text-[#111827] placeholder:text-[#9ca3af]"
                selectClassName="text-[#334155]"
                onLocalPartChange={handleEmailLocalPartChange}
                onDomainChange={handleEmailDomainChange}
                onSelectDomain={selectEmailDomain}
              />
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
              <p
                className={`mt-2 text-right text-xs ${isEmailVerificationValid
                    ? 'text-[#16a34a]'
                    : isEmailVerified || isEmailCodeExpired
                      ? 'text-[#dc2626]'
                      : 'text-[#6b7280]'
                  }`}
              >
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
              <PasswordVisibilityButton isVisible={showPassword} onToggle={togglePasswordVisibility} />
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
              <PasswordVisibilityButton
                isVisible={showPasswordConfirm}
                onToggle={togglePasswordConfirmVisibility}
                labelPrefix="비밀번호 확인"
              />
            </div>
            {isPasswordConfirmTouched && (
              <p className={`mt-1 text-[11px] ${isPasswordMatched ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                {isPasswordMatched ? '일치합니다' : '일치하지 않습니다'}
              </p>
            )}
          </div>

          {(validationError || registerError) && (
            <p className="text-right text-xs font-medium text-[#dc2626]">
              {validationError || (registerError as Error)?.message}
            </p>
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
          maxWidth="max-w-[420px]"
        >
          <div className="space-y-3.5">
            <div className="email-verify-panel">
              <div className="flex items-start gap-3">
                <span className="email-verify-icon" aria-hidden="true">
                  <MailCheck className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="email-verify-title">인증 코드를 보냈습니다.</p>
                  <p className="email-verify-description">
                    받은 메일함에서 6자리 인증 코드를 확인해 주세요.
                  </p>
                </div>
              </div>

              <div className="email-verify-address">
                <p className="text-[11px] font-bold text-[#64748b]">전송 이메일</p>
                <p className="mt-1 truncate text-sm font-black leading-5 text-[#111827]">{form.email}</p>
              </div>

              {emailVerificationNotice && (
                <div
                  className={`email-verify-notice ${isEmailCodeExpired ? 'email-verify-notice-danger' : 'email-verify-notice-active'
                    }`}
                >
                  <Timer className="h-4 w-4 shrink-0" />
                  {emailVerificationNotice}
                </div>
              )}
            </div>

            <div className="email-verify-code-card">
              <label htmlFor="email-verification-code" className="auth-label">
                인증 코드
              </label>
              <input
                id="email-verification-code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                className="input-base email-verify-input"
                placeholder="6자리 코드"
                value={emailVerificationInput}
                onChange={(e) => {
                  setEmailVerificationInput(e.target.value.replace(/\D/g, ''))
                  clearEmailVerificationError()
                }}
              />
              {emailVerificationError && (
                <div className="email-verify-error" role="alert">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {emailVerificationError}
                </div>
              )}
            </div>

            <div className="email-verify-actions">
              <button
                type="button"
                onClick={handleOpenEmailVerification}
                className="email-verify-button border-[#e6e8f2] bg-white text-[#334155] hover:border-[#C8CDF2] hover:text-[#3B45B3]"
                disabled={isSendingEmailCode}
              >
                {isSendingEmailCode ? '재전송 중...' : '재전송'}
              </button>
              <button
                type="button"
                onClick={handleConfirmEmailVerification}
                className="email-verify-button border-[#3B45B3] bg-[#3B45B3] text-white shadow-[0_14px_30px_rgba(59,69,179,0.20)] hover:bg-[#2D3691]"
                disabled={isVerifyingEmailCode || isEmailCodeExpired}
              >
                {isVerifyingEmailCode ? '확인 중...' : '확인'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </AuthLayout>
  )
}

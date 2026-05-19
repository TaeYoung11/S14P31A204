import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  buildEmail,
  DEFAULT_EMAIL_DOMAIN,
  EMAIL_DOMAIN_OPTIONS,
  EMAIL_PATTERN,
  sanitizeEmailSegment,
  type EmailDomainOption,
} from '@/features/auth/constants/email'
import { authService } from '@/features/auth/services/auth.service'
import { useAuthStore } from '@/shared/stores/authStore'

const toExpiresAt = (expiresInSeconds: number) => Date.now() + Math.max(expiresInSeconds, 0) * 1000

const getRemainingSeconds = (expiresAt: number | null, now: number) => {
  if (!expiresAt) return 0
  return Math.max(0, Math.ceil((expiresAt - now) / 1000))
}

const formatRemainingTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)
  const restSeconds = seconds % 60
  if (minutes <= 0) return `${restSeconds}초`
  return `${minutes}분 ${restSeconds.toString().padStart(2, '0')}초`
}

export const useRegisterPage = () => {
  const navigate = useNavigate()
  const { setUser, setToken, setRefreshToken } = useAuthStore()
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    passwordConfirm: '',
    userType: 'DESIGNER' as 'DESIGNER' | 'CUSTOMER',
  })
  const [emailLocalPart, setEmailLocalPart] = useState('')
  const [emailDomain, setEmailDomain] = useState<string>(DEFAULT_EMAIL_DOMAIN)
  const [isCustomEmailDomain, setIsCustomEmailDomain] = useState(false)
  const [validationError, setValidationError] = useState('')
  const [isEmailVerificationOpen, setIsEmailVerificationOpen] = useState(false)
  const [emailVerificationInput, setEmailVerificationInput] = useState('')
  const [emailVerificationError, setEmailVerificationError] = useState('')
  const [isEmailVerified, setIsEmailVerified] = useState(false)
  const [verifiedToken, setVerifiedToken] = useState('')
  const [emailCodeExpiresAt, setEmailCodeExpiresAt] = useState<number | null>(null)
  const [verifiedTokenExpiresAt, setVerifiedTokenExpiresAt] = useState<number | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [showPassword, setShowPassword] = useState(false)
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false)

  const emailCodeRemainingSeconds = getRemainingSeconds(emailCodeExpiresAt, currentTime)
  const verifiedTokenRemainingSeconds = getRemainingSeconds(verifiedTokenExpiresAt, currentTime)
  const isEmailCodeExpired = Boolean(emailCodeExpiresAt) && emailCodeRemainingSeconds === 0 && !isEmailVerified
  const isVerifiedTokenExpired = Boolean(verifiedTokenExpiresAt) && verifiedTokenRemainingSeconds === 0
  const isEmailVerificationValid = isEmailVerified && !isVerifiedTokenExpired
  const isPasswordReady = form.password.length >= 8
  const isPasswordConfirmTouched = form.passwordConfirm.length > 0
  const isPasswordMatched = isPasswordConfirmTouched && form.password === form.passwordConfirm

  const emailVerificationNotice = useMemo(() => {
    if (isEmailVerified) {
      if (isVerifiedTokenExpired) return '이메일 인증 유효시간이 만료되었습니다. 인증을 다시 진행해 주세요.'
      return `이메일 인증이 완료되었습니다. 가입 가능 시간 ${formatRemainingTime(verifiedTokenRemainingSeconds)}`
    }

    if (!emailCodeExpiresAt) return ''
    if (isEmailCodeExpired) return '인증 시간이 만료되었습니다. 인증 코드를 다시 전송해 주세요.'
    return `인증 코드 유효시간 ${formatRemainingTime(emailCodeRemainingSeconds)}`
  }, [
    emailCodeExpiresAt,
    emailCodeRemainingSeconds,
    isEmailCodeExpired,
    isEmailVerified,
    isVerifiedTokenExpired,
    verifiedTokenRemainingSeconds,
  ])

  useEffect(() => {
    if (!emailCodeExpiresAt && !verifiedTokenExpiresAt) return undefined

    const timerId = window.setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)

    return () => window.clearInterval(timerId)
  }, [emailCodeExpiresAt, verifiedTokenExpiresAt])

  const registerMutation = useMutation({
    mutationFn: () =>
      authService.register({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        userType: form.userType,
        verifiedToken,
      }),
    onSuccess: ({ access_token, refresh_token, user }) => {
      setToken(access_token)
      setRefreshToken(refresh_token)
      setUser(user)
      navigate('/projects', { replace: true })
    },
  })

  const sendCodeMutation = useMutation({
    mutationFn: authService.sendEmailCode,
    onSuccess: (data) => {
      setValidationError('')
      setEmailVerificationError('')
      setEmailCodeExpiresAt(toExpiresAt(data.expiresIn))
      setVerifiedTokenExpiresAt(null)
      setCurrentTime(Date.now())
      setIsEmailVerificationOpen(true)
    },
  })

  const verifyCodeMutation = useMutation({
    mutationFn: authService.verifyEmailCode,
    onSuccess: (data) => {
      setVerifiedToken(data.verifiedToken)
      setIsEmailVerified(true)
      setVerifiedTokenExpiresAt(toExpiresAt(data.expiresIn))
      setCurrentTime(Date.now())
      setIsEmailVerificationOpen(false)
    },
  })

  const resetEmailVerification = () => {
    setIsEmailVerified(false)
    setEmailVerificationInput('')
    setEmailVerificationError('')
    setVerifiedToken('')
    setEmailCodeExpiresAt(null)
    setVerifiedTokenExpiresAt(null)
  }

  const handleEmailLocalPartChange = (value: string) => {
    const nextLocalPart = sanitizeEmailSegment(value)
    setEmailLocalPart(nextLocalPart)
    setForm((prev) => ({ ...prev, email: buildEmail(nextLocalPart, emailDomain) }))
    resetEmailVerification()
  }

  const handleEmailDomainChange = (value: string) => {
    const nextDomain = sanitizeEmailSegment(value)
    setEmailDomain(nextDomain)
    setForm((prev) => ({ ...prev, email: buildEmail(emailLocalPart, nextDomain) }))
    resetEmailVerification()
  }

  const selectEmailDomain = (domain: EmailDomainOption | 'custom') => {
    if (domain === 'custom') {
      setIsCustomEmailDomain(true)
      handleEmailDomainChange('')
      return
    }

    setIsCustomEmailDomain(false)
    handleEmailDomainChange(domain)
  }

  const update =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = e.target.value
      setForm((prev) => ({ ...prev, [key]: value }))

      if (key === 'email') {
        resetEmailVerification()
      }
    }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError('')

    if (!form.name.trim()) {
      setValidationError('이름을 입력해 주세요.')
      return
    }

    if (!EMAIL_PATTERN.test(form.email)) {
      setValidationError('올바른 이메일 형식을 입력해 주세요.')
      return
    }

    if (!isEmailVerified || !verifiedToken || isVerifiedTokenExpired) {
      setValidationError('이메일 인증을 완료한 뒤 회원가입해 주세요.')
      return
    }

    if (!isPasswordReady) {
      setValidationError('비밀번호는 8자 이상이어야 합니다.')
      return
    }

    if (form.password !== form.passwordConfirm) {
      setValidationError('비밀번호 확인이 일치하지 않습니다.')
      return
    }

    registerMutation.mutate()
  }

  const handleOpenEmailVerification = () => {
    setValidationError('')
    setEmailVerificationError('')
    setIsEmailVerified(false)
    setVerifiedToken('')
    setVerifiedTokenExpiresAt(null)

    if (!form.email.trim()) {
      setValidationError('이메일을 먼저 입력해 주세요.')
      return
    }

    if (!EMAIL_PATTERN.test(form.email)) {
      setValidationError('올바른 이메일 형식을 입력해 주세요.')
      return
    }

    setEmailVerificationInput('')
    sendCodeMutation.mutate({
      email: form.email.trim().toLowerCase(),
    })
  }

  const handleConfirmEmailVerification = () => {
    setEmailVerificationError('')

    if (isEmailCodeExpired) {
      setEmailVerificationError('인증 시간이 만료되었습니다. 인증 코드를 다시 전송해 주세요.')
      return
    }

    if (!emailVerificationInput.trim()) {
      setEmailVerificationError('인증 코드를 입력해 주세요.')
      return
    }

    verifyCodeMutation.mutate({
      email: form.email.trim().toLowerCase(),
      code: emailVerificationInput.trim(),
    })
  }

  const combinedRegisterError = registerMutation.error ?? sendCodeMutation.error ?? verifyCodeMutation.error

  return {
    form,
    emailLocalPart,
    emailDomain,
    isCustomEmailDomain,
    emailDomainOptions: EMAIL_DOMAIN_OPTIONS,
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
    isRegistering: registerMutation.isPending,
    registerError: combinedRegisterError,
    isSendingEmailCode: sendCodeMutation.isPending,
    isVerifyingEmailCode: verifyCodeMutation.isPending,
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
    clearEmailVerificationError: () => setEmailVerificationError(''),
    closeEmailVerificationModal: () => setIsEmailVerificationOpen(false),
    selectUserType: (userType: 'DESIGNER' | 'CUSTOMER') =>
      setForm((prev) => ({ ...prev, userType })),
    togglePasswordVisibility: () => setShowPassword((prev) => !prev),
    togglePasswordConfirmVisibility: () => setShowPasswordConfirm((prev) => !prev),
  }
}

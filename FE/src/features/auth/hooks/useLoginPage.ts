// 로그인 페이지의 이메일 조합, 기억하기, 제출 상태를 관리합니다.
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import {
  buildEmail,
  EMAIL_DOMAIN_OPTIONS,
  EMAIL_PATTERN,
  sanitizeEmailSegment,
  splitEmail,
  type EmailDomainOption,
} from '@/features/auth/constants/email'
import { clearWithdrawNotice, readWithdrawNotice } from '@/features/auth/constants/storage'
import { useAuth } from '@/features/auth/hooks/useAuth'

const REMEMBERED_EMAIL_KEY = 'batang-remembered-email'

interface LoginLocationState {
  email?: string
  withdrawn?: boolean
}

const readRememberedEmail = () => {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? ''
}

export const useLoginPage = () => {
  const { login, isLoggingIn, loginError } = useAuth()
  const location = useLocation()
  const locationState = location.state as LoginLocationState | null
  const stateEmail = locationState?.email?.trim() ?? ''
  const initialEmail = stateEmail || readRememberedEmail()
  const initialEmailParts = splitEmail(initialEmail)

  const [emailLocalPart, setEmailLocalPart] = useState(initialEmailParts.localPart)
  const [emailDomain, setEmailDomain] = useState(initialEmailParts.domain)
  const [isCustomEmailDomain, setIsCustomEmailDomain] = useState(initialEmailParts.isCustomDomain)
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [rememberEmail, setRememberEmail] = useState(Boolean(initialEmail))
  const [loginValidationError, setLoginValidationError] = useState('')
  const [hasWithdrawNotice] = useState(() => readWithdrawNotice() || Boolean(locationState?.withdrawn))

  const email = useMemo(() => buildEmail(emailLocalPart, emailDomain), [emailDomain, emailLocalPart])

  useEffect(() => {
    if (!hasWithdrawNotice) return
    clearWithdrawNotice()
  }, [hasWithdrawNotice])

  const validateEmailInput = (localPart: string, domain: string) => {
    const nextEmail = buildEmail(localPart, domain)
    if (!nextEmail || EMAIL_PATTERN.test(nextEmail)) {
      setLoginValidationError('')
      return
    }

    setLoginValidationError('올바른 이메일 형식으로 입력해 주세요.')
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()
    setLoginValidationError('')

    if (!normalizedEmail) {
      setLoginValidationError('이메일을 입력해 주세요.')
      return
    }

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setLoginValidationError('올바른 이메일 형식으로 입력해 주세요.')
      return
    }

    if (!password) {
      setLoginValidationError('비밀번호를 입력해 주세요.')
      return
    }

    if (typeof window !== 'undefined') {
      if (rememberEmail) {
        window.localStorage.setItem(REMEMBERED_EMAIL_KEY, normalizedEmail)
      } else {
        window.localStorage.removeItem(REMEMBERED_EMAIL_KEY)
      }
    }

    login({ email: normalizedEmail, password })
  }

  return {
    email,
    emailLocalPart,
    emailDomain,
    isCustomEmailDomain,
    emailDomainOptions: EMAIL_DOMAIN_OPTIONS,
    password,
    showPw,
    rememberEmail,
    loginError,
    loginValidationError,
    isLoggingIn,
    loginNotice: hasWithdrawNotice ? '회원 탈퇴가 완료되었습니다. 다시 로그인해 주세요.' : '',
    setEmailLocalPart: (value: string) => {
      const nextLocalPart = sanitizeEmailSegment(value)
      setEmailLocalPart(nextLocalPart)
      validateEmailInput(nextLocalPart, emailDomain)
    },
    setEmailDomain: (value: string) => {
      const nextDomain = sanitizeEmailSegment(value)
      setEmailDomain(nextDomain)
      validateEmailInput(emailLocalPart, nextDomain)
    },
    selectEmailDomain: (domain: EmailDomainOption | 'custom') => {
      if (domain === 'custom') {
        setIsCustomEmailDomain(true)
        setEmailDomain('')
        validateEmailInput(emailLocalPart, '')
        return
      }
      setIsCustomEmailDomain(false)
      setEmailDomain(domain)
      validateEmailInput(emailLocalPart, domain)
    },
    setPassword: (value: string) => {
      setLoginValidationError('')
      setPassword(value)
    },
    setRememberEmail,
    togglePasswordVisibility: () => setShowPw((prev) => !prev),
    handleSubmit,
  }
}

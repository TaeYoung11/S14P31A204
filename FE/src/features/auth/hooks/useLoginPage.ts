// 로그인 페이지의 이메일 조합, 기억하기, 제출 상태를 관리합니다.
import { useMemo, useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '@/features/auth/hooks/useAuth'

const REMEMBERED_EMAIL_KEY = 'batang-remembered-email'
const EMAIL_DOMAIN_OPTIONS = ['gmail.com', 'naver.com', 'kakao.com'] as const
const EMAIL_PATTERN = /\S+@\S+\.\S+/
type EmailDomainOption = (typeof EMAIL_DOMAIN_OPTIONS)[number]

interface LoginLocationState {
  email?: string
  withdrawn?: boolean
}

const readRememberedEmail = () => {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? ''
}

const splitEmail = (email: string) => {
  const normalizedEmail = email.trim().toLowerCase()
  const atIndex = normalizedEmail.indexOf('@')
  const localPart = atIndex >= 0 ? normalizedEmail.slice(0, atIndex) : normalizedEmail
  const domain = atIndex >= 0 ? normalizedEmail.slice(atIndex + 1) : ''
  const isKnownDomain = EMAIL_DOMAIN_OPTIONS.includes(domain as EmailDomainOption)

  return {
    localPart,
    domain: domain || 'gmail.com',
    isCustomDomain: Boolean(domain) && !isKnownDomain,
  }
}

const buildEmail = (localPart: string, domain: string) => {
  const normalizedLocalPart = localPart.trim()
  const normalizedDomain = domain.trim()
  if (!normalizedLocalPart || !normalizedDomain) return ''
  return `${normalizedLocalPart}@${normalizedDomain}`.toLowerCase()
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

  const email = useMemo(() => buildEmail(emailLocalPart, emailDomain), [emailDomain, emailLocalPart])

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
    loginNotice: locationState?.withdrawn ? '회원 탈퇴가 완료되었습니다. 다시 로그인해 주세요.' : '',
    setEmailLocalPart: (value: string) => {
      setLoginValidationError('')
      setEmailLocalPart(value)
    },
    setEmailDomain: (value: string) => {
      setLoginValidationError('')
      setEmailDomain(value)
    },
    selectEmailDomain: (domain: EmailDomainOption | 'custom') => {
      setLoginValidationError('')
      if (domain === 'custom') {
        setIsCustomEmailDomain(true)
        setEmailDomain('')
        return
      }
      setIsCustomEmailDomain(false)
      setEmailDomain(domain)
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

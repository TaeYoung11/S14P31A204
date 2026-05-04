import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '@/features/auth/hooks/useAuth'

const REMEMBERED_EMAIL_KEY = 'batang-remembered-email'
const EMAIL_TEMPLATES = ['designer@batang.io', 'customer@batang.io', 'name@company.com'] as const

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

  const rememberedEmail = readRememberedEmail()

  const [email, setEmail] = useState(locationState?.email ?? rememberedEmail)
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [rememberEmail, setRememberEmail] = useState(Boolean(locationState?.email ?? rememberedEmail))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()

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
    password,
    showPw,
    rememberEmail,
    loginError,
    isLoggingIn,
    emailTemplates: EMAIL_TEMPLATES,
    loginNotice: locationState?.withdrawn ? '회원탈퇴가 완료되었습니다.' : '',
    setEmail,
    setPassword,
    setRememberEmail,
    selectEmailTemplate: (nextEmail: string) => setEmail(nextEmail),
    togglePasswordVisibility: () => setShowPw((prev) => !prev),
    handleSubmit,
  }
}

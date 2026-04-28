import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '@/features/auth/hooks/useAuth'

const REMEMBERED_EMAIL_KEY = 'batang-remembered-email'

interface LoginLocationState {
  email?: string
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

    if (typeof window !== 'undefined') {
      if (rememberEmail) {
        window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email)
      } else {
        window.localStorage.removeItem(REMEMBERED_EMAIL_KEY)
      }
    }

    login({ email, password })
  }

  return {
    email,
    password,
    showPw,
    rememberEmail,
    loginError,
    isLoggingIn,
    setEmail,
    setPassword,
    setRememberEmail,
    togglePasswordVisibility: () => setShowPw((prev) => !prev),
    handleSubmit,
  }
}

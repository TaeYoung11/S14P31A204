import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '@/features/auth/hooks/useAuth'

interface LoginLocationState {
  email?: string
}

export const useLoginPage = () => {
  const { login, isLoggingIn, loginError } = useAuth()
  const location = useLocation()
  const locationState = location.state as LoginLocationState | null

  const [email, setEmail] = useState(locationState?.email ?? '')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)

  useEffect(() => {
    if (locationState?.email) {
      setEmail(locationState.email)
    }
  }, [locationState?.email])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    login({ email, password })
  }

  return {
    email,
    password,
    showPw,
    loginError,
    isLoggingIn,
    setEmail,
    setPassword,
    togglePasswordVisibility: () => setShowPw((prev) => !prev),
    handleSubmit,
  }
}

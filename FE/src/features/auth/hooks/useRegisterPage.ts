import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { authService } from '@/features/auth/services/auth.service'
import { useAuthStore } from '@/shared/stores/authStore'

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
  const [validationError, setValidationError] = useState('')
  const [isEmailVerificationOpen, setIsEmailVerificationOpen] = useState(false)
  const [emailVerificationInput, setEmailVerificationInput] = useState('')
  const [emailVerificationError, setEmailVerificationError] = useState('')
  const [emailVerificationNotice, setEmailVerificationNotice] = useState('')
  const [isEmailVerified, setIsEmailVerified] = useState(false)
  const [verifiedToken, setVerifiedToken] = useState('')

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
      setEmailVerificationNotice(`${data.email}로 인증 코드를 전송했습니다. 유효시간 ${data.expiresIn}초`)
      setIsEmailVerificationOpen(true)
    },
  })

  const verifyCodeMutation = useMutation({
    mutationFn: authService.verifyEmailCode,
    onSuccess: (data) => {
      setVerifiedToken(data.verifiedToken)
      setIsEmailVerified(true)
      setEmailVerificationNotice(`이메일 인증이 완료되었습니다. 인증 유효시간 ${data.expiresIn}초`)
      setIsEmailVerificationOpen(false)
    },
  })

  const update =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = e.target.value
      setForm((prev) => ({ ...prev, [key]: value }))

      if (key === 'email') {
        setIsEmailVerified(false)
        setEmailVerificationInput('')
        setEmailVerificationError('')
        setEmailVerificationNotice('')
        setVerifiedToken('')
      }
    }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError('')

    if (!form.name.trim()) {
      setValidationError('이름을 입력해 주세요.')
      return
    }

    if (!/\S+@\S+\.\S+/.test(form.email)) {
      setValidationError('올바른 이메일 형식을 입력해 주세요.')
      return
    }

    if (!isEmailVerified || !verifiedToken) {
      setValidationError('이메일 인증을 완료한 뒤 회원가입해 주세요.')
      return
    }

    if (form.password.length < 8) {
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

    if (!form.email.trim()) {
      setValidationError('이메일을 먼저 입력해 주세요.')
      return
    }

    if (!/\S+@\S+\.\S+/.test(form.email)) {
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
    validationError,
    isEmailVerificationOpen,
    emailVerificationInput,
    emailVerificationError,
    emailVerificationNotice,
    isEmailVerified,
    isRegistering: registerMutation.isPending,
    registerError: combinedRegisterError,
    isSendingEmailCode: sendCodeMutation.isPending,
    isVerifyingEmailCode: verifyCodeMutation.isPending,
    update,
    handleSubmit,
    handleOpenEmailVerification,
    handleConfirmEmailVerification,
    setEmailVerificationInput,
    clearEmailVerificationError: () => setEmailVerificationError(''),
    closeEmailVerificationModal: () => setIsEmailVerificationOpen(false),
    selectUserType: (userType: 'DESIGNER' | 'CUSTOMER') =>
      setForm((prev) => ({ ...prev, userType })),
  }
}

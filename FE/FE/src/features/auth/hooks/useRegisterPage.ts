import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { authService } from '@/features/auth/services/auth.service'

export const useRegisterPage = () => {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    passwordConfirm: '',
    user_type: 'DESIGNER' as 'DESIGNER' | 'CLIENT',
  })
  const [validationError, setValidationError] = useState('')
  const [isEmailVerificationOpen, setIsEmailVerificationOpen] = useState(false)
  const [emailVerificationCode, setEmailVerificationCode] = useState('')
  const [emailVerificationInput, setEmailVerificationInput] = useState('')
  const [emailVerificationError, setEmailVerificationError] = useState('')
  const [emailVerificationNotice, setEmailVerificationNotice] = useState('')
  const [isEmailVerified, setIsEmailVerified] = useState(false)

  const mutation = useMutation({
    mutationFn: () =>
      authService.register({
        name: form.name,
        email: form.email,
        password: form.password,
        user_type: form.user_type,
      }),
    onSuccess: () =>
      navigate('/login', {
        state: { email: form.email },
        replace: true,
      }),
  })

  const update =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = e.target.value
      setForm((prev) => ({ ...prev, [key]: value }))

      if (key === 'email') {
        setIsEmailVerified(false)
        setEmailVerificationCode('')
        setEmailVerificationInput('')
        setEmailVerificationError('')
        setEmailVerificationNotice('')
      }
    }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError('')

    if (!isEmailVerified) {
      setValidationError('이메일 인증을 완료해야 가입할 수 있습니다.')
      return
    }

    if (form.password !== form.passwordConfirm) {
      setValidationError('비밀번호가 일치하지 않습니다.')
      return
    }

    mutation.mutate()
  }

  const handleOpenEmailVerification = () => {
    setValidationError('')
    setEmailVerificationError('')

    if (!form.email.trim()) {
      setValidationError('이메일 주소를 먼저 입력해주세요.')
      return
    }

    if (!/\S+@\S+\.\S+/.test(form.email)) {
      setValidationError('올바른 이메일 주소를 입력해주세요.')
      return
    }

    const nextCode = String(Math.floor(100000 + Math.random() * 900000))
    setEmailVerificationCode(nextCode)
    setEmailVerificationInput('')
    setEmailVerificationNotice(`${form.email}로 인증번호를 전송했습니다.`)
    setIsEmailVerificationOpen(true)
  }

  const handleConfirmEmailVerification = () => {
    setEmailVerificationError('')

    if (!emailVerificationInput.trim()) {
      setEmailVerificationError('인증번호를 입력해주세요.')
      return
    }

    if (emailVerificationInput.trim() !== emailVerificationCode) {
      setEmailVerificationError('인증번호가 올바르지 않습니다.')
      return
    }

    setIsEmailVerified(true)
    setEmailVerificationNotice('이메일 인증이 완료되었습니다.')
    setIsEmailVerificationOpen(false)
  }

  return {
    form,
    validationError,
    isEmailVerificationOpen,
    emailVerificationCode,
    emailVerificationInput,
    emailVerificationError,
    emailVerificationNotice,
    isEmailVerified,
    isRegistering: mutation.isPending,
    registerError: mutation.error,
    update,
    handleSubmit,
    handleOpenEmailVerification,
    handleConfirmEmailVerification,
    setEmailVerificationInput,
    clearEmailVerificationError: () => setEmailVerificationError(''),
    closeEmailVerificationModal: () => setIsEmailVerificationOpen(false),
    selectUserType: (userType: 'DESIGNER' | 'CLIENT') =>
      setForm((prev) => ({ ...prev, user_type: userType })),
  }
}

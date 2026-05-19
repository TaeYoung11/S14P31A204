import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { WITHDRAW_NOTICE_KEY } from '@/features/auth/constants/storage'
import type { LoginDto, WithdrawDto } from '@/features/auth/services/auth.service'
import { authService } from '@/features/auth/services/auth.service'
import { useAuthStore } from '@/shared/stores/authStore'

export const useAuth = () => {
  const queryClient = useQueryClient()
  const {
    user,
    token,
    refreshToken,
    setUser,
    setToken,
    setRefreshToken,
    logout: storeLogout,
  } = useAuthStore()
  const navigate = useNavigate()

  const { data: me, isLoading: isMeLoading } = useQuery({
    queryKey: ['me', token],
    queryFn: () => authService.getMe(),
    enabled: !!token,
    retry: false,
    staleTime: 1000 * 60 * 5,
  })

  const loginMutation = useMutation({
    mutationFn: authService.login,
    onSuccess: ({ access_token, refresh_token, user: nextUser }) => {
      setToken(access_token)
      setRefreshToken(refresh_token)
      setUser(nextUser)
      navigate('/projects')
    },
  })

  const logoutMutation = useMutation({
    mutationFn: authService.logout,
    onSuccess: () => {
      storeLogout()
      queryClient.clear()
      navigate('/login')
    },
  })

  const withdrawMutation = useMutation({
    mutationFn: authService.withdraw,
    onSuccess: () => {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(WITHDRAW_NOTICE_KEY, 'true')
      }
      storeLogout()
      queryClient.clear()
      navigate('/login', {
        replace: true,
        state: { withdrawn: true },
      })
    },
  })

  return {
    user: me ?? user,
    token,
    refreshToken,
    isAuthenticated: !!token,
    isMeLoading,
    login: (data: LoginDto) => loginMutation.mutate(data),
    loginError: loginMutation.error,
    isLoggingIn: loginMutation.isPending,
    logout: () => logoutMutation.mutate(),
    logoutError: logoutMutation.error,
    isLoggingOut: logoutMutation.isPending,
    withdraw: (data: WithdrawDto) => withdrawMutation.mutate(data),
    withdrawError: withdrawMutation.error,
    isWithdrawing: withdrawMutation.isPending,
  }
}

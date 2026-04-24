import { useQuery, useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { authService } from '@/features/auth/services/auth.service'
import { useAuthStore } from '@/shared/stores/authStore'

export const useAuth = () => {
  const { user, token, setUser, setToken, logout: storeLogout } = useAuthStore()
  const navigate = useNavigate()

  const { data: me, isLoading: isMeLoading } = useQuery({
    queryKey: ['me', token],
    queryFn: () => authService.getMe(token!),
    enabled: !!token,
    retry: false,
    staleTime: 1000 * 60 * 5,
  })

  const loginMutation = useMutation({
    mutationFn: authService.login,
    onSuccess: ({ access_token, user }) => {
      setToken(access_token)
      setUser(user)
      navigate('/projects')
    },
  })

  const logoutMutation = useMutation({
    mutationFn: authService.logout,
    onSuccess: () => {
      storeLogout()
      navigate('/login')
    },
  })

  return {
    user: me ?? user,
    token,
    isAuthenticated: !!token,
    isMeLoading,
    login: loginMutation.mutate,
    loginError: loginMutation.error,
    isLoggingIn: loginMutation.isPending,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  }
}

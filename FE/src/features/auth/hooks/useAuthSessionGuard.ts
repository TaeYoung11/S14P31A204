import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authService } from '@/features/auth/services/auth.service'
import { useAuthStore } from '@/shared/stores/authStore'
import { useAuthStoreHydrated } from '@/shared/stores/useAuthStoreHydrated'

type AppError = Error & { status?: number }

export function useAuthSessionGuard() {
  const hasHydrated = useAuthStoreHydrated()
  const token = useAuthStore((state) => state.token)
  const setUser = useAuthStore((state) => state.setUser)
  const logout = useAuthStore((state) => state.logout)

  const meQuery = useQuery({
    queryKey: ['me', token],
    queryFn: () => authService.getMe(),
    enabled: hasHydrated && !!token,
    retry: false,
    staleTime: 1000 * 60 * 5,
  })

  useEffect(() => {
    if (meQuery.data) {
      setUser(meQuery.data)
    }
  }, [meQuery.data, setUser])

  useEffect(() => {
    const status = (meQuery.error as AppError | null)?.status
    const isUnauthorized = meQuery.isError && status === 401

    if (isUnauthorized) {
      logout()
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('bim-storage')
      }
    }
  }, [meQuery.error, meQuery.isError, logout])

  if (!hasHydrated) {
    return {
      status: 'hydrating' as const,
      isLoading: true,
    }
  }

  if (!token) {
    return {
      status: 'unauthenticated' as const,
      isLoading: false,
    }
  }

  if (meQuery.isPending) {
    return {
      status: 'checking' as const,
      isLoading: true,
    }
  }

  if (meQuery.isError) {
    const status = (meQuery.error as AppError | null)?.status

    if (status === 401) {
      return {
        status: 'unauthenticated' as const,
        isLoading: false,
      }
    }

    return {
      status: 'authenticated' as const,
      isLoading: false,
    }
  }

  return {
    status: 'authenticated' as const,
    isLoading: false,
  }
}

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
    // 토큰이 유효하면 최신 사용자 정보를 스토어에 동기화한다.
    // (페이지 새로고침 후에도 헤더/권한 UI가 즉시 일관되게 보이도록 유지)
    if (meQuery.data) {
      setUser(meQuery.data)
    }
  }, [meQuery.data, setUser])

  useEffect(() => {
    const status = (meQuery.error as AppError | null)?.status
    const isUnauthorized = meQuery.isError && status === 401

    if (isUnauthorized) {
      // 인증 만료 시 로컬 인증 상태를 즉시 비우고, 오래된 persist 데이터도 제거한다.
      logout()
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('bim-storage')
      }
    }
  }, [meQuery.error, meQuery.isError, logout])

  if (!hasHydrated) {
    // persist hydration이 끝나기 전에는 인증 여부를 확정할 수 없으므로 로딩 상태를 유지한다.
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

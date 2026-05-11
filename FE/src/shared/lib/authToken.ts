// 인증 토큰 저장과 재발급 흐름을 공통으로 관리한다.
import axios from 'axios'
import { useAuthStore } from '@/shared/stores/authStore'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1'

interface StoredAuthState {
  state?: {
    token?: string | null
    refreshToken?: string | null
  }
}

interface RefreshTokenResponse {
  accessToken: string
  refreshToken: string
  accessTokenExpiresIn: number
  refreshTokenExpiresIn: number
}

interface ApiResponse<T> {
  status: number
  message: string
  data: T
}

export const readStoredAuthState = (): StoredAuthState | null => {
  const raw = localStorage.getItem('bim-storage')
  if (!raw) return null

  try {
    return JSON.parse(raw) as StoredAuthState
  } catch {
    return null
  }
}

export const clearAuthState = () => {
  useAuthStore.getState().logout()
  localStorage.removeItem('bim-storage')
}

export const redirectToLoginIfNeeded = () => {
  if (typeof window === 'undefined') return
  if (window.location.pathname === '/login') return
  window.location.assign('/login')
}

const writeTokens = (accessToken: string, refreshToken: string) => {
  const store = useAuthStore.getState()
  store.setToken(accessToken)
  store.setRefreshToken(refreshToken)
}

let refreshPromise: Promise<string> | null = null

export const refreshAccessToken = async (): Promise<string> => {
  const refreshToken = readStoredAuthState()?.state?.refreshToken
  if (!refreshToken) {
    throw new Error('Missing refresh token')
  }

  if (!refreshPromise) {
    refreshPromise = axios
      .post<ApiResponse<RefreshTokenResponse>>(
        `${BASE_URL}/auth/refresh`,
        { refreshToken },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        },
      )
      .then((response) => {
        const nextAccessToken = response.data.data.accessToken
        const nextRefreshToken = response.data.data.refreshToken
        writeTokens(nextAccessToken, nextRefreshToken)
        return nextAccessToken
      })
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}

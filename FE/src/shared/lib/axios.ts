import axios, { type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/shared/stores/authStore'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api/v1'

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

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

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean
}

const readStoredAuthState = (): StoredAuthState | null => {
  const raw = localStorage.getItem('bim-storage')
  if (!raw) return null

  try {
    return JSON.parse(raw) as StoredAuthState
  } catch {
    return null
  }
}

const clearAuthState = () => {
  useAuthStore.getState().logout()
  localStorage.removeItem('bim-storage')
}

const writeTokens = (accessToken: string, refreshToken: string) => {
  const store = useAuthStore.getState()
  store.setToken(accessToken)
  store.setRefreshToken(refreshToken)
}

let refreshPromise: Promise<string> | null = null

const refreshAccessToken = async (): Promise<string> => {
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

api.interceptors.request.use(
  (config) => {
    const parsed = readStoredAuthState()
    const token = parsed?.state?.token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as RetriableRequestConfig | undefined

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      const url = originalRequest.url ?? ''
      const isRefreshRequest = url.includes('/auth/refresh')

      if (!isRefreshRequest) {
        originalRequest._retry = true

        try {
          const nextAccessToken = await refreshAccessToken()
          originalRequest.headers.Authorization = `Bearer ${nextAccessToken}`
          return api(originalRequest)
        } catch {
          clearAuthState()
          window.location.href = '/login'
          return Promise.reject(error)
        }
      }
    }

    if (error.response?.status === 401) {
      clearAuthState()
      window.location.href = '/login'
    }

    return Promise.reject(error)
  },
)

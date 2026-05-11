// API 요청 인스턴스와 인증 토큰 재발급 인터셉터를 설정합니다.
import axios, { type InternalAxiosRequestConfig } from 'axios'
import {
  clearAuthState,
  readStoredAuthState,
  redirectToLoginIfNeeded,
  refreshAccessToken,
} from '@/shared/lib/authToken'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1'

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean
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
          redirectToLoginIfNeeded()
          return Promise.reject(error)
        }
      }
    }

    if (error.response?.status === 401) {
      clearAuthState()
      redirectToLoginIfNeeded()
    }

    return Promise.reject(error)
  },
)

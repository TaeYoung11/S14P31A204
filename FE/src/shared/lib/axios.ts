import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1'

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor — JWT 자동 첨부
api.interceptors.request.use(
  (config) => {
    // storage에서 직접 읽음 (circular dependency 방지)
    const raw = localStorage.getItem('bim-storage')
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        const token = parsed?.state?.token
        if (token) {
          config.headers.Authorization = `Bearer ${token}`
        }
      } catch {
        // ignore
      }
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor — 401 시 로그인으로 redirect
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('bim-storage')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

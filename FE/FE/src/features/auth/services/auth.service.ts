import { mockGetMe, mockLogin, mockRegister } from '@/features/auth/mocks/auth.mock'
import type { User } from '@/shared/types'

export interface LoginDto {
  email: string
  password: string
}

export interface RegisterDto {
  email: string
  password: string
  name: string
  user_type: 'DESIGNER' | 'CLIENT'
}

export const authService = {
  login: async (data: LoginDto) => {
    return mockLogin(data.email, data.password)
    // return api.post<{ access_token: string; user: User }>('/auth/login', data).then(r => r.data)
  },

  register: async (data: RegisterDto): Promise<User> => {
    return mockRegister(data)
    // return api.post<User>('/auth/register', data).then(r => r.data)
  },

  logout: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100))
    // return api.post('/auth/logout')
  },

  getMe: async (token: string): Promise<User> => {
    return mockGetMe(token)
    // return api.get<User>('/auth/me').then(r => r.data)
  },
}

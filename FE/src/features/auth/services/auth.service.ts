import axios from 'axios'
import { api } from '@/shared/lib/axios'
import type { User } from '@/shared/types'

type AppError = Error & { status?: number }

interface ApiResponse<T> {
  status: number
  message: string
  data: T
}

interface UserInfoResponse {
  userId: string
  email: string
  name: string
  userType: 'DESIGNER' | 'CUSTOMER'
}

interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: UserInfoResponse
}

interface SignupResponse {
  userId: string
  email: string
  name: string
  userType: 'DESIGNER' | 'CUSTOMER'
  accessToken: string
  refreshToken: string
}

interface MemberInfoResponse {
  userId: string
  email: string
  name: string
  userType: 'DESIGNER' | 'CUSTOMER'
}

interface SendEmailCodeResponse {
  email: string
  expiresIn: number
}

interface VerifyEmailCodeResponse {
  verifiedToken: string
  expiresIn: number
}

export interface LoginDto {
  email: string
  password: string
}

export interface RegisterDto {
  email: string
  password: string
  name: string
  userType: 'DESIGNER' | 'CUSTOMER'
  verifiedToken: string
}

export interface LoginResult {
  access_token: string
  refresh_token: string
  user: User
}

export interface SendEmailCodeDto {
  email: string
}

export interface VerifyEmailCodeDto {
  email: string
  code: string
}

export interface WithdrawDto {
  password: string
}

const mapUser = (user: UserInfoResponse | MemberInfoResponse): User => ({
  id: user.userId,
  email: user.email,
  name: user.name,
  user_type: user.userType,
  created_at: new Date().toISOString(),
})

const mapSignupUser = (user: SignupResponse): User => ({
  id: user.userId,
  email: user.email,
  name: user.name,
  user_type: user.userType,
  created_at: new Date().toISOString(),
})

const toErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message
    if (typeof message === 'string' && message.trim().length > 0) {
      return message
    }
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return fallback
}

const toAppError = (error: unknown, fallback: string): AppError => {
  const nextError = new Error(toErrorMessage(error, fallback)) as AppError

  if (axios.isAxiosError(error)) {
    nextError.status = error.response?.status
  }

  return nextError
}

export const authService = {
  login: async (data: LoginDto): Promise<LoginResult> => {
    try {
      const response = await api.post<ApiResponse<LoginResponse>>('/auth/login', {
        email: data.email.trim(),
        password: data.password,
      })

      return {
        access_token: response.data.data.accessToken,
        refresh_token: response.data.data.refreshToken,
        user: mapUser(response.data.data.user),
      }
    } catch (error) {
      throw toAppError(error, '로그인에 실패했습니다. 입력한 정보를 다시 확인해 주세요.')
    }
  },

  register: async (data: RegisterDto): Promise<LoginResult> => {
    try {
      const response = await api.post<ApiResponse<SignupResponse>>('/auth/signup', {
        email: data.email.trim(),
        password: data.password,
        name: data.name.trim(),
        userType: data.userType,
        verifiedToken: data.verifiedToken,
      })

      return {
        access_token: response.data.data.accessToken,
        refresh_token: response.data.data.refreshToken,
        user: mapSignupUser(response.data.data),
      }
    } catch (error) {
      throw toAppError(error, '회원가입에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    }
  },

  logout: async (): Promise<void> => {
    try {
      await api.post('/auth/logout')
    } catch (error) {
      throw toAppError(error, '로그아웃에 실패했습니다.')
    }
  },

  getMe: async (): Promise<User> => {
    try {
      const response = await api.get<ApiResponse<MemberInfoResponse>>('/auth/me')
      return mapUser(response.data.data)
    } catch (error) {
      throw toAppError(error, '사용자 정보를 불러오지 못했습니다.')
    }
  },

  sendEmailCode: async ({ email }: SendEmailCodeDto): Promise<SendEmailCodeResponse> => {
    try {
      const response = await api.post<ApiResponse<SendEmailCodeResponse>>('/auth/email/send-code', {
        email: email.trim(),
      })
      return response.data.data
    } catch (error) {
      throw toAppError(error, '이메일 인증 코드를 전송하지 못했습니다.')
    }
  },

  verifyEmailCode: async ({ email, code }: VerifyEmailCodeDto): Promise<VerifyEmailCodeResponse> => {
    try {
      const response = await api.post<ApiResponse<VerifyEmailCodeResponse>>('/auth/email/verify-code', {
        email: email.trim(),
        code: code.trim(),
      })
      return response.data.data
    } catch (error) {
      throw toAppError(error, '이메일 인증에 실패했습니다.')
    }
  },

  withdraw: async ({ password }: WithdrawDto): Promise<void> => {
    try {
      await api.delete('/auth/me', {
        data: { password },
      })
    } catch (error) {
      throw toAppError(error, '회원탈퇴에 실패했습니다.')
    }
  },
}

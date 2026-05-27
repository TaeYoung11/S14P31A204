import type { User } from '@/shared/types'

const MOCK_USERS_STORAGE_KEY = 'batang-mock-users'
const MOCK_PASSWORD = 'password123'

const DEFAULT_MOCK_USERS: User[] = [
  {
    id: 'mock-user-1',
    email: 'designer@batang.io',
    name: '설계자 계정',
    user_type: 'DESIGNER',
    created_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'mock-user-2',
    email: 'client@batang.io',
    name: '클라이언트 계정',
    user_type: 'CLIENT',
    created_at: '2025-01-05T00:00:00Z',
  },
]

const cloneDefaultUsers = () => DEFAULT_MOCK_USERS.map((user) => ({ ...user }))

const readStoredUsers = (): User[] => {
  if (typeof window === 'undefined') {
    return cloneDefaultUsers()
  }

  const stored = window.localStorage.getItem(MOCK_USERS_STORAGE_KEY)
  if (!stored) {
    const initialUsers = cloneDefaultUsers()
    window.localStorage.setItem(MOCK_USERS_STORAGE_KEY, JSON.stringify(initialUsers))
    return initialUsers
  }

  try {
    const parsed = JSON.parse(stored) as User[]
    if (!Array.isArray(parsed)) {
      throw new Error('Invalid mock users payload')
    }
    return parsed
  } catch {
    const fallbackUsers = cloneDefaultUsers()
    window.localStorage.setItem(MOCK_USERS_STORAGE_KEY, JSON.stringify(fallbackUsers))
    return fallbackUsers
  }
}

const writeStoredUsers = (users: User[]) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(MOCK_USERS_STORAGE_KEY, JSON.stringify(users))
}

const getMockUsers = () => readStoredUsers()

export const mockLogin = async (email: string, password: string) => {
  await new Promise((resolve) => setTimeout(resolve, 500))

  if (password !== MOCK_PASSWORD) {
    throw new Error('비밀번호가 올바르지 않습니다.')
  }

  const user = getMockUsers().find((candidate) => candidate.email === email)
  if (!user) {
    throw new Error('존재하지 않는 이메일입니다.')
  }

  return {
    access_token: `mock-token-${user.id}`,
    user,
  }
}

export const mockRegister = async (data: {
  email: string
  password: string
  name: string
  user_type: 'DESIGNER' | 'CLIENT'
}) => {
  await new Promise((resolve) => setTimeout(resolve, 500))

  const users = getMockUsers()
  const normalizedEmail = data.email.trim().toLowerCase()

  if (users.some((user) => user.email.toLowerCase() === normalizedEmail)) {
    throw new Error('이미 사용 중인 이메일입니다.')
  }

  const newUser: User = {
    id: `mock-user-${Date.now()}`,
    email: normalizedEmail,
    name: data.name,
    user_type: data.user_type,
    created_at: new Date().toISOString(),
  }

  writeStoredUsers([...users, newUser])
  return newUser
}

export const mockGetMe = async (token: string): Promise<User> => {
  await new Promise((resolve) => setTimeout(resolve, 200))
  const userId = token.replace('mock-token-', '')
  const user = getMockUsers().find((candidate) => candidate.id === userId)
  if (!user) throw new Error('401')
  return user
}

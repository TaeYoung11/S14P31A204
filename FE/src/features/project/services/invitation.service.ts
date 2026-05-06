import { isAxiosError } from 'axios'
import { api } from '@/shared/lib/axios'
import type { ApiResponse } from '@/shared/types'
import { MOCK_INVITE_USERS, MOCK_INVITE_NOTIFICATIONS } from '@/features/project/mocks/invitation.mock'

export type InvitationRole = 'CUSTOMER' | 'REPRESENTATIVE_CUSTOMER'

export interface UserSearchResult {
  userId: string
  name: string
  email: string
}

export interface SendInviteRequest {
  inviteeEmail: string
  role: InvitationRole
}

export interface SendInviteResponse {
  projectId: string
  inviteeEmail: string
  role: InvitationRole
  joinedAt: string
}

export interface InvitationNotification {
  notificationId: string
  isRead: boolean
  title: string
  body: string
  projectId: string
  projectName: string
  role: InvitationRole
  createdAt: string
}

// Temporary mock fallback for local API integration work.
// In dev, user search and mock-user invites may fall back on HTTP errors for UI testing.
// Other invitation APIs only fall back on network-level failures; real HTTP responses surface to the UI.
const shouldUseMockFallback = (error: unknown) =>
  isAxiosError(error) && !error.response

const shouldUseMockSearchFallback = (error: unknown) =>
  isAxiosError(error)

const isMockInviteUser = (email: string) =>
  MOCK_INVITE_USERS.some((user) => user.email === email)

const shouldUseMockInviteFallback = (error: unknown, email: string) =>
  isAxiosError(error) && isMockInviteUser(email)

const searchMockUsers = (keyword: string) => {
  const q = keyword.toLowerCase()
  return MOCK_INVITE_USERS.filter(
    (u) => u.email.includes(q) || u.name.toLowerCase().includes(q),
  )
}

export const invitationService = {
  searchUsers: async (keyword: string): Promise<UserSearchResult[]> => {
    try {
      const res = await api.get<ApiResponse<UserSearchResult[]>>('/users/search', {
        params: { email: keyword },
      })
      const users = res.data.data
      return users.length === 0 ? searchMockUsers(keyword) : users
    } catch (error: unknown) {
      if (!shouldUseMockSearchFallback(error)) throw error

      return searchMockUsers(keyword)
    }
  },

  sendInvite: async (projectId: string, req: SendInviteRequest): Promise<SendInviteResponse> => {
    try {
      const res = await api.post<ApiResponse<SendInviteResponse>>(
        `/projects/${projectId}/invitations`,
        req,
      )
      return res.data.data
    } catch (error: unknown) {
      if (!shouldUseMockInviteFallback(error, req.inviteeEmail)) throw error

      await new Promise((resolve) => setTimeout(resolve, 400))
      return {
        projectId,
        inviteeEmail: req.inviteeEmail,
        role: req.role,
        joinedAt: new Date().toISOString(),
      }
    }
  },

  getNotifications: async (isRead?: boolean): Promise<InvitationNotification[]> => {
    try {
      const res = await api.get<ApiResponse<InvitationNotification[]>>(
        '/notifications/invitations',
        { params: isRead !== undefined ? { isRead } : {} },
      )
      return res.data.data
    } catch (error: unknown) {
      if (!shouldUseMockFallback(error)) throw error

      return isRead !== undefined
        ? MOCK_INVITE_NOTIFICATIONS.filter((n) => n.isRead === isRead)
        : [...MOCK_INVITE_NOTIFICATIONS]
    }
  },

  markAsRead: async (notificationId: string): Promise<void> => {
    try {
      await api.patch(`/notifications/invitations/${notificationId}/read`)
    } catch (error: unknown) {
      const status = isAxiosError(error) ? error.response?.status : undefined
      if (status === 409) return
      if (shouldUseMockFallback(error)) return
      throw error
    }
  },
}

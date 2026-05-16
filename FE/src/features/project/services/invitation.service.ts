import { isAxiosError } from 'axios'
import { api } from '@/shared/lib/axios'
import type { ApiResponse } from '@/shared/types'

export type InvitationRole = 'CUSTOMER' | 'REPRESENTATIVE_CUSTOMER'

export interface UserSearchResult {
  userId: string
  name: string
  email: string
}

export interface SendInviteRequest {
  inviteeEmail: string
}

export interface SendInviteResponse {
  projectId: string
  invitedUserId: string
  invitedUserName: string
  invitedUserEmail: string
  role: InvitationRole
}

export interface InvitationNotification {
  notificationId: string
  isRead: boolean
  projectId: string
  projectName: string
  inviterUserId: string
  inviterName: string
  readAt: string | null
  createdAt: string
}

interface InvitationNotificationListResponse {
  notifications: InvitationNotification[]
}

export const invitationService = {
  searchUsers: async (keyword: string): Promise<UserSearchResult[]> => {
    const res = await api.get<ApiResponse<UserSearchResult[]>>('/users/search', {
      params: { email: keyword },
    })
    return res.data.data
  },

  sendInvite: async (projectId: string, req: SendInviteRequest): Promise<SendInviteResponse> => {
    const res = await api.post<ApiResponse<SendInviteResponse>>(
      `/projects/${projectId}/invitations`,
      req,
    )
    return res.data.data
  },

  removeProjectMember: async (projectId: string, userId: string): Promise<void> => {
    await api.delete(`/projects/${projectId}/members/${userId}`)
  },

  getNotifications: async (isRead?: boolean): Promise<InvitationNotification[]> => {
    const res = await api.get<ApiResponse<InvitationNotificationListResponse>>(
      '/notifications/invitations',
      { params: isRead !== undefined ? { isRead } : {} },
    )
    return res.data.data.notifications
  },

  markAsRead: async (notificationId: string): Promise<void> => {
    try {
      await api.patch(`/notifications/invitations/${notificationId}/read`)
    } catch (error: unknown) {
      const status = isAxiosError(error) ? error.response?.status : undefined
      if (status === 409) return
      throw error
    }
  },
}

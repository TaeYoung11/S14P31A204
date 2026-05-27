import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  invitationService,
  type InvitationNotification,
  type SendInviteRequest,
} from '@/features/project/services/invitation.service'
import { invitationQueryKeys } from '@/features/project/constants/invitationQueryKeys'
import { notificationStreamService } from '@/features/project/services/notificationStream.service'
import { useProjectNotificationToastStore } from '@/features/project/stores/projectNotificationToastStore'

interface InvitationNotificationsQueryOptions {
  enabled?: boolean
}

const PROJECT_INVITATION_CREATED_EVENT = 'project-invitation-created'
const INVITATION_TOAST_DURATION_MS = 5000

const parseInvitationNotification = (data: string): InvitationNotification | null => {
  try {
    const parsed = JSON.parse(data) as InvitationNotification
    if (!parsed.notificationId || !parsed.projectId) return null
    return {
      notificationId: parsed.notificationId,
      isRead: Boolean(parsed.isRead),
      projectId: parsed.projectId,
      projectName: typeof parsed.projectName === 'string' ? parsed.projectName : '',
      inviterUserId: typeof parsed.inviterUserId === 'string' ? parsed.inviterUserId : '',
      inviterName: typeof parsed.inviterName === 'string' ? parsed.inviterName : '',
      readAt: typeof parsed.readAt === 'string' ? parsed.readAt : null,
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

const mergeInvitationNotification = (
  currentNotifications: InvitationNotification[] | undefined,
  notification: InvitationNotification,
): InvitationNotification[] => [
    notification,
    ...(currentNotifications ?? []).filter((item) => item.notificationId !== notification.notificationId),
  ]

export const useUserSearch = (keyword: string) =>
  useQuery({
    queryKey: invitationQueryKeys.userSearch(keyword),
    queryFn: () => invitationService.searchUsers(keyword),
    enabled: keyword.trim().length >= 1,
    staleTime: 30_000,
  })

export const useSendInvite = () =>
  useMutation({
    mutationFn: ({ projectId, req }: { projectId: string; req: SendInviteRequest }) =>
      invitationService.sendInvite(projectId, req),
  })

export const useRemoveProjectMember = () =>
  useMutation({
    mutationFn: ({ projectId, userId }: { projectId: string; userId: string }) =>
      invitationService.removeProjectMember(projectId, userId),
  })

export const useInvitationNotifications = (
  isRead?: boolean,
  options: InvitationNotificationsQueryOptions = {},
) =>
  useQuery({
    queryKey: invitationQueryKeys.notifications(isRead),
    queryFn: () => invitationService.getNotifications(isRead),
    enabled: options.enabled,
    staleTime: 0,
  })

export const useMarkNotificationRead = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: invitationService.markAsRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: invitationQueryKeys.all })
    },
  })
}

export const useMarkNotificationsRead = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (notificationIds: string[]) => {
      const uniqueNotificationIds = Array.from(new Set(notificationIds))
      await Promise.all(uniqueNotificationIds.map((notificationId) => invitationService.markAsRead(notificationId)))
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: invitationQueryKeys.all })
    },
  })
}

export const useProjectInvitationRealtime = (enabled = true) => {
  const queryClient = useQueryClient()
  const pushToast = useProjectNotificationToastStore((state) => state.pushToast)

  useEffect(() => {
    if (!enabled) return undefined

    const unsubscribe = notificationStreamService.subscribe((message) => {
      if (message.event !== PROJECT_INVITATION_CREATED_EVENT) return

      const notification = parseInvitationNotification(message.data)
      if (!notification) return

      queryClient.setQueryData<InvitationNotification[]>(
        invitationQueryKeys.notifications(),
        (current) => mergeInvitationNotification(current, notification),
      )
      queryClient.setQueryData<InvitationNotification[]>(
        invitationQueryKeys.notifications(false),
        (current) => mergeInvitationNotification(current, notification),
      )

      pushToast({
        id: `invitation:${notification.notificationId}`,
        type: 'invitation',
        groupKey: `invitation:${notification.notificationId}`,
        projectId: notification.projectId,
        title: notification.projectName || '\uD504\uB85C\uC81D\uD2B8 \uCD08\uB300',
        message: notification.inviterName
          ? `${notification.inviterName}\uB2D8\uC774 \uD504\uB85C\uC81D\uD2B8\uC5D0 \uCD08\uB300\uD588\uC2B5\uB2C8\uB2E4.`
          : '\uD504\uB85C\uC81D\uD2B8 \uCD08\uB300 \uC54C\uB9BC\uC774 \uB3C4\uCC29\uD588\uC2B5\uB2C8\uB2E4.',
        durationMs: INVITATION_TOAST_DURATION_MS,
      })
    })

    return () => unsubscribe()
  }, [enabled, pushToast, queryClient])
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  invitationService,
  type SendInviteRequest,
} from '@/features/project/services/invitation.service'
import { invitationQueryKeys } from '@/features/project/constants/invitationQueryKeys'

interface InvitationNotificationsQueryOptions {
  enabled?: boolean
}

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
      void queryClient.invalidateQueries({ queryKey: invitationQueryKeys.notifications() })
    },
  })
}

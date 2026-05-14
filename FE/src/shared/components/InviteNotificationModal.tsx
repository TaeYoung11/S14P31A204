import { useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, X, CheckCircle } from 'lucide-react'
import {
  useInvitationNotifications,
  useMarkNotificationRead,
  useMarkNotificationsRead,
} from '@/features/project/hooks/useInvitation'
import Spinner from '@/shared/components/Spinner'
import type { InvitationNotification } from '@/features/project/services/invitation.service'

interface InviteNotificationModalProps {
  isOpen: boolean
  onClose: () => void
}

const INVITATION_MODAL_TITLE = '\uCD08\uB300 \uC54C\uB9BC'
const INVITATION_EMPTY_MESSAGE = '\uCD08\uB300 \uC54C\uB9BC\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.'
const INVITATION_ITEM_TITLE = '\uD504\uB85C\uC81D\uD2B8 \uCD08\uB300'
const INVITATION_CLOSE_TITLE = '\uCD08\uB300 \uC54C\uB9BC \uB2EB\uAE30'
const EMPTY_INVITATION_NOTIFICATIONS: InvitationNotification[] = []

const getNotificationBody = (notification: InvitationNotification) =>
  notification.inviterName
    ? `${notification.inviterName}\uB2D8\uC774 '${notification.projectName}' \uD504\uB85C\uC81D\uD2B8\uC5D0 \uCD08\uB300\uD588\uC2B5\uB2C8\uB2E4.`
    : `'${notification.projectName}' \uD504\uB85C\uC81D\uD2B8\uC5D0 \uCD08\uB300\uB418\uC5C8\uC2B5\uB2C8\uB2E4.`

export function InviteNotificationModal({ isOpen, onClose }: InviteNotificationModalProps) {
  const navigate = useNavigate()
  const { data: notifications = EMPTY_INVITATION_NOTIFICATIONS, isLoading } = useInvitationNotifications(undefined, {
    enabled: isOpen,
  })
  const markAsRead = useMarkNotificationRead()
  const {
    mutateAsync: markNotificationsReadAsync,
    isPending: isMarkingNotificationsRead,
  } = useMarkNotificationsRead()
  const requestedReadNotificationIdsRef = useRef<Set<string>>(new Set())

  const unreadNotificationIds = useMemo(
    () =>
      notifications
        .filter((notification) => !notification.isRead)
        .map((notification) => notification.notificationId),
    [notifications],
  )

  useEffect(() => {
    if (!isOpen || isLoading || unreadNotificationIds.length === 0 || isMarkingNotificationsRead) return

    const unreadNotificationIdsToMark = unreadNotificationIds.filter(
      (notificationId) => !requestedReadNotificationIdsRef.current.has(notificationId),
    )
    if (unreadNotificationIdsToMark.length === 0) return

    unreadNotificationIdsToMark.forEach((notificationId) => {
      requestedReadNotificationIdsRef.current.add(notificationId)
    })

    void markNotificationsReadAsync(unreadNotificationIdsToMark).catch((error) => {
      unreadNotificationIdsToMark.forEach((notificationId) => {
        requestedReadNotificationIdsRef.current.delete(notificationId)
      })
      console.error('[invite-notification] Failed to mark notifications as read:', error)
    })
  }, [isOpen, isLoading, isMarkingNotificationsRead, markNotificationsReadAsync, unreadNotificationIds])

  if (!isOpen) return null

  const handleNotificationClick = async (notificationId: string, projectId: string) => {
    try {
      await markAsRead.mutateAsync(notificationId)
    } catch (error) {
      console.error('[invite-notification] Failed to mark notification as read:', error)
    } finally {
      onClose()
      navigate(`/projects/${projectId}/editor`)
    }
  }

  const unreadCount = notifications.filter((notification) => !notification.isRead).length

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-end pt-16 pr-6">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-[380px] overflow-hidden rounded-2xl bg-white shadow-[0_8px_40px_rgba(0,0,0,0.16)] animate-in fade-in slide-in-from-top-2 duration-200">
        <div className="flex items-center justify-between border-b border-[#F0F2F9] px-5 py-4">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-[#3B45B3]" />
            <h3 className="text-[15px] font-black text-[#1C1C1E]">{INVITATION_MODAL_TITLE}</h3>
            {unreadCount > 0 && (
              <span className="rounded-full bg-[#3B45B3] px-2 py-0.5 text-[10px] font-black text-white">
                {unreadCount}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#ADB5BD] transition-colors hover:text-[#1C1C1E]"
            title={INVITATION_CLOSE_TITLE}
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[360px] overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner size="md" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-[#ADB5BD]">
              <Bell size={32} className="mb-2 opacity-30" />
              <p className="text-sm font-medium">{INVITATION_EMPTY_MESSAGE}</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <button
                key={notification.notificationId}
                onClick={() => void handleNotificationClick(notification.notificationId, notification.projectId)}
                className={`flex w-full items-start gap-3 border-b border-[#F8F9FD] px-5 py-4 text-left transition-colors hover:bg-[#F8F9FD] ${
                  !notification.isRead ? 'bg-[#F0F2FF]/30' : ''
                }`}
              >
                <div
                  className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${
                    !notification.isRead ? 'bg-[#3B45B3]' : 'bg-transparent'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-[13px] font-black text-[#1C1C1E]">{INVITATION_ITEM_TITLE}</span>
                    {notification.isRead && <CheckCircle size={12} className="text-[#ADB5BD]" />}
                  </div>
                  <p className="line-clamp-2 text-[12px] leading-relaxed text-[#8E95A3]">
                    {getNotificationBody(notification)}
                  </p>
                  <p className="mt-1 text-[11px] text-[#ADB5BD]">
                    {new Date(notification.createdAt).toLocaleDateString('ko-KR', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

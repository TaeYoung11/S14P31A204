import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, X, CheckCircle } from 'lucide-react'
import { useInvitationNotifications, useMarkNotificationRead } from '@/features/project/hooks/useInvitation'
import Spinner from '@/shared/components/Spinner'

interface InviteNotificationModalProps {
  isOpen: boolean
  onClose: () => void
}

export function InviteNotificationModal({ isOpen, onClose }: InviteNotificationModalProps) {
  const navigate = useNavigate()
  const { data: notifications = [], isLoading, refetch } = useInvitationNotifications(undefined, {
    enabled: isOpen,
  })
  const markAsRead = useMarkNotificationRead()

  useEffect(() => {
    if (isOpen) void refetch()
  }, [isOpen, refetch])

  if (!isOpen) return null

  const handleNotificationClick = async (notificationId: string, projectId: string) => {
    await markAsRead.mutateAsync(notificationId)
    onClose()
    navigate(`/projects/${projectId}/editor`)
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-end pt-16 pr-6">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-[380px] bg-white rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.16)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-[#F0F2F9] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-[#3B45B3]" />
            <h3 className="text-[15px] font-black text-[#1C1C1E]">초대 알림</h3>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 bg-[#3B45B3] text-white text-[10px] font-black rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 text-[#ADB5BD] hover:text-[#1C1C1E] transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* 목록 */}
        <div className="max-h-[360px] overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner size="md" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-[#ADB5BD]">
              <Bell size={32} className="mb-2 opacity-30" />
              <p className="text-sm font-medium">초대 알림이 없습니다.</p>
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.notificationId}
                onClick={() => void handleNotificationClick(n.notificationId, n.projectId)}
                className={`w-full text-left px-5 py-4 border-b border-[#F8F9FD] hover:bg-[#F8F9FD] transition-colors flex items-start gap-3 ${
                  !n.isRead ? 'bg-[#F0F2FF]/30' : ''
                }`}
              >
                <div className={`mt-1.5 flex-shrink-0 w-2 h-2 rounded-full ${!n.isRead ? 'bg-[#3B45B3]' : 'bg-transparent'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[13px] font-black text-[#1C1C1E]">{n.title}</span>
                    {n.isRead && <CheckCircle size={12} className="text-[#ADB5BD]" />}
                  </div>
                  <p className="text-[12px] text-[#8E95A3] leading-relaxed line-clamp-2">{n.body}</p>
                  <p className="text-[11px] text-[#ADB5BD] mt-1">
                    {new Date(n.createdAt).toLocaleDateString('ko-KR', {
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

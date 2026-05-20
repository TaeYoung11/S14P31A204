import { Bell, Save, Share2 } from 'lucide-react'
import type { CollaborationUserType } from '@/features/editor/types'

interface EditorHeaderActionsProps {
  isViewer: boolean
  userType?: CollaborationUserType
  onOpenInvite?: () => void
  onOpenNotification?: () => void
  onSave?: () => void
  siteAreaLabel?: string
}

/**
 * 에디터 헤더 우측 액션 영역.
 * - 대지 면적 표시
 * - 사용자 타입별 공유/알림 버튼
 * - 저장/IFC 내보내기 버튼
 */
export default function EditorHeaderActions({
  isViewer,
  userType,
  onOpenInvite,
  onOpenNotification,
  onSave,
  siteAreaLabel,
}: EditorHeaderActionsProps) {
  const canSave = userType !== 'CUSTOMER'
  const iconButtonClass = `rounded-xl p-2 transition-colors ${isViewer
    ? 'text-white/75 hover:bg-white/10 hover:text-white'
    : 'text-[#7A859A] hover:bg-[#F0F2F9] hover:text-[#2F3A90]'
  }`

  return (
    <div className="flex items-center gap-4">
      {siteAreaLabel && (
        <div className={`rounded-full px-3 py-1 text-[11px] font-bold ${
          isViewer ? 'bg-white/15 text-white' : 'bg-[#EEF0FF] text-[#2F3A90]'
        }`}>
          대지 {siteAreaLabel}
        </div>
      )}

      {(userType === 'DESIGNER' || !userType) && (
        <button
          type="button"
          onClick={onOpenInvite}
          className={iconButtonClass}
          title="초대"
          aria-label="초대"
        >
          <Share2 size={18} />
        </button>
      )}

      {userType === 'CUSTOMER' && (
        <button
          type="button"
          id="editor-notification-btn"
          onClick={onOpenNotification}
          className={iconButtonClass}
          title="알림"
          aria-label="알림"
        >
          <Bell size={18} />
        </button>
      )}

      {canSave && (
        <button
          type="button"
          onClick={onSave}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-md transition-all ${isViewer
            ? 'bg-white/20 shadow-black/20 hover:bg-white/25'
            : 'bg-[#3B45B3] shadow-[#3B45B3]/20 hover:bg-[#2D3691]'
          }`}
        >
          <Save size={14} />
          {isViewer ? 'IFC 내보내기' : '저장'}
        </button>
      )}
    </div>
  )
}

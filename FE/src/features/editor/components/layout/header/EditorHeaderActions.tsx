import { Bell, Save, Share2 } from 'lucide-react'
import type { CollaborationUserType, SaveStatus } from '@/features/editor/types'

interface EditorHeaderActionsProps {
  isViewer: boolean
  userType?: CollaborationUserType
  onOpenInvite?: () => void
  onOpenNotification?: () => void
  onSave?: () => void
  saveStatus: SaveStatus
  siteAreaLabel?: string
}

const SAVE_STATUS_LABELS: Record<SaveStatus, string> = {
  idle: '대기 중',
  dirty: '변경 사항 있음',
  syncing: '동기화 중',
  synced: '동기화됨',
  'offline-queued': '오프라인 대기 중',
  error: '저장 실패',
}

const SAVE_STATUS_STYLES: Record<SaveStatus, string> = {
  idle: 'text-[#8E95A3] bg-[#F5F6FA]',
  dirty: 'text-[#A35F00] bg-[#FFF4DB]',
  syncing: 'text-[#3B45B3] bg-[#EEF0FF]',
  synced: 'text-[#237A57] bg-[#E8F6EF]',
  'offline-queued': 'text-[#7A5C00] bg-[#FFF7D6]',
  error: 'text-[#B42318] bg-[#FEECEC]',
}

/**
 * 에디터 헤더 우측 액션 영역.
 * - 저장 상태/대지 면적 표시
 * - 사용자 타입별 공유/알림 버튼
 * - 저장/IFC 내보내기 버튼
 */
export default function EditorHeaderActions({
  isViewer,
  userType,
  onOpenInvite,
  onOpenNotification,
  onSave,
  saveStatus,
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
        <div className={`rounded-full px-3 py-1 text-[11px] font-bold ${isViewer ? 'bg-white/15 text-white' : 'bg-[#EEF0FF] text-[#2F3A90]'
          }`}>
          대지 {siteAreaLabel}
        </div>
      )}

      <div className={`rounded-full border border-transparent px-3 py-1 text-[11px] font-bold ${SAVE_STATUS_STYLES[saveStatus]}`}>
        {SAVE_STATUS_LABELS[saveStatus]}
      </div>

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
          저장
        </button>
      )}
    </div>
  )
}

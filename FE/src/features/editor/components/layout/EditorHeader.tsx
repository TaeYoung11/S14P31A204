import type { CollaborationUserType, EditorMode, SaveStatus } from '../../types'
import EditorHeaderActions from './header/EditorHeaderActions'
import EditorHeaderBrandAndMode from './header/EditorHeaderBrandAndMode'

interface EditorHeaderProps {
  onOpenInvite?: () => void
  onOpenNotification?: () => void
  userType?: CollaborationUserType
  mode: EditorMode
  onModeChange: (mode: EditorMode) => void
  onSave?: () => void
  saveStatus?: SaveStatus
  siteAreaLabel?: string
}

/**
 * 상단 헤더
 * - 워크스페이스 이동, 편집/뷰 모드 전환, 저장 상태/공유/저장 액션을 제공한다.
 */
export default function EditorHeader({
  onOpenInvite,
  onOpenNotification,
  userType,
  mode,
  onModeChange,
  onSave,
  saveStatus = 'idle',
  siteAreaLabel,
}: EditorHeaderProps) {
  const isViewer = mode === 'view'

  return (
    <header className={`relative z-50 flex h-14 shrink-0 items-center justify-between border-b px-6 ${
      isViewer
        ? 'border-white/10 bg-[#0C0D10]/90'
        : 'border-[#E2E6EF] bg-white/90 backdrop-blur-sm shadow-[0_8px_24px_rgba(28,35,90,0.08)]'
    }`}>
      <EditorHeaderBrandAndMode mode={mode} isViewer={isViewer} onModeChange={onModeChange} />
      <EditorHeaderActions
        mode={mode}
        isViewer={isViewer}
        userType={userType}
        onOpenInvite={onOpenInvite}
        onOpenNotification={onOpenNotification}
        onSave={onSave}
        saveStatus={saveStatus}
        siteAreaLabel={siteAreaLabel}
      />
    </header>
  )
}

import { MessagesSquare } from 'lucide-react'
import type { EditorMode } from '@/features/editor/types'
import SidebarToolButton from './SidebarToolButton'

interface ReadOnlySidebarFooterProps {
  mode: EditorMode
  onToggleCollaboration?: () => void
}

/**
 * 읽기 전용 에디터 하단 고정 액션.
 * - 2D/3D 모드에서만 협업 패널 접근 버튼을 노출한다.
 */
export default function ReadOnlySidebarFooter({
  mode,
  onToggleCollaboration,
}: ReadOnlySidebarFooterProps) {
  if (mode !== '2d' && mode !== '3d') return null

  return (
    <div className="flex w-full flex-col items-center gap-2 border-t border-[#EEF2FA] bg-white/80 px-1.5 py-4">
      <SidebarToolButton
        label="협업"
        isActive
        onClick={onToggleCollaboration}
        icon={<MessagesSquare size={24} />}
      />
    </div>
  )
}

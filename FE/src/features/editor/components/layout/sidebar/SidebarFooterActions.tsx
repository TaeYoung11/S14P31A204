import { Brain, MessagesSquare } from 'lucide-react'
import SidebarToolButton from './SidebarToolButton'

interface SidebarFooterActionsProps {
  isCollaborationMode?: boolean
  isAgentPanelMode?: boolean
  onToggleCollaboration?: () => void
  onToggleAgentPanel?: () => void
}

/**
 * 2D/3D 모드 하단 고정 액션
 * - 협업 패널과 AI 진입 버튼을 제공한다.
 */
export default function SidebarFooterActions({
  isCollaborationMode = false,
  isAgentPanelMode = false,
  onToggleCollaboration,
  onToggleAgentPanel,
}: SidebarFooterActionsProps) {
  return (
    <div className="flex w-full flex-col items-center gap-2 border-t border-[#EEF2FA] bg-white/80 px-1.5 py-4">
      <SidebarToolButton
        label="협업"
        isActive={isCollaborationMode}
        onClick={onToggleCollaboration}
        icon={<MessagesSquare size={24} />}
      />

      <SidebarToolButton
        label="AI"
        isActive={isAgentPanelMode}
        onClick={onToggleAgentPanel}
        icon={<Brain size={24} />}
      />
    </div>
  )
}

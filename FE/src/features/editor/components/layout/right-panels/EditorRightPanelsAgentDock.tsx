import { AssistantPanel } from '../../panels/AssistantPanel'
import type { EditorRightPanelsProps } from './EditorRightPanels.types'
import { buildAssistantSectionProps } from './buildRightPanelSectionProps'

interface AgentDockProps {
  props: EditorRightPanelsProps
}

/** Agent 채팅 패널을 협업 댓글처럼 우측 고정 영역에 표시합니다. */
export default function EditorRightPanelsAgentDock({ props }: AgentDockProps) {
  const assistantPanelProps = buildAssistantSectionProps(props)
  if (!assistantPanelProps) return null

  return (
    <div className="relative z-[120] flex h-full min-h-0 w-[320px] shrink-0 flex-col overflow-hidden rounded-2xl border border-[#E2E6EF] bg-white shadow-sm">
      <AssistantPanel
        {...assistantPanelProps}
        isDocked
        isOpen
        offset={{ x: 0, y: 0 }}
        width={320}
        height={0}
      />
    </div>
  )
}

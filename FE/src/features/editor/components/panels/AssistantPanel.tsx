// AI Agent 패널을 어두운 채팅형 UI로 표시합니다.
import type { MouseEvent as ReactMouseEvent } from 'react'
import type { PanelKey, PanelOffset, PanelResizeAxis } from '../../types'
import type { ClarificationAlternative, ClarificationArtifact, LlmChatLogItem, LlmEditPreview, LlmEditStatus } from '../../types/llmEdit.types'
import { PanelFrame } from '../shared/PanelFrame'
import { AssistantClarificationCard } from './assistant/AssistantClarificationCard'
import { AssistantNoticeCard } from './assistant/AssistantNoticeCard'
import { AssistantPreviewCard } from './assistant/AssistantPreviewCard'
import { AssistantPromptSection } from './assistant/AssistantPromptSection'
import { AssistantSuggestionsCard } from './assistant/AssistantSuggestionsCard'

interface AssistantPanelProps {
  isOpen: boolean
  isDocked?: boolean
  offset: PanelOffset
  width: number
  height: number
  zIndex?: number
  provider: 'mock' | 'api'
  prompt: string
  status: LlmEditStatus
  isLoading: boolean
  message: string
  suggestions: string[]
  preview: LlmEditPreview | null
  canRun: boolean
  activeJobId: string | null
  jobProgress: number | null
  clarificationArtifact: ClarificationArtifact | null
  chatLogs: LlmChatLogItem[]
  isChatLogsLoading: boolean
  onPromptChange: (value: string) => void
  onRun: () => void
  onApply: () => void
  onDiscard: () => void
  onSelectAlternative: (alternative: ClarificationAlternative) => void
  floorProjectImportMessage: string
  onDragStart: (key: PanelKey, e: ReactMouseEvent<HTMLElement>) => void
  onResizeStart: (key: PanelKey, axis: PanelResizeAxis, e: ReactMouseEvent<HTMLButtonElement>) => void
  onToggle: (key: PanelKey) => void
}

const formatChatType = (type: LlmChatLogItem['type']) => {
  if (type === 'assistant') return '바탕 Agent'
  if (type === 'system') return 'System'
  return 'You'
}

export function AssistantPanel({
  isOpen,
  isDocked = false,
  offset,
  width,
  height,
  zIndex,
  provider,
  prompt,
  status,
  isLoading,
  message,
  suggestions,
  preview,
  canRun,
  activeJobId,
  jobProgress,
  clarificationArtifact,
  chatLogs,
  isChatLogsLoading,
  onPromptChange,
  onRun,
  onApply,
  onDiscard,
  onSelectAlternative,
  floorProjectImportMessage,
  onDragStart,
  onResizeStart,
  onToggle,
}: AssistantPanelProps) {
  const content = (
    <div className="flex h-full min-h-0 flex-col bg-[#F8FAFC] text-[#1F2937]">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {isChatLogsLoading && (
          <p className="text-[12px] text-[#64748B]">채팅 로그를 불러오는 중입니다.</p>
        )}

        {!isChatLogsLoading && chatLogs.length === 0 && (
          <div className="flex h-full min-h-[180px] items-center">
            <p className="text-[12px] leading-5 text-[#64748B]">
              원하는 설계 변경을 아래에 입력하세요.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {chatLogs.map((log) => {
            const isUser = log.type === 'user'
            return (
              <div key={log.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[88%] rounded-2xl px-3 py-2 text-[12px] leading-5 ${
                    isUser
                      ? 'rounded-br-md bg-[#3B45B3] text-white'
                      : 'rounded-bl-md border border-[#E2E8F0] bg-white text-[#1F2937] shadow-sm'
                  }`}
                >
                  <div className={`mb-1 text-[10px] font-semibold ${isUser ? 'text-white/65' : 'text-[#64748B]'}`}>
                    {formatChatType(log.type)}
                    {log.jobStatus ? ` · ${log.jobStatus}` : ''}
                  </div>
                  <p className="whitespace-pre-wrap break-words">{log.content}</p>
                </div>
              </div>
            )
          })}
        </div>

        {(isLoading || status === 'running') && (
          <div className="mt-3 rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-[12px] text-[#475569] shadow-sm">
            <p>바탕 Agent가 작업을 처리하는 중입니다.</p>
            {jobProgress !== null && (
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#E2E8F0]">
                  <div
                    className="h-full rounded-full bg-[#3B45B3] transition-all duration-500"
                    style={{ width: `${Math.max(0, Math.min(100, jobProgress))}%` }}
                  />
                </div>
                <span className="text-[10px] tabular-nums text-[#94A3B8]">{Math.round(jobProgress)}%</span>
              </div>
            )}
          </div>
        )}

        {(status === 'ambiguous' || status === 'error' || status === 'applied' || (status === 'clarification_required' && !clarificationArtifact)) && message && (
          <div className="mt-3">
            <AssistantNoticeCard message={message} />
          </div>
        )}

        {floorProjectImportMessage && status === 'idle' && (
          <div className="mt-3">
            <AssistantNoticeCard message={floorProjectImportMessage} />
          </div>
        )}

        {status === 'ambiguous' && (
          <div className="mt-3">
            <AssistantSuggestionsCard suggestions={suggestions} onSelect={onPromptChange} />
          </div>
        )}

        {status === 'clarification_required' && clarificationArtifact && (
          <div className="mt-3">
            <AssistantClarificationCard
              question={clarificationArtifact.question}
              alternatives={clarificationArtifact.alternatives}
              onSelect={onSelectAlternative}
            />
          </div>
        )}

        {preview && (
          <div className="mt-3">
            <AssistantPreviewCard preview={preview} />
          </div>
        )}
      </div>

      <AssistantPromptSection
        prompt={prompt}
        status={status}
        isLoading={isLoading}
        canRun={canRun}
        preview={preview}
        onPromptChange={onPromptChange}
        onRun={onRun}
        onApply={onApply}
        onDiscard={onDiscard}
      />
    </div>
  )

  if (isDocked) {
    return (
      <section className="flex h-full min-h-0 w-full flex-col bg-white">
        <div className="flex h-[53px] shrink-0 items-center justify-between border-b border-[#F0F2F9] px-5">
          <h2 className="text-xs font-extrabold text-[#1C1C1E]">바탕 Agent</h2>
          {provider === 'mock' && (
            <span className="rounded-md bg-[#EEF2FF] px-1.5 py-0.5 text-[10px] font-semibold text-[#3B45B3]">
              Mock
            </span>
          )}
        </div>
        <div className="min-h-0 flex-1">
          {content}
        </div>
      </section>
    )
  }

  return (
    <PanelFrame
      panelKey="assistant"
      title="바탕 Agent"
      headerExtra={
        provider === 'mock' ? (
          <span className="rounded-md bg-[#EEF2FF] px-1.5 py-0.5 text-[10px] font-semibold text-[#3B45B3]">
            Mock
          </span>
        ) : null
      }
      isOpen={isOpen}
      offset={offset}
      width={width}
      height={height}
      zIndex={zIndex}
      theme="light"
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onToggle={onToggle}
    >
      {content}
    </PanelFrame>
  )
}

import { useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { Sparkles } from 'lucide-react'
import type { PanelKey, PanelOffset, PanelResizeAxis } from '../../types'
import { PanelFrame } from '../shared/PanelFrame'
import type { LlmEditPreview, LlmEditStatus } from '../../types/llmEdit.types'
import { AssistantImportSection } from './assistant/AssistantImportSection'
import { AssistantNoticeCard } from './assistant/AssistantNoticeCard'
import { AssistantPreviewCard } from './assistant/AssistantPreviewCard'
import { AssistantPromptSection } from './assistant/AssistantPromptSection'

interface AssistantPanelProps {
  isOpen: boolean
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
  onPromptChange: (value: string) => void
  onRun: () => void
  onApply: () => void
  onDiscard: () => void
  floorProjectImportMessage: string
  onImportFloorProjectJson: (rawJson: string) => Promise<void>
  onImportSampleFloorProject: () => void
  onDragStart: (key: PanelKey, e: ReactMouseEvent<HTMLElement>) => void
  onResizeStart: (key: PanelKey, axis: PanelResizeAxis, e: ReactMouseEvent<HTMLButtonElement>) => void
  onToggle: (key: PanelKey) => void
}

/**
 * AI 어시스턴트 패널
 * - 자연어 수정 명령 실행/적용
 * - BATANG 2D 샘플/JSON import
 */
export function AssistantPanel({
  isOpen,
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
  onPromptChange,
  onRun,
  onApply,
  onDiscard,
  floorProjectImportMessage,
  onImportFloorProjectJson,
  onImportSampleFloorProject,
  onDragStart,
  onResizeStart,
  onToggle,
}: AssistantPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isImporting, setIsImporting] = useState(false)

  const handlePickJsonFile = () => {
    if (isImporting) return
    fileInputRef.current?.click()
  }

  const handleJsonFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setIsImporting(true)
    try {
      const rawJson = await file.text()
      await onImportFloorProjectJson(rawJson)
    } finally {
      setIsImporting(false)
      event.target.value = ''
    }
  }

  return (
    <PanelFrame
      panelKey="assistant"
      title="AI 어시스턴트"
      titleIcon={<Sparkles size={14} fill="white" />}
      isOpen={isOpen}
      offset={offset}
      width={width}
      height={height}
      zIndex={zIndex}
      theme="dark"
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onToggle={onToggle}
    >
      <div className="p-4 space-y-3">
        <div className="bg-white rounded-xl p-3 shadow-inner">
          <AssistantPromptSection
            provider={provider}
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
          <AssistantImportSection
            isImporting={isImporting}
            fileInputRef={fileInputRef}
            onSampleImport={onImportSampleFloorProject}
            onPickJsonFile={handlePickJsonFile}
            onJsonFileChange={handleJsonFileChange}
          />
        </div>

        {isLoading && (
          <AssistantNoticeCard loading message="AI가 요청을 분석하고 있습니다..." />
        )}

        {(status === 'ambiguous' || status === 'error' || status === 'applied') && message && (
          <AssistantNoticeCard message={message} />
        )}

        {floorProjectImportMessage && (
          <AssistantNoticeCard message={floorProjectImportMessage} />
        )}

        {status === 'ambiguous' && suggestions.length > 0 && (
          <div className="rounded-xl bg-white px-3 py-2">
            <p className="text-[10px] font-bold text-[#64748B] mb-1">재입력 예시</p>
            <ul className="space-y-1">
              {suggestions.map((suggestion) => (
                <li key={suggestion}>
                  <button
                    onClick={() => onPromptChange(suggestion)}
                    className="text-left text-[11px] text-[#3B45B3] hover:underline"
                  >
                    {suggestion}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {preview && (
          <AssistantPreviewCard preview={preview} />
        )}
      </div>
    </PanelFrame>
  )
}

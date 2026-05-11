// 2D 캔버스에서 새 댓글 핀 작성 입력창을 표시합니다.
import type { RefObject } from 'react'

interface PinDraftState {
  x: number
  y: number
  message: string
}

interface TwoDCanvasPinDraftPanelProps {
  isCollaborationMode: boolean
  pinDraft: PinDraftState | null
  stageSize: { width: number; height: number }
  toScreenPoint: (point: { x: number; y: number }) => { x: number; y: number }
  pinInputRef: RefObject<HTMLInputElement>
  onMessageChange: (message: string) => void
  onCancel: () => void
  onSave: () => void
}

/**
 * 2D 협업 모드에서 새 댓글 핀 내용을 입력하는 패널입니다.
 */
export function TwoDCanvasPinDraftPanel({
  isCollaborationMode,
  pinDraft,
  stageSize,
  toScreenPoint,
  pinInputRef,
  onMessageChange,
  onCancel,
  onSave,
}: TwoDCanvasPinDraftPanelProps) {
  if (!isCollaborationMode || !pinDraft) return null

  const panelLeft = Math.min(Math.max(toScreenPoint(pinDraft).x + 12, 8), Math.max(stageSize.width - 268, 8))
  const panelTop = Math.min(Math.max(toScreenPoint(pinDraft).y - 12, 8), Math.max(stageSize.height - 120, 8))
  const canSave = !!pinDraft.message.trim()

  return (
    <div
      className="absolute z-20 w-[260px] rounded-xl border border-[#D9DEF0] bg-white p-3 shadow-lg"
      style={{ left: panelLeft, top: panelTop }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <p className="mb-2 text-[11px] font-bold text-[#3B45B3]">댓글 핀 작성</p>
      <input
        ref={pinInputRef}
        value={pinDraft.message}
        onChange={(e) => onMessageChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            onCancel()
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSave()
          }
        }}
        placeholder="댓글을 입력하세요."
        className="w-full rounded-lg border border-[#E2E6EF] bg-[#FAFBFF] px-3 py-2 text-xs outline-none focus:border-[#3B45B3]"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-[#E2E6EF] px-2.5 py-1.5 text-[11px] font-bold text-[#68768F]"
        >
          취소
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="rounded-lg bg-[#3B45B3] px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-45"
        >
          저장
        </button>
      </div>
    </div>
  )
}

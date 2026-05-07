import { FileText, Image as ImageIcon, Paperclip, X } from 'lucide-react'
import type { RefObject } from 'react'
import type { FloorCommentAttachmentInput } from '../../types'

interface PinDraftState {
  x: number
  y: number
  message: string
  attachments: FloorCommentAttachmentInput[]
}

interface TwoDCanvasPinDraftPanelProps {
  isCollaborationMode: boolean
  pinDraft: PinDraftState | null
  stageSize: { width: number; height: number }
  toScreenPoint: (point: { x: number; y: number }) => { x: number; y: number }
  pinInputRef: RefObject<HTMLInputElement>
  pinImageInputRef: RefObject<HTMLInputElement>
  pinFileInputRef: RefObject<HTMLInputElement>
  onAddFiles: (files: FileList | null) => void
  onRemoveAttachment: (url: string) => void
  onMessageChange: (message: string) => void
  onCancel: () => void
  onSave: () => void
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes >= 1_000_000) return `${(sizeBytes / 1_000_000).toFixed(1)}MB`
  if (sizeBytes >= 1_000) return `${(sizeBytes / 1_000).toFixed(1)}KB`
  return `${sizeBytes}B`
}

/**
 * 2D 협업 모드 핀 작성 패널
 * - 첨부 추가/삭제, 메시지 입력, 저장/취소 UI를 담당한다.
 */
export function TwoDCanvasPinDraftPanel({
  isCollaborationMode,
  pinDraft,
  stageSize,
  toScreenPoint,
  pinInputRef,
  pinImageInputRef,
  pinFileInputRef,
  onAddFiles,
  onRemoveAttachment,
  onMessageChange,
  onCancel,
  onSave,
}: TwoDCanvasPinDraftPanelProps) {
  if (!isCollaborationMode || !pinDraft) return null

  const panelLeft = Math.min(Math.max(toScreenPoint(pinDraft).x + 12, 8), Math.max(stageSize.width - 268, 8))
  const panelTop = Math.min(Math.max(toScreenPoint(pinDraft).y - 12, 8), Math.max(stageSize.height - 120, 8))
  const canSave = !!pinDraft.message.trim() || pinDraft.attachments.length > 0

  return (
    <div
      className="absolute z-20 w-[260px] rounded-xl border border-[#D9DEF0] bg-white p-3 shadow-lg"
      style={{ left: panelLeft, top: panelTop }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <p className="mb-2 text-[11px] font-bold text-[#3B45B3]">핀 댓글 작성</p>
      <div className="mb-2 flex items-center gap-2">
        <button
          onClick={() => pinImageInputRef.current?.click()}
          className="rounded-md p-1.5 text-[#7D88A0] hover:bg-[#F1F4FF] hover:text-[#3B45B3]"
          title="이미지 첨부"
        >
          <ImageIcon size={14} />
        </button>
        <button
          onClick={() => pinFileInputRef.current?.click()}
          className="rounded-md p-1.5 text-[#7D88A0] hover:bg-[#F1F4FF] hover:text-[#3B45B3]"
          title="파일 첨부"
        >
          <Paperclip size={14} />
        </button>
        <input
          ref={pinImageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            onAddFiles(e.target.files)
            e.currentTarget.value = ''
          }}
        />
        <input
          ref={pinFileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            onAddFiles(e.target.files)
            e.currentTarget.value = ''
          }}
        />
      </div>
      {pinDraft.attachments.length > 0 && (
        <div className="mb-2 max-h-24 space-y-1.5 overflow-y-auto rounded-lg border border-[#EEF1F8] bg-[#FAFBFF] p-2">
          {pinDraft.attachments.map((attachment) => (
            <div key={attachment.url} className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1">
              <div className="min-w-0 flex items-center gap-1.5 text-[10px] text-[#55627D]">
                {attachment.kind === 'image' ? <ImageIcon size={11} /> : <FileText size={11} />}
                <span className="truncate">{attachment.name}</span>
                <span className="shrink-0 text-[#98A3BA]">{formatFileSize(attachment.sizeBytes)}</span>
              </div>
              <button
                onClick={() => onRemoveAttachment(attachment.url)}
                className="text-[#9AA4BA] hover:text-[#49556F]"
                title="첨부 제거"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
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
        placeholder="댓글을 입력하세요"
        className="w-full rounded-lg border border-[#E2E6EF] bg-[#FAFBFF] px-3 py-2 text-xs outline-none focus:border-[#3B45B3]"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-lg border border-[#E2E6EF] px-2.5 py-1.5 text-[11px] font-bold text-[#68768F]"
        >
          취소
        </button>
        <button
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

import { useEffect, useRef, useState } from 'react'
import type { FloorCommentAttachmentInput, Point2D } from '../../types'

interface UsePinDraftParams {
  isCollaborationMode?: boolean
  onPinCreate?: (x: number, y: number, content: string, attachments?: FloorCommentAttachmentInput[]) => void
}

interface PinDraftState {
  x: number
  y: number
  message: string
  attachments: FloorCommentAttachmentInput[]
}

/**
 * 협업 코멘트 핀 작성 Draft 상태와 파일 첨부 URL 수명을 관리한다.
 */
export function usePinDraft({ isCollaborationMode, onPinCreate }: UsePinDraftParams) {
  const [pinDraft, setPinDraft] = useState<PinDraftState | null>(null)
  const pinInputRef = useRef<HTMLInputElement | null>(null)
  const pinImageInputRef = useRef<HTMLInputElement | null>(null)
  const pinFileInputRef = useRef<HTMLInputElement | null>(null)

  const createAttachmentFromFile = (file: File): FloorCommentAttachmentInput => {
    const mimeType = file.type || 'application/octet-stream'
    return {
      kind: mimeType.startsWith('image/') ? 'image' : 'file',
      name: file.name,
      mimeType,
      sizeBytes: file.size,
      url: URL.createObjectURL(file),
    }
  }

  const startPinDraftAt = (point: Point2D) => {
    setPinDraft((prev) => {
      if (prev) prev.attachments.forEach((attachment) => URL.revokeObjectURL(attachment.url))
      return {
        x: point.x,
        y: point.y,
        message: '',
        attachments: [],
      }
    })
  }

  const addPinDraftFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const nextAttachments = Array.from(files).map(createAttachmentFromFile)
    setPinDraft((prev) => (prev ? { ...prev, attachments: [...prev.attachments, ...nextAttachments] } : prev))
  }

  const removePinDraftAttachment = (targetUrl: string) => {
    setPinDraft((prev) => {
      if (!prev) return prev
      const target = prev.attachments.find((attachment) => attachment.url === targetUrl)
      if (target) URL.revokeObjectURL(target.url)
      return {
        ...prev,
        attachments: prev.attachments.filter((attachment) => attachment.url !== targetUrl),
      }
    })
  }

  const savePinDraft = () => {
    if (!pinDraft) return
    const message = pinDraft.message.trim()
    if (!message && pinDraft.attachments.length === 0) return
    onPinCreate?.(pinDraft.x, pinDraft.y, message, pinDraft.attachments)
    setPinDraft(null)
  }

  const cancelPinDraft = () => {
    if (!pinDraft) return
    pinDraft.attachments.forEach((attachment) => URL.revokeObjectURL(attachment.url))
    setPinDraft(null)
  }

  const setPinDraftMessage = (message: string) => {
    setPinDraft((prev) => (prev ? { ...prev, message } : prev))
  }

  useEffect(() => {
    if (!isCollaborationMode) {
      if (pinDraft) {
        pinDraft.attachments.forEach((attachment) => URL.revokeObjectURL(attachment.url))
        const clearTimer = window.setTimeout(() => setPinDraft(null), 0)
        return () => window.clearTimeout(clearTimer)
      }
      return
    }
    if (!pinDraft) return
    const timer = window.setTimeout(() => pinInputRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [isCollaborationMode, pinDraft])

  return {
    pinDraft,
    pinInputRef,
    pinImageInputRef,
    pinFileInputRef,
    startPinDraftAt,
    addPinDraftFiles,
    removePinDraftAttachment,
    savePinDraft,
    cancelPinDraft,
    setPinDraftMessage,
  }
}

import { useEffect, useRef, useState } from 'react'
import type { Point2D } from '../../types'

interface UsePinDraftParams {
  isCollaborationMode?: boolean
  onPinCreate?: (x: number, y: number, content: string) => void
}

interface PinDraftState {
  x: number
  y: number
  message: string
}

/**
 * 협업 코멘트 핀 작성 Draft 상태와 파일 첨부 URL 수명을 관리한다.
 */
export function usePinDraft({ isCollaborationMode, onPinCreate }: UsePinDraftParams) {
  const [pinDraft, setPinDraft] = useState<PinDraftState | null>(null)
  const pinInputRef = useRef<HTMLInputElement | null>(null)

  const startPinDraftAt = (point: Point2D) => {
    setPinDraft({
      x: point.x,
      y: point.y,
      message: '',
    })
  }

  const savePinDraft = () => {
    if (!pinDraft) return
    const message = pinDraft.message.trim()
    if (!message) return
    onPinCreate?.(pinDraft.x, pinDraft.y, message)
    setPinDraft(null)
  }

  const cancelPinDraft = () => {
    if (!pinDraft) return
    setPinDraft(null)
  }

  const setPinDraftMessage = (message: string) => {
    setPinDraft((prev) => (prev ? { ...prev, message } : prev))
  }

  useEffect(() => {
    if (!isCollaborationMode) {
      if (pinDraft) {
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
    startPinDraftAt,
    savePinDraft,
    cancelPinDraft,
    setPinDraftMessage,
  }
}

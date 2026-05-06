import { useCallback, useEffect, useState } from 'react'
import type { Point2D } from '../../types'

interface UseWallDraftStateParams {
  isWallTool: boolean
}

/**
 * 벽 생성 드래프트 상태와 라이프사이클을 관리한다.
 * - Esc 취소, 벽 도구 이탈 시 자동 정리를 포함한다.
 */
export function useWallDraftState({ isWallTool }: UseWallDraftStateParams) {
  const [isDrawingWall, setIsDrawingWall] = useState(false)
  const [wallDraftStart, setWallDraftStart] = useState<Point2D | null>(null)
  const [wallDraftEnd, setWallDraftEnd] = useState<Point2D | null>(null)

  const cancelWallDraft = useCallback(() => {
    setIsDrawingWall(false)
    setWallDraftStart(null)
    setWallDraftEnd(null)
  }, [])

  useEffect(() => {
    if (!isWallTool || !isDrawingWall) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      cancelWallDraft()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isWallTool, isDrawingWall, cancelWallDraft])

  useEffect(() => {
    if (isWallTool) return
    const timer = window.setTimeout(() => {
      cancelWallDraft()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [isWallTool, cancelWallDraft])

  return {
    isDrawingWall,
    wallDraftStart,
    wallDraftEnd,
    setIsDrawingWall,
    setWallDraftStart,
    setWallDraftEnd,
    cancelWallDraft,
  }
}

import { useCallback, useEffect, useRef, useState } from 'react'

export interface OpeningSnapGuide {
  wallId: string
  wallPosition: number
}

/**
 * 개구부 스냅 가이드 표시 상태와 자동 해제 타이머를 관리한다.
 */
export function useOpeningSnapGuide() {
  const [openingSnapGuide, setOpeningSnapGuideState] = useState<OpeningSnapGuide | null>(null)
  const guideTimerRef = useRef<number | null>(null)

  const clearGuideTimer = useCallback(() => {
    if (guideTimerRef.current === null) return
    clearTimeout(guideTimerRef.current)
    guideTimerRef.current = null
  }, [])

  const setOpeningSnapGuide = useCallback((value: OpeningSnapGuide | null) => {
    if (value === null) {
      clearGuideTimer()
      setOpeningSnapGuideState(null)
      return
    }
    setOpeningSnapGuideState(value)
  }, [clearGuideTimer])

  const showTemporaryOpeningSnapGuide = useCallback((guide: OpeningSnapGuide, durationMs = 220) => {
    setOpeningSnapGuideState(guide)
    clearGuideTimer()
    guideTimerRef.current = window.setTimeout(() => {
      setOpeningSnapGuideState(null)
      guideTimerRef.current = null
    }, durationMs)
  }, [clearGuideTimer])

  useEffect(() => {
    return () => {
      clearGuideTimer()
    }
  }, [clearGuideTimer])

  return {
    openingSnapGuide,
    setOpeningSnapGuide,
    showTemporaryOpeningSnapGuide,
  }
}

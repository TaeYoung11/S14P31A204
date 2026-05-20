import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  isProjectCanvasOnboardingRequested,
  readProjectCanvasOnboardingSeen,
  writeProjectCanvasOnboardingSeen,
} from '@/pages/editor/utils/projectCanvasOnboarding'

interface UseProjectCanvasOnboardingOptions {
  userId?: string | null
  slideCount: number
}

/** 온보딩 모달의 URL 파라미터, 표시 여부, 현재 슬라이드를 한 곳에서 관리한다. */
export function useProjectCanvasOnboarding({ userId, slideCount }: UseProjectCanvasOnboardingOptions) {
  const [searchParams, setSearchParams] = useSearchParams()
  const shouldRequestOnboarding = isProjectCanvasOnboardingRequested(searchParams)
  const [isOpen, setIsOpen] = useState(() => shouldRequestOnboarding && !readProjectCanvasOnboardingSeen(userId))
  const [slideIndex, setSlideIndex] = useState(0)

  /** 모달을 닫을 때 URL 요청 파라미터와 온보딩 확인 상태를 함께 정리한다. */
  const close = useCallback(() => {
    writeProjectCanvasOnboardingSeen(userId)
    setIsOpen(false)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('onboarding')
      return next
    }, { replace: true })
  }, [setSearchParams, userId])

  /** 인디케이터 클릭으로 이동할 때 유효한 슬라이드 범위를 벗어나지 않게 보정한다. */
  const goToSlide = useCallback((nextIndex: number) => {
    setSlideIndex(Math.min(Math.max(nextIndex, 0), Math.max(slideCount - 1, 0)))
  }, [slideCount])

  /** 마지막 슬라이드에서는 완료 처리하고, 그 외에는 다음 안내로 이동한다. */
  const goNext = useCallback(() => {
    const lastIndex = Math.max(slideCount - 1, 0)
    if (slideIndex >= lastIndex) {
      close()
      return
    }
    setSlideIndex((current) => Math.min(current + 1, lastIndex))
  }, [close, slideCount, slideIndex])

  return {
    close,
    goNext,
    goToSlide,
    isLastSlide: slideIndex === slideCount - 1,
    isOpen,
    slideIndex,
  }
}

import { useEffect, type RefObject } from 'react'

interface UseCtrlWheelZoomParams {
  rootRef: RefObject<HTMLElement>
  onWheelZoom?: (factor: number) => void
}

/**
 * Ctrl/Cmd + 휠 줌 입력을 공통 처리한다.
 * 브라우저 기본 확대를 막고 캔버스 줌 콜백으로만 전달한다.
 */
export function useCtrlWheelZoom({ rootRef, onWheelZoom }: UseCtrlWheelZoomParams) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      onWheelZoom?.(event.deltaY < 0 ? 1.1 : 0.9)
    }

    root.addEventListener('wheel', handleWheel, { passive: false })
    return () => root.removeEventListener('wheel', handleWheel)
  }, [rootRef, onWheelZoom])
}


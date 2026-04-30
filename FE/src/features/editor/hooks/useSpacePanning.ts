import { useEffect, useState } from 'react'

/**
 * 스페이스 바 키를 누르는 동안 패닝 모드를 활성화하는 공유 훅
 * - BubbleCanvas, TwoDCanvas, ThreeDCanvas에서 공통으로 사용
 * - input / textarea 포커스 중에는 기본 동작 유지 (무시)
 * - 창 포커스를 잃으면 자동으로 해제
 */
export function useSpacePanning(): boolean {
  const [isSpacePressed, setIsSpacePressed] = useState(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return
      }
      e.preventDefault()
      setIsSpacePressed(true)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpacePressed(false)
    }
    const onBlur = () => setIsSpacePressed(false)

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  return isSpacePressed
}

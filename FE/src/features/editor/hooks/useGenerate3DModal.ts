import { useCallback, useMemo, useState } from 'react'

interface UseGenerate3DModalParams {
  defaultStoryHeightMm: number
  minStoryHeightMm: number
  maxStoryHeightMm: number
  onClose: () => void
  onConfirm: (storyHeightMm: number) => void
}

/**
 * 3D 생성 모달의 입력값/검증/닫기 동작을 관리한다.
 * 모달 컴포넌트에는 렌더링 코드만 남기기 위해 분리했다.
 */
export function useGenerate3DModal({
  defaultStoryHeightMm,
  minStoryHeightMm,
  maxStoryHeightMm,
  onClose,
  onConfirm,
}: UseGenerate3DModalParams) {
  const [storyHeightInput, setStoryHeightInput] = useState(String(defaultStoryHeightMm))

  // input 문자열을 숫자로 변환해 검증/확정 로직에서 공통 사용한다.
  const parsedHeight = useMemo(
    () => parseInt(storyHeightInput, 10),
    [storyHeightInput],
  )

  const isValid = useMemo(
    () => (
      !Number.isNaN(parsedHeight) &&
      parsedHeight >= minStoryHeightMm &&
      parsedHeight <= maxStoryHeightMm
    ),
    [maxStoryHeightMm, minStoryHeightMm, parsedHeight],
  )

  const handleConfirm = useCallback(() => {
    if (!isValid) return
    // 확인 후에는 다음 열림에서 동일한 기본값을 제공하도록 입력을 초기화한다.
    onConfirm(parsedHeight)
    setStoryHeightInput(String(defaultStoryHeightMm))
  }, [defaultStoryHeightMm, isValid, onConfirm, parsedHeight])

  const handleClose = useCallback(() => {
    // 취소 시에도 입력값을 롤백해 재진입 UX를 일정하게 유지한다.
    setStoryHeightInput(String(defaultStoryHeightMm))
    onClose()
  }, [defaultStoryHeightMm, onClose])

  return {
    storyHeightInput,
    parsedHeight,
    isValid,
    setStoryHeightInput,
    handleConfirm,
    handleClose,
  }
}

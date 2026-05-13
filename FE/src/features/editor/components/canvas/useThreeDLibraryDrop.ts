import { useCallback, useRef, useState, type DragEvent as ReactDragEvent } from 'react'
import { hasLibraryPresetInDataTransfer, readLibraryPresetFromDataTransfer } from './threeDLibraryDnd'
import type { ThreeDLibraryDropRequest, ThreeDLibraryPreset } from './threeDLibrary.types'

interface UseThreeDLibraryDropParams {
  isEditingLocked: boolean
  addLibraryPreset: (
    preset: ThreeDLibraryPreset,
    options?: { closePanel?: boolean },
  ) => void
}

interface UseThreeDLibraryDropResult {
  libraryDropRequest: ThreeDLibraryDropRequest | null
  handleLibraryDragOver: (event: ReactDragEvent<HTMLDivElement>) => void
  handleLibraryDrop: (event: ReactDragEvent<HTMLDivElement>) => void
  handleResolveLibraryDrop: (token: number, patch?: Partial<ThreeDLibraryPreset>) => void
}

/**
 * 3D 라이브러리 드래그앤드롭 상태를 관리한다.
 * - 캔버스 drop 요청 토큰 생성
 * - StrictMode 중복 resolve 방어
 * - 캔버스 외/패널 내부 drop 무시
 */
export function useThreeDLibraryDrop({
  isEditingLocked,
  addLibraryPreset,
}: UseThreeDLibraryDropParams): UseThreeDLibraryDropResult {
  const dropTokenRef = useRef(0)
  const resolvedDropTokenRef = useRef(0)
  const [libraryDropRequest, setLibraryDropRequest] = useState<ThreeDLibraryDropRequest | null>(null)

  const handleLibraryDragOver = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (isEditingLocked) return
    if (!hasLibraryPresetInDataTransfer(event.dataTransfer)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [isEditingLocked])

  const handleLibraryDrop = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (isEditingLocked) return
    if (!hasLibraryPresetInDataTransfer(event.dataTransfer)) return
    const dropTarget = event.target
    if (dropTarget instanceof HTMLElement && dropTarget.closest('[data-3d-library-panel="true"]')) {
      return
    }
    const preset = readLibraryPresetFromDataTransfer(event.dataTransfer)
    if (!preset) return
    event.preventDefault()
    dropTokenRef.current += 1
    setLibraryDropRequest({
      token: dropTokenRef.current,
      preset,
      clientX: event.clientX,
      clientY: event.clientY,
    })
  }, [isEditingLocked])

  const handleResolveLibraryDrop = useCallback((token: number, patch?: Partial<ThreeDLibraryPreset>) => {
    // StrictMode에서 동일 토큰 콜백이 중복 호출되는 케이스를 방어한다.
    if (token <= resolvedDropTokenRef.current) return
    resolvedDropTokenRef.current = token

    if (!libraryDropRequest || libraryDropRequest.token !== token) {
      setLibraryDropRequest((pendingRequest) => (
        pendingRequest?.token === token ? null : pendingRequest
      ))
      return
    }

    // 드롭 위치 계산 실패(캔버스 밖/레이캐스트 실패) 시 배치를 취소한다.
    if (!patch || isEditingLocked) {
      setLibraryDropRequest(null)
      return
    }

    addLibraryPreset(
      { ...libraryDropRequest.preset, ...patch },
      { closePanel: false },
    )
    setLibraryDropRequest(null)
  }, [addLibraryPreset, isEditingLocked, libraryDropRequest])

  return {
    libraryDropRequest,
    handleLibraryDragOver,
    handleLibraryDrop,
    handleResolveLibraryDrop,
  }
}

import { useCallback, useRef, useState } from 'react'
import type { ThreeDLibraryPreset } from '../components/canvas/threeDLibrary.types'

interface UseThreeDLibraryPresetsParams {
  onPresetAdded?: () => void
  onElementCreated?: (preset: ThreeDLibraryPreset) => void
  onElementDeleted?: (preset: ThreeDLibraryPreset) => void
}

interface AddLibraryPresetOptions {
  closePanel?: boolean
}

/**
 * 3D 라이브러리 프리셋 목록과 카테고리 선택 상태를 관리한다.
 * - ThreeDCanvas는 렌더링 조합만 담당하도록 이 훅에 상태 로직을 분리한다.
 * - 프리셋 추가/변경/삭제와 카테고리 선택을 캡슐화한다.
 */
export function useThreeDLibraryPresets({
  onPresetAdded,
  onElementCreated,
  onElementDeleted,
}: UseThreeDLibraryPresetsParams) {
  const nextElementSuffixRef = useRef(0)
  /** 현재 선택된 카테고리 id ('all'이면 전체 표시) */
  const [selectedCategory, setSelectedCategory] = useState('all')
  /** 씬에 배치된 라이브러리 프리셋 목록 */
  const [libraryElements, setLibraryElements] = useState<ThreeDLibraryPreset[]>([])
  const libraryElementsRef = useRef<ThreeDLibraryPreset[]>([])

  /**
   * 프리셋을 씬에 추가한다.
   * id 충돌을 방지하기 위해 timestamp·인덱스를 suffix로 붙여 고유 id를 생성한다.
   */
  const addLibraryPreset = useCallback(
    (preset: ThreeDLibraryPreset, options?: AddLibraryPresetOptions) => {
      const nextPreset = {
        ...preset,
        id: `${preset.id}-${Date.now()}-${nextElementSuffixRef.current}`,
      }
      nextElementSuffixRef.current += 1
      libraryElementsRef.current = [...libraryElementsRef.current, nextPreset]
      setLibraryElements(libraryElementsRef.current)
      onElementCreated?.(nextPreset)
      if (options?.closePanel ?? true) onPresetAdded?.()
    },
    [onElementCreated, onPresetAdded],
  )

  /** 특정 id의 프리셋 데이터를 부분 업데이트한다. (색상·재질·치수 변경 시 사용) */
  const changeLibraryElement = useCallback((id: string, patch: Partial<ThreeDLibraryPreset>) => {
    libraryElementsRef.current = libraryElementsRef.current.map((element) =>
      element.id === id ? { ...element, ...patch } : element)
    setLibraryElements(libraryElementsRef.current)
  }, [])

  /** 특정 id의 프리셋을 씬에서 제거한다. */
  const deleteLibraryElement = useCallback((id: string) => {
    const deletedElement = libraryElementsRef.current.find((element) => element.id === id) ?? null
    libraryElementsRef.current = libraryElementsRef.current.filter((element) => element.id !== id)
    setLibraryElements(libraryElementsRef.current)
    if (deletedElement) onElementDeleted?.(deletedElement)
  }, [onElementDeleted])

  return {
    selectedCategory,
    setSelectedCategory,
    libraryElements,
    addLibraryPreset,
    changeLibraryElement,
    deleteLibraryElement,
  }
}

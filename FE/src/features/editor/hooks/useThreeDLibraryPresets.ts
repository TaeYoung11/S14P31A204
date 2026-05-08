import { useCallback, useState } from 'react'
import type { ThreeDLibraryPreset } from '../components/canvas/threeDLibrary.types'

interface UseThreeDLibraryPresetsParams {
  onPresetAdded?: () => void
}

/**
 * 3D 라이브러리 프리셋 목록과 카테고리 선택 상태를 관리한다.
 * - ThreeDCanvas는 렌더링 조합만 담당하도록 이 훅에 상태 로직을 분리한다.
 * - 프리셋 추가/변경/삭제와 카테고리 선택을 캡슐화한다.
 */
export function useThreeDLibraryPresets({ onPresetAdded }: UseThreeDLibraryPresetsParams) {
  /** 현재 선택된 카테고리 id ('all'이면 전체 표시) */
  const [selectedCategory, setSelectedCategory] = useState('all')
  /** 씬에 배치된 라이브러리 프리셋 목록 */
  const [libraryElements, setLibraryElements] = useState<ThreeDLibraryPreset[]>([])

  /**
   * 프리셋을 씬에 추가한다.
   * id 충돌을 방지하기 위해 timestamp·인덱스를 suffix로 붙여 고유 id를 생성한다.
   */
  const addLibraryPreset = useCallback(
    (preset: ThreeDLibraryPreset) => {
      setLibraryElements((prev) => [
        ...prev,
        {
          ...preset,
          id: `${preset.id}-${Date.now()}-${prev.length}`,
        },
      ])
      onPresetAdded?.()
    },
    [onPresetAdded],
  )

  /** 특정 id의 프리셋 데이터를 부분 업데이트한다. (색상·재질·치수 변경 시 사용) */
  const changeLibraryElement = useCallback((id: string, patch: Partial<ThreeDLibraryPreset>) => {
    setLibraryElements((prev) =>
      prev.map((element) => (element.id === id ? { ...element, ...patch } : element)),
    )
  }, [])

  /** 특정 id의 프리셋을 씬에서 제거한다. */
  const deleteLibraryElement = useCallback((id: string) => {
    setLibraryElements((prev) => prev.filter((element) => element.id !== id))
  }, [])

  return {
    selectedCategory,
    setSelectedCategory,
    libraryElements,
    addLibraryPreset,
    changeLibraryElement,
    deleteLibraryElement,
  }
}


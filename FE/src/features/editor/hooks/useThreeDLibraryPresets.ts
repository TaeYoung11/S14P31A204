import { useCallback, useState } from 'react'
import type { ThreeDLibraryPreset } from '../components/canvas/ThreeDLibraryPanel'

interface UseThreeDLibraryPresetsParams {
  onPresetAdded?: () => void
}

/**
 * 3D 라이브러리 프리셋 목록과 카테고리 선택 상태를 관리한다.
 * ThreeDCanvas는 렌더링 조합만 담당하도록 상태 로직을 분리한다.
 */
export function useThreeDLibraryPresets({ onPresetAdded }: UseThreeDLibraryPresetsParams) {
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [libraryElements, setLibraryElements] = useState<ThreeDLibraryPreset[]>([])

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

  const changeLibraryElement = useCallback((id: string, patch: Partial<ThreeDLibraryPreset>) => {
    setLibraryElements((prev) =>
      prev.map((element) => (element.id === id ? { ...element, ...patch } : element)),
    )
  }, [])

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


import { useMemo, useState } from 'react'
import {
  mergeUniqueProjectIds,
  toggleProjectSelection,
} from '@/features/project/utils/projectListHelpers'
import type { Project } from '@/shared/types'

/** 프로젝트 카드 다중 선택 상태와 선택 액션을 관리합니다. */
export function useProjectSelection(projects: Project[]) {
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([])

  const selectedProjects = useMemo(
    () => projects.filter((project) => selectedProjectIds.includes(project.id)),
    [projects, selectedProjectIds],
  )

  /** 선택 모드를 종료할 때 이전 선택이 다음 진입에 남지 않도록 초기화합니다. */
  const toggleSelectionMode = () => {
    setIsSelectionMode((prev) => {
      if (prev) {
        setSelectedProjectIds([])
      }
      return !prev
    })
  }

  const handleToggleProjectSelect = (projectId: string) => {
    setSelectedProjectIds((prev) => toggleProjectSelection(prev, projectId))
  }

  /** 현재 화면에 보이는 프로젝트 카드를 전체 선택하거나 전체 해제합니다. */
  const handleSelectAllVisible = () => {
    const visibleProjectIds = projects.map((project) => project.id)
    const isAllVisibleSelected =
      visibleProjectIds.length > 0 &&
      visibleProjectIds.every((id) => selectedProjectIds.includes(id))

    if (isAllVisibleSelected) {
      setSelectedProjectIds((prev) => prev.filter((id) => !visibleProjectIds.includes(id)))
      return
    }

    setSelectedProjectIds((prev) => mergeUniqueProjectIds(prev, visibleProjectIds))
  }

  /** 일괄 작업이 끝난 뒤 선택 상태를 안전하게 비웁니다. */
  const clearSelection = () => {
    setSelectedProjectIds([])
    setIsSelectionMode(false)
  }

  return {
    clearSelection,
    handleSelectAllVisible,
    handleToggleProjectSelect,
    isSelectionMode,
    selectedProjectIds,
    selectedProjects,
    toggleSelectionMode,
  }
}

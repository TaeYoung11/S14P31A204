import { useState } from 'react'
import type { Project } from '@/shared/types'

interface UseProjectDeleteFlowOptions {
  deleteProjectById: (projectId: string) => Promise<unknown>
  onDeleteComplete: () => void
  projects: Project[]
}

/** 프로젝트 삭제 확인 모달과 단일/일괄 삭제 처리를 관리합니다. */
export function useProjectDeleteFlow({
  deleteProjectById,
  onDeleteComplete,
  projects,
}: UseProjectDeleteFlowOptions) {
  const [deleteProjects, setDeleteProjects] = useState<Project[]>([])
  const [deleteConfirmName, setDeleteConfirmName] = useState('')

  /** 삭제 대상 프로젝트가 있을 때 삭제 확인 모달을 엽니다. */
  const handleDeleteOpen = (targets: Project[]) => {
    if (targets.length === 0) return
    setDeleteConfirmName('')
    setDeleteProjects(targets)
  }

  /** 삭제 확인 모달 상태를 초기화합니다. */
  const closeDeleteModal = () => {
    setDeleteProjects([])
    setDeleteConfirmName('')
  }

  /** 삭제 확정된 프로젝트를 일괄 삭제하고 후속 선택 상태를 정리합니다. */
  const handleConfirmDelete = async () => {
    if (deleteProjects.length === 0) return

    await Promise.all(deleteProjects.map((project) => deleteProjectById(project.id)))
    closeDeleteModal()
    onDeleteComplete()
  }

  /** 단일 프로젝트 카드의 삭제 버튼 클릭을 삭제 모달로 연결합니다. */
  const handleProjectDelete = (projectId: string) => {
    const targetProject = projects.find((project) => project.id === projectId)
    if (targetProject) handleDeleteOpen([targetProject])
  }

  return {
    closeDeleteModal,
    deleteConfirmName,
    deleteProjects,
    handleConfirmDelete,
    handleDeleteOpen,
    handleProjectDelete,
    setDeleteConfirmName,
  }
}

import { useEffect } from 'react'
import { projectService } from '@/features/project/services/project.service'
import { useProjectStore } from '@/features/project/stores/projectStore'

/**
 * 에디터 상단에 표시할 프로젝트명을 계산한다.
 * - 라우트 projectId와 store의 currentProject가 다를 때는 안전하게 기본값을 사용한다.
 * - 직접 URL 진입/새로고침에서도 이름이 보이도록 projectId 기반으로 1회 동기화한다.
 */
export function useEditorProjectName(projectId: string | undefined) {
  const currentProject = useProjectStore((state) => state.currentProject)
  const setCurrentProject = useProjectStore((state) => state.setCurrentProject)

  useEffect(() => {
    if (!projectId) return
    if (currentProject?.id === projectId) return

    let cancelled = false
    void projectService.getById(projectId)
      .then((project) => {
        if (cancelled) return
        setCurrentProject(project)
      })
      .catch(() => {
        // 프로젝트명 동기화 실패는 치명적 오류가 아니므로 화면은 기본값으로 유지한다.
      })

    return () => {
      cancelled = true
    }
  }, [projectId, currentProject?.id, setCurrentProject])

  let currentProjectName = '프로젝트'
  if (projectId && currentProject?.id === projectId) {
    const trimmed = currentProject.name?.trim()
    if (trimmed && trimmed.length > 0) {
      currentProjectName = trimmed
    }
  }

  return { currentProjectName }
}

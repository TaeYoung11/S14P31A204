import { useProjectStore } from '@/features/project/stores/projectStore'

/**
 * 에디터 상단에 표시할 프로젝트명을 계산합니다.
 * - store에 선택 프로젝트가 없으면 projectId 기반 상세 조회 결과로 보완합니다.
 * - 직접 URL 진입/새로고침/사이드바 전환 모두 같은 경로로 이름을 복구합니다.
 */
export function useEditorProjectName(projectId: string | undefined) {
  const currentProject = useProjectStore((state) => state.currentProject)
  let currentProjectName = '프로젝트'
  let projectName = ''
  if (projectId && currentProject?.id === projectId) {
    projectName = currentProject.name
  }
  const trimmed = projectName?.trim()

  if (trimmed && trimmed.length > 0) {
    currentProjectName = trimmed
  }

  return { currentProjectName }
}

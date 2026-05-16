import type { Project } from '@/shared/types'

/**
 * 사용자 검색어를 정규식으로 변환한다.
 * - 정규식 문법이 유효하면 그대로 사용한다.
 * - 유효하지 않으면 특수문자를 이스케이프해서 일반 문자열 검색으로 처리한다.
 */
export function createSearchRegex(search: string): RegExp {
  try {
    return new RegExp(search, 'i')
  } catch {
    return new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
  }
}

/**
 * 프로젝트 선택 상태를 토글한다.
 * 이미 선택된 ID면 제거하고, 없으면 추가한다.
 */
export function toggleProjectSelection(projectIds: string[], projectId: string): string[] {
  return projectIds.includes(projectId)
    ? projectIds.filter((id) => id !== projectId)
    : [...projectIds, projectId]
}

/**
 * 현재 선택된 프로젝트 목록과 화면에 보이는 프로젝트 목록을 합쳐
 * 중복 없는 선택 ID 배열을 반환한다.
 */
export function mergeUniqueProjectIds(currentIds: string[], visibleIds: string[]): string[] {
  return Array.from(new Set([...currentIds, ...visibleIds]))
}

/**
 * 댓글 이동/삭제 대상 탐색에 사용하기 위해
 * 2개의 프로젝트 컬렉션에서 단일 프로젝트를 조회한다.
 */
export function findProjectById(
  projectId: string,
  preferredProjects: Project[],
  fallbackProjects: Project[],
): Project | undefined {
  return preferredProjects.find((project) => project.id === projectId)
    ?? fallbackProjects.find((project) => project.id === projectId)
}

/**
 * 프로젝트 관련 React Query 키 생성기.
 * 키 구조를 한곳에서 관리해 invalidate/query 간 불일치를 방지한다.
 */
export const projectQueryKeys = {
  list: () => ['projects'] as const,
  all: () => ['projects', 'all'] as const,
  detail: (projectId: string) => ['projects', projectId] as const,
  members: (projectId: string) => ['projects', projectId, 'members'] as const,
  commentsRoot: () => ['projects', 'comments'] as const,
  comments: (projectIds: string[]) => ['projects', 'comments', [...projectIds].sort()] as const,
  sitePolygon: (projectId: string | null) => ['projects', projectId, 'site-polygon'] as const,
}

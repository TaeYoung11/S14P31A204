// 프로젝트 메인 화면의 안 읽은 댓글 목록 조회를 제공한다.
import { useQuery } from '@tanstack/react-query'
import { projectQueryKeys } from '@/features/project/constants/projectQueryKeys'
import {
  projectCommentService,
} from '@/features/project/services/projectComment.service'
import type { Project } from '@/shared/types'

export const useProjectComments = (projects: Project[]) => {
  const projectIds = projects.map((project) => project.id)

  return useQuery({
    queryKey: projectQueryKeys.comments(projectIds),
    queryFn: () => projectCommentService.getCommentsForProjects(projects),
    enabled: projectIds.length > 0,
    staleTime: 30 * 1000,
    retry: false,
  })
}

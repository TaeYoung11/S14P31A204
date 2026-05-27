import { useQuery } from '@tanstack/react-query'
import { projectQueryKeys } from '@/features/project/constants/projectQueryKeys'
import { projectThumbnailService } from '@/features/project/services/projectThumbnail.service'
import { readCachedProjectRenderThumbnailUrl } from '@/features/project/utils/projectRenderThumbnailCache'

export function useProjectThumbnail(projectId: string, enabled = true) {
  return useQuery({
    queryKey: projectQueryKeys.thumbnail(projectId),
    queryFn: async () =>
      await projectThumbnailService.getLatestRenderedImageUrl(projectId)
      ?? readCachedProjectRenderThumbnailUrl(projectId),
    initialData: () => readCachedProjectRenderThumbnailUrl(projectId),
    enabled: enabled && !!projectId,
    retry: false,
    staleTime: 0,
  })
}

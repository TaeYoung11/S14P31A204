import { useQuery } from '@tanstack/react-query'
import { workspaceSaveService } from '@/features/editor/services/workspaceSave.service'
import type { EditorMode } from '@/features/editor/types'
import { projectQueryKeys } from '@/features/project/constants/projectQueryKeys'

export function useProjectWorkspacePreview(
  projectId: string,
  mode: EditorMode | null,
  enabled = true,
) {
  return useQuery({
    queryKey: projectQueryKeys.workspacePreview(projectId),
    queryFn: () => workspaceSaveService.loadHistorySnapshot(projectId),
    enabled: enabled && !!projectId && !!mode && mode !== 'view',
    staleTime: 30 * 1000,
    retry: false,
  })
}

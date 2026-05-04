import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectQueryKeys } from '@/features/project/constants/projectQueryKeys'
import { projectService } from '@/features/project/services/project.service'
import { getProjectSitePolygonEntry } from '@/features/project/utils/projectSiteCache'
import { extractOuterRingFromCoordinates } from '@/features/project/utils/sitePolygon'
import type { ProjectSitePolygonResult } from '@/features/project/utils/projectSiteFallback'
import type { CreateProjectDto, UpdateProjectDto } from '@/shared/types'

export const useProjects = () => {
  return useInfiniteQuery({
    queryKey: projectQueryKeys.list(),
    queryFn: ({ pageParam }) => projectService.getList(pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.hasNext ? lastPage.page + 1 : undefined,
  })
}

export const useAllProjects = (enabled: boolean) => {
  return useQuery({
    queryKey: projectQueryKeys.all(),
    queryFn: () => projectService.getAll(),
    enabled,
    staleTime: 60 * 1000,
  })
}

export const useProject = (id: string) => {
  return useQuery({
    queryKey: projectQueryKeys.detail(id),
    queryFn: () => projectService.getById(id),
    enabled: !!id,
  })
}

export const useProjectMembers = (projectId: string) => {
  return useQuery({
    queryKey: projectQueryKeys.members(projectId),
    queryFn: () => projectService.getMembers(projectId),
    enabled: !!projectId,
  })
}

export const useCreateProject = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateProjectDto) => projectService.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectQueryKeys.list() }),
  })
}

export const useUpdateProject = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProjectDto }) =>
      projectService.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectQueryKeys.list() }),
  })
}

export const useDeleteProject = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => projectService.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectQueryKeys.list() }),
  })
}

export const useRegisterProjectSite = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      projectId,
      latitude,
      longitude,
    }: {
      projectId: string
      latitude: number
      longitude: number
    }) => projectService.registerSite(projectId, { latitude, longitude }),
    onSuccess: (data, variables) => {
      const ring = extractOuterRingFromCoordinates(data.cadastralInfo?.polygon?.coordinates)
      if (ring) {
        qc.setQueryData<ProjectSitePolygonResult>(
          projectQueryKeys.sitePolygon(variables.projectId),
          { polygonRing: ring, source: 'api' },
        )
      }
      qc.invalidateQueries({
        queryKey: projectQueryKeys.sitePolygon(variables.projectId),
      })
    },
  })
}

export const useProjectSitePolygon = (projectId: string | null, enabled = true) => {
  return useQuery({
    queryKey: projectQueryKeys.sitePolygon(projectId),
    queryFn: () => projectService.getSitePolygon(projectId ?? ''),
    initialData: (): ProjectSitePolygonResult | undefined => {
      if (!projectId) return undefined
      const cached = getProjectSitePolygonEntry(projectId)
      if (!cached) return undefined

      return {
        polygonRing: cached.polygonRing,
        source: cached.isStale ? 'local_stale' : 'local',
      }
    },
    enabled: enabled && !!projectId,
    staleTime: 60 * 1000,
  })
}

import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectQueryKeys } from '@/features/project/constants/projectQueryKeys'
import { projectService } from '@/features/project/services/project.service'
import { saveProjectSitePolygon } from '@/features/project/utils/projectSiteCache'
import { getProjectSitePolygonEntry } from '@/features/project/utils/projectSiteCache'
import { calculateSiteAreaM2 } from '@/features/project/utils/siteGeometry'
import { extractOuterRingFromCoordinates } from '@/features/project/utils/sitePolygon'
import type { ProjectSitePolygonResult } from '@/features/project/utils/projectSiteFallback'
import type { CreateProjectDto, UpdateProjectDto } from '@/shared/types'

export const useProjects = () => {
  return useInfiniteQuery({
    queryKey: projectQueryKeys.list(),
    queryFn: ({ pageParam }) => projectService.getList(pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.hasNext ? lastPage.page + 1 : undefined,
    retry: false,
  })
}

export const useAllProjects = (enabled: boolean) => {
  return useQuery({
    queryKey: projectQueryKeys.all(),
    queryFn: () => projectService.getAll(),
    enabled,
    staleTime: 60 * 1000,
    retry: false,
  })
}

export const useProject = (id: string) => {
  return useQuery({
    queryKey: projectQueryKeys.detail(id),
    queryFn: () => projectService.getById(id),
    enabled: !!id,
    retry: false,
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
      const sitePolygonQueryKey = projectQueryKeys.sitePolygon(variables.projectId)

      if (ring) {
        saveProjectSitePolygon(variables.projectId, ring, { source: 'api' })
        qc.setQueryData<ProjectSitePolygonResult>(
          sitePolygonQueryKey,
          { polygonRing: ring, areaM2: calculateSiteAreaM2(ring), source: 'api' },
        )
        return
      }

      qc.invalidateQueries({
        queryKey: sitePolygonQueryKey,
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
      // mock 데이터는 initialData로 사용하지 않음 — 실제 대지가 있을 때 가짜 대지가 잠깐 보이는 문제 방지
      if (!cached || cached.source === 'mock') return undefined

      return {
        polygonRing: cached.polygonRing,
        areaM2: calculateSiteAreaM2(cached.polygonRing),
        source: cached.isStale ? 'local_stale' : 'local',
      }
    },
    enabled: enabled && !!projectId,
    staleTime: 60 * 1000,
  })
}

import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectService } from '@/features/project/services/project.service'
import type { CreateProjectDto, UpdateProjectDto } from '@/shared/types'

export const useProjects = () => {
  return useInfiniteQuery({
    queryKey: ['projects'],
    queryFn: ({ pageParam }) => projectService.getList(pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.hasNext ? lastPage.page : undefined,
  })
}

export const useAllProjects = (enabled: boolean) => {
  return useQuery({
    queryKey: ['projects', 'all'],
    queryFn: () => projectService.getAll(),
    enabled,
    staleTime: 60 * 1000,
  })
}

export const useProject = (id: string) => {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: () => projectService.getById(id),
    enabled: !!id,
  })
}

export const useProjectMembers = (projectId: string) => {
  return useQuery({
    queryKey: ['projects', projectId, 'members'],
    queryFn: () => projectService.getMembers(projectId),
    enabled: !!projectId,
  })
}

export const useCreateProject = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateProjectDto) => projectService.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export const useUpdateProject = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProjectDto }) =>
      projectService.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export const useDeleteProject = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => projectService.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export const useRegisterProjectSite = () => {
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
  })
}

export const useInviteToProject = () => {
  return useMutation({
    mutationFn: ({ projectId, email }: { projectId: string; email: string }) =>
      projectService.invite(projectId, email),
  })
}

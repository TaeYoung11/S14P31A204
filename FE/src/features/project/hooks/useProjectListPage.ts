import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/hooks/useAuth'
import {
  useAllProjects,
  useCreateProject,
  useDeleteProject,
  useInviteToProject,
  useProjects,
  useUpdateProject,
} from '@/features/project/hooks/useProjects'
import { useProjectStore } from '@/features/project/stores/projectStore'
import type { Project } from '@/shared/types'

type ViewMode = 'grid' | 'list'
type ProjectFormValues = { name: string; description: string }

const DELETE_CONFIRM_TEXT = '삭제'

/**
 * 사용자 검색어를 정규식으로 변환한다.
 * - 정상 정규식이면 그대로 사용
 * - 특수문자 포함으로 실패하면 escape 후 재시도
 */
function createSearchRegex(search: string): RegExp {
  try {
    return new RegExp(search, 'i')
  } catch {
    return new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
  }
}

/** 선택 목록에 projectId를 토글한다. */
function toggleProjectSelection(projectIds: string[], projectId: string): string[] {
  return projectIds.includes(projectId)
    ? projectIds.filter((id) => id !== projectId)
    : [...projectIds, projectId]
}

/** 기존 선택 목록과 화면 표시 목록을 합쳐 중복 없는 ID 목록을 만든다. */
function mergeUniqueProjectIds(currentIds: string[], visibleIds: string[]): string[] {
  return Array.from(new Set([...currentIds, ...visibleIds]))
}

/**
 * 프로젝트 목록 페이지 비즈니스 훅.
 * 페이지는 이 훅에서 받은 값으로 화면 조립만 수행한다.
 */
export function useProjectListPage() {
  const navigate = useNavigate()
  const setCurrentProject = useProjectStore((state) => state.setCurrentProject)
  const { user, logout, withdraw, withdrawError, isWithdrawing } = useAuth()
  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage } = useProjects()
  const createProject = useCreateProject()
  const updateProject = useUpdateProject()
  const deleteProject = useDeleteProject()
  const inviteToProject = useInviteToProject()

  const [createOpen, setCreateOpen] = useState(false)
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [shareProjects, setShareProjects] = useState<Project[]>([])
  const [deleteProjects, setDeleteProjects] = useState<Project[]>([])
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([])
  const [siteProject, setSiteProject] = useState<Project | null>(null)

  const { data: allData, isLoading: isSearchLoading } = useAllProjects(search.length > 0)
  const sentinelRef = useRef<HTMLDivElement>(null)

  /** 무한 스크롤 감시: sentinel이 보이면 다음 페이지를 요청한다. */
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasNextPage) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { threshold: 0.1 },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  const filteredProjects = useMemo(() => {
    if (search) {
      const regex = createSearchRegex(search)
      return (allData ?? []).filter((project) => regex.test(project.name) || regex.test(project.description))
    }

    return data?.pages.flatMap((page) => page.projects) ?? []
  }, [allData, data, search])

  const selectedProjects = useMemo(
    () => filteredProjects.filter((project) => selectedProjectIds.includes(project.id)),
    [filteredProjects, selectedProjectIds],
  )

  const isDesigner = user?.user_type === 'DESIGNER'

  const toggleSelectionMode = () => {
    setIsSelectionMode((prev) => {
      if (prev) {
        setSelectedProjectIds([])
      }
      return !prev
    })
  }

  const handleToggleProjectSelect = (projectId: string) => {
    setSelectedProjectIds((prev) => toggleProjectSelection(prev, projectId))
  }

  const handleSelectAllVisible = () => {
    const visibleProjectIds = filteredProjects.map((project) => project.id)
    const isAllVisibleSelected =
      visibleProjectIds.length > 0 &&
      visibleProjectIds.every((id) => selectedProjectIds.includes(id))

    if (isAllVisibleSelected) {
      setSelectedProjectIds((prev) => prev.filter((id) => !visibleProjectIds.includes(id)))
      return
    }

    setSelectedProjectIds((prev) => mergeUniqueProjectIds(prev, visibleProjectIds))
  }

  const handleDeleteOpen = (projects: Project[]) => {
    if (projects.length === 0) return
    setDeleteConfirmName('')
    setDeleteProjects(projects)
  }

  const closeDeleteModal = () => {
    setDeleteProjects([])
    setDeleteConfirmName('')
  }

  const handleConfirmDelete = async () => {
    if (deleteProjects.length === 0) return

    await Promise.all(deleteProjects.map((project) => deleteProject.mutateAsync(project.id)))
    closeDeleteModal()
    setSelectedProjectIds([])
    setIsSelectionMode(false)
  }

  const handleBulkShareOpen = () => {
    if (selectedProjects.length === 0) return
    setShareProjects(selectedProjects)
  }

  const handleInvite = async (email: string) => {
    try {
      await Promise.all(
        shareProjects.map((project) =>
          inviteToProject.mutateAsync({ projectId: project.id, email }),
        ),
      )
    } catch (err) {
      console.error('초대 실패:', err)
      throw err
    }
  }

  const handleProjectDelete = (projectId: string) => {
    const targetProject = filteredProjects.find((project) => project.id === projectId)
    if (targetProject) handleDeleteOpen([targetProject])
  }

  const handleCreateSubmit = ({ name, description }: ProjectFormValues) => {
    if (editProject) {
      updateProject.mutate(
        { id: editProject.id, data: { name, description } },
        { onSuccess: () => setEditProject(null) },
      )
      return
    }

    createProject.mutate(
      { name, description },
      {
        onSuccess: (project) => {
          setCreateOpen(false)
          setSiteProject(project)
        },
      },
    )
  }

  const handleCloseSiteModal = () => {
    if (siteProject) {
      setCurrentProject(siteProject)
      navigate(`/projects/${siteProject.id}/editor`)
    }
    setSiteProject(null)
  }

  return {
    createOpen,
    createProject,
    data,
    deleteConfirmName,
    deleteProject,
    deleteProjects,
    editProject,
    filteredProjects,
    handleBulkShareOpen,
    handleConfirmDelete,
    handleCreateSubmit,
    handleDeleteOpen,
    handleInvite,
    handleProjectDelete,
    handleSelectAllVisible,
    handleToggleProjectSelect,
    hasNextPage,
    inviteToProject,
    isCreateModalOpen: createOpen || !!editProject,
    isDeleteModalOpen: deleteProjects.length > 0,
    isDeleteConfirmValid: deleteConfirmName === DELETE_CONFIRM_TEXT,
    isDesigner,
    isFetchingNextPage,
    isLoading,
    isSearchLoading,
    isSelectionMode,
    logout,
    withdraw,
    onCloseCreateModal: () => {
      setCreateOpen(false)
      setEditProject(null)
    },
    onCloseDeleteModal: closeDeleteModal,
    onCloseShareModal: () => setShareProjects([]),
    onCloseSiteModal: handleCloseSiteModal,
    onOpenCreateModal: () => setCreateOpen(true),
    onOpenEditModal: (project: Project) => setEditProject(project),
    onOpenShareModal: (project: Project) => setShareProjects([project]),
    search,
    selectedProjectIds,
    selectedProjects,
    sentinelRef,
    setDeleteConfirmName,
    setSearch,
    setViewMode,
    shareProjects,
    siteProject,
    toggleSelectionMode,
    updateProject,
    userId: user?.id,
    userInitial: user?.name?.[0] ?? 'U',
    userEmail: user?.email,
    userName: user?.name,
    userType: user?.user_type,
    withdrawError,
    isWithdrawing,
    viewMode,
    deleteConfirmText: DELETE_CONFIRM_TEXT,
  }
}

// 프로젝트 목록 화면의 상태와 댓글 알림 동작을 조합하는 페이지 훅입니다.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/hooks/useAuth'
import {
  useAllProjects,
  useCreateProject,
  useDeleteProject,
  useProjects,
  useUpdateProject,
} from '@/features/project/hooks/useProjects'
import { useProjectComments } from '@/features/project/hooks/useProjectComments'
import { useProjectCommentRealtime } from '@/features/project/hooks/useProjectCommentRealtime'
import { useProjectStore } from '@/features/project/stores/projectStore'
import type { Project } from '@/shared/types'
import type { ProjectCommentListItem } from '@/features/project/services/projectComment.service'

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
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false)
  const [isProjectCommentModalOpen, setIsProjectCommentModalOpen] = useState(false)

  const { data: allData, isLoading: isSearchLoading } = useAllProjects(search.length > 0)
  const { data: allProjectsForComments = [], isLoading: areAllProjectsForCommentsLoading } = useAllProjects(true)
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
  const projectCommentsQuery = useProjectComments(allProjectsForComments)
  const projectCommentRealtime = useProjectCommentRealtime(allProjectsForComments)

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

  const handleProjectDelete = (projectId: string) => {
    const targetProject = filteredProjects.find((project) => project.id === projectId)
    if (targetProject) handleDeleteOpen([targetProject])
  }

  const openProjectById = (projectId: string, pinId?: string) => {
    const targetProject =
      allProjectsForComments.find((project) => project.id === projectId) ??
      filteredProjects.find((project) => project.id === projectId)
    if (targetProject) {
      setCurrentProject(targetProject)
    }
    const pinQuery = pinId ? `?mode=2d&pinId=${encodeURIComponent(pinId)}` : ''
    navigate(`/projects/${projectId}/editor${pinQuery}`)
  }

  const handleProjectCommentClick = (comment: ProjectCommentListItem) => {
    setIsProjectCommentModalOpen(false)
    openProjectById(comment.projectId, comment.pinId)
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
    handleProjectCommentClick,
    handleDeleteOpen,
    handleProjectDelete,
    handleSelectAllVisible,
    handleToggleProjectSelect,
    hasNextPage,
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
    isNotificationModalOpen,
    onOpenNotificationModal: () => setIsNotificationModalOpen(true),
    onCloseNotificationModal: () => setIsNotificationModalOpen(false),
    isProjectCommentModalOpen,
    onOpenProjectCommentModal: () => setIsProjectCommentModalOpen(true),
    onCloseProjectCommentModal: () => setIsProjectCommentModalOpen(false),
    onCloseProjectCommentToast: projectCommentRealtime.dismissToast,
    onOpenProjectFromCommentToast: openProjectById,
    projectCommentToast: projectCommentRealtime.toast,
    projectComments: projectCommentsQuery.data ?? [],
    areProjectCommentsLoading: areAllProjectsForCommentsLoading || projectCommentsQuery.isLoading,
  }
}

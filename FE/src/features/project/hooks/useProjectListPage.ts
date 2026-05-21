import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/hooks/useAuth'
import {
  useAllProjects,
  useCreateProject,
  useDeleteProject,
  useProjects,
  useUpdateProject,
} from '@/features/project/hooks/useProjects'
import { useProjectDeleteFlow } from '@/features/project/hooks/useProjectDeleteFlow'
import { useProjectInfiniteScroll } from '@/features/project/hooks/useProjectInfiniteScroll'
import { useProjectListNotifications } from '@/features/project/hooks/useProjectListNotifications'
import { useProjectSelection } from '@/features/project/hooks/useProjectSelection'
import { useProjectSiteCreationFlow } from '@/features/project/hooks/useProjectSiteCreationFlow'
import { useProjectStore } from '@/features/project/stores/projectStore'
import {
  createSearchRegex,
  findProjectById,
} from '@/features/project/utils/projectListHelpers'
import type { Project } from '@/shared/types'

type ViewMode = 'grid' | 'list'
type ProjectFormValues = { name: string; description: string }

const DELETE_CONFIRM_TEXT = '삭제'

/**
 * 프로젝트 목록 페이지의 비즈니스 로직을 담당합니다.
 * 페이지 컴포넌트는 이 훅의 반환값으로 화면 조립만 수행합니다.
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
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

  const { data: allData, isLoading: isSearchLoading } = useAllProjects(search.length > 0)
  const { data: allProjectsForComments = [], isLoading: areAllProjectsForCommentsLoading } = useAllProjects(true)
  const sentinelRef = useProjectInfiniteScroll({ fetchNextPage, hasNextPage, isFetchingNextPage })

  const filteredProjects = useMemo(() => {
    if (search) {
      const regex = createSearchRegex(search)
      return (allData ?? []).filter((project) => regex.test(project.name) || regex.test(project.description))
    }

    return data?.pages.flatMap((page) => page.projects) ?? []
  }, [allData, data, search])

  const projectSelection = useProjectSelection(filteredProjects)
  const projectDeleteFlow = useProjectDeleteFlow({
    deleteProjectById: deleteProject.mutateAsync,
    onDeleteComplete: projectSelection.clearSelection,
    projects: filteredProjects,
  })
  const siteCreationFlow = useProjectSiteCreationFlow({
    deleteProjectById: deleteProject.mutateAsync,
    navigateToEditor: (projectId, query = '') => navigate(`/projects/${projectId}/editor${query}`),
    setCurrentProject,
  })

  const isDesigner = user?.user_type === 'DESIGNER'

  /** 현재 선택된 프로젝트를 공유 모달에 전달합니다. */
  const handleBulkShareOpen = () => {
    if (projectSelection.selectedProjects.length === 0) return
    setShareProjects(projectSelection.selectedProjects)
  }

  /**
   * 프로젝트 편집 화면으로 이동합니다.
   * 댓글 알림에서 진입한 경우 pinId를 쿼리로 전달해 해당 핀을 바로 열 수 있게 합니다.
   */
  const openProjectById = (projectId: string, pinId?: string) => {
    const targetProject = findProjectById(projectId, allProjectsForComments, filteredProjects)
    if (targetProject) {
      setCurrentProject(targetProject)
    }
    const pinQuery = pinId ? `?mode=2d&pinId=${encodeURIComponent(pinId)}` : ''
    navigate(`/projects/${projectId}/editor${pinQuery}`)
  }
  const projectNotifications = useProjectListNotifications({
    allProjectsForComments,
    areAllProjectsForCommentsLoading,
    onOpenProject: openProjectById,
    userType: user?.user_type,
  })

  /**
   * 프로젝트 생성과 수정을 한 진입점에서 처리합니다.
   * 수정 모드는 기본 정보만 갱신하고, 생성 모드는 사이트 정보 입력 모달로 이어집니다.
   */
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
          siteCreationFlow.openSiteModalForProject(project)
        },
      },
    )
  }

  /** 프로젝트 생성/수정 모달 닫기 공통 처리입니다. */
  const handleCloseCreateModal = () => {
    setCreateOpen(false)
    setEditProject(null)
  }

  return {
    createOpen,
    createProject,
    data,
    deleteConfirmName: projectDeleteFlow.deleteConfirmName,
    deleteProject,
    deleteProjects: projectDeleteFlow.deleteProjects,
    editProject,
    filteredProjects,
    handleBulkShareOpen,
    handleConfirmDelete: projectDeleteFlow.handleConfirmDelete,
    handleCreateSubmit,
    handleProjectCommentClick: projectNotifications.handleProjectCommentClick,
    handleDeleteOpen: projectDeleteFlow.handleDeleteOpen,
    handleProjectDelete: projectDeleteFlow.handleProjectDelete,
    handleSelectAllVisible: projectSelection.handleSelectAllVisible,
    handleToggleProjectSelect: projectSelection.handleToggleProjectSelect,
    hasNextPage,
    isCreateModalOpen: createOpen || !!editProject,
    isDeleteModalOpen: projectDeleteFlow.deleteProjects.length > 0,
    isDeleteConfirmValid: projectDeleteFlow.deleteConfirmName === DELETE_CONFIRM_TEXT,
    isDesigner,
    isFetchingNextPage,
    isLoading,
    isSearchLoading,
    isSelectionMode: projectSelection.isSelectionMode,
    logout,
    withdraw,
    onCloseCreateModal: handleCloseCreateModal,
    onCloseDeleteModal: projectDeleteFlow.closeDeleteModal,
    onCloseShareModal: () => setShareProjects([]),
    onCompleteSiteModal: siteCreationFlow.completeSiteModal,
    onCancelSiteModal: siteCreationFlow.cancelSiteModal,
    isCancellingSiteProject: siteCreationFlow.isCancellingSiteProject,
    siteCancelErrorMessage: siteCreationFlow.siteCancelErrorMessage,
    onClearSiteCancelError: siteCreationFlow.clearSiteCancelErrorMessage,
    onOpenCreateModal: () => setCreateOpen(true),
    onOpenEditModal: (project: Project) => setEditProject(project),
    onOpenShareModal: (project: Project) => setShareProjects([project]),
    search,
    selectedProjectIds: projectSelection.selectedProjectIds,
    selectedProjects: projectSelection.selectedProjects,
    sentinelRef,
    setDeleteConfirmName: projectDeleteFlow.setDeleteConfirmName,
    setSearch,
    setViewMode,
    shareProjects,
    siteProject: siteCreationFlow.siteProject,
    toggleSelectionMode: projectSelection.toggleSelectionMode,
    updateProject,
    userId: user?.id,
    userInitial: user?.name?.[0] ?? 'U',
    userEmail: user?.email,
    userName: user?.name,
    userType: user?.user_type,
    withdrawError,
    isWithdrawing,
    invitationNotificationCount: projectNotifications.invitationNotificationCount,
    viewMode,
    deleteConfirmText: DELETE_CONFIRM_TEXT,
    isNotificationModalOpen: projectNotifications.isNotificationModalOpen,
    onOpenNotificationModal: projectNotifications.onOpenNotificationModal,
    onCloseNotificationModal: projectNotifications.onCloseNotificationModal,
    isProjectCommentModalOpen: projectNotifications.isProjectCommentModalOpen,
    onOpenProjectCommentModal: projectNotifications.onOpenProjectCommentModal,
    onCloseProjectCommentModal: projectNotifications.onCloseProjectCommentModal,
    onCloseProjectCommentToast: projectNotifications.onCloseProjectCommentToast,
    onOpenProjectFromCommentToast: openProjectById,
    projectCommentToast: projectNotifications.projectCommentToast,
    projectComments: projectNotifications.projectComments,
    areProjectCommentsLoading: projectNotifications.areProjectCommentsLoading,
  }
}

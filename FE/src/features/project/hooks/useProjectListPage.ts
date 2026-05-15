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
import { useInvitationNotifications } from '@/features/project/hooks/useInvitation'
import { useProjectStore } from '@/features/project/stores/projectStore'
import {
  createSearchRegex,
  findProjectById,
  mergeUniqueProjectIds,
  toggleProjectSelection,
} from '@/features/project/utils/projectListHelpers'
import type { Project } from '@/shared/types'
import type { ProjectCommentListItem } from '@/features/project/services/projectComment.service'

type ViewMode = 'grid' | 'list'
type ProjectFormValues = { name: string; description: string }

const DELETE_CONFIRM_TEXT = '삭제'

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
  const [isCancellingSiteProject, setIsCancellingSiteProject] = useState(false)
  const [siteCancelErrorMessage, setSiteCancelErrorMessage] = useState('')
  const isCancellingSiteProjectRef = useRef(false)
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false)
  const [isProjectCommentModalOpen, setIsProjectCommentModalOpen] = useState(false)

  const { data: allData, isLoading: isSearchLoading } = useAllProjects(search.length > 0)
  const { data: allProjectsForComments = [], isLoading: areAllProjectsForCommentsLoading } = useAllProjects(true)
  const { data: unreadInvitationNotifications = [] } = useInvitationNotifications(false, {
    enabled: user?.user_type === 'CUSTOMER',
  })
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

  /**
   * 프로젝트 카드 선택 모드를 토글한다.
   * - 종료 시에는 선택 ID를 초기화해 다음 진입에 이전 선택이 남지 않게 한다.
   */
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

  /** 화면에 보이는 카드 전체 선택/해제를 처리한다. */
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

  /** 프로젝트 삭제 모달을 연다. */
  const handleDeleteOpen = (projects: Project[]) => {
    if (projects.length === 0) return
    setDeleteConfirmName('')
    setDeleteProjects(projects)
  }

  /** 삭제 확인 모달 상태를 초기화한다. */
  const closeDeleteModal = () => {
    setDeleteProjects([])
    setDeleteConfirmName('')
  }

  /** 삭제 확정된 프로젝트들을 일괄 삭제한다. */
  const handleConfirmDelete = async () => {
    if (deleteProjects.length === 0) return

    await Promise.all(deleteProjects.map((project) => deleteProject.mutateAsync(project.id)))
    closeDeleteModal()
    setSelectedProjectIds([])
    setIsSelectionMode(false)
  }

  /** 현재 선택된 프로젝트를 공유 모달로 전달한다. */
  const handleBulkShareOpen = () => {
    if (selectedProjects.length === 0) return
    setShareProjects(selectedProjects)
  }

  /** 단일 카드 삭제 버튼 클릭 시 삭제 모달을 연다. */
  const handleProjectDelete = (projectId: string) => {
    const targetProject = filteredProjects.find((project) => project.id === projectId)
    if (targetProject) handleDeleteOpen([targetProject])
  }

  /**
   * 프로젝트 편집 화면으로 이동한다.
   * - 댓글 알림을 통해 진입한 경우 pinId를 쿼리로 전달해 해당 핀을 바로 열 수 있다.
   */
  const openProjectById = (projectId: string, pinId?: string) => {
    const targetProject = findProjectById(projectId, allProjectsForComments, filteredProjects)
    if (targetProject) {
      setCurrentProject(targetProject)
    }
    const pinQuery = pinId ? `?mode=2d&pinId=${encodeURIComponent(pinId)}` : ''
    navigate(`/projects/${projectId}/editor${pinQuery}`)
  }

  /** 댓글 알림 클릭 시 알림 모달을 닫고 프로젝트 편집 화면으로 이동한다. */
  const handleProjectCommentClick = (comment: ProjectCommentListItem) => {
    setIsProjectCommentModalOpen(false)
    openProjectById(comment.projectId, comment.pinId)
  }

  /**
   * 프로젝트 생성/수정 제출을 처리한다.
   * - 수정 모드: 프로젝트 기본 정보만 갱신한다.
   * - 생성 모드: 프로젝트 생성 후 대지 입력 모달로 이어간다.
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
          setSiteCancelErrorMessage('')
          setSiteProject(project)
        },
      },
    )
  }

  /** 대지 정보 입력이 완료된 프로젝트를 편집 화면으로 진입시킨다. */
  const handleCompleteSiteModal = () => {
    if (siteProject) {
      setCurrentProject(siteProject)
      navigate(`/projects/${siteProject.id}/editor`)
    }
    setSiteCancelErrorMessage('')
    setSiteProject(null)
  }

  /**
   * 대지 입력 없이 모달을 닫은 경우 생성한 프로젝트를 즉시 삭제한다.
   * - "대지 미입력 시 프로젝트 생성 불가" 정책을 보장하는 핵심 메서드다.
   */
  const handleCancelSiteModal = async () => {
    if (!siteProject || isCancellingSiteProjectRef.current) return
    isCancellingSiteProjectRef.current = true
    setIsCancellingSiteProject(true)
    setSiteCancelErrorMessage('')
    try {
      await deleteProject.mutateAsync(siteProject.id)
      setSiteCancelErrorMessage('')
      setSiteProject(null)
    } catch (error) {
      if (error instanceof Error && error.message.trim().length > 0) {
        setSiteCancelErrorMessage(error.message)
      } else {
        setSiteCancelErrorMessage('프로젝트 생성 취소 처리에 실패했습니다. 다시 시도해주세요.')
      }
    } finally {
      isCancellingSiteProjectRef.current = false
      setIsCancellingSiteProject(false)
    }
  }

  /** 프로젝트 생성/수정 모달 닫기 공통 처리 */
  const handleCloseCreateModal = () => {
    setCreateOpen(false)
    setEditProject(null)
  }

  /** 대지 모달 취소 오류 메시지를 외부 이벤트에서 수동으로 초기화한다. */
  const clearSiteCancelErrorMessage = () => {
    setSiteCancelErrorMessage('')
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
    onCloseCreateModal: handleCloseCreateModal,
    onCloseDeleteModal: closeDeleteModal,
    onCloseShareModal: () => setShareProjects([]),
    onCompleteSiteModal: handleCompleteSiteModal,
    onCancelSiteModal: handleCancelSiteModal,
    isCancellingSiteProject,
    siteCancelErrorMessage,
    onClearSiteCancelError: clearSiteCancelErrorMessage,
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
    invitationNotificationCount: unreadInvitationNotifications.length,
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

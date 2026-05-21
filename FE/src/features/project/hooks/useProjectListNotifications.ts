import { useState } from 'react'
import { useInvitationNotifications } from '@/features/project/hooks/useInvitation'
import { useProjectComments } from '@/features/project/hooks/useProjectComments'
import { useProjectCommentRealtime } from '@/features/project/hooks/useProjectCommentRealtime'
import type { ProjectCommentListItem } from '@/features/project/services/projectComment.service'
import type { Project } from '@/shared/types'

interface UseProjectListNotificationsOptions {
  allProjectsForComments: Project[]
  areAllProjectsForCommentsLoading: boolean
  onOpenProject: (projectId: string, pinId?: string) => void
  userType?: string
}

/** 초대 알림, 댓글 알림, 댓글 토스트 상태를 프로젝트 목록 페이지 밖에서 관리합니다. */
export function useProjectListNotifications({
  allProjectsForComments,
  areAllProjectsForCommentsLoading,
  onOpenProject,
  userType,
}: UseProjectListNotificationsOptions) {
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false)
  const [isProjectCommentModalOpen, setIsProjectCommentModalOpen] = useState(false)
  const { data: unreadInvitationNotifications = [] } = useInvitationNotifications(false, {
    enabled: userType === 'CUSTOMER',
  })
  const projectCommentsQuery = useProjectComments(allProjectsForComments)
  const projectCommentRealtime = useProjectCommentRealtime(allProjectsForComments)

  /** 댓글 알림 클릭 시 모달을 닫고 해당 프로젝트 편집 화면으로 이동합니다. */
  const handleProjectCommentClick = (comment: ProjectCommentListItem) => {
    setIsProjectCommentModalOpen(false)
    onOpenProject(comment.projectId, comment.pinId)
  }

  return {
    areProjectCommentsLoading: areAllProjectsForCommentsLoading || projectCommentsQuery.isLoading,
    handleProjectCommentClick,
    invitationNotificationCount: unreadInvitationNotifications.length,
    isNotificationModalOpen,
    isProjectCommentModalOpen,
    onCloseNotificationModal: () => setIsNotificationModalOpen(false),
    onCloseProjectCommentModal: () => setIsProjectCommentModalOpen(false),
    onCloseProjectCommentToast: projectCommentRealtime.dismissToast,
    onOpenNotificationModal: () => setIsNotificationModalOpen(true),
    onOpenProjectCommentModal: () => setIsProjectCommentModalOpen(true),
    projectCommentToast: projectCommentRealtime.toast,
    projectComments: projectCommentsQuery.data ?? [],
  }
}

import type { ComponentProps } from 'react'
import ProjectCreateModal from '@/features/project/components/ProjectCreateModal'
import ProjectDeleteConfirmModal from '@/features/project/components/ProjectDeleteConfirmModal'
import ProjectCommentNotificationModal from '@/features/project/components/ProjectCommentNotificationModal'
import ProjectCommentToast from '@/features/project/components/ProjectCommentToast'
import ProjectSiteModal from '@/features/project/components/ProjectSiteModal'
import { InviteModal } from '@/shared/components/InviteModal'
import { InviteNotificationModal } from '@/shared/components/InviteNotificationModal'

interface ProjectListModalStackProps {
  createModalProps: ComponentProps<typeof ProjectCreateModal>
  inviteModalProps: ComponentProps<typeof InviteModal>
  deleteConfirmModalProps: ComponentProps<typeof ProjectDeleteConfirmModal>
  inviteNotificationModalProps: ComponentProps<typeof InviteNotificationModal>
  projectCommentNotificationModalProps: ComponentProps<typeof ProjectCommentNotificationModal>
  siteModalProps?: ComponentProps<typeof ProjectSiteModal> | null
  commentToastProps: ComponentProps<typeof ProjectCommentToast>
}

/** 프로젝트 목록 페이지에서 사용하는 모달과 토스트를 한곳에서 조립한다. */
export default function ProjectListModalStack({
  createModalProps,
  inviteModalProps,
  deleteConfirmModalProps,
  inviteNotificationModalProps,
  projectCommentNotificationModalProps,
  siteModalProps,
  commentToastProps,
}: ProjectListModalStackProps) {
  const createModalKey = `${createModalProps.editProject?.id ?? 'create'}-${createModalProps.isOpen ? 'open' : 'closed'}`

  return (
    <>
      <ProjectCreateModal key={createModalKey} {...createModalProps} />
      <InviteModal {...inviteModalProps} />
      <ProjectDeleteConfirmModal {...deleteConfirmModalProps} />
      <InviteNotificationModal {...inviteNotificationModalProps} />
      <ProjectCommentNotificationModal {...projectCommentNotificationModalProps} />
      {siteModalProps && <ProjectSiteModal {...siteModalProps} />}
      <ProjectCommentToast {...commentToastProps} />
    </>
  )
}

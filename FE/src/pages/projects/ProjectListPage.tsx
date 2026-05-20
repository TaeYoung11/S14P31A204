// 프로젝트 메인 목록 화면과 댓글 알림 UI를 렌더링하는 페이지입니다.
import ProjectCardsSection from '@/features/project/components/ProjectCardsSection'
import ProjectCommandCenter from '@/features/project/components/ProjectCommandCenter'
import ProjectEmptyState from '@/features/project/components/ProjectEmptyState'
import ProjectListHeader from '@/features/project/components/ProjectListHeader'
import ProjectListModalStack from '@/features/project/components/ProjectListModalStack'
import ProjectSelectionToolbar from '@/features/project/components/ProjectSelectionToolbar'
import { useProjectListPage } from '@/features/project/hooks/useProjectListPage'
import Spinner from '@/shared/components/Spinner'

export default function ProjectsPage() {
  const { sentinelRef, ...page } = useProjectListPage()

  return (
    <div className="project-shell min-h-screen">
      <ProjectListHeader
        userName={page.userName}
        userEmail={page.userEmail}
        userInitial={page.userInitial}
        userId={page.userId}
        userType={page.userType}
        onLogout={page.logout}
        onWithdraw={(password) => page.withdraw({ password })}
        withdrawError={page.withdrawError ? (page.withdrawError as Error).message : ''}
        isWithdrawing={page.isWithdrawing}
        onNotificationOpen={page.onOpenNotificationModal}
        invitationNotificationCount={page.invitationNotificationCount}
        onCommentNotificationOpen={page.onOpenProjectCommentModal}
        commentNotificationCount={page.projectComments.length}
      />

      <main className="mx-auto max-w-[1120px] px-5 py-7 sm:px-7">
        <ProjectCommandCenter
          projectCount={page.filteredProjects.length}
          search={page.search}
          viewMode={page.viewMode}
          isDesigner={page.isDesigner}
          isSelectionMode={page.isSelectionMode}
          onSearchChange={page.setSearch}
          onViewModeChange={page.setViewMode}
          onToggleSelectionMode={page.toggleSelectionMode}
          onCreateProject={page.onOpenCreateModal}
        />

        {page.isDesigner && page.isSelectionMode && page.filteredProjects.length > 0 && (
          <ProjectSelectionToolbar
            visibleProjects={page.filteredProjects}
            selectedProjects={page.selectedProjects}
            selectedProjectIds={page.selectedProjectIds}
            isDeleting={page.deleteProject.isPending}
            onSelectAllVisible={page.handleSelectAllVisible}
            onBulkShareOpen={page.handleBulkShareOpen}
            onDeleteOpen={page.handleDeleteOpen}
          />
        )}

        {page.isLoading || page.isSearchLoading ? (
          <div className="flex justify-center py-20">
            <Spinner size="lg" />
          </div>
        ) : page.filteredProjects.length === 0 ? (
          <ProjectEmptyState hasSearch={Boolean(page.search)} />
        ) : (
          <ProjectCardsSection
            projects={page.filteredProjects}
            userType={page.isDesigner ? 'DESIGNER' : 'CLIENT'}
            viewMode={page.viewMode}
            isDesigner={page.isDesigner}
            isSelectionMode={page.isSelectionMode}
            selectedProjectIds={page.selectedProjectIds}
            onDelete={page.handleProjectDelete}
            onEdit={page.onOpenEditModal}
            onShare={page.onOpenShareModal}
            onToggleSelect={page.handleToggleProjectSelect}
            onCreateProject={page.onOpenCreateModal}
          />
        )}

        {!page.search && <div ref={sentinelRef} className="h-1" />}
        {!page.search && page.isFetchingNextPage && (
          <div className="flex justify-center py-6">
            <Spinner size="lg" />
          </div>
        )}
      </main>

      <ProjectListModalStack
        createModalProps={{
          isOpen: page.isCreateModalOpen,
          onClose: page.onCloseCreateModal,
          onSubmit: page.handleCreateSubmit,
          isPending: page.createProject.isPending || page.updateProject.isPending,
          editProject: page.editProject,
        }}
        inviteModalProps={{
          isOpen: page.shareProjects.length > 0,
          onClose: page.onCloseShareModal,
          projectIds: page.shareProjects.map((project) => project.id),
        }}
        deleteConfirmModalProps={{
          isOpen: page.isDeleteModalOpen,
          onClose: page.onCloseDeleteModal,
          projects: page.deleteProjects,
          confirmText: page.deleteConfirmText,
          confirmName: page.deleteConfirmName,
          isConfirmValid: page.isDeleteConfirmValid,
          isDeleting: page.deleteProject.isPending,
          onConfirm: page.handleConfirmDelete,
          onConfirmNameChange: page.setDeleteConfirmName,
        }}
        inviteNotificationModalProps={{
          isOpen: page.isNotificationModalOpen,
          onClose: page.onCloseNotificationModal,
        }}
        projectCommentNotificationModalProps={{
          isOpen: page.isProjectCommentModalOpen,
          comments: page.projectComments,
          isLoading: page.areProjectCommentsLoading,
          onClose: page.onCloseProjectCommentModal,
          onCommentClick: page.handleProjectCommentClick,
        }}
        siteModalProps={page.siteProject ? {
          isOpen: true,
          projectId: page.siteProject.id,
          projectName: page.siteProject.name,
          onComplete: page.onCompleteSiteModal,
          onCancel: page.onCancelSiteModal,
          isCancellingProject: page.isCancellingSiteProject,
          cancelErrorMessage: page.siteCancelErrorMessage,
          onClearCancelError: page.onClearSiteCancelError,
        } : null}
        commentToastProps={{
          toast: page.projectCommentToast,
          onClose: page.onCloseProjectCommentToast,
          onOpenProject: page.onOpenProjectFromCommentToast,
        }}
      />
    </div>
  )
}

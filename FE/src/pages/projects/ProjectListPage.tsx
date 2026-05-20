// 프로젝트 메인 목록 화면과 댓글 알림 UI를 렌더링하는 페이지입니다.
import ProjectCreateModal from '@/features/project/components/ProjectCreateModal'
import ProjectCreateTile from '@/features/project/components/ProjectCreateTile'
import ProjectDeleteConfirmModal from '@/features/project/components/ProjectDeleteConfirmModal'
import ProjectCard from '@/features/project/components/ProjectCard'
import ProjectCommentNotificationModal from '@/features/project/components/ProjectCommentNotificationModal'
import ProjectCommentToast from '@/features/project/components/ProjectCommentToast'
import ProjectEmptyState from '@/features/project/components/ProjectEmptyState'
import ProjectListHeader from '@/features/project/components/ProjectListHeader'
import ProjectListCommandCenter from '@/features/project/components/ProjectListCommandCenter'
import ProjectSelectionToolbar from '@/features/project/components/ProjectSelectionToolbar'
import { InviteModal } from '@/shared/components/InviteModal'
import { InviteNotificationModal } from '@/shared/components/InviteNotificationModal'
import ProjectSiteModal from '@/features/project/components/ProjectSiteModal'
import { useProjectListPage } from '@/features/project/hooks/useProjectListPage'
import Spinner from '@/shared/components/Spinner'

export default function ProjectsPage() {
  const {
    createProject,
    deleteConfirmName,
    deleteConfirmText,
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
    isCreateModalOpen,
    isDeleteConfirmValid,
    isDeleteModalOpen,
    isDesigner,
    isFetchingNextPage,
    isLoading,
    isSearchLoading,
    isSelectionMode,
    areProjectCommentsLoading,
    logout,
    withdraw,
    onCloseCreateModal,
    onCloseDeleteModal,
    onCloseShareModal,
    onCompleteSiteModal,
    onCancelSiteModal,
    isCancellingSiteProject,
    siteCancelErrorMessage,
    onClearSiteCancelError,
    isNotificationModalOpen,
    isProjectCommentModalOpen,
    onOpenNotificationModal,
    onCloseNotificationModal,
    onOpenProjectCommentModal,
    onCloseProjectCommentModal,
    onCloseProjectCommentToast,
    onOpenCreateModal,
    onOpenEditModal,
    onOpenShareModal,
    onOpenProjectFromCommentToast,
    projectCommentToast,
    projectComments,
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
    userEmail,
    userInitial,
    userId,
    userName,
    userType,
    withdrawError,
    isWithdrawing,
    invitationNotificationCount,
    viewMode,
  } = useProjectListPage()
  const isAllVisibleSelected =
    filteredProjects.length > 0 && selectedProjects.length === filteredProjects.length

  return (
    <div className="project-shell min-h-screen">
      <ProjectListHeader
        userName={userName}
        userEmail={userEmail}
        userInitial={userInitial}
        userId={userId}
        userType={userType}
        onLogout={logout}
        onWithdraw={(password) => withdraw({ password })}
        withdrawError={withdrawError ? (withdrawError as Error).message : ''}
        isWithdrawing={isWithdrawing}
        onNotificationOpen={onOpenNotificationModal}
        invitationNotificationCount={invitationNotificationCount}
        onCommentNotificationOpen={onOpenProjectCommentModal}
        commentNotificationCount={projectComments.length}
      />

      <main className="mx-auto max-w-[1120px] px-5 py-7 sm:px-7">
        <ProjectListCommandCenter
          filteredProjectCount={filteredProjects.length}
          isDesigner={isDesigner}
          isSelectionMode={isSelectionMode}
          search={search}
          viewMode={viewMode}
          onCreateOpen={onOpenCreateModal}
          onSearchChange={setSearch}
          onSelectionModeToggle={toggleSelectionMode}
          onViewModeChange={setViewMode}
        />

        {isDesigner && isSelectionMode && filteredProjects.length > 0 && (
          <ProjectSelectionToolbar
            isAllVisibleSelected={isAllVisibleSelected}
            isDeleting={deleteProject.isPending}
            selectedCount={selectedProjectIds.length}
            onBulkDelete={() => handleDeleteOpen(selectedProjects)}
            onBulkShare={handleBulkShareOpen}
            onSelectAllVisible={handleSelectAllVisible}
          />
        )}

        {isLoading || isSearchLoading ? (
          <div className="flex justify-center py-20">
            <Spinner size="lg" />
          </div>
        ) : filteredProjects.length === 0 ? (
          <ProjectEmptyState search={search} />
        ) : (
          <div
            className={`grid gap-5 ${
              viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'
            }`}
          >
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                userType={isDesigner ? 'DESIGNER' : 'CLIENT'}
                onDelete={handleProjectDelete}
                onEdit={onOpenEditModal}
                onShare={onOpenShareModal}
                viewMode={viewMode}
                isSelectionMode={isSelectionMode}
                isSelected={selectedProjectIds.includes(project.id)}
                onToggleSelect={handleToggleProjectSelect}
              />
            ))}

            {isDesigner && !isSelectionMode && (
              <ProjectCreateTile onCreateOpen={onOpenCreateModal} />
            )}
          </div>
        )}

        {!search && <div ref={sentinelRef} className="h-1" />}
        {!search && isFetchingNextPage && (
          <div className="flex justify-center py-6">
            <Spinner size="lg" />
          </div>
        )}
      </main>

      <ProjectCreateModal
        key={`${editProject?.id ?? 'create'}-${isCreateModalOpen ? 'open' : 'closed'}`}
        isOpen={isCreateModalOpen}
        onClose={onCloseCreateModal}
        onSubmit={handleCreateSubmit}
        isPending={createProject.isPending || updateProject.isPending}
        editProject={editProject}
      />

      <InviteModal
        isOpen={shareProjects.length > 0}
        onClose={onCloseShareModal}
        projectIds={shareProjects.map((p) => p.id)}
      />

      <ProjectDeleteConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={onCloseDeleteModal}
        projects={deleteProjects}
        confirmText={deleteConfirmText}
        confirmName={deleteConfirmName}
        isConfirmValid={isDeleteConfirmValid}
        isDeleting={deleteProject.isPending}
        onConfirm={handleConfirmDelete}
        onConfirmNameChange={setDeleteConfirmName}
      />

      <InviteNotificationModal
        isOpen={isNotificationModalOpen}
        onClose={onCloseNotificationModal}
      />

      <ProjectCommentNotificationModal
        isOpen={isProjectCommentModalOpen}
        comments={projectComments}
        isLoading={areProjectCommentsLoading}
        onClose={onCloseProjectCommentModal}
        onCommentClick={handleProjectCommentClick}
      />

      {siteProject && (
        <ProjectSiteModal
          isOpen
          projectId={siteProject.id}
          projectName={siteProject.name}
          onComplete={onCompleteSiteModal}
          onCancel={onCancelSiteModal}
          isCancellingProject={isCancellingSiteProject}
          cancelErrorMessage={siteCancelErrorMessage}
          onClearCancelError={onClearSiteCancelError}
        />
      )}

      <ProjectCommentToast
        toast={projectCommentToast}
        onClose={onCloseProjectCommentToast}
        onOpenProject={onOpenProjectFromCommentToast}
      />
    </div>
  )
}

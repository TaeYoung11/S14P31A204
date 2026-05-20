// 프로젝트 메인 목록 화면과 댓글 알림 UI를 렌더링하는 페이지입니다.
import { Plus, FolderOpen, LayoutGrid, List, CheckSquare, Share2, Trash2, X, Search } from 'lucide-react'
import ProjectCreateModal from '@/features/project/components/ProjectCreateModal'
import ProjectDeleteConfirmModal from '@/features/project/components/ProjectDeleteConfirmModal'
import ProjectCard from '@/features/project/components/ProjectCard'
import ProjectCommentNotificationModal from '@/features/project/components/ProjectCommentNotificationModal'
import ProjectCommentToast from '@/features/project/components/ProjectCommentToast'
import ProjectListHeader from '@/features/project/components/ProjectListHeader'
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
        <section className="project-command-center mb-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="project-muted">Projects</p>
              <div className="mt-1 flex items-end gap-3">
                <h1 className="text-2xl font-black tracking-tight text-[#0f172a]">내 프로젝트</h1>
                <span className="pb-1 text-xs font-black text-[#94a3b8]">{filteredProjects.length}개</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="project-search-box">
                <Search className="pointer-events-none h-4 w-4 text-[#94a3b8]" />
                <input
                  id="project-search"
                  type="text"
                  className="project-search-input"
                  placeholder="프로젝트 이름 또는 설명으로 검색"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="project-view-switch">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`project-view-button ${viewMode === 'grid' ? 'is-active' : ''}`}
                  title="그리드 보기"
                  aria-label="그리드 보기"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`project-view-button ${viewMode === 'list' ? 'is-active' : ''}`}
                  title="목록 보기"
                  aria-label="목록 보기"
                >
                  <List className="h-4 w-4" />
                </button>
              </div>

              {isDesigner && (
                <button
                  type="button"
                  className={`project-icon-button h-11 w-11 ${
                    isSelectionMode
                      ? 'border-[#111827] bg-[#111827] text-white hover:border-[#1f2937] hover:bg-[#1f2937] hover:text-white'
                      : ''
                  }`}
                  onClick={toggleSelectionMode}
                  title={isSelectionMode ? '선택 모드 종료' : '선택 모드'}
                  aria-label={isSelectionMode ? '선택 모드 종료' : '선택 모드'}
                >
                  {isSelectionMode ? <X className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
                </button>
              )}

              {isDesigner && (
                <button
                  id="create-project-btn"
                  className="project-primary-button h-11 px-5"
                  onClick={onOpenCreateModal}
                  disabled={isSelectionMode}
                >
                  <Plus className="h-4 w-4" />
                  새 프로젝트
                </button>
              )}
            </div>
          </div>
        </section>

        {isDesigner && isSelectionMode && filteredProjects.length > 0 && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#c7d2fe] bg-[#eef2ff]/80 px-4 py-3 shadow-[0_10px_30px_rgba(79,70,229,0.08)]">
            <p className="text-sm font-black text-[#312e81]">{selectedProjectIds.length}개 선택됨</p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="project-secondary-button"
                onClick={handleSelectAllVisible}
                title={selectedProjects.length === filteredProjects.length ? '전체 해제' : '전체 선택'}
                aria-label={selectedProjects.length === filteredProjects.length ? '전체 해제' : '전체 선택'}
              >
                {selectedProjects.length === filteredProjects.length ? '전체 해제' : '전체 선택'}
              </button>
              <button
                type="button"
                className="project-secondary-button h-12 w-12 px-0"
                disabled={selectedProjectIds.length === 0}
                onClick={handleBulkShareOpen}
                title="선택 프로젝트 공유"
                aria-label="선택 프로젝트 공유"
              >
                <Share2 className="h-6 w-6" strokeWidth={2.6} />
              </button>
              <button
                type="button"
                className="project-danger-button h-12 w-12 px-0"
                disabled={selectedProjectIds.length === 0 || deleteProject.isPending}
                onClick={() => handleDeleteOpen(selectedProjects)}
                title={selectedProjectIds.length === 1 ? '선택 프로젝트 삭제' : '선택 항목 삭제'}
                aria-label={selectedProjectIds.length === 1 ? '선택 프로젝트 삭제' : '선택 항목 삭제'}
              >
                <Trash2 className="h-6 w-6" strokeWidth={2.6} />
              </button>
            </div>
          </div>
        )}

        {isLoading || isSearchLoading ? (
          <div className="flex justify-center py-20">
            <Spinner size="lg" />
          </div>
        ) : filteredProjects.length === 0 ? (
          <section className="project-empty-panel">
            <div className="project-empty-visual">
              <FolderOpen className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-black text-[#111827]">
                {search ? '검색 결과가 없습니다' : '첫 프로젝트를 시작해 보세요'}
              </h2>
              <p className="mt-1 text-sm font-medium text-[#64748b]">
                {search ? '입력한 검색어와 일치하는 프로젝트가 없습니다.' : '프로젝트를 만들면 이곳에서 바로 확인하고 관리할 수 있습니다.'}
              </p>
            </div>
          </section>
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
                enableRenderedThumbnail
              />
            ))}

            {isDesigner && !isSelectionMode && (
              <button
                onClick={onOpenCreateModal}
                className="group flex min-h-[240px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[#c7d2fe] bg-white/85 transition-colors hover:border-[#4f46e5] hover:bg-[#f8faff]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#dbeafe] bg-[#eff6ff] transition-colors group-hover:border-[#4f46e5]">
                  <Plus className="h-5 w-5 text-[#9ca3af] transition-colors group-hover:text-[#4f46e5]" />
                </div>
                <span className="text-sm font-medium text-[#6b7280] transition-colors group-hover:text-[#4f46e5]">
                  새 프로젝트 만들기
                </span>
              </button>
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

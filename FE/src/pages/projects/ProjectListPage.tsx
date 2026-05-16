// 프로젝트 메인 목록 화면과 댓글 알림 UI를 렌더링하는 페이지입니다.
import { Plus, FolderOpen, LayoutGrid, List, Search, CheckSquare, Share2, Trash2, X } from 'lucide-react'
import ProjectCreateModal from '@/features/project/components/ProjectCreateModal'
import ProjectCard from '@/features/project/components/ProjectCard'
import ProjectCommentNotificationModal from '@/features/project/components/ProjectCommentNotificationModal'
import ProjectCommentToast from '@/features/project/components/ProjectCommentToast'
import ProjectListHeader from '@/features/project/components/ProjectListHeader'
import { InviteModal } from '@/shared/components/InviteModal'
import { InviteNotificationModal } from '@/shared/components/InviteNotificationModal'
import ProjectSiteModal from '@/features/project/components/ProjectSiteModal'
import { useProjectListPage } from '@/features/project/hooks/useProjectListPage'
import EmptyState from '@/shared/components/EmptyState'
import Modal from '@/shared/components/Modal'
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
    onCloseSiteModal,
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
    <div className="min-h-screen bg-[#fafafa]">
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

      <main className="mx-auto max-w-[1200px] px-8 py-8">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-[#111827]">프로젝트</h1>
          {isDesigner && (
            <button
              id="create-project-btn"
              className="flex items-center gap-2 rounded-lg bg-[#4f46e5] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#4338ca]"
              onClick={onOpenCreateModal}
              disabled={isSelectionMode}
            >
              <Plus className="h-4 w-4" />
              새 프로젝트 생성
            </button>
          )}
        </div>

        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#111827]">내 프로젝트</h2>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
              <input
                id="project-search"
                type="text"
                className="w-[260px] rounded-lg border border-transparent bg-[#f3f4f6] py-2 pl-9 pr-4 text-sm text-[#111827] placeholder-[#9ca3af] transition-all focus:border-[#e5e7eb] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2563eb]/10"
                placeholder="프로젝트 이름 또는 설명 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-1 rounded-lg bg-[#f3f4f6] p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  viewMode === 'grid'
                    ? 'bg-white text-[#111827] shadow-sm'
                    : 'text-[#6b7280] hover:text-[#374151]'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  viewMode === 'list'
                    ? 'bg-white text-[#111827] shadow-sm'
                    : 'text-[#6b7280] hover:text-[#374151]'
                }`}
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>

            {isDesigner && (
              <button
                type="button"
                className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                  isSelectionMode
                    ? 'bg-[#111827] text-white hover:bg-[#1f2937]'
                    : 'border border-[#e5e7eb] bg-white text-[#374151] hover:bg-[#f9fafb]'
                }`}
                onClick={toggleSelectionMode}
                title={isSelectionMode ? '선택 모드 종료' : '선택 모드'}
                aria-label={isSelectionMode ? '선택 모드 종료' : '선택 모드'}
              >
                {isSelectionMode ? <X className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>

        {isDesigner && isSelectionMode && filteredProjects.length > 0 && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dbeafe] bg-[#f8fbff] px-4 py-3">
            <p className="text-sm font-semibold text-[#111827]">{selectedProjectIds.length}개 선택됨</p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn-secondary flex h-11 items-center justify-center px-4"
                onClick={handleSelectAllVisible}
                title={selectedProjects.length === filteredProjects.length ? '전체 해제' : '전체 선택'}
                aria-label={selectedProjects.length === filteredProjects.length ? '전체 해제' : '전체 선택'}
              >
                {selectedProjects.length === filteredProjects.length ? '전체 해제' : '전체 선택'}
              </button>
              <button
                type="button"
                className="btn-secondary flex h-11 w-11 items-center justify-center px-0"
                disabled={selectedProjectIds.length === 0}
                onClick={handleBulkShareOpen}
                title="선택 프로젝트 공유"
                aria-label="선택 프로젝트 공유"
              >
                <Share2 className="h-7 w-7" />
              </button>
              <button
                type="button"
                className="btn-danger flex h-11 w-11 items-center justify-center px-0"
                disabled={selectedProjectIds.length === 0 || deleteProject.isPending}
                onClick={() => handleDeleteOpen(selectedProjects)}
                title={selectedProjectIds.length === 1 ? '선택 프로젝트 삭제' : '선택 항목 삭제'}
                aria-label={selectedProjectIds.length === 1 ? '선택 프로젝트 삭제' : '선택 항목 삭제'}
              >
                <Trash2 className="h-7 w-7" />
              </button>
            </div>
          </div>
        )}

        {isLoading || isSearchLoading ? (
          <div className="flex justify-center py-20">
            <Spinner size="lg" />
          </div>
        ) : filteredProjects.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title={search ? '검색 결과가 없습니다' : '프로젝트가 없습니다'}
            description={
              search
                ? '다른 검색어로 다시 시도해보세요.'
                : '새 프로젝트를 생성해서 작업을 시작해보세요.'
            }
            action={isDesigner && !search ? { label: '새 프로젝트 만들기', onClick: onOpenCreateModal } : undefined}
          />
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
              <button
                onClick={onOpenCreateModal}
                className="group flex min-h-[280px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[#e5e7eb] bg-white transition-all duration-300 hover:border-[#4f46e5] hover:bg-[#faf5ff]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#e5e7eb] transition-colors group-hover:border-[#4f46e5]">
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

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={onCloseDeleteModal}
        title={deleteProjects.length > 1 ? '프로젝트 삭제 확인' : '프로젝트 삭제'}
        maxWidth="max-w-[440px]"
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm text-[#374151]">
              {deleteProjects.length > 1
                ? `선택한 ${deleteProjects.length}개 프로젝트를 삭제하시겠습니까?`
                : '이 프로젝트를 삭제하시겠습니까?'}
            </p>
            <p className="text-xs text-[#9ca3af]">삭제 후에는 되돌릴 수 없습니다.</p>
          </div>

          <div className="rounded-lg bg-[#f8f9fa] px-3 py-3">
            {deleteProjects.length > 1 ? (
              <div className="space-y-1.5">
                {deleteProjects.slice(0, 5).map((project) => (
                  <p key={project.id} className="truncate text-sm font-medium text-[#111827]">
                    {project.name}
                  </p>
                ))}
                {deleteProjects.length > 5 && (
                  <p className="text-xs text-[#6b7280]">외 {deleteProjects.length - 5}개</p>
                )}
              </div>
            ) : (
              <p className="text-sm font-medium text-[#111827]">{deleteProjects[0]?.name}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="delete-project-confirm" className="block text-xs font-medium text-[#374151]">
              삭제를 진행하려면 <span className="font-semibold text-[#dc2626]">{deleteConfirmText}</span> 를 입력하세요.
            </label>
            <input
              id="delete-project-confirm"
              type="text"
              className="input-base w-full"
              placeholder={deleteConfirmText}
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={onCloseDeleteModal}
              disabled={deleteProject.isPending}
            >
              취소
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={handleConfirmDelete}
              disabled={deleteProject.isPending || !isDeleteConfirmValid}
            >
              {deleteProject.isPending ? '삭제 중...' : '삭제'}
            </button>
          </div>
        </div>
      </Modal>

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

      <ProjectSiteModal
        isOpen={!!siteProject}
        projectId={siteProject?.id ?? null}
        projectName={siteProject?.name}
        onClose={onCloseSiteModal}
      />

      <ProjectCommentToast
        toast={projectCommentToast}
        onClose={onCloseProjectCommentToast}
        onOpenProject={onOpenProjectFromCommentToast}
      />
    </div>
  )
}

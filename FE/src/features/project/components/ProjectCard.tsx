import { useState } from 'react'
import { Check, MoreHorizontal, Box, Trash2, Pencil, UserPlus } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Project } from '@/shared/types'
import type { UserType } from '@/shared/types'

interface ProjectCardProps {
  project: Project
  userType: UserType
  onDelete: (id: string) => void
  onEdit: (project: Project) => void
  onShare: (project: Project) => void
  viewMode?: 'grid' | 'list'
  isSelectionMode?: boolean
  isSelected?: boolean
  onToggleSelect?: (projectId: string) => void
}

function getProjectMetaText(project: Project) {
  return `최종수정일 ${new Date(project.updated_at).toLocaleDateString('ko-KR')}`
}

export default function ProjectCard({
  project,
  userType,
  onDelete,
  onEdit,
  onShare,
  viewMode = 'grid',
  isSelectionMode = false,
  isSelected = false,
  onToggleSelect,
}: ProjectCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const isDesigner = userType === 'DESIGNER'
  const isListView = viewMode === 'list'

  const handleToggleSelect = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onToggleSelect?.(project.id)
  }

  return (
    <div
      className={`group relative cursor-pointer rounded-xl border bg-white transition-all duration-300 hover:shadow-lg ${
        isSelected ? 'border-[#2563eb]' : 'border-[#e5e7eb]'
      }`}
      onClick={
        isSelectionMode
          ? () => {
              onToggleSelect?.(project.id)
            }
          : undefined
      }
    >
      {isSelected && (
        <div className="pointer-events-none absolute inset-0 z-10 rounded-xl ring-2 ring-[#93c5fd]" />
      )}
      {!isListView && (
        <Link to={`/projects/${project.id}`} className={`block ${isSelectionMode ? 'pointer-events-none' : ''}`}>
          <div className="relative h-44 overflow-hidden bg-gradient-to-br from-[#f1f3f5] to-[#e5e7eb]">
            {project.thumbnail_url ? (
              <img
                src={project.thumbnail_url}
                alt={project.name}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#f8f9fa] to-[#e5e7eb]">
                <Box className="h-12 w-12 text-[#d1d5db]" />
              </div>
            )}

            {isSelectionMode ? (
              <button
                type="button"
                className={`absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
                  isSelected
                    ? 'border-[#2563eb] bg-[#2563eb] text-white'
                    : 'border-white/80 bg-white/90 text-transparent backdrop-blur-sm hover:border-[#2563eb] hover:text-[#2563eb]'
                }`}
                onClick={handleToggleSelect}
                title={isSelected ? '선택 해제' : '선택'}
              >
                <Check className="h-4 w-4" />
              </button>
            ) : (
              isDesigner && (
                <button
                  className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 opacity-0 shadow-sm backdrop-blur-sm transition-opacity duration-200 hover:bg-white group-hover:opacity-100"
                  onClick={(e) => {
                    e.preventDefault()
                    onEdit(project)
                  }}
                  title="수정"
                >
                  <Pencil className="h-3.5 w-3.5 text-[#374151]" />
                </button>
              )
            )}
          </div>
        </Link>
      )}

      <div className="p-4">
        <div className="mb-1 flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {isListView && isSelectionMode && (
              <button
                type="button"
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  isSelected
                    ? 'border-[#2563eb] bg-[#2563eb] text-white'
                    : 'border-[#cbd5e1] bg-white text-transparent hover:border-[#2563eb] hover:text-[#2563eb]'
                }`}
                onClick={handleToggleSelect}
                title={isSelected ? '선택 해제' : '선택'}
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            )}

            <Link to={`/projects/${project.id}`} className={`min-w-0 flex-1 ${isSelectionMode ? 'pointer-events-none' : ''}`}>
              <h3 className="truncate text-sm font-bold text-[#111827] transition-colors group-hover:text-[#4f46e5]">
                {project.name}
              </h3>
            </Link>
          </div>

          {isListView && isDesigner && !isSelectionMode && (
            <button
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f8fafc] text-[#374151] transition-colors hover:bg-[#eef2ff] hover:text-[#4f46e5]"
              onClick={(e) => {
                e.preventDefault()
                onEdit(project)
              }}
              title="수정"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <p className={`mb-3 text-xs text-[#6b7280] ${isListView ? 'line-clamp-2' : 'truncate'}`}>{project.description}</p>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center -space-x-1.5">
            {Array.from({ length: Math.min(project.member_count, 3) }).map((_, i) => (
              <div
                key={i}
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#e5e7eb]"
              >
                <span className="text-[10px] font-medium text-[#6b7280]">
                  {String.fromCharCode(65 + i)}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {project.unread_comment_count > 0 && (
              <span className="rounded-full bg-[#eef2ff] px-2 py-1 text-[11px] font-semibold text-[#4f46e5]">
                댓글 {project.unread_comment_count}
              </span>
            )}
            <span className="text-xs text-[#9ca3af]">
              {getProjectMetaText(project)}
            </span>

            {isDesigner && !isSelectionMode && (
              <div className="relative shrink-0">
                <button
                  id={`project-menu-${project.id}`}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-[#9ca3af] transition-all hover:bg-[#f3f4f6] hover:text-[#374151]"
                  onClick={(e) => {
                    e.preventDefault()
                    setMenuOpen(!menuOpen)
                  }}
                  title="더보기"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-8 z-10 w-44 rounded-lg border border-[#e5e7eb] bg-white py-1 shadow-[0_4px_12px_rgba(0,0,0,0.1)]">
                    <button
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[#374151] hover:bg-[#f3f4f6]"
                      onClick={() => {
                        onShare(project)
                        setMenuOpen(false)
                      }}
                    >
                      <UserPlus className="h-4 w-4" /> 공유 초대
                    </button>
                    <button
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[#dc2626] hover:bg-[#fef2f2]"
                      onClick={() => {
                        onDelete(project.id)
                        setMenuOpen(false)
                      }}
                    >
                      <Trash2 className="h-4 w-4" /> 삭제
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

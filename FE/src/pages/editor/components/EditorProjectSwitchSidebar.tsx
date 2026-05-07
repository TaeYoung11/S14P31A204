import { useEffect, useRef } from 'react'
import { FolderOpen, Search, X } from 'lucide-react'
import ProjectCard from '@/features/project/components/ProjectCard'
import Spinner from '@/shared/components/Spinner'
import type { Project } from '@/shared/types'

const TEXT_TITLE = '프로젝트 목록'
const TEXT_DESCRIPTION = '작업할 프로젝트를 선택하세요'
const TEXT_CLOSE = '닫기'
const TEXT_CLOSE_ARIA = '프로젝트 목록 닫기'
const TEXT_SEARCH_PLACEHOLDER = '프로젝트 검색'
const TEXT_EMPTY_TITLE = '프로젝트가 없습니다.'
const TEXT_EMPTY_DESCRIPTION = '검색어를 바꾸거나 프로젝트 목록을 확인해 주세요.'

interface EditorProjectSwitchSidebarProps {
  isOpen: boolean
  projects: Project[]
  search: string
  isLoading: boolean
  onSearchChange: (search: string) => void
  onProjectSelect: (project: Project) => void
  onClose: () => void
}

export default function EditorProjectSwitchSidebar({
  isOpen,
  projects,
  search,
  isLoading,
  onSearchChange,
  onProjectSelect,
  onClose,
}: EditorProjectSwitchSidebarProps) {
  const searchInputRef = useRef<HTMLInputElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (!isOpen) {
      if (wasOpenRef.current) {
        previousFocusRef.current?.focus()
      }
      wasOpenRef.current = false
      return
    }

    wasOpenRef.current = true
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null

    window.setTimeout(() => {
      searchInputRef.current?.focus()
    }, 0)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-[#111827]/30 backdrop-blur-[1px] transition-opacity ${isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
          }`}
        onClick={onClose}
      />
      <aside
        className={`fixed left-0 top-0 z-[80] flex h-screen w-[390px] max-w-[calc(100vw-24px)] flex-col border-r border-[#e5e7eb] bg-[#f8fafc] shadow-[18px_0_48px_rgba(15,23,42,0.18)] transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        aria-hidden={!isOpen}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#e5e7eb] bg-white px-5">
          <div>
            <h2 className="text-sm font-bold text-[#111827]">{TEXT_TITLE}</h2>
            <p className="text-xs text-[#6b7280]">{TEXT_DESCRIPTION}</p>
          </div>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#111827]"
            onClick={onClose}
            title={TEXT_CLOSE}
            aria-label={TEXT_CLOSE_ARIA}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-[#e5e7eb] bg-white px-5 py-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
            <input
              ref={searchInputRef}
              type="text"
              className="w-full rounded-lg border border-[#e5e7eb] bg-[#f9fafb] py-2.5 pl-9 pr-4 text-sm text-[#111827] placeholder-[#9ca3af] transition-all focus:border-[#4f46e5] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/10"
              placeholder={TEXT_SEARCH_PLACEHOLDER}
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Spinner size="lg" />
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#d1d5db] bg-white px-6 py-14 text-center">
              <FolderOpen className="mb-3 h-9 w-9 text-[#cbd5e1]" />
              <p className="text-sm font-semibold text-[#111827]">{TEXT_EMPTY_TITLE}</p>
              <p className="mt-1 text-xs text-[#6b7280]">{TEXT_EMPTY_DESCRIPTION}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {projects.map((project) => (
                <div key={project.id} onClick={() => onProjectSelect(project)}>
                  <ProjectCard
                    project={project}
                    userType="CLIENT"
                    onDelete={() => undefined}
                    onEdit={() => undefined}
                    onShare={() => undefined}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  )
}

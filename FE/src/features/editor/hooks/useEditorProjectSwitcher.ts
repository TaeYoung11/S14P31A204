// 에디터 프로젝트 전환 사이드바의 검색과 열림 상태를 관리하는 훅입니다.
import { useCallback, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAllProjects } from '@/features/project/hooks/useProjects'
import { useProjectStore } from '@/features/project/stores/projectStore'
import { buildProjectEditorPath } from '@/features/project/utils/projectEditorModeCache'
import type { Project } from '@/shared/types'

export function useEditorProjectSwitcher() {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const setCurrentProject = useProjectStore((state) => state.setCurrentProject)
  const { data: allProjects = [], isLoading } = useAllProjects(isOpen)

  const projects = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    if (!normalizedSearch) return allProjects

    return allProjects.filter((project) => {
      const name = project.name.toLowerCase()
      const description = project.description.toLowerCase()
      return name.includes(normalizedSearch) || description.includes(normalizedSearch)
    })
  }, [allProjects, search])
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const selectProject = useCallback((project: Project) => {
    setCurrentProject(project)
    setIsOpen(false)
    const pinId = searchParams.get('pinId')
    navigate(pinId ? `/projects/${project.id}/editor?mode=2d&pinId=${encodeURIComponent(pinId)}` : buildProjectEditorPath(project.id))
  }, [navigate, searchParams, setCurrentProject])

  return {
    isOpen,
    projects,
    search,
    isLoading,
    open,
    close,
    selectProject,
    setSearch,
  }
}

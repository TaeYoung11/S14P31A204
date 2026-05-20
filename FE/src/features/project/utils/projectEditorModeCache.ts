import type { EditorMode } from '@/features/editor/types'

const STORAGE_KEY = 'batang:project-editor-last-mode:v1'
const EDITOR_MODES: EditorMode[] = ['bubble', '2d', '3d', 'view']

type ProjectEditorModeCache = Record<string, EditorMode>

const isEditorMode = (value: unknown): value is EditorMode =>
  typeof value === 'string' && EDITOR_MODES.includes(value as EditorMode)

const canUseStorage = (): boolean => typeof window !== 'undefined' && Boolean(window.localStorage)

const readCache = (): ProjectEditorModeCache => {
  if (!canUseStorage()) return {}

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}

    return Object.entries(parsed as Record<string, unknown>).reduce<ProjectEditorModeCache>((acc, [projectId, mode]) => {
      if (isEditorMode(mode)) acc[projectId] = mode
      return acc
    }, {})
  } catch {
    return {}
  }
}

const writeCache = (cache: ProjectEditorModeCache): void => {
  if (!canUseStorage()) return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {
    // 마지막 모드 캐시는 보조 상태이므로 저장 실패 시 기존 라우팅 동작을 유지한다.
  }
}

export function readProjectEditorMode(projectId: string | null | undefined): EditorMode | null {
  if (!projectId) return null
  return readCache()[projectId] ?? null
}

export function saveProjectEditorMode(projectId: string | null | undefined, mode: EditorMode): void {
  if (!projectId) return
  const cache = readCache()
  cache[projectId] = mode
  writeCache(cache)
}

export function resolveProjectEditorMode(projectId: string | null | undefined, fallback: EditorMode = 'bubble'): EditorMode {
  return readProjectEditorMode(projectId) ?? fallback
}

export function buildProjectEditorPath(projectId: string, mode?: EditorMode | null): string {
  const resolvedMode = mode ?? resolveProjectEditorMode(projectId)
  return `/projects/${projectId}/editor?mode=${encodeURIComponent(resolvedMode)}`
}

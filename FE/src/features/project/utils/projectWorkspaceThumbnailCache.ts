import type { EditorMode } from '@/features/editor/types'

type WorkspaceThumbnailMode = Exclude<EditorMode, 'view'>

interface ProjectWorkspaceThumbnailCacheEntry {
  mode: WorkspaceThumbnailMode
  imageUrl: string
  updatedAt: string
}

type ProjectWorkspaceThumbnailCacheProject = Partial<Record<WorkspaceThumbnailMode, ProjectWorkspaceThumbnailCacheEntry>>
type ProjectWorkspaceThumbnailCache = Record<string, ProjectWorkspaceThumbnailCacheProject>

const STORAGE_KEY = 'batang:project-workspace-thumbnails:v9'
const MAX_CACHE_ENTRIES = 20

const canUseStorage = (): boolean => typeof window !== 'undefined' && Boolean(window.localStorage)

const isWorkspaceThumbnailMode = (value: unknown): value is WorkspaceThumbnailMode =>
  value === 'bubble' || value === '2d' || value === '3d'

const isDisplayableImageUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') return false
  const normalized = value.trim()
  return normalized.startsWith('data:image/') || normalized.startsWith('http://') || normalized.startsWith('https://')
}

const normalizeCacheEntry = (
  entry: Partial<ProjectWorkspaceThumbnailCacheEntry> | null | undefined,
): ProjectWorkspaceThumbnailCacheEntry | null => {
  if (!isWorkspaceThumbnailMode(entry?.mode) || !isDisplayableImageUrl(entry?.imageUrl)) return null
  return {
    mode: entry.mode,
    imageUrl: entry.imageUrl.trim(),
    updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : '',
  }
}

const readCache = (): ProjectWorkspaceThumbnailCache => {
  if (!canUseStorage()) return {}

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}

    return Object.entries(parsed as Record<string, unknown>).reduce<ProjectWorkspaceThumbnailCache>(
      (acc, [projectId, value]) => {
        if (!value || typeof value !== 'object') return acc

        const legacyEntry = normalizeCacheEntry(value as Partial<ProjectWorkspaceThumbnailCacheEntry>)
        if (legacyEntry) {
          acc[projectId] = { [legacyEntry.mode]: legacyEntry }
          return acc
        }

        const entries = Object.entries(value as Record<string, Partial<ProjectWorkspaceThumbnailCacheEntry>>)
          .reduce<ProjectWorkspaceThumbnailCacheProject>((projectAcc, [mode, entry]) => {
            if (!isWorkspaceThumbnailMode(mode)) return projectAcc
            const normalized = normalizeCacheEntry({ ...entry, mode })
            if (normalized) projectAcc[mode] = normalized
            return projectAcc
          }, {})
        if (Object.keys(entries).length > 0) acc[projectId] = entries
        return acc
      },
      {},
    )
  } catch {
    return {}
  }
}

const pruneCache = (cache: ProjectWorkspaceThumbnailCache): ProjectWorkspaceThumbnailCache => {
  const entries = Object.entries(cache)
  if (entries.length <= MAX_CACHE_ENTRIES) return cache

  return Object.fromEntries(
    entries
      .sort(([, a], [, b]) => {
        const latestA = Math.max(...Object.values(a).map((entry) => Date.parse(entry?.updatedAt ?? '') || 0))
        const latestB = Math.max(...Object.values(b).map((entry) => Date.parse(entry?.updatedAt ?? '') || 0))
        return latestB - latestA
      })
      .slice(0, MAX_CACHE_ENTRIES),
  )
}

const writeCache = (cache: ProjectWorkspaceThumbnailCache): void => {
  if (!canUseStorage()) return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pruneCache(cache)))
  } catch {
    // 캔버스 캡처는 보조 캐시이므로 저장 실패 시 기존 썸네일/fallback 흐름을 유지한다.
  }
}

export function readProjectWorkspaceThumbnailUrl(
  projectId: string | null | undefined,
  mode?: EditorMode | null,
): string | null {
  if (!projectId) return null
  const projectCache = readCache()[projectId]
  if (!projectCache) return null
  if (mode) {
    if (!isWorkspaceThumbnailMode(mode)) return null
    return projectCache[mode]?.imageUrl ?? null
  }

  const latestEntry = Object.values(projectCache)
    .filter((entry): entry is ProjectWorkspaceThumbnailCacheEntry => Boolean(entry))
    .sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0))[0]
  return latestEntry?.imageUrl ?? null
}

export function saveProjectWorkspaceThumbnailUrl(
  projectId: string | null | undefined,
  mode: EditorMode,
  imageUrl: string | null | undefined,
): void {
  if (!projectId || !isWorkspaceThumbnailMode(mode) || !isDisplayableImageUrl(imageUrl)) return

  const cache = readCache()
  cache[projectId] = {
    ...cache[projectId],
    [mode]: {
      mode,
      imageUrl: imageUrl.trim(),
      updatedAt: new Date().toISOString(),
    },
  }
  writeCache(cache)
}

interface ProjectRenderThumbnailCacheEntry {
  imageUrl: string
  renderId?: string
  updatedAt: string
}

type ProjectRenderThumbnailCache = Record<string, ProjectRenderThumbnailCacheEntry>

const STORAGE_KEY = 'batang:project-render-thumbnails:v1'

const isBrowser = (): boolean => typeof window !== 'undefined' && Boolean(window.localStorage)

const normalizeDisplayableUrl = (value: string | null | undefined): string | null => {
  const normalized = value?.trim()
  if (!normalized || normalized.startsWith('s3://')) return null
  return normalized
}

const readCache = (): ProjectRenderThumbnailCache => {
  if (!isBrowser()) return {}

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as ProjectRenderThumbnailCache : {}
  } catch {
    return {}
  }
}

const writeCache = (cache: ProjectRenderThumbnailCache): void => {
  if (!isBrowser()) return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {
    // localStorage 용량/권한 문제는 썸네일 보조 캐시만 포기하고 기존 API 흐름을 유지한다.
  }
}

export function readCachedProjectRenderThumbnailUrl(projectId: string): string | null {
  if (!projectId) return null
  return normalizeDisplayableUrl(readCache()[projectId]?.imageUrl)
}

export function saveProjectRenderThumbnailUrl(
  projectId: string,
  imageUrl: string | null | undefined,
  renderId?: string | null,
): void {
  const normalizedUrl = normalizeDisplayableUrl(imageUrl)
  if (!projectId || !normalizedUrl) return

  const cache = readCache()
  cache[projectId] = {
    imageUrl: normalizedUrl,
    renderId: renderId ?? undefined,
    updatedAt: new Date().toISOString(),
  }
  writeCache(cache)
}

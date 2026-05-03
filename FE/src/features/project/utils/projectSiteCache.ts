import { normalizePolygonRing, validatePolygonRing } from './sitePolygon.ts'

const PROJECT_SITE_CACHE_KEY = 'bim-project-site-cache-v1'
export const PROJECT_SITE_CACHE_TTL_MS = 24 * 60 * 60 * 1000

interface CachedProjectSiteEntry {
  polygonRing: number[][]
  savedAt: number
}

type CachedProjectSiteMap = Record<string, CachedProjectSiteEntry>

function toCacheEntry(value: unknown): CachedProjectSiteEntry | null {
  if (Array.isArray(value)) {
    // v1 legacy 포맷: projectId -> number[][]
    const legacyRing = normalizePolygonRing(value)
    if (!validatePolygonRing(legacyRing).isValid) return null
    return { polygonRing: legacyRing, savedAt: 0 }
  }

  if (!value || typeof value !== 'object') return null
  const candidate = value as { polygonRing?: unknown; savedAt?: unknown }
  if (!Array.isArray(candidate.polygonRing)) return null

  const polygonRing = normalizePolygonRing(candidate.polygonRing)
  if (!validatePolygonRing(polygonRing).isValid) return null

  const savedAt =
    Number.isFinite(Number(candidate.savedAt)) && Number(candidate.savedAt) > 0
      ? Number(candidate.savedAt)
      : 0

  return { polygonRing, savedAt }
}

function readCache(): CachedProjectSiteMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(PROJECT_SITE_CACHE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}

    const entries = Object.entries(parsed as Record<string, unknown>)
      .map(([projectId, value]) => [projectId, toCacheEntry(value)] as const)
      .filter(([, value]) => value !== null)
      .map(([projectId, value]) => [projectId, value as CachedProjectSiteEntry] as const)

    return Object.fromEntries(entries)
  } catch {
    return {}
  }
}

function writeCache(cache: CachedProjectSiteMap) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PROJECT_SITE_CACHE_KEY, JSON.stringify(cache))
}

export function saveProjectSitePolygon(projectId: string, polygonRing: number[][]) {
  if (!projectId || !polygonRing || polygonRing.length < 3) return
  const normalizedRing = normalizePolygonRing(polygonRing)
  if (!validatePolygonRing(normalizedRing).isValid) return

  const nextCache = {
    ...readCache(),
    [projectId]: {
      polygonRing: normalizedRing,
      savedAt: Date.now(),
    },
  }
  writeCache(nextCache)
}

export function getProjectSitePolygon(projectId: string): number[][] | null {
  if (!projectId) return null
  const cached = readCache()[projectId]
  if (!cached || cached.polygonRing.length < 3) return null
  return cached.polygonRing
}

export interface ProjectSiteCacheEntryRead {
  polygonRing: number[][]
  savedAt: number
  isStale: boolean
}

export function getProjectSitePolygonEntry(
  projectId: string,
  options?: { ttlMs?: number; nowMs?: number },
): ProjectSiteCacheEntryRead | null {
  if (!projectId) return null
  const cached = readCache()[projectId]
  if (!cached || cached.polygonRing.length < 3) return null

  const ttlMs = options?.ttlMs ?? PROJECT_SITE_CACHE_TTL_MS
  const nowMs = options?.nowMs ?? Date.now()
  const hasSavedAt = Number.isFinite(cached.savedAt) && cached.savedAt > 0
  const isStale = !hasSavedAt || nowMs - cached.savedAt > ttlMs

  return {
    polygonRing: cached.polygonRing,
    savedAt: cached.savedAt,
    isStale,
  }
}

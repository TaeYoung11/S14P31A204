export type ProjectSiteSource = 'api' | 'local' | 'local_stale' | 'mock' | 'none'

export interface ProjectSitePolygonResult {
  polygonRing: number[][] | null
  source: ProjectSiteSource
}

export interface SiteCacheCandidate {
  polygonRing: number[][]
  isStale: boolean
  source: 'api' | 'manual' | 'mock'
}

export interface ResolveProjectSiteFallbackParams {
  apiPolygonRing: number[][] | null
  cacheCandidate: SiteCacheCandidate | null
  mockPolygonRing: number[][] | null
  useMock: boolean
  allowStaleCache: boolean
}

/**
 * 대지 폴리곤 소스를 우선순위에 따라 결정한다.
 * 우선순위: API -> fresh local -> mock -> stale local(옵션 허용 시) -> none
 */
export function resolveProjectSiteFallback({
  apiPolygonRing,
  cacheCandidate,
  mockPolygonRing,
  useMock,
  allowStaleCache,
}: ResolveProjectSiteFallbackParams): ProjectSitePolygonResult {
  if (apiPolygonRing && apiPolygonRing.length >= 3) {
    return { polygonRing: apiPolygonRing, source: 'api' }
  }

  if (cacheCandidate && !cacheCandidate.isStale) {
    if (cacheCandidate.source === 'mock') {
      if (useMock) return { polygonRing: cacheCandidate.polygonRing, source: 'mock' }
    } else {
      return { polygonRing: cacheCandidate.polygonRing, source: 'local' }
    }
  }

  if (useMock && mockPolygonRing && mockPolygonRing.length >= 3) {
    return { polygonRing: mockPolygonRing, source: 'mock' }
  }

  if (allowStaleCache && cacheCandidate && cacheCandidate.isStale) {
    if (cacheCandidate.source === 'mock') {
      if (useMock) return { polygonRing: cacheCandidate.polygonRing, source: 'mock' }
    } else {
      return { polygonRing: cacheCandidate.polygonRing, source: 'local_stale' }
    }
  }

  return { polygonRing: null, source: 'none' }
}

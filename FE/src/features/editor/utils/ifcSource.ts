import { getRuntimeEnvString } from '@/shared/lib/runtimeEnv'

const STORAGE_HTTP_BASE_URL = getRuntimeEnvString('VITE_STORAGE_HTTP_BASE_URL')
const API_BASE_URL = getRuntimeEnvString('VITE_API_URL', '/api/v1')

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '')
const trimLeadingSlash = (value: string): string => value.replace(/^\/+/, '')

const joinUrl = (base: string, path: string): string =>
  `${trimTrailingSlash(base)}/${trimLeadingSlash(path)}`

const deriveOriginFromApiBase = (): string | null => {
  if (typeof window === 'undefined') return null
  if (!API_BASE_URL) return window.location.origin

  try {
    const url = new URL(API_BASE_URL, window.location.origin)
    return url.origin
  } catch {
    return window.location.origin
  }
}

/**
 * WS로 받은 IFC 저장소 URL을 브라우저 fetch 가능한 URL로 변환한다.
 */
export const resolveIfcFetchUrl = (rawUrl: string): string => {
  const normalized = rawUrl.trim()
  if (!normalized) return normalized
  if (normalized.startsWith('https://') || normalized.startsWith('http://')) return normalized

  if (normalized.startsWith('s3://')) {
    if (!STORAGE_HTTP_BASE_URL) {
      throw new Error('s3:// IFC URL을 받았습니다. FE 환경변수 VITE_STORAGE_HTTP_BASE_URL 설정이 필요합니다.')
    }
    const objectPath = normalized.slice('s3://'.length)
    return joinUrl(STORAGE_HTTP_BASE_URL, objectPath)
  }

  if (normalized.startsWith('/')) {
    return normalized
  }

  if (STORAGE_HTTP_BASE_URL) {
    return joinUrl(STORAGE_HTTP_BASE_URL, normalized)
  }

  const apiOrigin = deriveOriginFromApiBase()
  return apiOrigin ? joinUrl(apiOrigin, normalized) : `/${trimLeadingSlash(normalized)}`
}

/**
 * IFC URL/경로에서 파일명을 추출한다.
 */
export const normalizeIfcSourceName = (sourceUrl: string, fallback = 'model.ifc'): string => {
  try {
    const parsed = new URL(sourceUrl)
    const segments = parsed.pathname.split('/').filter(Boolean)
    const lastSegment = segments.length > 0 ? segments[segments.length - 1] : null
    return lastSegment && lastSegment.length > 0 ? lastSegment : fallback
  } catch {
    const segments = sourceUrl.split('/').filter(Boolean)
    const lastSegment = segments.length > 0 ? segments[segments.length - 1] : null
    return lastSegment && lastSegment.length > 0 ? lastSegment : fallback
  }
}

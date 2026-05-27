import { getRuntimeEnvString } from '@/shared/lib/runtimeEnv'

const DEFAULT_API_BASE_URL = '/api/v1'

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '')
const trimLeadingSlash = (value: string): string => value.replace(/^\/+/, '')
const joinUrl = (base: string, path: string): string =>
  `${trimTrailingSlash(base)}/${trimLeadingSlash(path)}`

const resolveApiOrigin = (): string | null => {
  if (typeof window === 'undefined') return null

  const apiBaseUrl = getRuntimeEnvString('VITE_API_URL', DEFAULT_API_BASE_URL)
  if (!apiBaseUrl) return window.location.origin

  try {
    const url = new URL(apiBaseUrl, window.location.origin)
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
    throw new Error('s3:// IFC URL 형식은 현재 지원하지 않습니다.')
  }

  if (normalized.startsWith('/')) {
    return normalized
  }

  const apiOrigin = resolveApiOrigin()
  return apiOrigin ? joinUrl(apiOrigin, normalized) : `/${trimLeadingSlash(normalized)}`
}

/**
 * WS로 받은 IFC 저장소 URL 또는 assetId를 브라우저 fetch 가능한 URL로 변환한다.
 * - http/https이면 BE가 이미 발급한 presigned URL로 보고 그대로 반환
 * - assetId는 호출 호환성을 위해 받지만, BE에 없는 download-url API를 호출하지 않는다
 * - s3://bucket/key 형식은 호출부의 최신 IFC source 보강 경로에서 처리한다
 * - 상대경로이면 API origin 붙여서 반환
 */
export const resolveIfcPresignedUrl = (rawUrl: string, assetId?: string): Promise<string> => {
  const normalized = rawUrl.trim()
  if (!normalized) return Promise.resolve(normalized)

  if (assetId && (normalized.startsWith('https://') || normalized.startsWith('http://'))) {
    return Promise.resolve(normalized)
  }

  return Promise.resolve(resolveIfcFetchUrl(normalized))
}

/**
 * IFC URL/경로에서 파일명을 추출한다.
 */
const AWS_PRESIGNED_DATE_PATTERN =
  /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/

export const getPresignedUrlExpiresAt = (url: string): number | null => {
  try {
    const parsed = new URL(url)
    const amzDate = parsed.searchParams.get('X-Amz-Date')
    const expiresRaw = parsed.searchParams.get('X-Amz-Expires')
    if (!amzDate || !expiresRaw) return null

    const match = AWS_PRESIGNED_DATE_PATTERN.exec(amzDate)
    if (!match) return null

    const expiresSeconds = Number.parseInt(expiresRaw, 10)
    if (!Number.isFinite(expiresSeconds) || expiresSeconds <= 0) return null

    const [, year, month, day, hour, minute, second] = match
    const issuedAt = Date.UTC(
      Number.parseInt(year, 10),
      Number.parseInt(month, 10) - 1,
      Number.parseInt(day, 10),
      Number.parseInt(hour, 10),
      Number.parseInt(minute, 10),
      Number.parseInt(second, 10),
    )
    return issuedAt + expiresSeconds * 1000
  } catch {
    return null
  }
}

export const isExpiredPresignedIfcUrl = (url: string, skewMs = 30_000): boolean => {
  const expiresAt = getPresignedUrlExpiresAt(url)
  return expiresAt !== null && Date.now() + skewMs >= expiresAt
}

export const normalizeIfcSourceDedupeKey = (sourceUrl: string): string => {
  const normalized = sourceUrl.trim()
  if (!normalized) return ''

  try {
    const parsed = new URL(normalized)
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`
  } catch {
    return normalized.split(/[?#]/, 1)[0] ?? normalized
  }
}

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

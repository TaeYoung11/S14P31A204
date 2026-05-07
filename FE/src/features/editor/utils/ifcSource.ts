import { getRuntimeEnvString } from '@/shared/lib/runtimeEnv'
import { fetchS3AssetDownloadUrl } from '../services/s3Asset.service'

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
 * - assetId(UUID)가 있으면 download-url API로 presigned URL 발급
 * - s3://bucket/key 형식이면 S3 key를 assetId로 간주하여 download-url API 호출
 * - http/https이면 그대로 반환
 * - 상대경로이면 API origin 붙여서 반환
 */
export const resolveIfcPresignedUrl = async (rawUrl: string, assetId?: string): Promise<string> => {
  if (assetId) {
    return fetchS3AssetDownloadUrl(assetId)
  }

  const normalized = rawUrl.trim()
  if (!normalized) return normalized

  if (normalized.startsWith('s3://')) {
    // s3://bucket/key → key를 assetId로 간주해 download-url API 호출
    const s3Key = normalized.replace(/^s3:\/\/[^/]+\//, '')
    return fetchS3AssetDownloadUrl(s3Key)
  }

  return resolveIfcFetchUrl(normalized)
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

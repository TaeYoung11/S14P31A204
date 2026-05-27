import { api } from '@/shared/lib/axios'

interface S3DownloadUrlData {
  downloadUrl: string
  assetId: string
  fileName: string
  fileSize: number
  expiresAt: string
}

/**
 * private S3 버킷 asset의 presigned 다운로드 URL을 발급한다.
 * - GET /api/v1/s3/assets/{assetId}/download-url
 * - 현재 BE에는 이 endpoint가 없어 호출 시 500이 발생한다. 검증 전까지 직접 호출하지 않는다.
 */
export async function fetchS3AssetDownloadUrl(assetId: string): Promise<string> {
  const { data } = await api.get<{ data: S3DownloadUrlData }>(`/s3/assets/${assetId}/download-url`)
  return data.data.downloadUrl
}

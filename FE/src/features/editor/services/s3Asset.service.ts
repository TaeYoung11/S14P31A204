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
 */
export async function fetchS3AssetDownloadUrl(assetId: string): Promise<string> {
  const { data } = await api.get<{ data: S3DownloadUrlData }>(`/s3/assets/${assetId}/download-url`)
  return data.data.downloadUrl
}

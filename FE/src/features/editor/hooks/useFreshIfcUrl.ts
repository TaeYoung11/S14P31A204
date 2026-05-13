import { useEffect, useState } from 'react'
import { fetchS3AssetDownloadUrl } from '../services/s3Asset.service'

/**
 * presigned URL 만료 방지 훅.
 *
 * 3D 캔버스가 탭 전환으로 언마운트·리마운트될 때, 이전에 발급된 presigned URL이
 * 만료되어 403 에러가 발생하는 것을 방지한다.
 *
 * 동작:
 * - `assetId`가 있으면 mount 또는 `assetId` 변경 시마다 download-url API를 호출해
 *   항상 유효한 fresh URL을 반환한다.
 * - `assetId`가 없으면(공개 URL·상대경로 등) `fallbackUrl`을 그대로 반환한다.
 * - API 호출 실패 시 `fallbackUrl`로 폴백한다.
 * - 컴포넌트 언마운트 또는 의존성 변경 시 진행 중인 비동기 호출을 취소한다.
 *
 * @param assetId   - S3 private 버킷 assetId (없으면 null)
 * @param fallbackUrl - assetId가 없거나 재발급 실패 시 사용할 URL (없으면 null)
 * @returns 유효한 IFC 다운로드 URL, 재발급 대기 중이면 null
 */
export function useFreshIfcUrl(
  assetId: string | null,
  fallbackUrl: string | null,
): string | null {
  /**
   * 마지막으로 재발급에 성공한 assetId별 URL을 보관한다.
   * effect 내부에서 동기 setState를 피하기 위해, fallback 동기화는 렌더 계산으로 처리한다.
   */
  const [resolvedByAsset, setResolvedByAsset] = useState<{
    assetId: string
    url: string | null
  } | null>(null)

  useEffect(() => {
    if (!assetId) return

    let cancelled = false

    fetchS3AssetDownloadUrl(assetId)
      .then((url) => {
        if (cancelled) return
        setResolvedByAsset({
          assetId,
          url,
        })
      })
      .catch(() => {
        if (cancelled) return
        setResolvedByAsset({
          assetId,
          url: fallbackUrl,
        })
      })

    return () => {
      cancelled = true
    }
  }, [assetId, fallbackUrl])

  if (!assetId) return fallbackUrl
  if (!resolvedByAsset || resolvedByAsset.assetId !== assetId) return fallbackUrl
  return resolvedByAsset.url
}

import { useEffect, useState } from 'react'
import { projectService } from '@/features/project/services/project.service'
import { isExpiredPresignedIfcUrl } from '../utils/ifcSource'

interface RefreshedIfcSource {
  projectId: string
  assetId: string | null
  fallbackUrl: string | null
  url: string | null
}

const isDirectIfcFetchUrl = (url: string): boolean => {
  const normalized = url.trim()
  if (!normalized) return false
  if (normalized.startsWith('https://') || normalized.startsWith('http://')) {
    return !isExpiredPresignedIfcUrl(normalized)
  }
  return normalized.startsWith('/')
}

/**
 * Keeps the 3D canvas on a fetchable IFC URL without calling the removed
 * /api/v1/s3/assets/{assetId}/download-url backend contract.
 */
export function useFreshIfcUrl(
  assetId: string | null,
  fallbackUrl: string | null,
  projectId?: string | null,
): string | null {
  const normalizedFallbackUrl = fallbackUrl?.trim() || null
  const canUseFallbackUrl = normalizedFallbackUrl ? isDirectIfcFetchUrl(normalizedFallbackUrl) : false
  const [refreshedSource, setRefreshedSource] = useState<RefreshedIfcSource | null>(null)

  useEffect(() => {
    if (canUseFallbackUrl) return
    if (!projectId) return

    let cancelled = false

    projectService.getIfcSource(projectId)
      .then((source) => {
        if (cancelled) return
        setRefreshedSource({
          projectId,
          assetId,
          fallbackUrl: normalizedFallbackUrl,
          url: source.currentIfcUrl ?? normalizedFallbackUrl,
        })
      })
      .catch(() => {
        if (cancelled) return
        setRefreshedSource({
          projectId,
          assetId,
          fallbackUrl: normalizedFallbackUrl,
          url: normalizedFallbackUrl,
        })
      })

    return () => {
      cancelled = true
    }
  }, [assetId, canUseFallbackUrl, normalizedFallbackUrl, projectId])

  if (canUseFallbackUrl) return normalizedFallbackUrl
  if (!projectId) return normalizedFallbackUrl
  if (
    !refreshedSource ||
    refreshedSource.projectId !== projectId ||
    refreshedSource.assetId !== assetId ||
    refreshedSource.fallbackUrl !== normalizedFallbackUrl
  ) {
    return null
  }
  return refreshedSource.url
}

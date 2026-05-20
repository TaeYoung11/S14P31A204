import { useCallback, useEffect, useMemo } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { useProjectSitePolygon } from '@/features/project/hooks/useProjects'
import {
  calculateSiteAreaM2,
  mapSiteRingToCanvasPoints,
  mapSiteRingToCanvasPointsByMmScale,
  toPyeong,
} from '@/features/project/utils/siteGeometry'
import { FLOOR_MM_PER_PX, SITE_RAW_POINTS } from '../constants'
import type { BubbleData, FloorOpening, FloorRoom, FloorWall, SaveStatus } from '../types'
import { centerSitePoints, fitSitePointsToStage } from '../utils/bubbleCalc'
import { ensureSiteContainsBubbles, type ViewportInsets } from '../utils/editorViewport'
import { getFlatPointsBounds, translateFlatPoints } from '../utils/sitePointTransform'
import { getViewportFrame } from '../utils/viewportInsets'
import {
  DEFAULT_LAYOUT_BOUNDARY_PADDING_MM,
  resolveMmPerPxForFloorPlan,
} from '../utils/editorPageHelpers'
import type { LayoutImportBoundaryInput } from '../utils/editorPageHelpers'
import { buildSiteBoundaryBlockReason } from '../utils/siteBoundaryMessage'

/** 스테이지 여백을 포함한 대지 자동 맞춤 padding(px) */
export const EDITOR_SITE_FIT_PADDING_PX = 72
const SITE_CONTAIN_BUBBLE_PADDING_PX = 80
const SITE_CONTAIN_MAX_SCALE = 3.5

interface StableSiteAnchor {
  projectId: string
  x: number
  y: number
}

const siteAnchorCacheByProjectId = new Map<string, StableSiteAnchor>()
const MAX_SITE_ANCHOR_CACHE_ENTRIES = 100

function hasUsableSiteBoundary(points: number[]): boolean {
  if (points.length < 6) return false
  let validPairCount = 0
  for (let index = 0; index + 1 < points.length; index += 2) {
    if (Number.isFinite(points[index]) && Number.isFinite(points[index + 1])) {
      validPairCount += 1
    }
  }
  return validPairCount >= 3
}

function getCachedSiteAnchor(projectId: string): StableSiteAnchor | null {
  return siteAnchorCacheByProjectId.get(projectId) ?? null
}

function setCachedSiteAnchor(projectId: string, anchor: { x: number; y: number }) {
  // Map은 삽입 순서를 유지하므로 가장 오래된 항목부터 제거해 캐시 크기를 제한한다.
  if (!siteAnchorCacheByProjectId.has(projectId) && siteAnchorCacheByProjectId.size >= MAX_SITE_ANCHOR_CACHE_ENTRIES) {
    const oldestKey = siteAnchorCacheByProjectId.keys().next().value
    if (typeof oldestKey === 'string') {
      siteAnchorCacheByProjectId.delete(oldestKey)
    }
  }
  siteAnchorCacheByProjectId.set(projectId, {
    projectId,
    x: anchor.x,
    y: anchor.y,
  })
}

interface RectLikeContent {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 방/버블처럼 x,y,width,height를 가진 요소 목록의 중심점을 계산한다.
 * 유효한 경계가 없으면 null을 반환한다.
 */
function computeRectLikeCenter(items: RectLikeContent[]): { x: number; y: number } | null {
  if (items.length === 0) return null
  const minX = Math.min(...items.map((item) => item.x))
  const minY = Math.min(...items.map((item) => item.y))
  const maxX = Math.max(...items.map((item) => item.x + item.width))
  const maxY = Math.max(...items.map((item) => item.y + item.height))
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
}

interface UseEditorSiteBoundaryParams {
  projectId: string | undefined
  stageWidth: number
  stageHeight: number
  viewportInsets?: Partial<ViewportInsets>
  bubbles: BubbleData[]
  floorRooms: FloorRoom[]
  floorWalls: FloorWall[]
  floorOpenings: FloorOpening[]
  sitePolygonRing?: number[][] | null
  siteAreaM2?: number | null
  sitePolygonQueryEnabled?: boolean
  siteBoundaryHydrated?: boolean
  setSaveStatus: Dispatch<SetStateAction<SaveStatus>>
  onNotice?: (notice: {
    title?: string
    message: string
    description?: string
    confirmLabel?: string
  }) => void
}

/**
 * 대지 경계 계산/검증 훅.
 * - 대지 좌표 로딩
 * - 캔버스용 site points 계산
 * - 저장 차단(canStartSaveFlow) 판단
 */
export function useEditorSiteBoundary({
  projectId,
  stageWidth,
  stageHeight,
  viewportInsets,
  bubbles,
  floorRooms,
  floorWalls,
  floorOpenings,
  sitePolygonRing,
  siteAreaM2: siteAreaM2Override,
  sitePolygonQueryEnabled = true,
  siteBoundaryHydrated = true,
  setSaveStatus,
  onNotice,
}: UseEditorSiteBoundaryParams) {
  const sitePolygonQuery = useProjectSitePolygon(
    projectId ?? null,
    sitePolygonQueryEnabled && !!projectId && !sitePolygonRing,
  )
  const sitePolygonQueryData = sitePolygonQueryEnabled ? sitePolygonQuery.data : undefined
  const cachedSiteRing = sitePolygonRing ?? sitePolygonQueryData?.polygonRing ?? null
  const apiSiteAreaM2 = siteAreaM2Override ?? sitePolygonQueryData?.areaM2 ?? null

  const siteAreaM2 = useMemo(
    () => apiSiteAreaM2 ?? (cachedSiteRing ? calculateSiteAreaM2(cachedSiteRing) : null),
    [apiSiteAreaM2, cachedSiteRing],
  )

  const siteAreaPyeong = useMemo(
    () => (siteAreaM2 ? toPyeong(siteAreaM2) : null),
    [siteAreaM2],
  )

  const viewportFrame = useMemo(
    () => getViewportFrame(stageWidth, stageHeight, viewportInsets),
    [stageHeight, stageWidth, viewportInsets],
  )

  const recenterToViewport = useCallback((points: number[]): number[] => {
    const bounds = getFlatPointsBounds(points)
    if (!bounds) return points
    return translateFlatPoints(points, viewportFrame.centerX - bounds.cx, viewportFrame.centerY - bounds.cy)
  }, [viewportFrame.centerX, viewportFrame.centerY])

  // 파생 상태: 대지 외곽선 포인트 (캔버스 중앙 정렬)
  const sitePoints = useMemo(() => {
    const targetWidth = Math.max(viewportFrame.width - EDITOR_SITE_FIT_PADDING_PX * 2, 1)
    const targetHeight = Math.max(viewportFrame.height - EDITOR_SITE_FIT_PADDING_PX * 2, 1)
    const cachedCanvasPoints = cachedSiteRing
      ? mapSiteRingToCanvasPoints(cachedSiteRing, {
          targetWidth,
          targetHeight,
          fitRatio: 1,
        })
      : null
    const cachedRawPoints = cachedCanvasPoints?.flatMap((point) => [point.x, point.y]) ?? null

    if (cachedRawPoints) {
      const centeredToViewport = recenterToViewport(centerSitePoints(cachedRawPoints, stageWidth, stageHeight))
      return centeredToViewport
    }

    // 실제 대지 하이드레이션 이전에는 기본(mock) 대지를 그리지 않아 플리커를 방지한다.
    if (!siteBoundaryHydrated) {
      return []
    }

    const fitted = fitSitePointsToStage(SITE_RAW_POINTS, viewportFrame.width, viewportFrame.height, {
      padding: EDITOR_SITE_FIT_PADDING_PX,
      fitRatio: 1,
    })
    const fittedInViewport = translateFlatPoints(fitted, viewportFrame.insets.left, viewportFrame.insets.top)
    return ensureSiteContainsBubbles(
      fittedInViewport,
      bubbles,
      SITE_CONTAIN_BUBBLE_PADDING_PX,
      SITE_CONTAIN_MAX_SCALE,
    )
  }, [
    bubbles,
    cachedSiteRing,
    recenterToViewport,
    siteBoundaryHydrated,
    stageHeight,
    stageWidth,
    viewportFrame.height,
    viewportFrame.insets.left,
    viewportFrame.insets.top,
    viewportFrame.width,
  ])

  const floorPlanMmPerPx = useMemo(() => {
    if (bubbles.length > 0) {
      return resolveMmPerPxForFloorPlan(bubbles)
    }
    for (const room of floorRooms) {
      if (room.width > 1 && room.widthMm > 0) return room.widthMm / room.width
      if (room.height > 1 && room.heightMm > 0) return room.heightMm / room.height
    }
    return FLOOR_MM_PER_PX
  }, [bubbles, floorRooms])

  const bubbleMmPerPx = useMemo(
    () => resolveMmPerPxForFloorPlan(bubbles),
    [bubbles],
  )

  const contentCenter = useMemo(() => {
    const roomCenter = computeRectLikeCenter(floorRooms)
    if (roomCenter) return roomCenter

    const bubbleCenter = computeRectLikeCenter(bubbles)
    if (bubbleCenter) return bubbleCenter

    return { x: viewportFrame.centerX, y: viewportFrame.centerY }
  }, [bubbles, floorRooms, viewportFrame.centerX, viewportFrame.centerY])

  const siteAnchorResolution = useMemo(() => {
    const hasContent = bubbles.length > 0 || floorRooms.length > 0
    const viewportAnchor = { x: viewportFrame.centerX, y: viewportFrame.centerY }
    if (!projectId) {
      return {
        anchor: hasContent ? contentCenter : viewportAnchor,
        shouldPersist: false,
      }
    }

    const cachedAnchor = getCachedSiteAnchor(projectId)
    if (cachedAnchor) {
      if (!hasContent) {
        return {
          anchor: viewportAnchor,
          shouldPersist: cachedAnchor.x !== viewportAnchor.x || cachedAnchor.y !== viewportAnchor.y,
        }
      }
      return {
        anchor: { x: cachedAnchor.x, y: cachedAnchor.y },
        shouldPersist: false,
      }
    }

    const initialAnchor = hasContent ? contentCenter : viewportAnchor
    return {
      anchor: initialAnchor,
      shouldPersist: true,
    }
  }, [bubbles.length, contentCenter, floorRooms.length, projectId, viewportFrame.centerX, viewportFrame.centerY])

  useEffect(() => {
    if (!projectId) return
    if (!siteAnchorResolution.shouldPersist) return
    setCachedSiteAnchor(projectId, siteAnchorResolution.anchor)
  }, [projectId, siteAnchorResolution])

  const siteAnchorCenter = siteAnchorResolution.anchor

  const sitePlanPoints = useMemo(() => {
    if (!cachedSiteRing) return sitePoints
    const mapped = mapSiteRingToCanvasPointsByMmScale(cachedSiteRing, {
      mmPerPx: floorPlanMmPerPx,
      centerX: siteAnchorCenter.x,
      centerY: siteAnchorCenter.y,
    })
    if (!mapped) return sitePoints
    return mapped.flatMap((point) => [point.x, point.y])
  }, [cachedSiteRing, floorPlanMmPerPx, siteAnchorCenter, sitePoints])

  const fixedScaleSitePoints = useMemo(() => {
    if (!cachedSiteRing) return sitePoints
    const mapped = mapSiteRingToCanvasPointsByMmScale(cachedSiteRing, {
      mmPerPx: bubbleMmPerPx,
      centerX: siteAnchorCenter.x,
      centerY: siteAnchorCenter.y,
    })
    if (!mapped) return sitePoints
    return mapped.flatMap((point) => [point.x, point.y])
  }, [bubbleMmPerPx, cachedSiteRing, siteAnchorCenter, sitePoints])

  const layoutBoundaryInput = useMemo<LayoutImportBoundaryInput>(() => {
    if (cachedSiteRing && hasUsableSiteBoundary(sitePlanPoints)) {
      return {
        source: 'site',
        sitePlanPoints,
      }
    }
    return {
      source: 'default',
      paddingMm: DEFAULT_LAYOUT_BOUNDARY_PADDING_MM,
      fallbackReason: cachedSiteRing ? 'site-mapping-failed' : 'missing-site',
    }
  }, [cachedSiteRing, sitePlanPoints])

  const getSiteBoundaryBlockReason = useCallback((): string | null => {
    return buildSiteBoundaryBlockReason({
      sitePlanPoints,
      floorRooms,
      floorWalls,
      floorOpenings,
      bubbles,
    })
  }, [sitePlanPoints, floorRooms, floorWalls, floorOpenings, bubbles])

  const canStartSaveFlow = useCallback((): boolean => {
    const reason = getSiteBoundaryBlockReason()
    if (!reason) return true

    setSaveStatus('error')
    onNotice?.({
      title: '저장할 수 없습니다',
      message: '대지 경계 밖 요소가 있어 저장할 수 없습니다.',
      description: `현재 상태: ${reason}\n대지 안으로 이동한 뒤 다시 저장해 주세요.`,
    })
    return false
  }, [getSiteBoundaryBlockReason, onNotice, setSaveStatus])

  return {
    sitePolygonQuery,
    sitePoints,
    fixedScaleSitePoints,
    sitePlanPoints,
    layoutBoundaryInput,
    siteAreaM2,
    siteAreaPyeong,
    canStartSaveFlow,
  }
}

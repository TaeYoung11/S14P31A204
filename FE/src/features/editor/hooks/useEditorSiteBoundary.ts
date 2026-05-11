import { useCallback, useMemo } from 'react'
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
import { ensureSiteContainsBubbles } from '../utils/editorViewport'
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

interface UseEditorSiteBoundaryParams {
  projectId: string | undefined
  stageWidth: number
  stageHeight: number
  bubbles: BubbleData[]
  floorRooms: FloorRoom[]
  floorWalls: FloorWall[]
  floorOpenings: FloorOpening[]
  setSaveStatus: Dispatch<SetStateAction<SaveStatus>>
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
  bubbles,
  floorRooms,
  floorWalls,
  floorOpenings,
  setSaveStatus,
}: UseEditorSiteBoundaryParams) {
  const sitePolygonQuery = useProjectSitePolygon(projectId ?? null, !!projectId)
  const cachedSiteRing = sitePolygonQuery.data?.polygonRing ?? null
  const apiSiteAreaM2 = sitePolygonQuery.data?.areaM2 ?? null

  const siteAreaM2 = useMemo(
    () => apiSiteAreaM2 ?? (cachedSiteRing ? calculateSiteAreaM2(cachedSiteRing) : null),
    [apiSiteAreaM2, cachedSiteRing],
  )

  const siteAreaPyeong = useMemo(
    () => (siteAreaM2 ? toPyeong(siteAreaM2) : null),
    [siteAreaM2],
  )

  // 파생 상태: 대지 외곽선 포인트 (캔버스 중앙 정렬)
  const sitePoints = useMemo(() => {
    const targetWidth = Math.max(stageWidth - EDITOR_SITE_FIT_PADDING_PX * 2, 1)
    const targetHeight = Math.max(stageHeight - EDITOR_SITE_FIT_PADDING_PX * 2, 1)
    const cachedCanvasPoints = cachedSiteRing
      ? mapSiteRingToCanvasPoints(cachedSiteRing, {
          targetWidth,
          targetHeight,
          fitRatio: 1,
        })
      : null
    const cachedRawPoints = cachedCanvasPoints?.flatMap((point) => [point.x, point.y]) ?? null

    if (cachedRawPoints) {
      return centerSitePoints(cachedRawPoints, stageWidth, stageHeight)
    }
    const fitted = fitSitePointsToStage(SITE_RAW_POINTS, stageWidth, stageHeight, {
      padding: EDITOR_SITE_FIT_PADDING_PX,
      fitRatio: 1,
    })
    return ensureSiteContainsBubbles(
      fitted,
      bubbles,
      SITE_CONTAIN_BUBBLE_PADDING_PX,
      SITE_CONTAIN_MAX_SCALE,
    )
  }, [cachedSiteRing, stageWidth, stageHeight, bubbles])

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
    if (floorRooms.length > 0) {
      const minX = Math.min(...floorRooms.map((room) => room.x))
      const minY = Math.min(...floorRooms.map((room) => room.y))
      const maxX = Math.max(...floorRooms.map((room) => room.x + room.width))
      const maxY = Math.max(...floorRooms.map((room) => room.y + room.height))
      if (Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY)) {
        return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
      }
    }

    if (bubbles.length > 0) {
      const minX = Math.min(...bubbles.map((bubble) => bubble.x))
      const minY = Math.min(...bubbles.map((bubble) => bubble.y))
      const maxX = Math.max(...bubbles.map((bubble) => bubble.x + bubble.width))
      const maxY = Math.max(...bubbles.map((bubble) => bubble.y + bubble.height))
      if (Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY)) {
        return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
      }
    }

    return { x: stageWidth / 2, y: stageHeight / 2 }
  }, [bubbles, floorRooms, stageWidth, stageHeight])

  const siteAnchorCenter = useMemo(() => {
    const anchorProjectId = projectId ?? ''
    const cachedAnchor = siteAnchorCacheByProjectId.get(anchorProjectId)
    if (cachedAnchor) {
      return { x: cachedAnchor.x, y: cachedAnchor.y }
    }
    if (bubbles.length > 0 || floorRooms.length > 0) {
      siteAnchorCacheByProjectId.set(anchorProjectId, {
        projectId: anchorProjectId,
        x: contentCenter.x,
        y: contentCenter.y,
      })
      return contentCenter
    }
    siteAnchorCacheByProjectId.delete(anchorProjectId)
    return { x: stageWidth / 2, y: stageHeight / 2 }
  }, [bubbles.length, contentCenter, floorRooms.length, projectId, stageHeight, stageWidth])

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
    return {
      source: 'default',
      paddingMm: DEFAULT_LAYOUT_BOUNDARY_PADDING_MM,
    }
  }, [])

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
    window.alert(
      `대지 경계 밖 요소가 있어 저장할 수 없습니다.\n\n현재 상태: ${reason}\n\n대지 안으로 이동한 뒤 다시 저장해 주세요.`,
    )
    return false
  }, [getSiteBoundaryBlockReason, setSaveStatus])

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

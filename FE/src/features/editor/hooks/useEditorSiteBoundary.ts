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
} from '../utils/editorPageHelpers'
import type { LayoutImportBoundaryInput } from '../utils/editorPageHelpers'
import { buildSiteBoundaryBlockReason } from '../utils/siteBoundaryMessage'

/** 스테이지 여백을 포함한 대지 자동 맞춤 padding(px) */
export const EDITOR_SITE_FIT_PADDING_PX = 72
const SITE_CONTAIN_BUBBLE_PADDING_PX = 80
const SITE_CONTAIN_MAX_SCALE = 3.5

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

  const siteAreaM2 = useMemo(
    () => (cachedSiteRing ? calculateSiteAreaM2(cachedSiteRing) : null),
    [cachedSiteRing],
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
    for (const room of floorRooms) {
      if (room.width > 1 && room.widthMm > 0) return room.widthMm / room.width
      if (room.height > 1 && room.heightMm > 0) return room.heightMm / room.height
    }
    return FLOOR_MM_PER_PX
  }, [floorRooms])

  const sitePlanPoints = useMemo(() => {
    if (!cachedSiteRing) return sitePoints
    const mapped = mapSiteRingToCanvasPointsByMmScale(cachedSiteRing, {
      mmPerPx: floorPlanMmPerPx,
      centerX: stageWidth / 2,
      centerY: stageHeight / 2,
    })
    if (!mapped) return sitePoints
    return mapped.flatMap((point) => [point.x, point.y])
  }, [cachedSiteRing, floorPlanMmPerPx, sitePoints, stageWidth, stageHeight])

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
    sitePlanPoints,
    layoutBoundaryInput,
    siteAreaM2,
    siteAreaPyeong,
    canStartSaveFlow,
  }
}

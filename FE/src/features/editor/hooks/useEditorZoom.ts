import { useMemo, useState } from 'react'
import { MAX_EDITOR_ZOOM_PERCENT, MIN_EDITOR_ZOOM_PERCENT } from '../constants'
import { computeFitZoomPercent } from '../utils/editorViewport'

const DEFAULT_EDITOR_ZOOM_PERCENT = 100

function clampEditorZoom(value: number): number {
  return Math.min(
    Math.max(Math.round(value), MIN_EDITOR_ZOOM_PERCENT),
    MAX_EDITOR_ZOOM_PERCENT,
  )
}

interface UseEditorZoomParams {
  sitePlanPoints: number[]
  stageWidth: number
  stageHeight: number
  fitPaddingPx: number
}

/**
 * 에디터 줌 상태/핸들러 훅.
 * - 초기 자동 맞춤 줌(autoFit)
 * - 사용자 입력(버튼/휠/직접 입력) 기반 줌 변경
 */
export function useEditorZoom({
  sitePlanPoints,
  stageWidth,
  stageHeight,
  fitPaddingPx,
}: UseEditorZoomParams) {
  const [zoom, setZoom] = useState(DEFAULT_EDITOR_ZOOM_PERCENT)
  const [isUserZoomAdjusted, setIsUserZoomAdjusted] = useState(false)

  // 사용자가 수동 줌을 건드리기 전에는 모드별 대지 크기에 맞춰 자동 맞춤 줌을 적용한다.
  const autoFitZoom = useMemo(() => {
    if (isUserZoomAdjusted) return null
    if (stageWidth <= 0 || stageHeight <= 0) return null

    const fitZoom = computeFitZoomPercent(
      sitePlanPoints,
      stageWidth,
      stageHeight,
      fitPaddingPx,
    )
    if (!fitZoom) return null

    return clampEditorZoom(Math.min(DEFAULT_EDITOR_ZOOM_PERCENT, fitZoom))
  }, [isUserZoomAdjusted, sitePlanPoints, stageWidth, stageHeight, fitPaddingPx])

  const currentZoom = autoFitZoom ?? zoom

  const getBaseZoom = () => (isUserZoomAdjusted ? zoom : currentZoom)

  /** 사용자 수동 줌을 적용하고 클램프한다. */
  const applyUserZoom = (nextValue: number) => {
    if (!isUserZoomAdjusted) setIsUserZoomAdjusted(true)
    setZoom(clampEditorZoom(nextValue))
  }

  /** 스크롤 휠 줌 — 배율을 기존 줌 값에 곱해 적용 */
  const handleWheelZoom = (factor: number) => {
    applyUserZoom(getBaseZoom() * factor)
  }

  /** 버튼 확대(+10%) */
  const handleZoomIn = () => {
    applyUserZoom(getBaseZoom() + 10)
  }

  /** 버튼 축소(-10%) */
  const handleZoomOut = () => {
    applyUserZoom(getBaseZoom() - 10)
  }

  /** 직접 입력 줌 */
  const handleZoomChange = (value: number) => {
    applyUserZoom(value)
  }

  return {
    zoom: currentZoom,
    autoFitZoom,
    handleWheelZoom,
    handleZoomIn,
    handleZoomOut,
    handleZoomChange,
  }
}

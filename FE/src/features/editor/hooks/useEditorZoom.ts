import { useEffect, useMemo, useState } from 'react'
import { MAX_EDITOR_ZOOM_PERCENT, MIN_EDITOR_ZOOM_PERCENT } from '../constants'
import { computeFitZoomPercent } from '../utils/editorViewport'

const DEFAULT_EDITOR_ZOOM_PERCENT = 100

function clampEditorZoom(value: number): number {
  const clamped = Math.min(Math.max(value, MIN_EDITOR_ZOOM_PERCENT), MAX_EDITOR_ZOOM_PERCENT)
  return clamped < 10 ? Math.round(clamped * 10) / 10 : Math.round(clamped)
}

interface UseEditorZoomParams {
  projectId?: string
  sitePlanPoints: number[]
  stageWidth: number
  stageHeight: number
  fitPaddingPx: number
}

const createZoomStorageKey = (projectId?: string) => (
  projectId ? `editor:bubble-viewport:zoom:${projectId}` : null
)

const readStoredZoom = (projectId?: string): number | null => {
  if (typeof window === 'undefined') return null
  const storageKey = createZoomStorageKey(projectId)
  if (!storageKey) return null
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * 에디터 줌 상태/핸들러 훅.
 * - 초기 자동 맞춤 줌(autoFit)
 * - 사용자 입력(버튼/휠/직접 입력) 기반 줌 변경
 */
export function useEditorZoom({
  projectId,
  sitePlanPoints,
  stageWidth,
  stageHeight,
  fitPaddingPx,
}: UseEditorZoomParams) {
  const [zoom, setZoom] = useState(() => readStoredZoom(projectId) ?? DEFAULT_EDITOR_ZOOM_PERCENT)
  const [isUserZoomAdjusted, setIsUserZoomAdjusted] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const storageKey = createZoomStorageKey(projectId)
    if (!storageKey) return
    try {
      window.localStorage.setItem(storageKey, String(zoom))
    } catch {
      // localStorage 접근 실패는 치명적이지 않아 무시한다.
    }
  }, [projectId, zoom])

  // 사용자가 수동 줌을 건드리기 전에는 모드별 대지 크기에 맞춰 자동 맞춤 줌을 적용한다.
  const fitBaseZoom = useMemo(() => {
    if (stageWidth <= 0 || stageHeight <= 0) return null

    const fitZoom = computeFitZoomPercent(
      sitePlanPoints,
      stageWidth,
      stageHeight,
      fitPaddingPx,
    )
    if (!fitZoom) return null

    return clampEditorZoom(Math.min(DEFAULT_EDITOR_ZOOM_PERCENT, fitZoom))
  }, [sitePlanPoints, stageWidth, stageHeight, fitPaddingPx])

  const currentZoom = zoom
  const canvasZoom = (fitBaseZoom ?? DEFAULT_EDITOR_ZOOM_PERCENT) * (currentZoom / DEFAULT_EDITOR_ZOOM_PERCENT)

  const getBaseZoom = () => currentZoom

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
    canvasZoom,
    autoFitZoom: fitBaseZoom,
    handleWheelZoom,
    handleZoomIn,
    handleZoomOut,
    handleZoomChange,
  }
}

import { useLayoutEffect, useMemo, useRef, useCallback, type RefObject } from 'react'
import type { EditorMode } from '../types'
import { normalizeSnapIntervalMm, toRotationSnapDegrees } from '../utils/threeDSnap.utils'

interface UseZoomControlBarParams {
  mode: EditorMode
  isGridVisible: boolean
  isGridSnapEnabled: boolean
  gridSnapIntervalMm: number
  onToggleGrid?: () => void
  onToggleGridSnap?: () => void
  panelRef: RefObject<HTMLElement | null>
  setOffset: (updater: (prev: { x: number; y: number }) => { x: number; y: number }) => void
}

interface UseZoomControlBarResult {
  isGridControlActive: boolean
  gridSnapTitle: string
  handleGridSnapToggle: () => void
}

/**
 * ZoomControlBar의 계산/동기화 로직을 관리한다.
 * - 첫 렌더 시 패널 Y 위치를 부모 하단 기준으로 보정
 * - 2D 모드의 그리드/스냅 토글 동기화 정책 계산
 */
export function useZoomControlBar({
  mode,
  isGridVisible,
  isGridSnapEnabled,
  gridSnapIntervalMm,
  onToggleGrid,
  onToggleGridSnap,
  panelRef,
  setOffset,
}: UseZoomControlBarParams): UseZoomControlBarResult {
  // 첫 마운트 시 1회만 위치 보정한다. (사용자 드래그 위치를 이후에는 보존)
  const didInitPositionRef = useRef(false)

  useLayoutEffect(() => {
    if (didInitPositionRef.current) return
    const panelEl = panelRef.current
    const parentEl = (panelEl?.offsetParent as HTMLElement | null) ?? panelEl?.parentElement
    if (!panelEl || !parentEl) return
    didInitPositionRef.current = true
    const nextY = Math.max(12, parentEl.clientHeight - panelEl.offsetHeight - 24)
    setOffset((prev) => ({ ...prev, y: nextY }))
  }, [panelRef, setOffset])

  const handleGridSnapToggle = useCallback(() => {
    // 2D 모드에서는 "스냅 활성화 여부"와 "그리드 표시"를 같은 상태로 유지한다.
    const nextSnapEnabled = !isGridSnapEnabled
    onToggleGridSnap?.()
    if (mode === '2d' && isGridVisible !== nextSnapEnabled) onToggleGrid?.()
  }, [isGridSnapEnabled, isGridVisible, mode, onToggleGrid, onToggleGridSnap])

  const isGridControlActive = useMemo(
    () => (mode === '2d' ? (isGridSnapEnabled && isGridVisible) : isGridSnapEnabled),
    [isGridSnapEnabled, isGridVisible, mode],
  )

  const gridSnapTitle = useMemo(
    () => {
      if (mode === '2d') {
        return `그리드 스냅 토글 (그리드 ${isGridVisible ? '표시 중' : '숨김'})`
      }
      const translationMm = normalizeSnapIntervalMm(gridSnapIntervalMm)
      const rotationDeg = toRotationSnapDegrees(gridSnapIntervalMm)
      return `3D 스냅 토글 (이동 ${translationMm}mm / 회전 ${rotationDeg}° · ${isGridSnapEnabled ? 'ON' : 'OFF'})`
    },
    [gridSnapIntervalMm, isGridSnapEnabled, isGridVisible, mode],
  )

  return {
    isGridControlActive,
    gridSnapTitle,
    handleGridSnapToggle,
  }
}

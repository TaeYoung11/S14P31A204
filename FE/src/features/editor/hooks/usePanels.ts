import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { PANEL_MAX_HEIGHT, PANEL_MAX_WIDTH, PANEL_MIN_HEIGHT, PANEL_MIN_WIDTH } from '../constants'
import type { EditorMode, PanelKey, PanelOffset, PanelResizeAxis } from '../types'
import {
  clampRange,
  getPanelBoundsFallback,
  getPanelBoundsFromMetrics,
  getPanelVisibleSize,
  snapToEdge,
  type PanelBounds,
  type PanelMetrics,
} from '../utils/panelLayout'

const COLLAPSED_PANEL_SIZE = 44
const PANEL_EDGE_SNAP_PX = 18
const PANEL_SIBLING_SNAP_PX = 14
const DRAG_CLICK_GUARD_PX = 3

const PANEL_KEYS: PanelKey[] = ['attributes', 'zoning', 'assistant', 'floorView', 'hierarchy']
const DEFAULT_PANEL_OFFSETS: Record<PanelKey, PanelOffset> = {
  attributes: { x: 0, y: 0 },
  zoning: { x: 0, y: 0 },
  assistant: { x: 0, y: 0 },
  floorView: { x: 0, y: 0 },
  hierarchy: { x: 0, y: 0 },
}
const DEFAULT_PANEL_OPEN_STATE: Record<PanelKey, boolean> = {
  attributes: true,
  zoning: true,
  assistant: true,
  floorView: true,
  hierarchy: true,
}
const DEFAULT_PANEL_HEIGHTS: Record<PanelKey, number> = {
  attributes: 300,
  zoning: 200,
  assistant: 180,
  floorView: 150,
  hierarchy: 150,
}
const DEFAULT_PANEL_WIDTHS: Record<PanelKey, number> = {
  attributes: 300,
  zoning: 300,
  assistant: 300,
  floorView: 300,
  hierarchy: 300,
}
const DEFAULT_PANEL_Z_INDEXES: Record<PanelKey, number> = {
  attributes: 10,
  zoning: 11,
  assistant: 12,
  floorView: 13,
  hierarchy: 14,
}
const PANEL_VISIBLE_SIZE_CONFIG = {
  openMinVisibleWidthPx: 168,
  openMinVisibleHeightPx: 72,
  collapsedVisibleEdgePx: 56,
}
const PANEL_BOUNDS_CONFIG = {
  rightDragLimitPx: 12,
  leftDockBleedPx: 24,
  topReservedPx: 120,
  bottomReservedPx: 24,
}

interface DragState {
  panelKey: PanelKey
  startClientX: number
  startClientY: number
  startOffsetX: number
  startOffsetY: number
  lockAxis: 'x' | 'y' | null
}

interface ResizeState {
  panelKey: PanelKey
  axis: PanelResizeAxis
  startClientX: number
  startClientY: number
  startWidth: number
  startHeight: number
}

const createPanelOffsetState = () => ({ ...DEFAULT_PANEL_OFFSETS })
const createPanelOpenState = () => ({ ...DEFAULT_PANEL_OPEN_STATE })
const createPanelHeightState = () => ({ ...DEFAULT_PANEL_HEIGHTS })
const createPanelWidthState = () => ({ ...DEFAULT_PANEL_WIDTHS })
const createPanelZIndexState = () => ({ ...DEFAULT_PANEL_Z_INDEXES })

/**
 * 우측 패널 드래그·리사이즈 상태 관리 훅
 * - 패널 이동/리사이즈
 * - 경계/형제 스냅
 * - 드래그된 패널 전면 배치
 */
export function usePanels(mode: EditorMode) {
  const [panelOffsets, setPanelOffsets] = useState<Record<PanelKey, PanelOffset>>(createPanelOffsetState)
  const [panelOpenState, setPanelOpenState] = useState<Record<PanelKey, boolean>>(createPanelOpenState)
  const [panelHeights, setPanelHeights] = useState<Record<PanelKey, number>>(createPanelHeightState)
  const [panelWidths, setPanelWidths] = useState<Record<PanelKey, number>>(createPanelWidthState)
  const [panelZIndexes, setPanelZIndexes] = useState<Record<PanelKey, number>>(createPanelZIndexState)

  const zCounterRef = useRef(20)
  const dragRef = useRef<DragState | null>(null)
  const resizeRef = useRef<ResizeState | null>(null)
  const dragMovedRef = useRef(false)
  const suppressToggleByDragRef = useRef<Record<PanelKey, boolean>>({
    attributes: false,
    zoning: false,
    assistant: false,
    floorView: false,
    hierarchy: false,
  })

  /**
   * panel DOM 위치와 크기를 기준으로 뷰포트 좌표 메트릭을 수집한다.
   */
  const getPanelMetrics = useCallback((panelKey: PanelKey, isOpenOverride?: boolean): PanelMetrics | null => {
    if (typeof document === 'undefined') return null

    const panelEl = document.querySelector<HTMLElement>(`[data-panel-key="${panelKey}"]`)
    if (!panelEl) return null

    const parentEl = (panelEl.offsetParent as HTMLElement | null) ?? panelEl.parentElement
    if (!parentEl) return null

    const isOpen = isOpenOverride ?? panelOpenState[panelKey]
    const panelWidth = isOpen ? panelWidths[panelKey] : COLLAPSED_PANEL_SIZE
    const panelHeight = isOpen ? panelHeights[panelKey] : COLLAPSED_PANEL_SIZE
    const parentRect = parentEl.getBoundingClientRect()

    return {
      baseLeftViewport: parentRect.left + panelEl.offsetLeft,
      baseTopViewport: parentRect.top + panelEl.offsetTop,
      panelWidth,
      panelHeight,
    }
  }, [panelHeights, panelOpenState, panelWidths])

  /**
   * 패널별 이동 허용 범위를 계산한다.
   */
  const getPanelBounds = useCallback((panelKey: PanelKey, isOpenOverride?: boolean): PanelBounds => {
    const isOpen = isOpenOverride ?? panelOpenState[panelKey]
    const panelWidth = isOpen ? panelWidths[panelKey] : COLLAPSED_PANEL_SIZE
    const panelHeight = isOpen ? panelHeights[panelKey] : COLLAPSED_PANEL_SIZE
    const { visibleWidth, visibleHeight } = getPanelVisibleSize(
      isOpen,
      panelWidth,
      panelHeight,
      PANEL_VISIBLE_SIZE_CONFIG,
    )

    const metrics = getPanelMetrics(panelKey, isOpenOverride)
    if (metrics) {
      return getPanelBoundsFromMetrics(
        metrics,
        visibleWidth,
        visibleHeight,
        window.innerHeight,
        PANEL_BOUNDS_CONFIG,
      )
    }

    return getPanelBoundsFallback(
      panelWidth,
      visibleWidth,
      visibleHeight,
      window.innerHeight,
      PANEL_BOUNDS_CONFIG,
    )
  }, [getPanelMetrics, panelHeights, panelOpenState, panelWidths])

  /**
   * 다른 패널 위치와의 근접도 기준 스냅 값을 찾는다.
   */
  const getSiblingSnapValue = useCallback((
    panelKey: PanelKey,
    axis: 'x' | 'y',
    value: number,
    offsetsForSnap: Record<PanelKey, PanelOffset>,
  ) => {
    let best: number | null = null
    let bestDistance = Number.POSITIVE_INFINITY

    for (const key of PANEL_KEYS) {
      if (key === panelKey) continue
      const candidate = offsetsForSnap[key]?.[axis]
      if (typeof candidate !== 'number') continue

      const distance = Math.abs(candidate - value)
      if (distance <= PANEL_SIBLING_SNAP_PX && distance < bestDistance) {
        best = candidate
        bestDistance = distance
      }
    }
    return best
  }, [])

  /**
   * 패널 오프셋 보정(경계 clamp + edge snap + sibling snap)
   */
  const clampPanelOffset = useCallback((
    panelKey: PanelKey,
    x: number,
    y: number,
    isOpenOverride?: boolean,
    offsetsForSnap?: Record<PanelKey, PanelOffset>,
  ): PanelOffset => {
    const { minX, maxX, minY, maxY } = getPanelBounds(panelKey, isOpenOverride)
    const clampedX = clampRange(x, minX, maxX)
    const clampedY = clampRange(y, minY, maxY)
    const edgeSnapX = snapToEdge(clampedX, minX, maxX, PANEL_EDGE_SNAP_PX)
    const edgeSnapY = snapToEdge(clampedY, minY, maxY, PANEL_EDGE_SNAP_PX)

    if (!offsetsForSnap) {
      return { x: edgeSnapX, y: edgeSnapY }
    }

    return {
      x: getSiblingSnapValue(panelKey, 'x', edgeSnapX, offsetsForSnap) ?? edgeSnapX,
      y: getSiblingSnapValue(panelKey, 'y', edgeSnapY, offsetsForSnap) ?? edgeSnapY,
    }
  }, [getPanelBounds, getSiblingSnapValue])

  /**
   * 최근 상호작용 패널을 가장 앞으로 올린다.
   */
  const bringPanelToFront = useCallback((panelKey: PanelKey) => {
    const nextZ = zCounterRef.current + 1
    zCounterRef.current = nextZ
    setPanelZIndexes((prev) => ({ ...prev, [panelKey]: nextZ }))
  }, [])

  /**
   * 패널 위치와 레이어를 초기 상태로 되돌린다.
   */
  const resetPanelPositions = useCallback(() => {
    setPanelOffsets(createPanelOffsetState())
    setPanelZIndexes(createPanelZIndexState())
    zCounterRef.current = 20
  }, [])

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const drag = dragRef.current
      if (drag) {
        const dxRaw = event.clientX - drag.startClientX
        const dyRaw = event.clientY - drag.startClientY

        if (event.shiftKey) {
          if (!drag.lockAxis) {
            drag.lockAxis = Math.abs(dxRaw) >= Math.abs(dyRaw) ? 'x' : 'y'
          }
        } else {
          drag.lockAxis = null
        }

        const dx = drag.lockAxis === 'y' ? 0 : dxRaw
        const dy = drag.lockAxis === 'x' ? 0 : dyRaw

        if (!dragMovedRef.current && (Math.abs(dx) > DRAG_CLICK_GUARD_PX || Math.abs(dy) > DRAG_CLICK_GUARD_PX)) {
          dragMovedRef.current = true
        }

        setPanelOffsets((prev) => {
          const nextOffset = clampPanelOffset(
            drag.panelKey,
            drag.startOffsetX + dx,
            drag.startOffsetY + dy,
            undefined,
            prev,
          )
          return { ...prev, [drag.panelKey]: nextOffset }
        })
      }

      const resize = resizeRef.current
      if (resize) {
        const deltaX = event.clientX - resize.startClientX
        const deltaY = event.clientY - resize.startClientY

        if (resize.axis === 'x' || resize.axis === 'both') {
          const nextWidth = clampRange(resize.startWidth + deltaX, PANEL_MIN_WIDTH, PANEL_MAX_WIDTH)
          setPanelWidths((prev) => ({ ...prev, [resize.panelKey]: nextWidth }))
        }
        if (resize.axis === 'y' || resize.axis === 'both') {
          const nextHeight = clampRange(resize.startHeight + deltaY, PANEL_MIN_HEIGHT, PANEL_MAX_HEIGHT)
          setPanelHeights((prev) => ({ ...prev, [resize.panelKey]: nextHeight }))
        }
      }
    }

    const onMouseUp = () => {
      if (dragRef.current && dragMovedRef.current) {
        suppressToggleByDragRef.current[dragRef.current.panelKey] = true
      }
      dragRef.current = null
      resizeRef.current = null
      dragMovedRef.current = false
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [clampPanelOffset, mode])

  useEffect(() => {
    const reclampAllPanels = () => {
      setPanelOffsets((prev) => ({
        attributes: clampPanelOffset('attributes', prev.attributes.x, prev.attributes.y),
        zoning: clampPanelOffset('zoning', prev.zoning.x, prev.zoning.y),
        assistant: clampPanelOffset('assistant', prev.assistant.x, prev.assistant.y),
        floorView: clampPanelOffset('floorView', prev.floorView.x, prev.floorView.y),
        hierarchy: clampPanelOffset('hierarchy', prev.hierarchy.x, prev.hierarchy.y),
      }))
    }

    reclampAllPanels()
    window.addEventListener('resize', reclampAllPanels)
    return () => window.removeEventListener('resize', reclampAllPanels)
  }, [clampPanelOffset, mode])

  /**
   * 패널 드래그 시작 핸들러
   */
  const startDrag = useCallback((panelKey: PanelKey, event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    resizeRef.current = null
    dragMovedRef.current = false
    dragRef.current = {
      panelKey,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffsetX: panelOffsets[panelKey].x,
      startOffsetY: panelOffsets[panelKey].y,
      lockAxis: null,
    }
    bringPanelToFront(panelKey)
  }, [bringPanelToFront, panelOffsets])

  /**
   * 패널 리사이즈 시작 핸들러
   */
  const startResize = useCallback((panelKey: PanelKey, axis: PanelResizeAxis, event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = null
    resizeRef.current = {
      panelKey,
      axis,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startWidth: panelWidths[panelKey],
      startHeight: panelHeights[panelKey],
    }
    bringPanelToFront(panelKey)
  }, [bringPanelToFront, panelHeights, panelWidths])

  /**
   * 패널 열림/닫힘 토글
   * - 드래그 직후 발생하는 클릭은 무시한다.
   */
  const togglePanel = useCallback((panelKey: PanelKey) => {
    if (suppressToggleByDragRef.current[panelKey]) {
      suppressToggleByDragRef.current[panelKey] = false
      return
    }

    setPanelOpenState((prev) => {
      const willOpen = !prev[panelKey]
      if (willOpen) {
        setPanelOffsets((currentOffsets) => {
          const current = currentOffsets[panelKey]
          const adjusted = clampPanelOffset(panelKey, current.x, current.y, true, currentOffsets)
          return { ...currentOffsets, [panelKey]: adjusted }
        })
        bringPanelToFront(panelKey)
      }
      return { ...prev, [panelKey]: willOpen }
    })
  }, [bringPanelToFront, clampPanelOffset])

  return {
    panelOffsets,
    panelOpenState,
    panelHeights,
    panelWidths,
    panelZIndexes,
    startDrag,
    startResize,
    togglePanel,
    resetPanelPositions,
  }
}

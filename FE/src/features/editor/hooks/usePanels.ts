import { useState, useRef, useEffect, useCallback, type MouseEvent as ReactMouseEvent } from 'react'
import type { PanelKey, EditorMode, PanelOffset, PanelResizeAxis } from '../types'
import { PANEL_MIN_WIDTH, PANEL_MAX_WIDTH, PANEL_MIN_HEIGHT, PANEL_MAX_HEIGHT } from '../constants'

const COLLAPSED_PANEL_SIZE = 44
const PANEL_VISIBLE_EDGE_PX = 56
const PANEL_RIGHT_DRAG_LIMIT_PX = 12
const VIEWPORT_TOP_RESERVED_PX = 120
const VIEWPORT_BOTTOM_RESERVED_PX = 24
const PANEL_EDGE_SNAP_PX = 18
const PANEL_SIBLING_SNAP_PX = 14
const DRAG_CLICK_GUARD_PX = 3

const PANEL_KEYS: PanelKey[] = ['attributes', 'zoning', 'assistant', 'floorView', 'hierarchy']

interface DragState {
  panelKey: PanelKey
  startClientX: number
  startClientY: number
  startOffsetX: number
  startOffsetY: number
  lockAxis: 'x' | 'y' | null
}

interface PanelMetrics {
  baseLeftViewport: number
  baseTopViewport: number
  parentWidth: number
  panelWidth: number
  panelHeight: number
}

/**
 * 우측 패널 드래그·리사이즈 상태 관리 훅
 * - 자유 이동 + 경계/형제 스냅
 * - Shift 축 고정 드래그
 * - 드래그된 패널을 맨 앞으로 정렬
 */
export function usePanels(mode: EditorMode) {
  const [panelOffsets, setPanelOffsets] = useState<Record<PanelKey, PanelOffset>>({
    attributes: { x: 0, y: 0 },
    zoning: { x: 0, y: 0 },
    assistant: { x: 0, y: 0 },
    floorView: { x: 0, y: 0 },
    hierarchy: { x: 0, y: 0 },
  })

  const [panelOpenState, setPanelOpenState] = useState<Record<PanelKey, boolean>>({
    attributes: true,
    zoning: true,
    assistant: true,
    floorView: true,
    hierarchy: true,
  })

  const [panelHeights, setPanelHeights] = useState<Record<PanelKey, number>>({
    attributes: 300,
    zoning: 200,
    assistant: 180,
    floorView: 150,
    hierarchy: 150,
  })

  const [panelWidths, setPanelWidths] = useState<Record<PanelKey, number>>({
    attributes: 300,
    zoning: 300,
    assistant: 300,
    floorView: 300,
    hierarchy: 300,
  })

  const [panelZIndexes, setPanelZIndexes] = useState<Record<PanelKey, number>>({
    attributes: 10,
    zoning: 11,
    assistant: 12,
    floorView: 13,
    hierarchy: 14,
  })
  const zCounterRef = useRef(20)

  const dragRef = useRef<DragState | null>(null)
  const dragMovedRef = useRef(false)
  const suppressToggleByDragRef = useRef<Record<PanelKey, boolean>>({
    attributes: false,
    zoning: false,
    assistant: false,
    floorView: false,
    hierarchy: false,
  })

  const resizeRef = useRef<{
    panelKey: PanelKey
    axis: PanelResizeAxis
    startClientX: number
    startClientY: number
    startWidth: number
    startHeight: number
  } | null>(null)

  const getPanelMetrics = useCallback((panelKey: PanelKey, isOpenOverride?: boolean): PanelMetrics | null => {
    if (typeof document === 'undefined') return null
    const panelEl = document.querySelector<HTMLElement>(`[data-panel-key="${panelKey}"]`)
    if (!panelEl) return null
    const parentEl = (panelEl.offsetParent as HTMLElement | null) ?? panelEl.parentElement
    if (!parentEl) return null

    const parentRect = parentEl.getBoundingClientRect()
    const isOpen = isOpenOverride ?? panelOpenState[panelKey]
    const panelWidth = isOpen ? panelWidths[panelKey] : COLLAPSED_PANEL_SIZE
    const panelHeight = isOpen ? panelHeights[panelKey] : COLLAPSED_PANEL_SIZE
    return {
      baseLeftViewport: parentRect.left + panelEl.offsetLeft,
      baseTopViewport: parentRect.top + panelEl.offsetTop,
      parentWidth: parentRect.width,
      panelWidth,
      panelHeight,
    }
  }, [panelOpenState, panelWidths, panelHeights])

  const getPanelBounds = useCallback((panelKey: PanelKey, isOpenOverride?: boolean) => {
    const metrics = getPanelMetrics(panelKey, isOpenOverride)
    if (metrics) {
      const visibleEdge = Math.min(PANEL_VISIBLE_EDGE_PX, metrics.panelWidth)
      const minLeftViewport = -(metrics.panelWidth - visibleEdge)
      const maxLeftViewport = window.innerWidth - visibleEdge
      const minTopViewport = VIEWPORT_TOP_RESERVED_PX - (metrics.panelHeight - visibleEdge)
      const maxTopViewport = window.innerHeight - VIEWPORT_BOTTOM_RESERVED_PX - visibleEdge

      return {
        minX: minLeftViewport - metrics.baseLeftViewport,
        maxX: maxLeftViewport - metrics.baseLeftViewport,
        minY: minTopViewport - metrics.baseTopViewport,
        maxY: maxTopViewport - metrics.baseTopViewport,
      }
    }

    const isOpen = isOpenOverride ?? panelOpenState[panelKey]
    const panelWidth = isOpen ? panelWidths[panelKey] : COLLAPSED_PANEL_SIZE
    const panelHeight = isOpen ? panelHeights[panelKey] : COLLAPSED_PANEL_SIZE

    const visibleEdge = Math.min(PANEL_VISIBLE_EDGE_PX, panelWidth)
    const minX = -(panelWidth - visibleEdge)
    const maxX = PANEL_RIGHT_DRAG_LIMIT_PX
    const minY = -Math.max(0, window.innerHeight - VIEWPORT_TOP_RESERVED_PX - PANEL_VISIBLE_EDGE_PX)
    const maxY = Math.max(
      minY,
      window.innerHeight - VIEWPORT_TOP_RESERVED_PX - VIEWPORT_BOTTOM_RESERVED_PX - panelHeight,
    )

    return { minX, maxX, minY, maxY }
  }, [getPanelMetrics, panelOpenState, panelWidths, panelHeights])

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

  const clampPanelOffset = useCallback((
    panelKey: PanelKey,
    x: number,
    y: number,
    isOpenOverride?: boolean,
    offsetsForSnap?: Record<PanelKey, PanelOffset>,
  ): PanelOffset => {
    const { minX, maxX, minY, maxY } = getPanelBounds(panelKey, isOpenOverride)
    const clampedX = Math.min(maxX, Math.max(minX, x))
    const clampedY = Math.min(maxY, Math.max(minY, y))

    const edgeSnapX =
      Math.abs(clampedX - minX) <= PANEL_EDGE_SNAP_PX
        ? minX
        : Math.abs(clampedX - maxX) <= PANEL_EDGE_SNAP_PX
          ? maxX
          : clampedX
    const edgeSnapY =
      Math.abs(clampedY - minY) <= PANEL_EDGE_SNAP_PX
        ? minY
        : Math.abs(clampedY - maxY) <= PANEL_EDGE_SNAP_PX
          ? maxY
          : clampedY

    if (!offsetsForSnap) {
      return { x: edgeSnapX, y: edgeSnapY }
    }

    const siblingX = getSiblingSnapValue(panelKey, 'x', edgeSnapX, offsetsForSnap)
    const siblingY = getSiblingSnapValue(panelKey, 'y', edgeSnapY, offsetsForSnap)
    return {
      x: siblingX ?? edgeSnapX,
      y: siblingY ?? edgeSnapY,
    }
  }, [getPanelBounds, getSiblingSnapValue])

  const bringPanelToFront = (panelKey: PanelKey) => {
    const nextZ = zCounterRef.current + 1
    zCounterRef.current = nextZ
    setPanelZIndexes((prev) => ({ ...prev, [panelKey]: nextZ }))
  }

  const resetPanelPositions = () => {
    setPanelOffsets({
      attributes: { x: 0, y: 0 },
      zoning: { x: 0, y: 0 },
      assistant: { x: 0, y: 0 },
      floorView: { x: 0, y: 0 },
      hierarchy: { x: 0, y: 0 },
    })
    setPanelZIndexes({
      attributes: 10,
      zoning: 11,
      assistant: 12,
      floorView: 13,
      hierarchy: 14,
    })
    zCounterRef.current = 20
  }

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (dragRef.current) {
        const drag = dragRef.current
        const dxRaw = e.clientX - drag.startClientX
        const dyRaw = e.clientY - drag.startClientY

        if (e.shiftKey) {
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
          const next = clampPanelOffset(
            drag.panelKey,
            drag.startOffsetX + dx,
            drag.startOffsetY + dy,
            undefined,
            prev,
          )
          return { ...prev, [drag.panelKey]: next }
        })
      }

      if (resizeRef.current) {
        const { panelKey, axis, startClientX, startClientY, startWidth, startHeight } = resizeRef.current

        if (axis === 'x' || axis === 'both') {
          const nextW = Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, startWidth + e.clientX - startClientX))
          setPanelWidths((prev) => ({ ...prev, [panelKey]: nextW }))
        }
        if (axis === 'y' || axis === 'both') {
          const nextH = Math.max(PANEL_MIN_HEIGHT, Math.min(PANEL_MAX_HEIGHT, startHeight + e.clientY - startClientY))
          setPanelHeights((prev) => ({ ...prev, [panelKey]: nextH }))
        }
      }
    }

    const onMouseUp = () => {
      if (dragRef.current && dragMovedRef.current) {
        suppressToggleByDragRef.current[dragRef.current.panelKey] = true
      }
      dragRef.current = null
      dragMovedRef.current = false
      resizeRef.current = null
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [mode, panelHeights, panelWidths, panelOpenState, clampPanelOffset])

  useEffect(() => {
    const reclamp = () => {
      setPanelOffsets((prev) => ({
        attributes: clampPanelOffset('attributes', prev.attributes.x, prev.attributes.y),
        zoning: clampPanelOffset('zoning', prev.zoning.x, prev.zoning.y),
        assistant: clampPanelOffset('assistant', prev.assistant.x, prev.assistant.y),
        floorView: clampPanelOffset('floorView', prev.floorView.x, prev.floorView.y),
        hierarchy: clampPanelOffset('hierarchy', prev.hierarchy.x, prev.hierarchy.y),
      }))
    }

    reclamp()
    window.addEventListener('resize', reclamp)
    return () => window.removeEventListener('resize', reclamp)
  }, [panelHeights, panelWidths, panelOpenState, clampPanelOffset])

  const startDrag = (panelKey: PanelKey, e: ReactMouseEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
    resizeRef.current = null
    dragMovedRef.current = false
    dragRef.current = {
      panelKey,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startOffsetX: panelOffsets[panelKey].x,
      startOffsetY: panelOffsets[panelKey].y,
      lockAxis: null,
    }
    bringPanelToFront(panelKey)
  }

  const startResize = (panelKey: PanelKey, axis: PanelResizeAxis, e: ReactMouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = null
    resizeRef.current = {
      panelKey,
      axis,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startWidth: panelWidths[panelKey],
      startHeight: panelHeights[panelKey],
    }
    bringPanelToFront(panelKey)
  }

  const togglePanel = (panelKey: PanelKey) => {
    if (suppressToggleByDragRef.current[panelKey]) {
      suppressToggleByDragRef.current[panelKey] = false
      return
    }

    setPanelOpenState((prev) => {
      const willOpen = !prev[panelKey]
      if (willOpen) {
        setPanelOffsets((currentOffsets) => {
          const current = currentOffsets[panelKey]
          if (!current) return currentOffsets
          const adjusted = clampPanelOffset(panelKey, current.x, current.y, true, currentOffsets)
          return { ...currentOffsets, [panelKey]: adjusted }
        })
        bringPanelToFront(panelKey)
      }
      return { ...prev, [panelKey]: willOpen }
    })
  }

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

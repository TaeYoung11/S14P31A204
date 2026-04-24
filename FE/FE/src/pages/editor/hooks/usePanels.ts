import { useState, useRef, useEffect, type MouseEvent as ReactMouseEvent } from 'react'
import type { PanelKey, EditorMode, PanelOffset, PanelResizeAxis } from '../types'
import { PANEL_MIN_WIDTH, PANEL_MAX_WIDTH, PANEL_MIN_HEIGHT, PANEL_MAX_HEIGHT } from '../constants'

/** 우측 패널의 드래그·리사이즈 상태를 관리하는 훅 */
export function usePanels(mode: EditorMode) {
  const [panelOffsets, setPanelOffsets] = useState<Record<PanelKey, PanelOffset>>({
    attributes: { x: 0, y: 0 },
    zoning: { x: 0, y: 0 },
    assistant: { x: 0, y: 0 },
  })
  const [panelOpenState, setPanelOpenState] = useState<Record<PanelKey, boolean>>({
    attributes: true,
    zoning: true,
    assistant: true,
  })
  const [panelHeights, setPanelHeights] = useState<Record<PanelKey, number>>({
    attributes: 300,
    zoning: 200,
    assistant: 180,
  })
  const [panelWidths, setPanelWidths] = useState<Record<PanelKey, number>>({
    attributes: 300,
    zoning: 300,
    assistant: 300,
  })

  const dragRef = useRef<{
    panelKey: PanelKey
    startClientX: number
    startClientY: number
    startOffsetX: number
    startOffsetY: number
  } | null>(null)

  const resizeRef = useRef<{
    panelKey: PanelKey
    axis: PanelResizeAxis
    startClientX: number
    startClientY: number
    startWidth: number
    startHeight: number
  } | null>(null)

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (dragRef.current) {
        const { panelKey, startClientX, startClientY, startOffsetX, startOffsetY } = dragRef.current
        const dx = e.clientX - startClientX
        const dy = e.clientY - startClientY
        // 패널이 서로 겹치지 않도록 최소 Y 오프셋 제한
        const minY =
          panelKey === 'attributes'
            ? 0
            : panelKey === 'zoning'
              ? -(panelHeights.attributes + 24)
              : -(panelHeights.attributes + (mode === 'bubble' ? panelHeights.zoning + 48 : 24))

        setPanelOffsets((prev) => ({
          ...prev,
          [panelKey]: { x: startOffsetX + dx, y: Math.max(minY, startOffsetY + dy) },
        }))
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
      dragRef.current = null
      resizeRef.current = null
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [mode, panelHeights.attributes, panelHeights.zoning])

  /** 패널 드래그 시작 */
  const startDrag = (panelKey: PanelKey, e: ReactMouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    resizeRef.current = null
    dragRef.current = {
      panelKey,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startOffsetX: panelOffsets[panelKey].x,
      startOffsetY: panelOffsets[panelKey].y,
    }
  }

  /** 패널 리사이즈 시작 */
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
  }

  /** 패널 열기/닫기 토글 */
  const togglePanel = (panelKey: PanelKey) => {
    setPanelOpenState((prev) => ({ ...prev, [panelKey]: !prev[panelKey] }))
  }

  return {
    panelOffsets,
    panelOpenState,
    panelHeights,
    panelWidths,
    startDrag,
    startResize,
    togglePanel,
  }
}

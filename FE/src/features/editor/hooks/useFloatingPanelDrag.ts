import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { PanelOffset } from '../types'

interface DragState {
  startClientX: number
  startClientY: number
  startOffsetX: number
  startOffsetY: number
}

const DRAG_CLICK_GUARD_PX = 3

/**
 * 캔버스 오버레이 패널(absolute) 공통 드래그 훅.
 * - 기존 기능 클릭 동작과 충돌하지 않도록 시작 지점을 명시적으로 연결해 사용한다.
 * - 부모(relative 컨테이너) 안에서만 이동하도록 경계를 제한한다.
 */
export function useFloatingPanelDrag(initialOffset: PanelOffset, margin = 8) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [offset, setOffset] = useState<PanelOffset>(initialOffset)
  const dragRef = useRef<DragState | null>(null)
  const hasDraggedRef = useRef(false)
  const suppressNextClickRef = useRef(false)

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const dragging = dragRef.current
      const panelEl = panelRef.current
      if (!dragging || !panelEl) return

      const nextRawX = dragging.startOffsetX + (e.clientX - dragging.startClientX)
      const nextRawY = dragging.startOffsetY + (e.clientY - dragging.startClientY)
      if (
        !hasDraggedRef.current &&
        (Math.abs(e.clientX - dragging.startClientX) > DRAG_CLICK_GUARD_PX ||
          Math.abs(e.clientY - dragging.startClientY) > DRAG_CLICK_GUARD_PX)
      ) {
        hasDraggedRef.current = true
      }

      const parentEl =
        (panelEl.offsetParent as HTMLElement | null) ??
        panelEl.parentElement

      if (!parentEl) {
        setOffset({ x: nextRawX, y: nextRawY })
        return
      }

      const parentRect = parentEl.getBoundingClientRect()
      const panelRect = panelEl.getBoundingClientRect()
      const minX = margin
      const minY = margin
      const maxX = Math.max(minX, parentRect.width - panelRect.width - margin)
      const maxY = Math.max(minY, parentRect.height - panelRect.height - margin)

      setOffset({
        x: Math.min(maxX, Math.max(minX, nextRawX)),
        y: Math.min(maxY, Math.max(minY, nextRawY)),
      })
    }

    const onMouseUp = () => {
      if (hasDraggedRef.current) {
        suppressNextClickRef.current = true
      }
      dragRef.current = null
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [margin])

  const startDrag = (e: ReactMouseEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
    hasDraggedRef.current = false
    dragRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startOffsetX: offset.x,
      startOffsetY: offset.y,
    }
  }

  const consumeClickSuppressedByDrag = () => {
    if (!suppressNextClickRef.current) return false
    suppressNextClickRef.current = false
    return true
  }

  return {
    panelRef,
    offset,
    setOffset,
    startDrag,
    consumeClickSuppressedByDrag,
  }
}

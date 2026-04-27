import { useState, useRef, useCallback, useEffect } from 'react'
import { Minus, Maximize2, Minimize2, X, GripHorizontal } from 'lucide-react'

export interface FloatingPanelProps {
  id: string
  title: string
  defaultPosition: { x: number; y: number }
  defaultSize: { width: number; height: number }
  children: React.ReactNode
  keepMounted?: boolean
  icon?: React.ReactNode
  onClose?: () => void
  defaultMinimized?: boolean
}

type PanelState = 'normal' | 'minimized' | 'maximized' | 'closed'

export default function FloatingPanel({
  id,
  title,
  defaultPosition,
  defaultSize,
  children,
  keepMounted = false,
  icon,
  onClose,
  defaultMinimized = false,
}: FloatingPanelProps) {
  const [state, setState] = useState<PanelState>(defaultMinimized ? 'minimized' : 'normal')
  const [position, setPosition] = useState(defaultPosition)
  const [size] = useState(defaultSize)

  const panelRef = useRef<HTMLDivElement>(null)
  const dragState = useRef({
    dragging: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  })

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (state === 'maximized') return
    e.preventDefault()
    dragState.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      originX: position.x,
      originY: position.y,
    }
  }, [state, position])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragState.current.dragging) return

      const dx = e.clientX - dragState.current.startX
      const dy = e.clientY - dragState.current.startY

      setPosition({
        x: Math.max(0, dragState.current.originX + dx),
        y: Math.max(0, dragState.current.originY + dy),
      })
    }

    const onUp = () => {
      dragState.current.dragging = false
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)

    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const minimize = () => setState((value) => (value === 'minimized' ? 'normal' : 'minimized'))
  const maximize = () => setState((value) => (value === 'maximized' ? 'normal' : 'maximized'))
  const close = () => {
    setState('closed')
    onClose?.()
  }

  if (state === 'closed' && !keepMounted) return null

  const isMaximized = state === 'maximized'
  const isMinimized = state === 'minimized'
  const isClosed = state === 'closed'

  const panelStyle: React.CSSProperties = isMaximized
    ? { position: 'absolute', inset: 0, width: undefined, height: undefined, zIndex: 30 }
    : {
        position: 'absolute',
        left: position.x,
        top: position.y,
        width: size.width,
        height: isMinimized ? 'auto' : size.height,
        zIndex: 20,
      }

  return (
    <div
      id={id}
      ref={panelRef}
      style={{ ...panelStyle, display: isClosed ? 'none' : undefined }}
      className="floating-panel"
    >
      <div
        className="floating-panel-header"
        onMouseDown={onMouseDown}
        onDoubleClick={maximize}
      >
        <GripHorizontal className="h-3.5 w-3.5 shrink-0 text-[#d1d5db]" />
        {icon && <span className="text-[#6b7280]">{icon}</span>}
        <span className="floating-panel-title">{title}</span>

        <div className="floating-panel-controls">
          <button
            id={`${id}-minimize`}
            className="panel-control-btn"
            onClick={(e) => {
              e.stopPropagation()
              minimize()
            }}
            title={isMinimized ? '펼치기' : '최소화'}
          >
            <Minus className="h-3 w-3" />
          </button>

          <button
            id={`${id}-maximize`}
            className="panel-control-btn"
            onClick={(e) => {
              e.stopPropagation()
              maximize()
            }}
            title={isMaximized ? '원래 크기' : '최대화'}
          >
            {isMaximized ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </button>

          <button
            id={`${id}-close`}
            className="panel-control-btn panel-control-btn-danger"
            onClick={(e) => {
              e.stopPropagation()
              close()
            }}
            title="닫기"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {!isMinimized && <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">{children}</div>}
    </div>
  )
}

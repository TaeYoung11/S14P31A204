import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { GripVertical, Maximize2, MessageSquare, Minimize2, X } from 'lucide-react'
import { CollaborationPanel } from '../../panels/CollaborationPanel'
import type { EditorRightPanelsProps } from './EditorRightPanels.types'
import { buildCollaborationPanelProps } from './buildCollaborationPanelProps'

type CollaborationDockProps = Pick<
  EditorRightPanelsProps,
  | 'selectedPinId'
  | 'selectedPin'
  | 'commentPins'
  | 'commentNotifications'
  | 'currentCollaborationUserType'
  | 'currentCollaborationUserId'
  | 'currentCollaborationUserName'
  | 'onSelectPin'
  | 'onCreateCommentReply'
  | 'onResolvePin'
  | 'onDeletePin'
  | 'onResolveComment'
  | 'resolvingPinId'
  | 'deletingPinId'
  | 'resolvingCommentId'
>

interface DragState {
  startClientX: number
  startClientY: number
  startOffsetX: number
  startOffsetY: number
}

interface ResizeState {
  axis: 'x' | 'y' | 'both'
  startClientX: number
  startClientY: number
  startWidth: number
  startHeight: number
}

const COLLAPSED_SIZE = 44
const MIN_WIDTH = 320
const MAX_WIDTH = 620
const MIN_HEIGHT = 280
const MAX_HEIGHT = 760

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * 협업 모드 전용 우측 도크
 * - 버블 모드가 아닌 경우, 일반 패널 대신 협업 패널만 표시한다.
 */
export default function EditorRightPanelsCollaborationDock({
  selectedPinId,
  selectedPin,
  commentPins,
  commentNotifications,
  currentCollaborationUserType,
  currentCollaborationUserId,
  currentCollaborationUserName,
  onSelectPin,
  onCreateCommentReply,
  onResolvePin,
  onDeletePin,
  onResolveComment,
  resolvingPinId,
  deletingPinId,
  resolvingCommentId,
}: CollaborationDockProps) {
  const [isVisible, setIsVisible] = useState(true)
  const [isMinimized, setIsMinimized] = useState(false)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [width, setWidth] = useState(340)
  const [height, setHeight] = useState(560)
  const dragRef = useRef<DragState | null>(null)
  const resizeRef = useRef<ResizeState | null>(null)

  const collaborationPanelProps = buildCollaborationPanelProps({
    selectedPinId,
    selectedPin,
    commentPins,
    commentNotifications,
    currentCollaborationUserType,
    currentCollaborationUserId,
    currentCollaborationUserName,
    onSelectPin,
    onCreateCommentReply,
    onResolvePin,
    onDeletePin,
    onResolveComment,
    resolvingPinId,
    deletingPinId,
    resolvingCommentId,
  })

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const drag = dragRef.current
      if (drag) {
        const panelWidth = isMinimized ? COLLAPSED_SIZE : width
        const panelHeight = isMinimized ? COLLAPSED_SIZE : height
        const minX = -Math.max(panelWidth - 56, 0)
        const maxX = 28
        const minY = 8
        const maxY = Math.max(minY, window.innerHeight - panelHeight - 120)
        const nextX = clamp(drag.startOffsetX + (event.clientX - drag.startClientX), minX, maxX)
        const nextY = clamp(drag.startOffsetY + (event.clientY - drag.startClientY), minY, maxY)
        setOffset({ x: nextX, y: nextY })
      }

      const resize = resizeRef.current
      if (resize) {
        const deltaX = event.clientX - resize.startClientX
        const deltaY = event.clientY - resize.startClientY
        const maxHeightByViewport = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, window.innerHeight - 140))

        if (resize.axis === 'x' || resize.axis === 'both') {
          const nextWidth = clamp(resize.startWidth + deltaX, MIN_WIDTH, MAX_WIDTH)
          setWidth(nextWidth)
        }
        if (resize.axis === 'y' || resize.axis === 'both') {
          const nextHeight = clamp(resize.startHeight + deltaY, MIN_HEIGHT, maxHeightByViewport)
          setHeight(nextHeight)
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
  }, [height, isMinimized, width])

  const startDrag = (event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault()
    dragRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffsetX: offset.x,
      startOffsetY: offset.y,
    }
  }

  const startResize = (axis: 'x' | 'y' | 'both', event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    resizeRef.current = {
      axis,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startWidth: width,
      startHeight: height,
    }
  }

  if (!isVisible) {
    return (
      <div className="relative z-30 flex w-[48px] shrink-0">
        <button
          type="button"
          onClick={() => setIsVisible(true)}
          className="mt-2 ml-1 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#DFE4F0] bg-white/95 text-[#5F6C88] shadow-[0_10px_24px_rgba(38,48,95,0.12)] transition-colors hover:bg-[#F3F6FD] hover:text-[#3B45B3]"
          title="협업 패널 열기"
          aria-label="협업 패널 열기"
        >
          <MessageSquare size={16} />
        </button>
      </div>
    )
  }

  return (
    <div
      className="relative z-30 shrink-0"
      style={{
        width: isMinimized ? COLLAPSED_SIZE : width,
        transform: `translate(${offset.x}px, ${offset.y}px)`,
      }}
    >
      <div
        className="relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[#DFE4F0] bg-white/95 shadow-[0_14px_30px_rgba(38,48,95,0.1)] backdrop-blur-sm transition-[width,height] duration-150"
        style={{ width: isMinimized ? COLLAPSED_SIZE : width, height: isMinimized ? COLLAPSED_SIZE : height }}
      >
        <div
          className="flex h-11 items-center justify-between border-b border-[#EEF1F8] px-3 cursor-grab active:cursor-grabbing"
          onMouseDown={startDrag}
        >
          <div className="flex items-center gap-2 text-[#3B45B3]">
            <GripVertical size={12} className="text-[#9AA4B5]" />
            {!isMinimized && <span className="text-[11px] font-extrabold">협업 패널</span>}
          </div>
          <div className="flex items-center gap-1" onMouseDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setIsMinimized((prev) => !prev)}
              className="rounded-md p-1 text-[#8D98AE] transition-colors hover:bg-[#EEF2FA] hover:text-[#3B45B3]"
              title={isMinimized ? '최소화 해제' : '최소화'}
              aria-label={isMinimized ? '최소화 해제' : '최소화'}
            >
              {isMinimized ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
            </button>
            <button
              type="button"
              onClick={() => setIsVisible(false)}
              className="rounded-md p-1 text-[#8D98AE] transition-colors hover:bg-[#FBECEF] hover:text-[#C23E3E]"
              title="닫기"
              aria-label="협업 패널 닫기"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {!isMinimized && (
          <>
            <div className="min-h-0 flex-1 overflow-hidden">
              <CollaborationPanel {...collaborationPanelProps} />
            </div>

            <button
              type="button"
              onMouseDown={(e) => startResize('y', e)}
              className="absolute bottom-0 left-0 h-2 w-full cursor-ns-resize"
              aria-label="협업 패널 세로 크기 조정"
            >
              <span className="absolute left-1/2 bottom-0 h-1 w-12 -translate-x-1/2 rounded-full bg-[#E2E6EF] transition-colors hover:bg-[#3B45B3]/35" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => startResize('x', e)}
              className="absolute right-0 top-0 h-full w-2 cursor-ew-resize"
              aria-label="협업 패널 가로 크기 조정"
            >
              <span className="absolute right-0 top-1/2 h-12 w-1 -translate-y-1/2 rounded-full bg-[#E2E6EF] transition-colors hover:bg-[#3B45B3]/35" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => startResize('both', e)}
              className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize bg-[#E2E6EF] transition-colors hover:bg-[#3B45B3]/35"
              aria-label="협업 패널 대각선 크기 조정"
            />
          </>
        )}
      </div>
    </div>
  )
}

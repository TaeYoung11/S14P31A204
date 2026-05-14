import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { ChevronLeft, ChevronRight, GripVertical } from 'lucide-react'
import type { PanelKey, PanelOffset, PanelResizeAxis } from '../../types'

interface ResizeHandlesProps {
  panelKey: PanelKey
  theme: 'light' | 'dark'
  onResizeStart: (key: PanelKey, axis: PanelResizeAxis, e: ReactMouseEvent<HTMLButtonElement>) => void
}

function ResizeHandles({ panelKey, theme, onResizeStart }: ResizeHandlesProps) {
  const hBar =
    theme === 'dark'
      ? 'absolute left-1/2 bottom-0 -translate-x-1/2 h-1 w-12 rounded-full bg-white/20 group-hover:bg-white/40 transition-colors'
      : 'absolute left-1/2 bottom-0 -translate-x-1/2 h-1 w-12 rounded-full bg-[#E2E6EF] group-hover:bg-[#3B45B3]/35 transition-colors'
  const vBar =
    theme === 'dark'
      ? 'absolute right-0 top-1/2 -translate-y-1/2 h-12 w-1 rounded-full bg-white/20 group-hover:bg-white/40 transition-colors'
      : 'absolute right-0 top-1/2 -translate-y-1/2 h-12 w-1 rounded-full bg-[#E2E6EF] group-hover:bg-[#3B45B3]/35 transition-colors'
  const corner =
    theme === 'dark'
      ? 'absolute right-0 bottom-0 w-3 h-3 cursor-nwse-resize bg-white/20 hover:bg-white/40 transition-colors'
      : 'absolute right-0 bottom-0 w-3 h-3 cursor-nwse-resize bg-[#E2E6EF] hover:bg-[#3B45B3]/35 transition-colors'

  return (
    <>
      <button
        onMouseDown={(e) => onResizeStart(panelKey, 'y', e)}
        className="absolute bottom-0 left-0 w-full h-2 cursor-ns-resize group"
        aria-label={`${panelKey} 패널 세로 크기 조정`}
      >
        <span className={hBar} />
      </button>
      <button
        onMouseDown={(e) => onResizeStart(panelKey, 'x', e)}
        className="absolute right-0 top-0 h-full w-2 cursor-ew-resize group"
        aria-label={`${panelKey} 패널 가로 크기 조정`}
      >
        <span className={vBar} />
      </button>
      <button
        onMouseDown={(e) => onResizeStart(panelKey, 'both', e)}
        className={corner}
        aria-label={`${panelKey} 패널 대각선 크기 조정`}
      />
    </>
  )
}

interface PanelFrameProps {
  panelKey: PanelKey
  title: string
  titleIcon?: ReactNode
  headerExtra?: ReactNode
  isOpen: boolean
  offset: PanelOffset
  width: number
  height?: number
  fillHeight?: boolean
  zIndex?: number
  theme?: 'light' | 'dark'
  onDragStart: (key: PanelKey, e: ReactMouseEvent<HTMLElement>) => void
  onResizeStart: (key: PanelKey, axis: PanelResizeAxis, e: ReactMouseEvent<HTMLButtonElement>) => void
  onToggle: (key: PanelKey) => void
  children: ReactNode
}

/** 드래그·리사이즈 가능한 재사용 패널 컨테이너 */
export function PanelFrame({
  panelKey,
  title,
  titleIcon,
  headerExtra,
  isOpen,
  offset,
  width,
  height,
  fillHeight = false,
  zIndex = 10,
  theme = 'light',
  onDragStart,
  onResizeStart,
  onToggle,
  children,
}: PanelFrameProps) {
  const COLLAPSED_SIZE = 44
  const isDark = theme === 'dark'
  const sectionClass = isDark
    ? 'relative bg-[#3B45B3] rounded-2xl shadow-lg shadow-[#3B45B3]/20 overflow-hidden flex flex-col min-h-0 shrink-0 transition-[width,height] duration-200'
    : 'relative bg-white border border-[#E2E6EF] rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-0 shrink-0 transition-[width,height] duration-200'
  const headerClass = isDark
    ? 'px-5 py-3 border-b border-white/10 flex items-center justify-between'
    : 'px-5 py-4 border-b border-[#F0F2F9] flex items-center justify-between'
  const dragBtnClass = isDark
    ? 'w-5 h-5 rounded-md bg-white/10 text-white/70 hover:text-white transition-colors flex items-center justify-center cursor-grab active:cursor-grabbing'
    : 'w-5 h-5 rounded-md bg-[#F3F5FA] text-[#9AA4B5] hover:text-[#505764] transition-colors flex items-center justify-center cursor-grab active:cursor-grabbing'
  const titleClass = isDark
    ? 'flex items-center gap-2 text-white'
    : 'flex items-center gap-2'
  const titleTextClass = isDark
    ? 'text-[11px] font-extrabold uppercase tracking-wider'
    : 'text-xs font-extrabold text-[#1C1C1E]'
  const toggleBtnClass = isDark
    ? 'text-white/40 hover:text-white/80 transition-colors'
    : 'text-[#ADB5BD] hover:text-[#505764] transition-colors'
  const collapsedButtonClass = isDark
    ? 'h-8 w-8 rounded-lg bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-colors flex items-center justify-center'
    : 'h-8 w-8 rounded-lg bg-[#F3F5FA] text-[#5B6A85] hover:bg-[#E8EDF8] hover:text-[#3B45B3] transition-colors flex items-center justify-center'

  return (
    <section
      data-panel-key={panelKey}
      className={sectionClass}
      style={{
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        width: isOpen ? width : COLLAPSED_SIZE,
        height: isOpen ? (fillHeight ? '100%' : height) : COLLAPSED_SIZE,
        maxHeight: isOpen ? (fillHeight ? '100%' : 'calc(100vh - 180px)') : COLLAPSED_SIZE,
        zIndex,
      }}
    >
      {isOpen ? (
        <>
          <div
            className={`${headerClass} cursor-grab active:cursor-grabbing`}
            onMouseDown={(e) => onDragStart(panelKey, e)}
          >
            <div className={titleClass}>
              {!titleIcon && (
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  className={dragBtnClass}
                  aria-label={`${title} 패널 이동`}
                >
                  <GripVertical size={12} />
                </button>
              )}
              {titleIcon}
              <h2 className={titleTextClass}>{title}</h2>
            </div>
            <div className="flex items-center gap-2" onMouseDown={(e) => e.stopPropagation()}>
              {headerExtra}
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => onToggle(panelKey)}
                className={toggleBtnClass}
                aria-label={`${title} 닫기`}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
            {children}
          </div>
          <ResizeHandles panelKey={panelKey} theme={theme} onResizeStart={onResizeStart} />
        </>
      ) : (
        <div
          onMouseDown={(e) => onDragStart(panelKey, e)}
          className="h-full w-full flex items-center justify-center cursor-grab active:cursor-grabbing"
          title={`${title} 이동`}
        >
          <button
            onClick={() => onToggle(panelKey)}
            className={collapsedButtonClass}
            aria-label={`${title} 열기`}
            title={title}
          >
            {titleIcon ?? <ChevronLeft size={16} />}
          </button>
        </div>
      )}
    </section>
  )
}

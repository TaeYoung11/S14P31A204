import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
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
  theme?: 'light' | 'dark'
  onDragStart: (key: PanelKey, e: ReactMouseEvent<HTMLButtonElement>) => void
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
  theme = 'light',
  onDragStart,
  onResizeStart,
  onToggle,
  children,
}: PanelFrameProps) {
  const isDark = theme === 'dark'
  const sectionClass = isDark
    ? 'relative bg-[#3B45B3] rounded-2xl shadow-lg shadow-[#3B45B3]/20 overflow-hidden flex flex-col min-h-0 shrink-0'
    : 'relative bg-white border border-[#E2E6EF] rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-0 shrink-0'
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

  return (
    <section
      className={sectionClass}
      style={{
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        width,
        height: isOpen ? height : undefined,
        maxHeight: 'calc(100vh - 180px)',
      }}
    >
      <div className={headerClass}>
        <div className={titleClass}>
          <button
            onMouseDown={(e) => onDragStart(panelKey, e)}
            className={dragBtnClass}
            aria-label={`${title} 패널 이동`}
          >
            <GripVertical size={12} />
          </button>
          {titleIcon}
          <h2 className={titleTextClass}>{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {headerExtra}
          <button
            onClick={() => onToggle(panelKey)}
            className={toggleBtnClass}
            aria-label={isOpen ? `${title} 닫기` : `${title} 열기`}
          >
            {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>
      {isOpen && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </div>
      )}
      <ResizeHandles panelKey={panelKey} theme={theme} onResizeStart={onResizeStart} />
    </section>
  )
}

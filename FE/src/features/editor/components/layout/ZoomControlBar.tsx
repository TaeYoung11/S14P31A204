import { useEffect, useRef } from 'react'
import { Grid3X3, GripVertical, Hand, Lock, Unlock, ZoomIn, ZoomOut } from 'lucide-react'
import type { EditorMode } from '../../types'
import { useFloatingPanelDrag } from '../../hooks/useFloatingPanelDrag'
import { MAX_EDITOR_ZOOM_PERCENT, MIN_EDITOR_ZOOM_PERCENT } from '../../constants'

interface ZoomControlBarProps {
  zoom: number
  mode: EditorMode
  selectedTool: string
  isGridVisible?: boolean
  isGridSnapEnabled?: boolean
  gridSnapIntervalMm?: number
  onZoomIn: () => void
  onZoomOut: () => void
  onSetZoom: (value: number) => void
  onSetTool: (tool: string) => void
  onToggleGrid?: () => void
  onToggleGridSnap?: () => void
  onGridSnapIntervalChange?: (value: number) => void
  isRotationLocked?: boolean
  onToggleRotationLock?: () => void
}

export function ZoomControlBar({
  zoom,
  mode,
  selectedTool,
  isGridVisible = false,
  isGridSnapEnabled = true,
  gridSnapIntervalMm = 250,
  onZoomIn,
  onZoomOut,
  onSetZoom,
  onSetTool,
  onToggleGrid,
  onToggleGridSnap,
  onGridSnapIntervalChange,
  isRotationLocked = false,
  onToggleRotationLock,
}: ZoomControlBarProps) {
  const { panelRef, offset, setOffset, startDrag } = useFloatingPanelDrag({ x: 24, y: 24 }, 12)
  const didInitPositionRef = useRef(false)

  useEffect(() => {
    if (didInitPositionRef.current) return
    const panelEl = panelRef.current
    const parentEl = (panelEl?.offsetParent as HTMLElement | null) ?? panelEl?.parentElement
    if (!panelEl || !parentEl) return

    didInitPositionRef.current = true
    const nextY = Math.max(12, parentEl.clientHeight - panelEl.offsetHeight - 24)
    setOffset((prev) => ({ ...prev, y: nextY }))
  }, [panelRef, setOffset])

  const handleGridSnapToggle = () => {
    const nextSnapEnabled = !isGridSnapEnabled
    onToggleGridSnap?.()
    if (mode === '2d' && isGridVisible !== nextSnapEnabled) onToggleGrid?.()
  }

  const isGridControlActive = mode === '2d'
    ? isGridSnapEnabled && isGridVisible
    : isGridSnapEnabled
  const gridSnapTitle = mode === '2d'
    ? `Grid snap (${isGridVisible ? 'grid on' : 'grid off'})`
    : 'Grid snap'

  return (
    <div
      ref={panelRef}
      className="absolute flex items-center bg-white border border-[#E2E6EF] rounded-2xl px-1.5 py-1.5 shadow-md z-10 transition-all"
      style={{ left: offset.x, top: offset.y }}
    >
      <button
        onMouseDown={startDrag}
        title="Move panel"
        aria-label="Move zoom control panel"
        className="p-1.5 text-[#9AA4B5] hover:text-[#505764] transition-colors rounded-xl hover:bg-[#F3F5FA] cursor-grab active:cursor-grabbing"
      >
        <GripVertical size={18} />
      </button>

      <div className="w-px h-5 bg-[#E2E6EF] mx-1.5" />

      <button
        onClick={onZoomOut}
        aria-label="Zoom out"
        className="p-1.5 text-[#6B7A99] hover:text-[#1C1C1E] transition-colors rounded-xl hover:bg-[#F0F2F9]"
      >
        <ZoomOut size={20} />
      </button>

      <input
        key={zoom}
        type="text"
        defaultValue={`${zoom}%`}
        onFocus={(e) => {
          e.currentTarget.value = String(zoom)
          e.currentTarget.select()
        }}
        onBlur={(e) => {
          const num = parseInt(e.currentTarget.value, 10)
          const clamped = isNaN(num)
            ? zoom
            : Math.min(Math.max(num, MIN_EDITOR_ZOOM_PERCENT), MAX_EDITOR_ZOOM_PERCENT)
          onSetZoom(clamped)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (!/[0-9]|Backspace|Delete|ArrowLeft|ArrowRight|Tab/.test(e.key)) e.preventDefault()
        }}
        aria-label="Zoom percent"
        className="text-[13px] font-semibold text-[#1C1C1E] w-[52px] text-center bg-transparent outline-none cursor-text"
      />

      <button
        onClick={onZoomIn}
        aria-label="Zoom in"
        className="p-1.5 text-[#6B7A99] hover:text-[#1C1C1E] transition-colors rounded-xl hover:bg-[#F0F2F9]"
      >
        <ZoomIn size={20} />
      </button>

      <div className="w-px h-5 bg-[#E2E6EF] mx-1.5" />

      <button
        onClick={() => onSetTool(selectedTool === 'hand' ? 'selection' : 'hand')}
        aria-label="Hand tool"
        className={`p-1.5 transition-colors rounded-xl ${
          selectedTool === 'hand'
            ? 'text-[#3B45B3] bg-[#F0F2FF]'
            : 'text-[#6B7A99] hover:text-[#1C1C1E] hover:bg-[#F0F2F9]'
        }`}
      >
        <Hand size={20} />
      </button>

      {(mode === '2d' || mode === '3d') && (
        <>
          <div className="w-px h-5 bg-[#E2E6EF] mx-1.5" />
          <button
            onClick={handleGridSnapToggle}
            title={gridSnapTitle}
            aria-label={gridSnapTitle}
            className={`p-1.5 transition-colors rounded-xl ${
              isGridControlActive
                ? 'text-[#3B45B3] bg-[#F0F2FF]'
                : 'text-[#6B7A99] hover:text-[#1C1C1E] hover:bg-[#F0F2F9]'
            }`}
          >
            <Grid3X3 size={20} />
          </button>
          <select
            value={gridSnapIntervalMm}
            onChange={(e) => onGridSnapIntervalChange?.(Number(e.target.value))}
            className="ml-1 h-8 rounded-lg border border-[#E2E6EF] bg-white px-2 text-[11px] font-semibold text-[#505764] outline-none focus:border-[#3B45B3]"
            title="Grid snap interval"
            aria-label="Grid snap interval"
          >
            <option value={100}>100mm</option>
            <option value={250}>250mm</option>
            <option value={500}>500mm</option>
          </select>
        </>
      )}

      {mode === '3d' && (
        <>
          <div className="w-px h-5 bg-[#E2E6EF] mx-2" />
          <button
            aria-label="3D rotate"
            className="p-1.5 text-[#3B45B3] bg-[#F0F2FF] rounded-xl shadow-sm"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M20.5 5.5C18.6 3.6 16 2.5 13 2.5V0.5L9.5 3.5L13 6.5V4.5C15.4 4.5 17.6 5.4 19.1 6.9L20.5 5.5Z" />
              <path d="M3.5 18.5C5.4 20.4 8 21.5 11 21.5V23.5L14.5 20.5L11 17.5V19.5C8.6 19.5 6.4 18.6 4.9 17.1L3.5 18.5Z" />
              <path d="M21.5 7.5C22.4 9 23 10.5 23 12H21C21 10.9 20.6 9.8 19.9 8.8L21.5 7.5Z" />
              <path d="M2.5 16.5C1.6 15 1 13.5 1 12H3C3 13.1 3.4 14.2 4.1 15.2L2.5 16.5Z" />
              <text x="12" y="15.5" textAnchor="middle" fontSize="8" fontWeight="900" fontFamily="Arial, sans-serif" fill="currentColor">3D</text>
            </svg>
          </button>
          <button
            onClick={onToggleRotationLock}
            title="Rotation lock"
            aria-label="Rotation lock"
            className={`ml-1 p-1.5 transition-colors rounded-xl ${
              isRotationLocked
                ? 'text-[#3B45B3] bg-[#F0F2FF]'
                : 'text-[#6B7A99] hover:text-[#1C1C1E] hover:bg-[#F0F2F9]'
            }`}
          >
            {isRotationLocked ? <Lock size={20} /> : <Unlock size={20} />}
          </button>
          <div className="w-px h-5 bg-[#E2E6EF] mx-2" />
          <span className="text-[11px] font-bold text-[#6B7A99] px-2 tabular-nums">
            X Y Z: 142.4, 33.1, 0.0
          </span>
        </>
      )}
    </div>
  )
}

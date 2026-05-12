import { Grid3X3, Hand, Lock, Move, RotateCw, Scaling, Unlock, ZoomIn, ZoomOut } from 'lucide-react'
import type { EditorMode } from '../../types'
import { MAX_EDITOR_ZOOM_PERCENT, MIN_EDITOR_ZOOM_PERCENT } from '../../constants'

interface ZoomControlBarProps {
  zoom: number
  mode: EditorMode
  selectedTool: string
  threeDCoordinates?: { x: number; y: number; z: number }
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

const toolBtnCls = (isActive: boolean) =>
  `rounded-xl p-1.5 transition-colors ${
    isActive
      ? 'bg-[#F0F2FF] text-[#3B45B3]'
      : 'text-[#6B7A99] hover:bg-[#F0F2F9] hover:text-[#1C1C1E]'
  }`

const formatZoom = (zoom: number) => (zoom < 10 ? zoom.toFixed(1) : String(Math.round(zoom)))

/**
 * 캔버스 하단 중앙에 표시되는 줌/도구 제어 바.
 */
export function ZoomControlBar({
  zoom,
  mode,
  selectedTool,
  threeDCoordinates = { x: 0, y: 0, z: 0 },
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
  const isGridControlActive = mode === '2d' ? isGridSnapEnabled && isGridVisible : isGridSnapEnabled
  const gridSnapTitle = mode === '2d'
    ? `그리드 스냅 ${isGridControlActive ? '끄기' : '켜기'}`
    : '그리드 스냅 전환'

  const handleGridSnapToggle = () => {
    const nextSnapEnabled = !isGridSnapEnabled
    onToggleGridSnap?.()
    if (mode === '2d' && isGridVisible !== nextSnapEnabled) onToggleGrid?.()
  }

  return (
    <div className="absolute bottom-6 left-1/2 z-[110] flex -translate-x-1/2 items-center rounded-2xl border border-[#DFE4F0] bg-white/95 px-1.5 py-1.5 shadow-[0_14px_28px_rgba(34,44,92,0.16)] backdrop-blur-sm transition-all">
      <button
        onClick={onZoomOut}
        aria-label="줌 축소"
        className="rounded-xl p-1.5 text-[#6B7A99] transition-colors hover:bg-[#F0F2F9] hover:text-[#1C1C1E]"
      >
        <ZoomOut size={20} />
      </button>

      <input
        key={zoom}
        type="text"
        defaultValue={`${formatZoom(zoom)}%`}
        onFocus={(e) => {
          e.currentTarget.value = formatZoom(zoom)
          e.currentTarget.select()
        }}
        onBlur={(e) => {
          const num = Number.parseFloat(e.currentTarget.value)
          const clamped = isNaN(num)
            ? zoom
            : Math.min(Math.max(num, MIN_EDITOR_ZOOM_PERCENT), MAX_EDITOR_ZOOM_PERCENT)
          onSetZoom(clamped)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (!/[0-9.]|Backspace|Delete|ArrowLeft|ArrowRight|Tab/.test(e.key)) e.preventDefault()
        }}
        aria-label="줌 비율 입력"
        className="w-[54px] cursor-text rounded-md bg-transparent text-center text-[13px] font-semibold text-[#1C1C1E] outline-none focus:bg-[#F5F7FD]"
      />

      <button
        onClick={onZoomIn}
        aria-label="줌 확대"
        className="rounded-xl p-1.5 text-[#6B7A99] transition-colors hover:bg-[#F0F2F9] hover:text-[#1C1C1E]"
      >
        <ZoomIn size={20} />
      </button>

      <div className="mx-1.5 h-5 w-px bg-[#E2E6EF]" />

      <button
        onClick={() => onSetTool(selectedTool === 'hand' ? 'selection' : 'hand')}
        aria-label="손 도구 전환"
        className={toolBtnCls(selectedTool === 'hand')}
      >
        <Hand size={20} />
      </button>

      {mode === '2d' && (
        <>
          <div className="mx-1.5 h-5 w-px bg-[#E2E6EF]" />
          <button
            onClick={handleGridSnapToggle}
            title={gridSnapTitle}
            aria-label={gridSnapTitle}
            className={toolBtnCls(isGridControlActive)}
          >
            <Grid3X3 size={20} />
          </button>
          <select
            value={gridSnapIntervalMm}
            onChange={(e) => onGridSnapIntervalChange?.(Number(e.target.value))}
            className="ml-1 h-8 rounded-lg border border-[#E2E6EF] bg-white px-2 text-[11px] font-semibold text-[#505764] outline-none transition-colors focus:border-[#3B45B3]"
            title="그리드 스냅 간격"
            aria-label="그리드 스냅 간격"
          >
            <option value={100}>100mm</option>
            <option value={250}>250mm</option>
            <option value={500}>500mm</option>
          </select>
        </>
      )}

      {mode === '3d' && (
        <>
          <div className="mx-2 h-5 w-px bg-[#E2E6EF]" />
          <button
            onClick={() => onSetTool('selection')}
            title="이동"
            aria-label="이동"
            className={toolBtnCls(selectedTool !== 'hand' && selectedTool !== 'rotate' && selectedTool !== 'scale')}
          >
            <Move size={20} />
          </button>
          <button
            onClick={() => onSetTool('rotate')}
            title="회전"
            aria-label="회전"
            className={toolBtnCls(selectedTool === 'rotate')}
          >
            <RotateCw size={20} />
          </button>
          <button
            onClick={() => onSetTool('scale')}
            title="크기 조절"
            aria-label="크기 조절"
            className={toolBtnCls(selectedTool === 'scale')}
          >
            <Scaling size={20} />
          </button>
          <div className="mx-2 h-5 w-px bg-[#E2E6EF]" />
          <button
            onClick={onToggleRotationLock}
            title="카메라 회전 잠금"
            aria-label="카메라 회전 잠금"
            className={toolBtnCls(isRotationLocked)}
          >
            {isRotationLocked ? <Lock size={20} /> : <Unlock size={20} />}
          </button>
          <div className="mx-2 h-5 w-px bg-[#E2E6EF]" />
          <span className="px-2 text-[11px] font-bold tabular-nums text-[#6B7A99]">
            X Y Z: {threeDCoordinates.x.toFixed(1)}, {threeDCoordinates.y.toFixed(1)},{' '}
            {threeDCoordinates.z.toFixed(1)}
          </span>
        </>
      )}
    </div>
  )
}

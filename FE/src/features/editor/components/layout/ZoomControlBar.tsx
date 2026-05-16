import { Grid3X3, GripVertical, Hand, Lock, Magnet, Move, RotateCw, Scaling, Unlock, ZoomIn, ZoomOut } from 'lucide-react'
import type { EditorMode } from '../../types'
import { useFloatingPanelDrag } from '../../hooks/useFloatingPanelDrag'
import { useZoomControlBar } from '../../hooks/useZoomControlBar'
import { MAX_EDITOR_ZOOM_PERCENT, MIN_EDITOR_ZOOM_PERCENT } from '../../constants'
import type { ThreeDCameraViewPreset } from '@/pages/editor/components/canvas-content/buildCanvasSectionProps'
import { CAMERA_VIEW_PRESETS, GRID_SNAP_INTERVAL_OPTIONS } from './zoomControlBar.constants'

interface ZoomControlBarProps {
  /** 현재 줌 퍼센트 (예: 100 = 100%) */
  zoom: number
  /** 현재 에디터 모드 */
  mode: EditorMode
  /** 현재 선택된 도구 식별자 */
  selectedTool: string
  /** 3D 모드에서 표시할 현재 카메라 좌표 */
  threeDCoordinates?: { x: number; y: number; z: number }
  /** 그리드 표시 여부 (2D 모드) */
  isGridVisible?: boolean
  /** 그리드 스냅 활성화 여부 */
  isGridSnapEnabled?: boolean
  /** 그리드 스냅 간격 (mm 단위) */
  gridSnapIntervalMm?: number
  onZoomIn: () => void
  onZoomOut: () => void
  /** 줌 퍼센트 직접 설정 */
  onSetZoom: (value: number) => void
  /** 현재 도구 변경 */
  onSetTool: (tool: string) => void
  onToggleGrid?: () => void
  onToggleGridSnap?: () => void
  onGridSnapIntervalChange?: (value: number) => void
  /** 3D 카메라 회전 잠금 여부 */
  isRotationLocked?: boolean
  onToggleRotationLock?: () => void
  selectedCameraViewPreset?: ThreeDCameraViewPreset | null
  onSelectCameraViewPreset?: (preset: ThreeDCameraViewPreset) => void
  /** CONVERTING 등 편집 잠금 상태 */
  isEditingLocked?: boolean
}

/**
 * 툴 버튼 활성/비활성 className 생성 헬퍼.
 * 활성 상태일 때는 파란 배경·글자, 비활성일 때는 회색 글자에 호버 효과를 적용한다.
 */
const toolBtnCls = (isActive: boolean) =>
  `rounded-xl p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
    isActive
      ? 'bg-[#F0F2FF] text-[#3B45B3]'
      : 'text-[#6B7A99] hover:bg-[#F0F2F9] hover:text-[#1C1C1E]'
  }`

const formatZoom = (zoom: number) => (zoom < 10 ? zoom.toFixed(1) : String(Math.round(zoom)))

/**
 * 캔버스 좌하단 고정 줌 컨트롤 바
 * - 줌 아웃 / 수치 입력 / 줌 인 / 손 도구 토글 버튼 포함
 * - 3D 모드에서는 회전/크기 기즈모 버튼, 카메라 회전 잠금, 현재 좌표를 추가로 표시
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
  selectedCameraViewPreset = null,
  onSelectCameraViewPreset,
  isEditingLocked = false,
}: ZoomControlBarProps) {
  const { panelRef, offset, setOffset, startDrag } = useFloatingPanelDrag({ x: 24, y: 24 }, 12)
  const { isGridControlActive, gridSnapTitle, handleGridSnapToggle } = useZoomControlBar({
    mode,
    isGridVisible,
    isGridSnapEnabled,
    gridSnapIntervalMm,
    onToggleGrid,
    onToggleGridSnap,
    panelRef,
    setOffset,
  })

  return (
    <div
      ref={panelRef}
      className="absolute z-10 flex items-center rounded-2xl border border-[#DFE4F0] bg-white/95 px-1.5 py-1.5 shadow-[0_14px_28px_rgba(34,44,92,0.16)] backdrop-blur-sm transition-all"
      style={{ left: offset.x, top: offset.y }}
    >
      <button
        onMouseDown={startDrag}
        title="패널 이동"
        aria-label="줌 컨트롤 패널 이동"
        className="cursor-grab rounded-xl p-1.5 text-[#9AA4B5] transition-colors hover:bg-[#F3F5FA] hover:text-[#505764] active:cursor-grabbing"
      >
        <GripVertical size={18} />
      </button>

      <div className="mx-1.5 h-5 w-px bg-[#E2E6EF]" />

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
        aria-label="줌 퍼센트 직접 입력"
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
        onPointerDown={(event) => invokeToolByPointerDown(event, () => onSetTool(selectedTool === 'hand' ? 'selection' : 'hand'))}
        onClick={(event) => {
          if (event.detail > 0) return
          onSetTool(selectedTool === 'hand' ? 'selection' : 'hand')
        }}
        aria-label="손 도구 (드래그 패닝)"
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
            title="그리드 스냅 간격(mm)"
            aria-label="Grid snap interval"
          >
            {GRID_SNAP_INTERVAL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </>
      )}

      {mode === '3d' && (
        <>
          <div className="mx-2 h-5 w-px bg-[#E2E6EF]" />
          {/* 오브젝트 변환 기즈모: 이동 / 회전 / 크기 */}
          <button
            onClick={() => onSetTool('selection')}
            title="이동 기즈모 (Move) · W"
            aria-label="이동 기즈모"
            className={toolBtnCls(selectedTool !== 'hand' && selectedTool !== 'rotate' && selectedTool !== 'scale')}
          >
            <Move size={20} />
          </button>
          <button
            onClick={() => onSetTool('rotate')}
            title="회전 기즈모 (Rotate) · E"
            aria-label="회전 기즈모"
            disabled={isEditingLocked}
            className={toolBtnCls(selectedTool === 'rotate')}
          >
            <RotateCw size={20} />
          </button>
          <button
            onClick={() => onSetTool('scale')}
            title="크기 기즈모 (Scale) · R"
            aria-label="크기 기즈모"
            disabled={isEditingLocked}
            className={toolBtnCls(selectedTool === 'scale')}
          >
            <Scaling size={20} />
          </button>
          <div className="mx-2 h-5 w-px bg-[#E2E6EF]" />
          <button
            onClick={handleGridSnapToggle}
            title={gridSnapTitle}
            aria-label={gridSnapTitle}
            disabled={isEditingLocked}
            className={toolBtnCls(isGridControlActive)}
          >
            <Magnet size={20} />
          </button>
          <select
            value={gridSnapIntervalMm}
            onChange={(e) => onGridSnapIntervalChange?.(Number(e.target.value))}
            disabled={isEditingLocked}
            className="ml-1 h-8 rounded-lg border border-[#E2E6EF] bg-white px-2 text-[11px] font-semibold text-[#505764] outline-none transition-colors focus:border-[#3B45B3] disabled:cursor-not-allowed disabled:opacity-55"
            title="3D 스냅 간격(mm)"
            aria-label="3D snap interval"
          >
            {GRID_SNAP_INTERVAL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <div className="mx-2 h-5 w-px bg-[#E2E6EF]" />
          <button
            onClick={onToggleRotationLock}
            title="카메라 회전 잠금"
            aria-label="카메라 회전 잠금 토글"
            className={toolBtnCls(isRotationLocked)}
          >
            {isRotationLocked ? <Lock size={20} /> : <Unlock size={20} />}
          </button>
          <div className="mx-2 h-5 w-px bg-[#E2E6EF]" />
          <div className="flex items-center gap-1">
            {CAMERA_VIEW_PRESETS.map((preset) => (
              <button
                key={preset.key}
                onClick={() => onSelectCameraViewPreset?.(preset.key)}
                title={preset.title}
                aria-label={preset.title}
                className={`rounded-lg px-2 py-1 text-[10px] font-bold transition-colors ${
                  selectedCameraViewPreset === preset.key
                    ? 'bg-[#F0F2FF] text-[#3B45B3]'
                    : 'text-[#6B7A99] hover:bg-[#F0F2F9] hover:text-[#1C1C1E]'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
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

// 뷰어 모드의 렌더링 목록 사이드바를 표시한다.
import type { MouseEvent as ReactMouseEvent, Ref } from 'react'
import { GripVertical, Image, Info, WandSparkles } from 'lucide-react'
import type { ProjectRenderResponse } from '../../services/projectRender.service'

interface RenderHistorySidebarProps {
  panelRef: Ref<HTMLDivElement>
  offset: { x: number; y: number }
  renders: ProjectRenderResponse[]
  timeOfDay: string
  season: string
  isRequesting: boolean
  canRequestRender: boolean
  errorMessage?: string | null
  onTimeOfDayChange: (value: string) => void
  onSeasonChange: (value: string) => void
  onRequestRender: () => void
  onDragStart: (event: ReactMouseEvent<HTMLElement>) => void
}

const TIME_OF_DAY_OPTIONS = ['DAY', 'NIGHT']
const SEASON_OPTIONS = ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER']
const OPTION_LABELS: Record<string, string> = {
  DAY: '낮',
  NIGHT: '밤',
  SPRING: '봄',
  SUMMER: '여름',
  AUTUMN: '가을',
  WINTER: '겨울',
}

const getRenderStatusLabel = (status: string): string => {
  if (status === 'SUCCEEDED') return '완료'
  if (status === 'FAILED') return '실패'
  if (status === 'RUNNING' || status === 'PROCESSING') return '진행 중'
  return '대기 중'
}

const getRenderStatusClass = (status: string): string => {
  if (status === 'SUCCEEDED') return 'bg-[#dcfce7] text-[#15803d]'
  if (status === 'FAILED') return 'bg-[#fee2e2] text-[#dc2626]'
  if (status === 'RUNNING' || status === 'PROCESSING') return 'bg-[#dbeafe] text-[#2563eb]'
  return 'bg-[#fef3c7] text-[#b45309]'
}

const normalizeProgress = (progress: number | null | undefined, status: string): number => {
  if (typeof progress === 'number' && Number.isFinite(progress)) {
    return Math.min(100, Math.max(0, Math.round(progress)))
  }
  if (status === 'SUCCEEDED') return 100
  return 0
}

const hasTimezoneSuffix = (value: string): boolean => /[zZ]$|[+-]\d{2}:\d{2}$/.test(value)

const formatRenderCreatedAt = (createdAt: string): string => {
  const normalized = createdAt.trim()
  const localMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (localMatch && !hasTimezoneSuffix(normalized)) {
    return `${localMatch[2]}. ${localMatch[3]}. ${localMatch[4]}:${localMatch[5]}`
  }

  const timestamp = new Date(normalized)
  if (Number.isNaN(timestamp.getTime())) return '-'
  return timestamp.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export default function RenderHistorySidebar({
  panelRef,
  offset,
  renders,
  timeOfDay,
  season,
  isRequesting,
  canRequestRender,
  errorMessage,
  onTimeOfDayChange,
  onSeasonChange,
  onRequestRender,
  onDragStart,
}: RenderHistorySidebarProps) {
  return (
    <div
      ref={panelRef}
      className="absolute flex max-h-[calc(100%-120px)] w-[320px] flex-col rounded-[24px] border border-white/10 bg-[#1C1C1E]/75 p-5 text-white shadow-2xl backdrop-blur-md"
      style={{ left: offset.x, top: offset.y }}
    >
      <div
        className="mb-5 flex cursor-grab items-center justify-between active:cursor-grabbing"
        onMouseDown={onDragStart}
      >
        <h3 className="text-sm font-black tracking-tight text-white/90">렌더링 목록</h3>
        <div className="flex items-center gap-2">
          <GripVertical size={16} className="text-white/35" />
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/5 bg-white/5">
            <Info size={16} className="text-white/60" />
          </div>
        </div>
      </div>

      <div className="mb-4">
        <div className="grid grid-cols-2 gap-2">
          <RenderSelect label="시간대" value={timeOfDay} options={TIME_OF_DAY_OPTIONS} onChange={onTimeOfDayChange} />
          <RenderSelect label="계절" value={season} options={SEASON_OPTIONS} onChange={onSeasonChange} />
        </div>
        <button
          type="button"
          disabled={!canRequestRender}
          onClick={onRequestRender}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 py-3 text-[12px] font-black text-white transition-all hover:scale-[1.02] hover:bg-white/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:scale-100"
        >
          <WandSparkles size={14} />
          {isRequesting ? '이미지 생성 중' : '이미지 생성'}
        </button>
        {errorMessage ? (
          <p className="mt-2 text-[11px] font-bold leading-4 text-[#fecaca]">{errorMessage}</p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {renders.length > 0 ? (
          <div className="flex flex-col gap-3">
            {renders.map((render) => (
              <RenderHistoryItem key={render.renderId} render={render} />
            ))}
          </div>
        ) : (
          <div className="flex min-h-[180px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.04] px-5 text-center">
            <Image size={24} className="mb-3 text-white/35" />
            <p className="text-xs font-bold text-white/70">아직 생성된 렌더링이 없습니다.</p>
            <p className="mt-2 text-[11px] leading-5 text-white/40">렌더링 요청이 완료되면 이 목록에 표시됩니다.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function RenderHistoryItem({ render }: { render: ProjectRenderResponse }) {
  const progress = normalizeProgress(render.progress, render.status)

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-black text-white/90">렌더링 이미지</p>
          <p className="mt-1 text-[10px] font-bold text-white/40">
            {formatRenderCreatedAt(render.createdAt)}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${getRenderStatusClass(render.status)}`}>
          {getRenderStatusLabel(render.status)}
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-white/70 transition-[width]"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-1 text-right text-[10px] font-bold text-white/40">
        {progress}%
      </p>
    </div>
  )
}

interface RenderSelectProps {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}

function RenderSelect({ label, value, options, onChange }: RenderSelectProps) {
  return (
    <label className="block">
      <span className="block text-[10px] font-black uppercase tracking-widest text-white/35">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-9 w-full rounded-xl border border-white/10 bg-[#111113] px-2 text-[11px] font-bold text-white outline-none focus:border-white/30"
      >
        {options.map((option) => (
          <option key={option} value={option}>{OPTION_LABELS[option] ?? option}</option>
        ))}
      </select>
    </label>
  )
}

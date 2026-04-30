import type { EditorMode } from '../../types'
import Spinner from '@/shared/components/Spinner'

type CanvasMode = EditorMode
type PanelMode = Exclude<EditorMode, 'view'>
type PanelSide = 'left' | 'right'

const CANVAS_LOADING_LABELS: Record<CanvasMode, string> = {
  bubble: '버블 다이어그램 로딩 중...',
  '2d': '2D 캔버스 로딩 중...',
  '3d': '3D 뷰 로딩 중...',
  view: '실사 뷰 로딩 중...',
}

/**
 * 에디터 메인 캔버스 lazy 로딩 fallback.
 * 모드별로 다른 문구를 표시해 현재 로딩 대상을 명확히 안내한다.
 */
export function ModeCanvasLoadingFallback({ mode }: { mode: CanvasMode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex items-center gap-2 rounded-xl bg-white/85 px-4 py-2 text-[#4B5563] shadow-sm">
        <Spinner size="sm" />
        <span className="text-sm font-medium">{CANVAS_LOADING_LABELS[mode]}</span>
      </div>
    </div>
  )
}

/**
 * 좌/우 패널 lazy 로딩 fallback.
 * 패널 위치(side)와 모드에 따라 문구를 구분한다.
 */
export function PanelLoadingFallback({ mode, side }: { mode: PanelMode; side: PanelSide }) {
  const labelByMode = {
    bubble: side === 'left' ? '버블 보조 패널 로딩 중...' : '버블 속성 패널 로딩 중...',
    '2d': side === 'left' ? '2D 레이어 패널 로딩 중...' : '2D 속성 패널 로딩 중...',
    '3d': side === 'left' ? '3D 보조 패널 로딩 중...' : '3D 속성 패널 로딩 중...',
  } as const

  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white/90 p-3 shadow-sm">
      <div className="flex items-center gap-2 text-[#4B5563]">
        <Spinner size="sm" />
        <span className="text-sm font-medium">{labelByMode[mode]}</span>
      </div>
    </div>
  )
}

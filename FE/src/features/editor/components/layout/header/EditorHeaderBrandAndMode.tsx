import { Link } from 'react-router-dom'
import type { EditorMode } from '@/features/editor/types'

interface EditorHeaderBrandAndModeProps {
  mode: EditorMode
  isViewer: boolean
  onModeChange: (mode: EditorMode) => void
}

/**
 * 에디터 헤더 좌측 영역.
 * - 프로젝트 목록 이동
 * - 편집/뷰어 모드 전환
 */
export default function EditorHeaderBrandAndMode({
  mode,
  isViewer,
  onModeChange,
}: EditorHeaderBrandAndModeProps) {
  const getModeButtonClass = (active: boolean) => `rounded-full px-3 py-1.5 text-[11px] font-bold transition-all ${
    active
      ? 'bg-[#3B45B3] text-white shadow-sm shadow-[#3B45B3]/25'
      : isViewer
        ? 'text-white/60 hover:bg-white/10 hover:text-white'
        : 'text-[#6F7C96] hover:bg-[#EEF1FA] hover:text-[#303D9A]'
  }`

  return (
    <div className="flex items-center gap-5">
      <Link
        to="/projects"
        className={`cursor-pointer text-sm font-black tracking-tight transition-opacity hover:opacity-80 ${
          isViewer ? 'text-white' : 'text-[#1C1C1E]'
        }`}
      >
        <span className={isViewer ? 'opacity-60' : 'opacity-55'}>바탕: BATANG</span> Workspace
      </Link>

      <nav className={`flex items-center gap-1 rounded-full p-1 ${
        isViewer ? 'bg-white/10' : 'border border-[#E4E8F3] bg-[#F7F8FC]'
      }`}>
        <button
          type="button"
          onClick={() => onModeChange('bubble')}
          className={mode !== 'view' ? getModeButtonClass(true) : getModeButtonClass(false)}
        >
          편집 모드
        </button>
        <button
          type="button"
          onClick={() => onModeChange('view')}
          className={mode === 'view' ? getModeButtonClass(true) : getModeButtonClass(false)}
        >
          뷰어 모드
        </button>
      </nav>
    </div>
  )
}

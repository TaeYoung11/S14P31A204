import { PanelLeftOpen } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { EditorMode } from '@/features/editor/types'
import BrandLogo from '@/shared/components/BrandLogo'

const TEXT_PROJECT_SWITCH = '프로젝트 전환'
const TEXT_PROJECT_SWITCH_OPEN = '프로젝트 전환 열기'
const TEXT_PROJECT_HOME = '프로젝트 홈'
const TEXT_PROJECT_LIST_GO = '프로젝트 목록으로 이동'
const TEXT_EDIT_MODE = '편집 모드'
const TEXT_VIEWER_MODE = '뷰어 모드'
const MODE_BUTTON_BASE_CLASS = 'min-h-9 rounded-full px-5 py-2 text-[13px] font-bold transition-all'

interface EditorHeaderBrandAndModeProps {
  mode: EditorMode
  isViewer: boolean
  onModeChange: (mode: EditorMode) => void
  onOpenProjectSwitcher?: () => void
}

/** 에디터 상단의 브랜드 링크, 프로젝트 전환 버튼, 편집/뷰어 모드 스위치를 렌더링한다. */
export default function EditorHeaderBrandAndMode({
  mode,
  isViewer,
  onModeChange,
  onOpenProjectSwitcher,
}: EditorHeaderBrandAndModeProps) {
  const getModeButtonClass = (active: boolean) => {
    if (active) return `${MODE_BUTTON_BASE_CLASS} bg-[#3B45B3] text-white shadow-sm shadow-[#3B45B3]/25`
    if (isViewer) return `${MODE_BUTTON_BASE_CLASS} text-white/60 hover:bg-white/10 hover:text-white`
    return `${MODE_BUTTON_BASE_CLASS} text-[#6F7C96] hover:bg-[#EEF1FA] hover:text-[#303D9A]`
  }

  const projectSwitcherClassName = `flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
    isViewer
      ? 'text-white/70 hover:bg-white/10 hover:text-white'
      : 'text-[#5f6b85] hover:bg-[#EEF1FA] hover:text-[#303D9A]'
  }`
  const modeGroupClassName = `flex items-center gap-1.5 rounded-full p-1.5 ${
    isViewer ? 'bg-white/10' : 'border border-[#E4E8F3] bg-[#F7F8FC]'
  }`

  return (
    <div className="flex items-center gap-5">
      <div className="flex items-center gap-2">
        {onOpenProjectSwitcher && (
          <button
            type="button"
            className={projectSwitcherClassName}
            onClick={onOpenProjectSwitcher}
            title={TEXT_PROJECT_SWITCH}
            aria-label={TEXT_PROJECT_SWITCH_OPEN}
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}
        <Link
          to="/projects"
          className="flex items-center gap-2 text-sm font-black tracking-tight no-underline transition-opacity hover:opacity-80"
          title={TEXT_PROJECT_HOME}
          aria-label={TEXT_PROJECT_LIST_GO}
        >
          <BrandLogo logoClassName="h-[22px] w-auto" textClassName={isViewer ? 'text-[13px] text-white' : 'text-[13px]'} />
        </Link>
      </div>

      <nav className={modeGroupClassName}>
        <button
          type="button"
          onClick={() => onModeChange('bubble')}
          className={mode !== 'view' ? getModeButtonClass(true) : getModeButtonClass(false)}
        >
          {TEXT_EDIT_MODE}
        </button>
        <button
          type="button"
          onClick={() => onModeChange('view')}
          className={mode === 'view' ? getModeButtonClass(true) : getModeButtonClass(false)}
        >
          {TEXT_VIEWER_MODE}
        </button>
      </nav>
    </div>
  )
}

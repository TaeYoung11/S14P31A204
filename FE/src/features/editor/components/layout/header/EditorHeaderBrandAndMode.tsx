// 에디터 헤더의 브랜드 로고와 편집/뷰어 모드 전환을 렌더링합니다.
import { PanelLeftOpen } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { EditorMode } from '@/features/editor/types'
import logoSrc from '@/assets/logo.svg'

const TEXT_PROJECT_SWITCH = '프로젝트 목록'
const TEXT_PROJECT_SWITCH_OPEN = '프로젝트 목록 열기'
const TEXT_PROJECT_HOME = '프로젝트 홈'
const TEXT_PROJECT_LIST_GO = '프로젝트 목록으로 이동'
const TEXT_EDIT_MODE = '편집 모드'
const TEXT_VIEWER_MODE = '뷰어 모드'

interface EditorHeaderBrandAndModeProps {
  mode: EditorMode
  isViewer: boolean
  onModeChange: (mode: EditorMode) => void
  onOpenProjectSwitcher?: () => void
}

export default function EditorHeaderBrandAndMode({
  mode,
  isViewer,
  onModeChange,
  onOpenProjectSwitcher,
}: EditorHeaderBrandAndModeProps) {
  const navigate = useNavigate()

  const getModeButtonClass = (active: boolean) => `rounded-full px-3 py-1.5 text-[11px] font-bold transition-all ${active
    ? 'bg-[#3B45B3] text-white shadow-sm shadow-[#3B45B3]/25'
    : isViewer
      ? 'text-white/60 hover:bg-white/10 hover:text-white'
      : 'text-[#6F7C96] hover:bg-[#EEF1FA] hover:text-[#303D9A]'
    }`

  return (
    <div className="flex items-center gap-5">
      <div className="flex items-center gap-2">
        {onOpenProjectSwitcher && (
          <button
            type="button"
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${isViewer
              ? 'text-white/70 hover:bg-white/10 hover:text-white'
              : 'text-[#5f6b85] hover:bg-[#EEF1FA] hover:text-[#303D9A]'
              }`}
            onClick={onOpenProjectSwitcher}
            title={TEXT_PROJECT_SWITCH}
            aria-label={TEXT_PROJECT_SWITCH_OPEN}
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          className="flex cursor-pointer items-center gap-2 text-sm font-black tracking-tight transition-opacity hover:opacity-80"
          onClick={() => navigate('/projects')}
          title={TEXT_PROJECT_HOME}
          aria-label={TEXT_PROJECT_LIST_GO}
        >
          <img
            src={logoSrc}
            alt="바탕 : BATANG"
            className={`h-5 w-auto ${isViewer ? 'brightness-0 invert opacity-80' : 'opacity-80'}`}
          />
          <span className={isViewer ? 'text-white' : 'text-[#1C1C1E]'}>Workspace</span>
        </button>
      </div>

      <nav className={`flex items-center gap-1 rounded-full p-1 ${isViewer ? 'bg-white/10' : 'border border-[#E4E8F3] bg-[#F7F8FC]'
        }`}>
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

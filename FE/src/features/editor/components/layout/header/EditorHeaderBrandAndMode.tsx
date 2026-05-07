import { PanelLeftOpen } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { EditorMode } from '@/features/editor/types'

const TEXT_PROJECT_SWITCH = '\uD504\uB85C\uC81D\uD2B8 \uC804\uD658'
const TEXT_PROJECT_SWITCH_OPEN = '\uD504\uB85C\uC81D\uD2B8 \uC804\uD658 \uC0AC\uC774\uB4DC\uBC14 \uC5F4\uAE30'
const TEXT_PROJECT_HOME = '\uD504\uB85C\uC81D\uD2B8 \uD648'
const TEXT_PROJECT_LIST_GO = '\uD504\uB85C\uC81D\uD2B8 \uBAA9\uB85D\uC73C\uB85C \uC774\uB3D9'
const TEXT_BRAND = '\uBC14\uD0D5: BATANG'
const TEXT_EDIT_MODE = '\uD3B8\uC9D1 \uBAA8\uB4DC'
const TEXT_VIEWER_MODE = '\uBDF0\uC5B4 \uBAA8\uB4DC'

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
          className={`cursor-pointer text-sm font-black tracking-tight transition-opacity hover:opacity-80 ${isViewer ? 'text-white' : 'text-[#1C1C1E]'
            }`}
          onClick={() => navigate('/projects')}
          title={TEXT_PROJECT_HOME}
          aria-label={TEXT_PROJECT_LIST_GO}
        >
          <span className={isViewer ? 'opacity-60' : 'opacity-55'}>{TEXT_BRAND}</span> Workspace
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

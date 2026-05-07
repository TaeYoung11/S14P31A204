import { FolderKanban, Redo2, Undo2 } from 'lucide-react'
import type { EditorMode } from '../../types'

interface EditorToolbarProps {
  mode: EditorMode
  projectName?: string
  onModeChange: (mode: EditorMode) => void
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
}

type ToolbarMode = Exclude<EditorMode, 'view'>

const MODE_LABELS: Record<ToolbarMode, string> = {
  bubble: 'Bubble',
  '2d': '2D Plan',
  '3d': '3D View',
}

const TOOLBAR_MODES: ToolbarMode[] = ['bubble', '2d', '3d']

/** 에디터 모드 전환 탭과 실행 취소/다시 실행 버튼을 렌더링한다. */
export default function EditorToolbar({
  mode,
  projectName,
  onModeChange,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
}: EditorToolbarProps) {
  const isView = mode === 'view'
  const displayProjectName = projectName?.trim() || '프로젝트'

  return (
    <div className={`h-14 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-6 shrink-0 z-40 ${isView ? 'bg-[#0A0A0B] border-b border-white/10' : ''}`}>
      <div className="min-w-0">
        <div
          className={`inline-flex max-w-[420px] items-center gap-2 rounded-lg px-3 py-1.5 ${
            isView ? 'bg-white/10 border border-white/10' : 'bg-white border border-[#E2E6EF] shadow-sm'
          }`}
          title={displayProjectName}
        >
          <FolderKanban size={14} className={isView ? 'text-white/70' : 'text-[#6B7280]'} />
          <h1 className={`max-w-[280px] truncate text-sm font-bold ${isView ? 'text-white/90' : 'text-[#1C1C1E]'}`}>
            {displayProjectName}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-6 justify-self-center">
        <div className={`p-1 rounded-full flex items-center gap-1 ${isView ? 'bg-white/10' : 'bg-[#E2E6EF]'}`}>
          {TOOLBAR_MODES.map((toolbarMode) => (
            <button
              key={toolbarMode}
              onClick={() => onModeChange(toolbarMode)}
              className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                mode === toolbarMode
                  ? isView
                    ? 'bg-white/20 text-white shadow-sm'
                    : 'bg-white text-[#3B45B3] shadow-sm'
                  : isView
                    ? 'text-white/50 hover:text-white/80'
                    : 'text-[#8E95A3] hover:text-[#505764]'
              }`}
            >
              {MODE_LABELS[toolbarMode]}
            </button>
          ))}
        </div>

        {!isView && (
          <div className="flex items-center gap-1 border-l border-[#DDE2ED] pl-6 text-[#8E95A3]">
            <button
              aria-label="실행 취소"
              onClick={onUndo}
              disabled={!canUndo}
              className="p-1.5 hover:bg-white hover:text-[#1C1C1E] rounded-md transition-all disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#8E95A3]"
            >
              <Undo2 size={18} />
            </button>
            <button
              aria-label="다시 실행"
              onClick={onRedo}
              disabled={!canRedo}
              className="p-1.5 hover:bg-white hover:text-[#1C1C1E] rounded-md transition-all disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#8E95A3]"
            >
              <Redo2 size={18} />
            </button>
          </div>
        )}
      </div>

      <div />
    </div>
  )
}

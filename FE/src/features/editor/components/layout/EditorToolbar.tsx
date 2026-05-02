import { FolderKanban, Undo2, Redo2 } from 'lucide-react'
import type { EditorMode } from '../../types'

interface EditorToolbarProps {
  mode: EditorMode
  projectName?: string
  onModeChange: (mode: EditorMode) => void
}

type ToolbarMode = Exclude<EditorMode, 'view'>

const MODE_LABELS: Record<ToolbarMode, string> = {
  bubble: 'Bubble',
  '2d': '2D Plan',
  '3d': '3D View',
}

const TOOLBAR_MODES: ToolbarMode[] = ['bubble', '2d', '3d']

/** 에디터 모드 전환 탭 + 실행취소/다시실행 버튼 */
export default function EditorToolbar({ mode, projectName, onModeChange }: EditorToolbarProps) {
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
        {/* 모드 전환 탭 */}
        <div className={`p-1 rounded-full flex items-center gap-1 ${isView ? 'bg-white/10' : 'bg-[#E2E6EF]'}`}>
          {TOOLBAR_MODES.map((m) => (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                mode === m
                  ? isView
                    ? 'bg-white/20 text-white shadow-sm'
                    : 'bg-white text-[#3B45B3] shadow-sm'
                  : isView
                  ? 'text-white/50 hover:text-white/80'
                  : 'text-[#8E95A3] hover:text-[#505764]'
              }`}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>

        {/* 실행취소 / 다시실행 */}
        {!isView && (
          <div className="flex items-center gap-1 border-l border-[#DDE2ED] pl-6 text-[#8E95A3]">
            <button aria-label="실행취소" className="p-1.5 hover:bg-white hover:text-[#1C1C1E] rounded-md transition-all">
              <Undo2 size={18} />
            </button>
            <button aria-label="다시실행" className="p-1.5 hover:bg-white hover:text-[#1C1C1E] rounded-md transition-all">
              <Redo2 size={18} />
            </button>
          </div>
        )}
      </div>

      <div />
    </div>
  )
}

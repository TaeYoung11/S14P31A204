import { Redo2, Undo2 } from 'lucide-react'
import type { EditorMode } from '../../types'

interface EditorToolbarProps {
  mode: EditorMode
  onModeChange: (mode: Exclude<EditorMode, 'view'>) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

const MODE_LABELS: Record<Exclude<EditorMode, 'view'>, string> = {
  bubble: 'Bubble',
  '2d': '2D Plan',
  '3d': '3D View',
}

export default function EditorToolbar({
  mode,
  onModeChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: EditorToolbarProps) {
  const isView = mode === 'view'

  return (
    <div
      className={`h-14 flex items-center justify-between px-6 shrink-0 z-40 ${
        isView ? 'bg-[#0A0A0B] border-b border-white/10' : ''
      }`}
    >
      <div className="flex items-center gap-4">
        <h1 className={`text-lg font-bold ${isView ? 'text-white/80' : 'text-[#1C1C1E]'}`}>
          모델 편집 도구
        </h1>
      </div>

      <div className="flex items-center gap-6">
        <div
          className={`p-1 rounded-full flex items-center gap-1 ${
            isView ? 'bg-white/10' : 'bg-[#E2E6EF]'
          }`}
        >
          {(Object.keys(MODE_LABELS) as Array<Exclude<EditorMode, 'view'>>).map((nextMode) => (
            <button
              key={nextMode}
              onClick={() => onModeChange(nextMode)}
              className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                mode === nextMode
                  ? isView
                    ? 'bg-white/20 text-white shadow-sm'
                    : 'bg-white text-[#3B45B3] shadow-sm'
                  : isView
                    ? 'text-white/50 hover:text-white/80'
                    : 'text-[#8E95A3] hover:text-[#505764]'
              }`}
            >
              {MODE_LABELS[nextMode]}
            </button>
          ))}
        </div>

        {!isView && (
          <div className="flex items-center gap-1 border-l border-[#DDE2ED] pl-6 text-[#8E95A3]">
            <button
              className="p-1.5 hover:bg-white hover:text-[#1C1C1E] rounded-md transition-all disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#8E95A3]"
              onClick={onUndo}
              disabled={!canUndo}
            >
              <Undo2 size={18} />
            </button>
            <button
              className="p-1.5 hover:bg-white hover:text-[#1C1C1E] rounded-md transition-all disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#8E95A3]"
              onClick={onRedo}
              disabled={!canRedo}
            >
              <Redo2 size={18} />
            </button>
          </div>
        )}
      </div>

      <div className="w-[100px]" />
    </div>
  )
}

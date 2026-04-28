import { Undo2, Redo2 } from 'lucide-react'
import type { EditorMode } from '../../types'

interface EditorToolbarProps {
  mode: EditorMode
  onModeChange: (mode: EditorMode) => void
}

const MODE_LABELS: Record<EditorMode, string> = {
  bubble: 'Bubble',
  '2d': '2D Plan',
  '3d': '3D View',
  view: 'View',
}

/** 에디터 모드 전환 탭 + 실행취소/다시실행 버튼 */
export default function EditorToolbar({ mode, onModeChange }: EditorToolbarProps) {
  const isView = mode === 'view'

  return (
    <div className={`h-14 flex items-center justify-between px-6 shrink-0 z-40 ${isView ? 'bg-[#0A0A0B] border-b border-white/10' : ''}`}>
      <div className="flex items-center gap-4">
        {/* TODO: 실제 프로젝트 이름을 props로 받아 표시 (현재 목업) */}
        <h1 className={`text-lg font-bold ${isView ? 'text-white/80' : 'text-[#1C1C1E]'}`}>판교 테크 센터</h1>
      </div>

      <div className="flex items-center gap-6">
        {/* 모드 전환 탭 */}
        <div className={`p-1 rounded-full flex items-center gap-1 ${isView ? 'bg-white/10' : 'bg-[#E2E6EF]'}`}>
          {(Object.keys(MODE_LABELS) as EditorMode[]).map((m) => (
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
            <button className="p-1.5 hover:bg-white hover:text-[#1C1C1E] rounded-md transition-all">
              <Undo2 size={18} />
            </button>
            <button className="p-1.5 hover:bg-white hover:text-[#1C1C1E] rounded-md transition-all">
              <Redo2 size={18} />
            </button>
          </div>
        )}
      </div>

      {/* 레이아웃 균형용 여백 */}
      <div className="w-[100px]" />
    </div>
  )
}

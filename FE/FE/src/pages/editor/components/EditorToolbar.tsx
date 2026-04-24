// 편집기 워크스페이스 툴바
// 프로젝트명, 뷰 모드 전환(버블/2D/3D), 실행 취소/다시 실행 버튼을 포함한다.

import { Undo2, Redo2 } from 'lucide-react'
import { EditorMode } from '../types'

interface EditorToolbarProps {
  mode: EditorMode
  onModeChange: (mode: EditorMode) => void
  projectName?: string
}

/** 뷰 모드 탭 정의 */
const MODES: { value: EditorMode; label: string }[] = [
  { value: 'bubble', label: 'Bubble' },
  { value: '2d',     label: '2D Plan' },
  { value: '3d',     label: '3D View' },
]

export default function EditorToolbar({
  mode,
  onModeChange,
  projectName = '판교 테크 센터',
}: EditorToolbarProps) {
  return (
    <div className="h-14 flex items-center justify-between px-6 shrink-0 z-40">
      <h1 className="text-lg font-bold text-[#1C1C1E]">{projectName}</h1>

      <div className="flex items-center gap-6">
        {/* 뷰 모드 전환 탭 */}
        <div className="bg-[#E2E6EF] p-1 rounded-full flex items-center gap-1">
          {MODES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => onModeChange(value)}
              className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                mode === value
                  ? 'bg-white text-[#3B45B3] shadow-sm'
                  : 'text-[#8E95A3] hover:text-[#505764]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 실행 취소 / 다시 실행 */}
        <div className="flex items-center gap-1 border-l border-[#DDE2ED] pl-6 text-[#8E95A3]">
          <button className="p-1.5 hover:bg-white hover:text-[#1C1C1E] rounded-md transition-all">
            <Undo2 size={18} />
          </button>
          <button className="p-1.5 hover:bg-white hover:text-[#1C1C1E] rounded-md transition-all">
            <Redo2 size={18} />
          </button>
        </div>
      </div>

      <div className="w-[100px]" />
    </div>
  )
}

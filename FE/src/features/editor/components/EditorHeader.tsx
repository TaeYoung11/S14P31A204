import { Share2, Save } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { EditorMode } from '../types'

interface EditorHeaderProps {
  onOpenInvite?: () => void
  mode: EditorMode
  onModeChange: (mode: EditorMode) => void
  onSave?: () => void
}

/** 에디터 최상단 헤더 — 프로젝트명, 네비게이션, 저장/공유 */
export default function EditorHeader({ onOpenInvite, mode, onModeChange, onSave }: EditorHeaderProps) {
  const isViewer = mode === 'view'

  return (
    <header className="h-12 bg-white border-b border-[#E2E6EF] flex items-center justify-between px-6 shrink-0 z-50 shadow-sm relative">
      <div className="flex items-center gap-8">
        <Link to="/projects" className="text-sm font-black tracking-tighter text-[#1C1C1E] hover:opacity-80 transition-opacity cursor-pointer">
          <span className="opacity-60">바탕:</span> BATANG
        </Link>
        <nav className="flex items-center gap-6">
          <button 
            onClick={() => onModeChange('bubble')}
            className={`text-xs h-12 flex items-center transition-all ${
              !isViewer 
                ? 'font-bold text-[#3B45B3] border-b-2 border-[#3B45B3]' 
                : 'font-medium text-[#8E95A3] hover:text-[#3B45B3]'
            }`}
          >
            워크스페이스
          </button>
          <button 
            onClick={() => onModeChange('view')}
            className={`text-xs h-12 flex items-center transition-all ${
              isViewer 
                ? 'font-bold text-[#3B45B3] border-b-2 border-[#3B45B3]' 
                : 'font-medium text-[#8E95A3] hover:text-[#3B45B3]'
            }`}
          >
            뷰어
          </button>
        </nav>
      </div>

      <div className="flex items-center gap-4">
        <button 
          onClick={onOpenInvite}
          className="p-2 text-[#8E95A3] hover:bg-[#F0F2F9] rounded-lg transition-colors"
        >
          <Share2 size={18} />
        </button>
        <button 
          onClick={onSave}
          className="bg-[#3B45B3] text-white px-4 py-1.5 rounded-lg text-xs font-bold shadow-md hover:bg-[#2D3691] shadow-[#3B45B3]/20 transition-all flex items-center gap-2"
        >
          <Save size={14} />
          {mode === '3d' ? 'IFC 내보내기' : '저장'}
        </button>
      </div>
    </header>
  )
}

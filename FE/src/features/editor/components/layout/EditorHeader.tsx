import { Save, Share2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { EditorMode, SaveStatus } from '../../types'

interface EditorHeaderProps {
  onOpenInvite?: () => void
  mode: EditorMode
  onModeChange: (mode: EditorMode) => void
  onSave?: () => void
  saveStatus?: SaveStatus
  siteAreaLabel?: string
}

const SAVE_STATUS_LABELS: Record<SaveStatus, string> = {
  idle: '저장 대기',
  dirty: '변경사항 있음',
  'saving-local': '로컬 저장 중',
  'saved-local': '로컬 저장됨',
  'syncing-remote': '서버 동기화 중',
  'saved-remote': '서버 저장됨',
  error: '저장 실패',
}

const SAVE_STATUS_STYLES: Record<SaveStatus, string> = {
  idle: 'text-[#8E95A3] bg-[#F5F6FA]',
  dirty: 'text-[#A35F00] bg-[#FFF4DB]',
  'saving-local': 'text-[#3B45B3] bg-[#EEF0FF]',
  'saved-local': 'text-[#237A57] bg-[#E8F6EF]',
  'syncing-remote': 'text-[#3B45B3] bg-[#EEF0FF]',
  'saved-remote': 'text-[#237A57] bg-[#E8F6EF]',
  error: 'text-[#B42318] bg-[#FEECEC]',
}

export default function EditorHeader({
  onOpenInvite,
  mode,
  onModeChange,
  onSave,
  saveStatus = 'idle',
  siteAreaLabel,
}: EditorHeaderProps) {
  const isViewer = mode === 'view'

  return (
    <header className="h-12 bg-white border-b border-[#E2E6EF] flex items-center justify-between px-6 shrink-0 z-50 shadow-sm relative">
      <div className="flex items-center gap-8">
        <Link
          to="/projects"
          className="text-sm font-black tracking-tighter text-[#1C1C1E] hover:opacity-80 transition-opacity cursor-pointer"
        >
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
        {siteAreaLabel && (
          <div className="px-3 py-1 rounded-full text-[11px] font-bold text-[#2F3A90] bg-[#EEF0FF]">
            대지 {siteAreaLabel}
          </div>
        )}
        <div className={`px-3 py-1 rounded-full text-[11px] font-bold ${SAVE_STATUS_STYLES[saveStatus]}`}>
          {SAVE_STATUS_LABELS[saveStatus]}
        </div>
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

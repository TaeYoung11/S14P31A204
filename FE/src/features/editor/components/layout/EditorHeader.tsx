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
  idle: '대기 중',
  dirty: '변경 사항 있음',
  syncing: '동기화 중',
  synced: '동기화됨',
  'offline-queued': '오프라인 대기 중',
  error: '저장 실패',
}

const SAVE_STATUS_STYLES: Record<SaveStatus, string> = {
  idle: 'text-[#8E95A3] bg-[#F5F6FA]',
  dirty: 'text-[#A35F00] bg-[#FFF4DB]',
  syncing: 'text-[#3B45B3] bg-[#EEF0FF]',
  synced: 'text-[#237A57] bg-[#E8F6EF]',
  'offline-queued': 'text-[#7A5C00] bg-[#FFF7D6]',
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
    <header className="relative z-50 flex h-12 shrink-0 items-center justify-between border-b border-[#E2E6EF] bg-white px-6 shadow-sm">
      <div className="flex items-center gap-8">
        <Link
          to="/projects"
          className="cursor-pointer text-sm font-black tracking-tighter text-[#1C1C1E] transition-opacity hover:opacity-80"
        >
          <span className="opacity-60">BATANG:</span> Workspace
        </Link>
        <nav className="flex items-center gap-6">
          <button
            onClick={() => onModeChange('bubble')}
            className={`flex h-12 items-center text-xs transition-all ${
              !isViewer
                ? 'border-b-2 border-[#3B45B3] font-bold text-[#3B45B3]'
                : 'font-medium text-[#8E95A3] hover:text-[#3B45B3]'
            }`}
          >
            편집 모드
          </button>
          <button
            onClick={() => onModeChange('view')}
            className={`flex h-12 items-center text-xs transition-all ${
              isViewer
                ? 'border-b-2 border-[#3B45B3] font-bold text-[#3B45B3]'
                : 'font-medium text-[#8E95A3] hover:text-[#3B45B3]'
            }`}
          >
            뷰어 모드
          </button>
        </nav>
      </div>

      <div className="flex items-center gap-4">
        {siteAreaLabel && (
          <div className="rounded-full bg-[#EEF0FF] px-3 py-1 text-[11px] font-bold text-[#2F3A90]">
            대지 {siteAreaLabel}
          </div>
        )}
        <div className={`rounded-full px-3 py-1 text-[11px] font-bold ${SAVE_STATUS_STYLES[saveStatus]}`}>
          {SAVE_STATUS_LABELS[saveStatus]}
        </div>
        <button
          onClick={onOpenInvite}
          className="rounded-lg p-2 text-[#8E95A3] transition-colors hover:bg-[#F0F2F9]"
        >
          <Share2 size={18} />
        </button>
        <button
          onClick={onSave}
          className="flex items-center gap-2 rounded-lg bg-[#3B45B3] px-4 py-1.5 text-xs font-bold text-white shadow-md shadow-[#3B45B3]/20 transition-all hover:bg-[#2D3691]"
        >
          <Save size={14} />
          {mode === '3d' ? 'IFC 내보내기' : '저장'}
        </button>
      </div>
    </header>
  )
}

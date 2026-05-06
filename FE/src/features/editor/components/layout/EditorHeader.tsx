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

/**
 * 상단 헤더
 * - 워크스페이스 이동, 편집/뷰 모드 전환, 저장 상태/공유/저장 액션을 제공한다.
 */
export default function EditorHeader({
  onOpenInvite,
  mode,
  onModeChange,
  onSave,
  saveStatus = 'idle',
  siteAreaLabel,
}: EditorHeaderProps) {
  const isViewer = mode === 'view'
  const getModeButtonClass = (active: boolean) => `rounded-full px-3 py-1.5 text-[11px] font-bold transition-all ${
    active
      ? 'bg-[#3B45B3] text-white shadow-sm shadow-[#3B45B3]/25'
      : isViewer
        ? 'text-white/60 hover:bg-white/10 hover:text-white'
        : 'text-[#6F7C96] hover:bg-[#EEF1FA] hover:text-[#303D9A]'
  }`

  return (
    <header className={`relative z-50 flex h-14 shrink-0 items-center justify-between border-b px-6 ${
      isViewer
        ? 'border-white/10 bg-[#0C0D10]/90'
        : 'border-[#E2E6EF] bg-white/90 backdrop-blur-sm shadow-[0_8px_24px_rgba(28,35,90,0.08)]'
    }`}>
      <div className="flex items-center gap-5">
        <Link
          to="/projects"
          className={`cursor-pointer text-sm font-black tracking-tight transition-opacity hover:opacity-80 ${
            isViewer ? 'text-white' : 'text-[#1C1C1E]'
          }`}
        >
          <span className={isViewer ? 'opacity-60' : 'opacity-55'}>BATANG:</span> Workspace
        </Link>
        <nav className={`flex items-center gap-1 rounded-full p-1 ${
          isViewer ? 'bg-white/10' : 'border border-[#E4E8F3] bg-[#F7F8FC]'
        }`}>
          <button
            type="button"
            onClick={() => onModeChange('bubble')}
            className={mode !== 'view' ? getModeButtonClass(true) : getModeButtonClass(false)}
          >
            편집 모드
          </button>
          <button
            type="button"
            onClick={() => onModeChange('view')}
            className={mode === 'view' ? getModeButtonClass(true) : getModeButtonClass(false)}
          >
            뷰어 모드
          </button>
        </nav>
      </div>

      <div className="flex items-center gap-4">
        {siteAreaLabel && (
          <div className={`rounded-full px-3 py-1 text-[11px] font-bold ${
            isViewer ? 'bg-white/15 text-white' : 'bg-[#EEF0FF] text-[#2F3A90]'
          }`}>
            대지 {siteAreaLabel}
          </div>
        )}
        <div className={`rounded-full border border-transparent px-3 py-1 text-[11px] font-bold ${SAVE_STATUS_STYLES[saveStatus]}`}>
          {SAVE_STATUS_LABELS[saveStatus]}
        </div>
        <button
          type="button"
          onClick={onOpenInvite}
          className={`rounded-xl p-2 transition-colors ${
            isViewer
              ? 'text-white/75 hover:bg-white/10 hover:text-white'
              : 'text-[#7A859A] hover:bg-[#F0F2F9] hover:text-[#2F3A90]'
          }`}
        >
          <Share2 size={18} />
        </button>
        <button
          type="button"
          onClick={onSave}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-md transition-all ${
            isViewer
              ? 'bg-white/20 shadow-black/20 hover:bg-white/25'
              : 'bg-[#3B45B3] shadow-[#3B45B3]/20 hover:bg-[#2D3691]'
          }`}
        >
          <Save size={14} />
          {mode === '3d' ? 'IFC 내보내기' : '저장'}
        </button>
      </div>
    </header>
  )
}

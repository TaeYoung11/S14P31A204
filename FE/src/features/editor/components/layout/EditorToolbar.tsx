import { FolderKanban, Loader2, Redo2, Undo2 } from 'lucide-react'
import type { EditorMode, SaveStatus } from '../../types'

interface EditorToolbarProps {
  mode: EditorMode
  projectName?: string
  onModeChange: (mode: EditorMode) => void
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
  saveStatus?: SaveStatus
  hasUnsavedDbChanges?: boolean
}

type ToolbarMode = Exclude<EditorMode, 'view'>

const MODE_LABELS: Record<ToolbarMode, string> = {
  bubble: '버블',
  '2d': '2D',
  '3d': '3D',
}

const TOOLBAR_MODES: ToolbarMode[] = ['bubble', '2d', '3d']

/**
 * 에디터 툴바
 * - 프로젝트 이름/모드 탭/실행취소 UI를 담당한다.
 */
export default function EditorToolbar({
  mode,
  projectName,
  onModeChange,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  saveStatus = 'idle',
  hasUnsavedDbChanges = false,
}: EditorToolbarProps) {
  const isView = mode === 'view'
  const displayProjectName = projectName?.trim() || '프로젝트'
  const shouldShowSyncingSpinner = saveStatus === 'syncing'
  const getModeTabClass = (tabMode: ToolbarMode) => `min-h-9 min-w-[68px] rounded-full px-5 py-2 text-[13px] font-bold transition-all ${
    mode === tabMode
      ? isView
        ? 'bg-white/20 text-white shadow-sm'
        : 'bg-white text-[#3B45B3] shadow-sm shadow-[#3B45B3]/10'
      : isView
        ? 'text-white/50 hover:text-white/80'
        : 'text-[#73809A] hover:text-[#505764]'
  }`

  return (
    <div className={`z-40 h-14 shrink-0 px-6 ${isView ? 'border-b border-white/10 bg-[#0A0A0B]' : ''}`}>
      <div className="grid h-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center">
        <div className="min-w-0">
          <div
            className={`inline-flex max-w-[460px] items-center gap-2 rounded-xl px-3 py-1.5 ${
              isView
                ? 'border border-white/10 bg-white/10'
                : 'border border-[#E2E6EF] bg-white/90 shadow-[0_10px_24px_rgba(45,54,145,0.08)]'
            }`}
            title={displayProjectName}
          >
            <FolderKanban size={14} className={isView ? 'text-white/70' : 'text-[#6B7280]'} />
            <h1 className={`max-w-[280px] truncate text-sm font-bold ${isView ? 'text-white/90' : 'text-[#1C1C1E]'}`}>
              {displayProjectName}
            </h1>
            {hasUnsavedDbChanges && (
              <span
                className={`shrink-0 text-base font-black leading-none ${isView ? 'text-white/80' : 'text-[#A35F00]'}`}
                title="저장되지 않은 변경사항이 있습니다"
                aria-label="저장되지 않은 변경사항"
              >
                *
              </span>
            )}
            {shouldShowSyncingSpinner && (
              <Loader2
                size={14}
                className={`shrink-0 animate-spin ${isView ? 'text-white/80' : 'text-[#3B45B3]'}`}
                aria-label="저장 중"
              />
            )}
          </div>
        </div>

        <div className="flex items-center gap-5 justify-self-center">
          {!isView && (
            <div className="flex items-center gap-1.5 rounded-full border border-[#E4E8F3] bg-[#EEF1F8] p-1.5">
              {TOOLBAR_MODES.map((m) => (
                <button key={m} type="button" onClick={() => onModeChange(m)} className={getModeTabClass(m)}>
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
          )}

          {!isView && (
            <div className="flex items-center gap-1 border-l border-[#DDE2ED] pl-5 text-[#8E95A3]">
              <button
                type="button"
                aria-label="실행취소"
                onClick={onUndo}
                disabled={!canUndo}
                className="rounded-lg p-1.5 transition-all hover:bg-white hover:text-[#1C1C1E] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#8E95A3]"
              >
                <Undo2 size={18} />
              </button>
              <button
                type="button"
                aria-label="다시실행"
                onClick={onRedo}
                disabled={!canRedo}
                className="rounded-lg p-1.5 transition-all hover:bg-white hover:text-[#1C1C1E] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#8E95A3]"
              >
                <Redo2 size={18} />
              </button>
            </div>
          )}
        </div>

        <div />
      </div>
    </div>
  )
}

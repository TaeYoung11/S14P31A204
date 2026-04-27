import { Bell } from 'lucide-react'

interface ProjectListHeaderProps {
  userName?: string
  userInitial: string
  onLogout: () => void
}

export default function ProjectListHeader({
  userName,
  userInitial,
  onLogout,
}: ProjectListHeaderProps) {
  return (
    <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-[#e5e7eb] bg-white px-8">
      <div className="flex items-center gap-2">
        <a href="/projects">
          <span className="text-base font-semibold tracking-tight text-[#111827]">바탕: BATANG</span>
        </a>
      </div>

      <div className="flex items-center gap-3">
        <button id="notification-btn" className="btn-icon" title="알림">
          <Bell className="h-[18px] w-[18px]" />
        </button>
        <button
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[#111827] text-xs font-medium text-white transition-all hover:ring-2 hover:ring-[#2563eb]/30"
          title={userName}
          onClick={onLogout}
        >
          {userInitial}
        </button>
      </div>
    </header>
  )
}

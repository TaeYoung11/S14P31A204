// 프로젝트 목록 상단의 브랜드, 알림, 사용자 프로필 메뉴를 렌더링합니다.
import { useState } from 'react'
import { Bell, LogOut, MessageSquareText, UserRoundX } from 'lucide-react'
import Modal from '@/shared/components/Modal'
import logoSrc from '@/assets/logo.svg'

interface ProjectListHeaderProps {
  userId?: string
  userName?: string
  userEmail?: string
  userType?: string
  userInitial: string
  onLogout: () => void
  onWithdraw: (password: string) => void
  withdrawError?: string
  isWithdrawing?: boolean
  onNotificationOpen?: () => void
  onCommentNotificationOpen?: () => void
  commentNotificationCount?: number
}

export default function ProjectListHeader({
  userName,
  userEmail,
  userType,
  userInitial,
  onLogout,
  onWithdraw,
  withdrawError = '',
  isWithdrawing = false,
  onNotificationOpen,
  onCommentNotificationOpen,
  commentNotificationCount = 0,
}: ProjectListHeaderProps) {
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false)
  const [withdrawPassword, setWithdrawPassword] = useState('')

  const handleOpenWithdraw = () => {
    setIsProfileModalOpen(false)
    setWithdrawPassword('')
    setIsWithdrawModalOpen(true)
  }

  const handleConfirmWithdraw = () => {
    onWithdraw(withdrawPassword)
  }

  return (
    <>
      <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-[#e5e7eb] bg-white px-8">
        <div className="flex items-center gap-2">
          <a href="/projects" aria-label="바탕 프로젝트 목록으로 이동">
            <img src={logoSrc} alt="바탕 : BATANG" className="h-[22px] w-auto" />
          </a>
        </div>

        <div className="flex items-center gap-3">
          {userType === 'CUSTOMER' && (
            <button id="notification-btn" className="btn-icon" title="알림" onClick={onNotificationOpen}>
              <Bell className="h-[18px] w-[18px]" />
            </button>
          )}

          <button
            id="comment-notification-btn"
            className="btn-icon relative"
            title="댓글 알림"
            onClick={onCommentNotificationOpen}
          >
            <MessageSquareText className="h-[18px] w-[18px]" />
            {(commentNotificationCount > 0) && (
              <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-[#ef4444] ring-2 ring-white" />
            )}
          </button>

          <button
            className="flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-2 py-1.5 transition-all hover:border-[#c7d2fe] hover:bg-[#f8faff]"
            title={userName}
            onClick={() => setIsProfileModalOpen(true)}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#111827] text-xs font-medium text-white">
              {userInitial}
            </span>
          </button>
        </div>
      </header>

      <Modal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        title="프로필"
        maxWidth="max-w-[360px]"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-[#e5e7eb] bg-white px-4 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#111827] text-sm font-semibold text-white">
                {userInitial}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-[#111827]">{userName ?? '사용자'}</p>
                  {userType === 'DESIGNER' && (
                    <span className="rounded-full bg-[#eef2ff] px-2 py-0.5 text-[11px] font-semibold text-[#4338ca]">
                      디자이너
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-[#6b7280]">{userEmail ?? '-'}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#374151] transition-colors hover:bg-[#f3f4f6]"
              onClick={() => {
                setIsProfileModalOpen(false)
                onLogout()
              }}
            >
              <LogOut className="h-4 w-4" />
              로그아웃
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#dc2626] transition-colors hover:bg-[#fef2f2]"
              onClick={handleOpenWithdraw}
            >
              <UserRoundX className="h-4 w-4" />
              회원탈퇴
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isWithdrawModalOpen}
        onClose={() => setIsWithdrawModalOpen(false)}
        title="회원탈퇴"
        maxWidth="max-w-[440px]"
      >
        <div className="space-y-4">
          <p className="text-sm text-[#374151]">
            회원탈퇴를 진행하려면 현재 계정 비밀번호를 입력해야 합니다. 탈퇴 후에는 계정을 복구할 수 없습니다.
          </p>

          <div>
            <label htmlFor="withdraw-password" className="auth-label">
              비밀번호
            </label>
            <input
              id="withdraw-password"
              type="password"
              className="input-base"
              placeholder="비밀번호를 입력하세요"
              value={withdrawPassword}
              onChange={(e) => setWithdrawPassword(e.target.value)}
            />
          </div>

          {withdrawError && <p className="form-error">{withdrawError}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIsWithdrawModalOpen(false)}
              disabled={isWithdrawing}
            >
              취소
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={handleConfirmWithdraw}
              disabled={isWithdrawing || withdrawPassword.trim().length === 0}
            >
              {isWithdrawing ? '처리 중...' : '회원탈퇴'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}

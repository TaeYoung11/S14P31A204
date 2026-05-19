import { useState } from 'react'
import { Bell, KeyRound, LogOut, MessageSquareText, ShieldAlert, UserRoundX } from 'lucide-react'
import BrandLogo from '@/shared/components/BrandLogo'
import Modal from '@/shared/components/Modal'

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
  invitationNotificationCount?: number
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
  invitationNotificationCount = 0,
  commentNotificationCount = 0,
}: ProjectListHeaderProps) {
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false)
  const [withdrawPassword, setWithdrawPassword] = useState('')

  /** 프로필 모달을 닫고 회원탈퇴 확인 모달을 연다. */
  const handleOpenWithdraw = () => {
    setIsProfileModalOpen(false)
    setWithdrawPassword('')
    setIsWithdrawModalOpen(true)
  }

  /** 입력된 비밀번호를 상위 탈퇴 요청 핸들러로 전달한다. */
  const handleConfirmWithdraw = () => {
    onWithdraw(withdrawPassword)
  }

  const userRoleLabel =
    userType === 'DESIGNER' ? '디자이너' : userType === 'CUSTOMER' ? '고객' : '멤버'

  return (
    <>
      <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-[#e5e7eb] bg-white px-8">
        <div className="flex items-center gap-2">
          <a
            href="/projects"
            className="flex items-center gap-2 text-sm font-black tracking-tight no-underline transition-opacity hover:opacity-80"
            aria-label="BATANG 프로젝트 목록으로 이동"
          >
            <BrandLogo />
          </a>
        </div>

        <div className="flex items-center gap-3">
          {userType === 'CUSTOMER' && (
            <button id="notification-btn" className="btn-icon" title="알림" onClick={onNotificationOpen}>
              <span className="relative">
                <Bell className="h-[18px] w-[18px]" />
                {invitationNotificationCount > 0 && (
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#ef4444] ring-2 ring-white" />
                )}
              </span>
            </button>
          )}

          <button
            id="comment-notification-btn"
            className="btn-icon relative"
            title="댓글 알림"
            onClick={onCommentNotificationOpen}
          >
            <MessageSquareText className="h-[18px] w-[18px]" />
            {commentNotificationCount > 0 && (
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
        <div className="space-y-3">
          <div className="rounded-[28px] border border-[#e5e7f6] bg-[linear-gradient(145deg,#ffffff_0%,#f8f6ff_58%,#f0edff_100%)] p-5 shadow-[0_18px_48px_rgba(79,70,229,0.14)]">
            <div className="flex items-center gap-4">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] bg-[#111827] text-2xl font-black text-white shadow-[0_18px_34px_rgba(17,24,39,0.24)]">
                {userInitial}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate text-xl font-black text-[#111827]">{userName ?? '사용자'}</p>
                  <span className="shrink-0 rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-[#5b45e8] shadow-sm">
                    {userRoleLabel}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm font-semibold text-[#667085]">{userEmail ?? '-'}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#e6e8f2] bg-white text-sm font-bold text-[#334155] shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#c7d2fe] hover:text-[#4f46e5] hover:shadow-md"
              onClick={() => {
                setIsProfileModalOpen(false)
                onLogout()
              }}
            >
              <LogOut className="h-4 w-4" />
              로그아웃
            </button>
            <button
              className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#fecaca] bg-[#fff7f7] text-sm font-bold text-[#dc2626] shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#fef2f2] hover:shadow-md"
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
        maxWidth="max-w-[460px]"
      >
        <div className="space-y-5">
          <div className="rounded-2xl border border-[#fecaca] bg-[linear-gradient(135deg,#fff7f7,#ffffff)] p-4">
            <div className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fee2e2] text-[#dc2626]">
                <ShieldAlert className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-bold text-[#991b1b]">계정 삭제 전 확인이 필요합니다.</p>
                <p className="mt-1 text-xs leading-5 text-[#7f1d1d]/80">
                  탈퇴를 진행하면 계정과 관련된 정보가 삭제되며 복구할 수 없습니다. 계속하려면 비밀번호를 입력해 주세요.
                </p>
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="withdraw-password" className="auth-label">
              비밀번호
            </label>
            <div className="relative">
              <input
                id="withdraw-password"
                type="password"
                className="input-auth pr-11"
                placeholder="비밀번호를 입력해 주세요"
                value={withdrawPassword}
                onChange={(e) => setWithdrawPassword(e.target.value)}
              />
              <KeyRound className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
            </div>
          </div>

          {withdrawError && <p className="form-error">{withdrawError}</p>}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              className="min-h-11 rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm font-semibold text-[#334155] transition-all hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => setIsWithdrawModalOpen(false)}
              disabled={isWithdrawing}
            >
              취소
            </button>
            <button
              type="button"
              className="min-h-11 rounded-xl bg-[#dc2626] px-4 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(220,38,38,0.20)] transition-all hover:bg-[#b91c1c] disabled:cursor-not-allowed disabled:opacity-50"
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

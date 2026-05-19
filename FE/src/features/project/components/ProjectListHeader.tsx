import { useState } from 'react'
import { AlertCircle, Bell, KeyRound, LogOut, MessageSquareText, ShieldAlert, UserRoundX } from 'lucide-react'
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
          <div className="account-modal-card">
            <div className="flex items-center gap-4">
              <span className="account-modal-avatar">
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
              className="account-modal-action account-modal-action-neutral"
              onClick={() => {
                setIsProfileModalOpen(false)
                onLogout()
              }}
            >
              <LogOut className="h-4 w-4" />
              로그아웃
            </button>
            <button
              className="account-modal-action account-modal-action-danger"
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
        maxWidth="max-w-[420px]"
      >
        <div className="space-y-3.5">
          <div className="withdraw-modal-panel">
            <div className="flex items-start gap-3">
              <span className="withdraw-modal-icon">
                <ShieldAlert className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="withdraw-modal-title">삭제할 계정을 확인해 주세요.</p>
                <p className="withdraw-modal-description">
                  탈퇴 후 계정 정보는 복구할 수 없습니다.
                </p>
                <div className="withdraw-modal-user">
                  <p className="truncate text-sm font-black leading-5 text-[#111827]">{userName ?? '사용자'}</p>
                  <p className="mt-0.5 truncate text-xs font-semibold text-[#667085]">{userEmail ?? '-'}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="withdraw-modal-field">
            <label htmlFor="withdraw-password" className="auth-label">
              비밀번호로 본인 확인
            </label>
            <div className="relative">
              <input
                id="withdraw-password"
                type="password"
                className="input-auth withdraw-modal-input pr-11"
                placeholder="비밀번호를 입력해 주세요"
                value={withdrawPassword}
                onChange={(e) => setWithdrawPassword(e.target.value)}
              />
              <KeyRound className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
            </div>
          </div>

          {withdrawError && (
            <div className="withdraw-error-box" role="alert">
              <span className="withdraw-error-icon" aria-hidden="true">
                <AlertCircle className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-black text-[#991b1b]">회원탈퇴에 실패했습니다.</p>
                <p className="mt-1 text-xs leading-5 text-[#b91c1c]/80">{withdrawError}</p>
              </div>
            </div>
          )}

          <div className="withdraw-modal-actions">
            <button
              type="button"
              className="account-modal-action account-modal-action-neutral"
              onClick={() => setIsWithdrawModalOpen(false)}
              disabled={isWithdrawing}
            >
              취소
            </button>
            <button
              type="button"
              className="withdraw-submit-button"
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

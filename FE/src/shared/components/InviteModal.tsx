import { useEffect, useState } from 'react'
import { X, CheckCircle2, Loader2 } from 'lucide-react'
import { useUserSearch, useSendInvite, useRemoveProjectMember } from '@/features/project/hooks/useInvitation'
import type { SendInviteRequest, UserSearchResult } from '@/features/project/services/invitation.service'
import { projectService } from '@/features/project/services/project.service'

interface InviteModalProps {
  isOpen: boolean
  onClose: () => void
  projectIds: string[]
}

interface AlreadyInvitedUserTag {
  userId: string
  name: string
}

export function InviteModal({ isOpen, onClose, projectIds }: InviteModalProps) {
  const [searchInput, setSearchInput] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [selectedUsers, setSelectedUsers] = useState<UserSearchResult[]>([])
  const [alreadyInvitedUsers, setAlreadyInvitedUsers] = useState<AlreadyInvitedUserTag[]>([])
  const [pendingDeleteUser, setPendingDeleteUser] = useState<AlreadyInvitedUserTag | null>(null)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const { data: searchResults = [], isLoading: isSearching } = useUserSearch(searchKeyword)
  const sendInvite = useSendInvite()
  const removeProjectMember = useRemoveProjectMember()

  useEffect(() => {
    if (!isOpen || projectIds.length === 0) return

    let cancelled = false
    void (async () => {
      const details = await Promise.all(
        projectIds.map((projectId) => projectService.getWorkspaceDetail(projectId).catch(() => null)),
      )
      if (cancelled) return

      const invitedUserMap = new Map<string, AlreadyInvitedUserTag>()
      details.forEach((detail) => {
        detail?.invitedUsers?.forEach((user) => {
          invitedUserMap.set(user.userId, {
            userId: user.userId,
            name: user.name,
          })
        })
      })

      setAlreadyInvitedUsers(Array.from(invitedUserMap.values()))
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen, projectIds])

  if (!isOpen) return null

  const handleClose = () => {
    setSearchInput('')
    setSearchKeyword('')
    setSelectedUsers([])
    setAlreadyInvitedUsers([])
    setPendingDeleteUser(null)
    setSubmitStatus('idle')
    setErrorMessage('')
    onClose()
  }

  const toggleSelect = (user: UserSearchResult) => {
    const exists = selectedUsers.some((u) => u.userId === user.userId)
    if (exists) {
      setSelectedUsers((prev) => prev.filter((u) => u.userId !== user.userId))
      return
    }

    setSelectedUsers((prev) => [...prev, user])
    setSearchInput('')
    setSearchKeyword('')
  }

  const handleRemoveSelectedUser = (user: UserSearchResult) => {
    setSelectedUsers((prev) => prev.filter((u) => u.userId !== user.userId))
  }

  const handleSubmit = async () => {
    if (selectedUsers.length === 0 || projectIds.length === 0) return
    setSubmitStatus('loading')
    setErrorMessage('')

    const inviteRequests: { projectId: string; req: SendInviteRequest }[] = selectedUsers.flatMap((user) =>
      projectIds.map((projectId) => ({
        projectId,
        req: {
          inviteeEmail: user.email,
        },
      })),
    )
    try {
      const results = await Promise.allSettled(
        inviteRequests.map((request) => sendInvite.mutateAsync(request)),
      )
      const successCount = results.filter((result) => result.status === 'fulfilled').length
      const failedCount = results.length - successCount
      if (failedCount > 0) {
        setSubmitStatus('error')
        setErrorMessage(
          successCount > 0
            ? `${successCount}건은 초대됐고, ${failedCount}건은 실패했습니다. 실패한 대상만 확인해 다시 시도해주세요.`
            : '초대 전송에 실패했습니다. 다시 시도해주세요.',
        )
        return
      }
      setSubmitStatus('success')
      setTimeout(handleClose, 1200)
    } catch {
      setSubmitStatus('error')
      setErrorMessage('일부 초대에 실패했습니다. 다시 시도해 주세요.')
    }
  }

  const handleRemoveAlreadyInvitedUser = async (user: AlreadyInvitedUserTag) => {
    if (projectIds.length === 0) return
    setPendingDeleteUser(user)
  }

  const handleConfirmRemoveAlreadyInvitedUser = async () => {
    if (!pendingDeleteUser || projectIds.length === 0) return
    setErrorMessage('')
    const results = await Promise.allSettled(
      projectIds.map((projectId) => removeProjectMember.mutateAsync({ projectId, userId: pendingDeleteUser.userId })),
    )
    const failedCount = results.filter((result) => result.status === 'rejected').length
    if (failedCount > 0) {
      setErrorMessage('초대 삭제에 실패했습니다. 다시 시도해 주세요.')
      setPendingDeleteUser(null)
      return
    }

    setAlreadyInvitedUsers((prev) => prev.filter((item) => item.userId !== pendingDeleteUser.userId))
    setPendingDeleteUser(null)
  }

  const isUserSelected = (user: UserSearchResult) =>
    selectedUsers.some((u) => u.userId === user.userId)

  const handleSearch = () => {
    const normalized = searchInput.trim()
    if (!normalized) {
      setSearchKeyword('')
      return
    }
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    if (!isValidEmail) {
      setErrorMessage('정확한 이메일 형식으로 입력해 주세요.')
      setSearchKeyword('')
      return
    }
    setErrorMessage('')
    setSearchKeyword(normalized)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={handleClose} />
      <div className="relative w-[500px] bg-white rounded-[24px] shadow-[0_20px_60px_rgba(0,0,0,0.2)] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* 헤더 */}
        <div className="px-8 pt-8 pb-6 border-b border-[#F0F2F9]">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-[22px] font-black text-[#1C1C1E]">공유 초대</h2>
            <button onClick={handleClose} className="p-1 text-[#ADB5BD] hover:text-[#1C1C1E] transition-colors">
              <X size={24} />
            </button>
          </div>
          <p className="text-[13px] font-medium text-[#8E95A3]">
            {projectIds.length > 1
              ? `${projectIds.length}개 프로젝트에 초대합니다.`
              : '새로운 고객을 프로젝트에 추가합니다.'}
          </p>
        </div>

        {/* 본문 */}
        <div className="p-8">
          <div className="mb-6 relative">
            <input
              type="text"
              placeholder="이메일 주소를 입력하세요"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleSearch()
                }
              }}
              className="w-full bg-[#F8F9FD] border border-[#E2E6EF] rounded-xl pl-4 pr-20 py-3.5 text-sm font-medium text-[#1C1C1E] placeholder-[#ADB5BD] focus:outline-none focus:border-[#3B45B3] focus:ring-4 focus:ring-[#3B45B3]/5 transition-all"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 rounded-md border border-[#D1D5DB] bg-[#F3F4F6] px-2 py-0.5 text-[10px] font-bold text-[#6B7280]">
              <span aria-hidden="true">↵</span>
              <span>Enter</span>
            </span>
          </div>

          {(selectedUsers.length > 0 || alreadyInvitedUsers.length > 0) && (
            <div className="mb-6 flex flex-wrap gap-2">
              {alreadyInvitedUsers.map((user) => (
                <span
                  key={`invited-${user.userId}`}
                  className="flex max-w-full items-center gap-2 rounded-full border border-[#D1D5DB] bg-[#F3F4F6] px-3 py-1.5 text-[12px] font-bold text-[#6B7280]"
                >
                  <span className="max-w-[180px] truncate">{user.name}</span>
                  <button
                    type="button"
                    onClick={() => void handleRemoveAlreadyInvitedUser(user)}
                    className="rounded-full text-current opacity-50 transition-opacity hover:opacity-80"
                    aria-label={`${user.name} 초대 삭제`}
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
              {selectedUsers.map((user) => {
                return (
                  <span
                    key={user.userId}
                    className="flex max-w-full items-center gap-2 rounded-full border border-[#E2E6EF] bg-[#F8F9FD] px-3 py-1.5 text-[12px] font-bold text-[#4B5563]"
                  >
                    <span className="max-w-[180px] truncate">{user.name}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSelectedUser(user)}
                      className="rounded-full text-current opacity-60 transition-opacity hover:opacity-100"
                      aria-label={`${user.name} 선택 해제`}
                    >
                      <X size={13} />
                    </button>
                  </span>
                )
              })}
            </div>
          )}

          <div className="flex flex-col gap-2 min-h-[160px]">
            <span className="text-[11px] font-black text-[#ADB5BD] uppercase tracking-widest mb-1">
              {searchKeyword.trim() ? `검색 결과 (${searchResults.length})` : '이메일로 초대할 사람을 검색하세요'}
            </span>

            {searchKeyword.trim() && searchResults.length === 0 && !isSearching && (
              <div className="flex-1 flex items-center justify-center text-[#ADB5BD] py-8">
                <p className="text-xs font-medium">검색 결과가 없습니다.</p>
              </div>
            )}

            {searchResults.map((user) => {
              const isSelected = isUserSelected(user)

              return (
                <div
                  key={user.userId}
                  onClick={() => toggleSelect(user)}
                  className={`group flex items-center justify-between p-4 rounded-2xl transition-all border cursor-pointer ${isSelected
                      ? 'bg-[#F0F2FF]/50 border-[#3B45B3]/20 shadow-sm'
                      : 'bg-white border-transparent hover:bg-[#F8F9FD]'
                    }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${isSelected ? 'bg-[#3B45B3] border-[#3B45B3]' : 'bg-white border-[#E2E6EF]'
                      }`}>
                      {isSelected && <CheckCircle2 size={14} className="text-white" />}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[14px] font-black text-[#1C1C1E]">{user.name}</span>
                      <span className="text-[12px] font-medium text-[#8E95A3]">{user.email}</span>
                    </div>
                  </div>

                  <div />
                </div>
              )
            })}
          </div>

          {errorMessage && (
            <p className="mt-3 text-xs text-[#dc2626] font-medium">{errorMessage}</p>
          )}
        </div>

        {/* 하단 */}
        <div className="px-8 py-6 bg-[#F8F9FD] flex items-center justify-between">
          <p className="text-[12px] text-[#ADB5BD]">
            {selectedUsers.length > 0 ? `${selectedUsers.length}명 선택됨` : 'CUSTOMER로 초대됩니다.'}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={handleClose}
              className="px-6 py-3 text-sm font-black text-[#6B7A99] hover:text-[#1C1C1E] transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSubmit}
              disabled={selectedUsers.length === 0 || projectIds.length === 0 || submitStatus === 'loading' || submitStatus === 'success'}
              className="px-8 py-3 bg-[#3B45B3] text-white text-sm font-black rounded-2xl shadow-lg shadow-[#3B45B3]/30 hover:bg-[#2D3691] hover:-translate-y-0.5 transition-all active:translate-y-0 disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none disabled:cursor-not-allowed flex items-center gap-2"
            >
              {submitStatus === 'loading' && <Loader2 size={14} className="animate-spin" />}
              {submitStatus === 'success' ? '초대 완료!' : '초대 발송'}
            </button>
          </div>
        </div>
      </div>

      {pendingDeleteUser && (
        <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/45">
          <div className="w-[360px] rounded-2xl bg-white p-6 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
            <p className="text-[15px] font-bold text-[#1C1C1E]">
              '{pendingDeleteUser.name}' 님을 초대 목록에서 제거할까요?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteUser(null)}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-[#6B7280] hover:bg-[#F3F4F6]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmRemoveAlreadyInvitedUser()}
                className="rounded-lg bg-[#DC2626] px-4 py-2 text-sm font-semibold text-white hover:bg-[#B91C1C]"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

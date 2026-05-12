import { useEffect, useState } from 'react'
import { X, Search, CheckCircle2, Loader2 } from 'lucide-react'
import { useUserSearch, useSendInvite } from '@/features/project/hooks/useInvitation'
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
  const [searchKeyword, setSearchKeyword] = useState('')
  const [selectedUsers, setSelectedUsers] = useState<UserSearchResult[]>([])
  const [alreadyInvitedUsers, setAlreadyInvitedUsers] = useState<AlreadyInvitedUserTag[]>([])
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const { data: searchResults = [], isLoading: isSearching } = useUserSearch(searchKeyword)
  const sendInvite = useSendInvite()

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
    setSearchKeyword('')
    setSelectedUsers([])
    setAlreadyInvitedUsers([])
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
            ? `${successCount}건은 초대됐고, ${failedCount}건은 실패했습니다. 다시 시도해주세요.`
            : '초대 발송에 실패했습니다. 다시 시도해주세요.',
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

  const isUserSelected = (user: UserSearchResult) =>
    selectedUsers.some((u) => u.userId === user.userId)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={handleClose} />
      <div className="relative w-[500px] overflow-hidden rounded-[24px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.2)] animate-in fade-in zoom-in-95 duration-200">
        <div className="border-b border-[#F0F2F9] px-8 pb-6 pt-8">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-[22px] font-black text-[#1C1C1E]">공유 초대</h2>
            <button onClick={handleClose} className="p-1 text-[#ADB5BD] transition-colors hover:text-[#1C1C1E]">
              <X size={24} />
            </button>
          </div>
          <p className="text-[13px] font-medium text-[#8E95A3]">
            {projectIds.length > 1
              ? `${projectIds.length}개 프로젝트에 초대합니다.`
              : '새로운 고객을 프로젝트에 추가합니다.'}
          </p>
        </div>

        <div className="p-8">
          <div className="relative mb-6">
            {isSearching ? (
              <Loader2 size={18} className="absolute left-4 top-1/2 -translate-y-1/2 animate-spin text-[#ADB5BD]" />
            ) : (
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#ADB5BD]" />
            )}
            <input
              type="text"
              placeholder="이메일 주소로 검색..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="w-full rounded-xl border border-[#E2E6EF] bg-[#F8F9FD] py-3.5 pl-12 pr-4 text-sm font-medium text-[#1C1C1E] placeholder-[#ADB5BD] transition-all focus:border-[#3B45B3] focus:outline-none focus:ring-4 focus:ring-[#3B45B3]/5"
            />
          </div>

          {selectedUsers.length > 0 && (
            <div className="mb-6 flex flex-wrap gap-2">
              {selectedUsers.map((user) => (
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
              ))}
            </div>
          )}

          {alreadyInvitedUsers.length > 0 && (
            <div className="mb-6 flex flex-wrap gap-2">
              {alreadyInvitedUsers.map((user) => (
                <span
                  key={`invited-${user.userId}`}
                  className="flex max-w-full items-center gap-2 rounded-full border border-[#DCE2F7] bg-[#F5F7FF] px-3 py-1.5 text-[12px] font-bold text-[#51608F]"
                >
                  <span className="max-w-[180px] truncate">{user.name}</span>
                  <span className="text-[10px] font-black">이미 초대됨</span>
                </span>
              ))}
            </div>
          )}

          <div className="flex min-h-[160px] flex-col gap-2">
            <span className="mb-1 text-[11px] font-black uppercase tracking-widest text-[#ADB5BD]">
              {searchKeyword.trim() ? `검색 결과 (${searchResults.length})` : '이메일로 초대할 사람을 검색하세요'}
            </span>

            {searchKeyword.trim() && searchResults.length === 0 && !isSearching && (
              <div className="flex flex-1 items-center justify-center py-8 text-[#ADB5BD]">
                <p className="text-xs font-medium">검색 결과가 없습니다.</p>
              </div>
            )}

            {searchResults.map((user) => {
              const isSelected = isUserSelected(user)

              return (
                <div
                  key={user.userId}
                  onClick={() => toggleSelect(user)}
                  className={`group flex cursor-pointer items-center justify-between rounded-2xl border p-4 transition-all ${isSelected
                    ? 'border-[#3B45B3]/20 bg-[#F0F2FF]/50 shadow-sm'
                    : 'border-transparent bg-white hover:bg-[#F8F9FD]'
                    }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`flex h-5 w-5 items-center justify-center rounded-md border transition-all ${isSelected ? 'border-[#3B45B3] bg-[#3B45B3]' : 'border-[#E2E6EF] bg-white'
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
            <p className="mt-3 text-xs font-medium text-[#dc2626]">{errorMessage}</p>
          )}
        </div>

        <div className="flex items-center justify-between bg-[#F8F9FD] px-8 py-6">
          <p className="text-[12px] text-[#ADB5BD]">
            {selectedUsers.length > 0 ? `${selectedUsers.length}명 선택됨` : '초대됩니다.'}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={handleClose}
              className="px-6 py-3 text-sm font-black text-[#6B7A99] transition-colors hover:text-[#1C1C1E]"
            >
              취소
            </button>
            <button
              onClick={handleSubmit}
              disabled={selectedUsers.length === 0 || projectIds.length === 0 || submitStatus === 'loading' || submitStatus === 'success'}
              className="flex items-center gap-2 rounded-2xl bg-[#3B45B3] px-8 py-3 text-sm font-black text-white shadow-lg shadow-[#3B45B3]/30 transition-all hover:-translate-y-0.5 hover:bg-[#2D3691] active:translate-y-0 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
            >
              {submitStatus === 'loading' && <Loader2 size={14} className="animate-spin" />}
              {submitStatus === 'success' ? '초대 완료' : '초대 발송'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

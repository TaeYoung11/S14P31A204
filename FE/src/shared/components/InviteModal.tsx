import { useState } from 'react'
import { X, Search, CheckCircle2, Loader2 } from 'lucide-react'
import { useUserSearch, useSendInvite } from '@/features/project/hooks/useInvitation'
import type { UserSearchResult } from '@/features/project/services/invitation.service'

interface InviteModalProps {
  isOpen: boolean
  onClose: () => void
  projectIds: string[]
}

export function InviteModal({ isOpen, onClose, projectIds }: InviteModalProps) {
  const [searchKeyword, setSearchKeyword] = useState('')
  const [selectedUsers, setSelectedUsers] = useState<UserSearchResult[]>([])
  const [representativeEmail, setRepresentativeEmail] = useState<string | null>(null)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const { data: searchResults = [], isLoading: isSearching } = useUserSearch(searchKeyword)
  const sendInvite = useSendInvite()

  if (!isOpen) return null

  const handleClose = () => {
    setSearchKeyword('')
    setSelectedUsers([])
    setRepresentativeEmail(null)
    setSubmitStatus('idle')
    setErrorMessage('')
    onClose()
  }

  const toggleSelect = (user: UserSearchResult) => {
    const exists = selectedUsers.some((u) => u.userId === user.userId)
    if (exists) {
      if (representativeEmail === user.email) setRepresentativeEmail(null)
      setSelectedUsers((prev) => prev.filter((u) => u.userId !== user.userId))
      return
    }

    setSelectedUsers((prev) => [...prev, user])
    setSearchKeyword('')
  }

  const handleAssignRepresentative = (e: React.MouseEvent, user: UserSearchResult) => {
    e.stopPropagation()
    setRepresentativeEmail(user.email)
    if (!selectedUsers.some((u) => u.userId === user.userId)) {
      setSelectedUsers((prev) => [...prev, user])
      setSearchKeyword('')
    }
  }

  const handleRemoveSelectedUser = (user: UserSearchResult) => {
    if (representativeEmail === user.email) setRepresentativeEmail(null)
    setSelectedUsers((prev) => prev.filter((u) => u.userId !== user.userId))
  }

  const handleSubmit = async () => {
    if (selectedUsers.length === 0 || projectIds.length === 0) return
    setSubmitStatus('loading')
    setErrorMessage('')

    try {
      await Promise.all(
        selectedUsers.flatMap((user) =>
          projectIds.map((projectId) =>
            sendInvite.mutateAsync({
              projectId,
              req: {
                inviteeEmail: user.email,
                role: user.email === representativeEmail ? 'REPRESENTATIVE_CUSTOMER' : 'CUSTOMER',
              },
            }),
          ),
        ),
      )
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
          <div className="relative mb-6">
            {isSearching ? (
              <Loader2 size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#ADB5BD] animate-spin" />
            ) : (
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#ADB5BD]" />
            )}
            <input
              type="text"
              placeholder="이메일 주소로 검색..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="w-full bg-[#F8F9FD] border border-[#E2E6EF] rounded-xl pl-12 pr-4 py-3.5 text-sm font-medium text-[#1C1C1E] placeholder-[#ADB5BD] focus:outline-none focus:border-[#3B45B3] focus:ring-4 focus:ring-[#3B45B3]/5 transition-all"
            />
          </div>

          {selectedUsers.length > 0 && (
            <div className="mb-6 flex flex-wrap gap-2">
              {selectedUsers.map((user) => {
                const isRep = representativeEmail === user.email

                return (
                  <span
                    key={user.userId}
                    className={`flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-bold ${
                      isRep
                        ? 'border-[#3B45B3]/20 bg-[#E7EBFF] text-[#3B45B3]'
                        : 'border-[#E2E6EF] bg-[#F8F9FD] text-[#4B5563]'
                    }`}
                  >
                    <span className="max-w-[180px] truncate">{user.name}</span>
                    {isRep && <span className="text-[10px] font-black">대표</span>}
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
              const isRep = representativeEmail === user.email

              return (
                <div
                  key={user.userId}
                  onClick={() => toggleSelect(user)}
                  className={`group flex items-center justify-between p-4 rounded-2xl transition-all border cursor-pointer ${
                    isSelected
                      ? 'bg-[#F0F2FF]/50 border-[#3B45B3]/20 shadow-sm'
                      : 'bg-white border-transparent hover:bg-[#F8F9FD]'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                      isSelected ? 'bg-[#3B45B3] border-[#3B45B3]' : 'bg-white border-[#E2E6EF]'
                    }`}>
                      {isSelected && <CheckCircle2 size={14} className="text-white" />}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[14px] font-black text-[#1C1C1E]">{user.name}</span>
                      <span className="text-[12px] font-medium text-[#8E95A3]">{user.email}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isRep ? (
                      <span className="px-3 py-1.5 bg-[#E7EBFF] text-[#3B45B3] text-[11px] font-black rounded-lg border border-[#3B45B3]/10 flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 bg-[#3B45B3] rounded-full animate-pulse" />
                        대표 고객
                      </span>
                    ) : (
                      <button
                        onClick={(e) => handleAssignRepresentative(e, user)}
                        className="px-3 py-1.5 bg-white border border-[#E2E6EF] text-[#6B7A99] text-[11px] font-bold rounded-lg hover:border-[#3B45B3] hover:text-[#3B45B3] transition-all opacity-0 group-hover:opacity-100"
                      >
                        대표 고객 지정
                      </button>
                    )}
                  </div>
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
    </div>
  )
}

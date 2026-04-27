import { X, Search, CheckCircle2 } from 'lucide-react'
import { useState, useMemo } from 'react'

interface User {
  id: string
  name: string
  email: string
  isRepresentative?: boolean
  isAlreadyShared?: boolean
}

interface InviteModalProps {
  isOpen: boolean
  onClose: () => void
  onInvite: (userIds: string[]) => void
}

const INITIAL_USERS: User[] = [
  { id: '1', name: '김민준', email: 'minjun.kim@architecture.kr', isAlreadyShared: true },
  { id: '2', name: '이서연', email: 'seoyeon.lee@studio-base.com' },
  { id: '3', name: '박지훈', email: 'jihoon.p@design-works.co' },
  { id: '4', name: '최윤아', email: 'yuna.choi@batang.com', isAlreadyShared: true },
]

export function InviteModal({ isOpen, onClose, onInvite }: InviteModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [users, setUsers] = useState<User[]>(INITIAL_USERS)
  // 초기 대표 고객 설정 (MOCK 데이터에서 id: 1인 사용자를 예시로 설정)
  const [representativeId, setRepresentativeId] = useState<string | null>('1')

  // 검색 필터링
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users
    return users.filter(user => 
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [users, searchQuery])

  if (!isOpen) return null

  // 사용자 선택/해제 (이미 공유된 사용자는 선택 대상에서 제외 - 이미 멤버이므로)
  const toggleSelect = (user: User) => {
    if (user.isAlreadyShared) return 
    
    setSelectedIds((prev) =>
      prev.includes(user.id) ? prev.filter((i) => i !== user.id) : [...prev, user.id]
    )
  }

  // 대표 고객 지정 (이미 공유된 사람 + 새로 초대할 사람 모두 가능하지만 단 한 명만)
  const handleAssignRepresentative = (e: React.MouseEvent, user: User) => {
    e.stopPropagation() 
    setRepresentativeId(user.id)
    
    // 만약 새로 초대할 사람을 대표로 지정했다면, 자동으로 체크박스도 선택됨
    if (!user.isAlreadyShared && !selectedIds.includes(user.id)) {
      setSelectedIds(prev => [...prev, user.id])
    }
  }

  const handleInviteSubmit = () => {
    onInvite(selectedIds)
    setSelectedIds([])
    setSearchQuery('')
    // 대표 고객은 유지하거나 서버 연동에 따라 처리 (여기선 UI 초기화)
    // setRepresentativeId(null)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* 배경 오버레이 */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity" 
        onClick={onClose}
      />
      
      {/* 모달 콘텐츠 */}
      <div className="relative w-[500px] bg-white rounded-[24px] shadow-[0_20px_60px_rgba(0,0,0,0.2)] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* 헤더 */}
        <div className="px-8 pt-8 pb-6 border-b border-[#F0F2F9]">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-[22px] font-black text-[#1C1C1E]">공유 초대</h2>
            <button 
              onClick={onClose}
              className="p-1 text-[#ADB5BD] hover:text-[#1C1C1E] transition-colors"
            >
              <X size={24} />
            </button>
          </div>
          <p className="text-[13px] font-medium text-[#8E95A3]">새로운 고객을 프로젝트에 추가합니다.</p>
        </div>

        {/* 본문 */}
        <div className="p-8">
          {/* 검색 입력창 */}
          <div className="relative mb-8">
            <Search 
              size={18} 
              className="absolute left-4 top-1/2 -translate-y-1/2 text-[#ADB5BD]" 
            />
            <input 
              type="text"
              placeholder="이름 또는 이메일 주소로 팀원 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#F8F9FD] border border-[#E2E6EF] rounded-xl pl-12 pr-4 py-3.5 text-sm font-medium text-[#1C1C1E] placeholder-[#ADB5BD] focus:outline-none focus:border-[#3B45B3] focus:ring-4 focus:ring-[#3B45B3]/5 transition-all"
            />
          </div>

          {/* 검색 결과 목록 */}
          <div className="flex flex-col gap-2 min-h-[200px]">
            <span className="text-[11px] font-black text-[#ADB5BD] uppercase tracking-widest mb-1">검색 결과 ({filteredUsers.length})</span>
            
            {filteredUsers.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-[#ADB5BD] py-10">
                <p className="text-xs font-medium">검색 결과가 없습니다.</p>
              </div>
            ) : (
              filteredUsers.map((user) => {
                const isSelected = selectedIds.includes(user.id)
                const isRep = representativeId === user.id
                const isAlready = user.isAlreadyShared
                
                return (
                  <div 
                    key={user.id}
                    onClick={() => toggleSelect(user)}
                    className={`group flex items-center justify-between p-4 rounded-2xl transition-all border ${
                      isAlready 
                        ? 'bg-[#F8F9FD]/40 border-transparent' 
                        : isSelected 
                          ? 'bg-[#F0F2FF]/50 border-[#3B45B3]/20 shadow-sm' 
                          : 'bg-white border-transparent hover:bg-[#F8F9FD]'
                    } ${!isAlready && 'cursor-pointer'}`}
                  >
                    <div className="flex items-center gap-4">
                      {/* 체크박스: 이미 공유된 사람은 항상 체크된 상태로 보여주거나, 혹은 체크 불가능한 상태로 표현 */}
                      <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                        isAlready
                          ? 'bg-[#E2E6EF] border-[#E2E6EF]'
                          : isSelected 
                            ? 'bg-[#3B45B3] border-[#3B45B3]' 
                            : 'bg-white border-[#E2E6EF]'
                      }`}>
                        {isAlready ? (
                          <CheckCircle2 size={14} className="text-white" />
                        ) : isSelected && (
                          <CheckCircle2 size={14} className="text-white" />
                        )}
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] font-black text-[#1C1C1E]">{user.name}</span>
                          {isAlready && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-[#EEE9FF] text-[#5D4AD8] rounded-md font-bold">멤버</span>
                          )}
                        </div>
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
              })
            )}
          </div>
        </div>

        {/* 하단 버튼 영역 */}
        <div className="px-8 py-6 bg-[#F8F9FD] flex items-center justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-6 py-3 text-sm font-black text-[#6B7A99] hover:text-[#1C1C1E] transition-colors"
          >
            취소
          </button>
          <button 
            onClick={handleInviteSubmit}
            disabled={selectedIds.length === 0}
            className="px-8 py-3 bg-[#3B45B3] text-white text-sm font-black rounded-2xl shadow-lg shadow-[#3B45B3]/30 hover:bg-[#2D3691] hover:-translate-y-0.5 transition-all active:translate-y-0 disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none disabled:cursor-not-allowed"
          >
            초대 발송
          </button>
        </div>
      </div>
    </div>
  )
}

import { MessageSquare, Pin, Send, User, Search, Paperclip, Image as ImageIcon, MoreVertical } from 'lucide-react'

interface Message {
  id: string
  user: string
  time: string
  content: string
  isMe?: boolean
}

const SAMPLE_MESSAGES: Message[] = [
  {
    id: '1',
    user: '김민석 건축주',
    time: '오전 10:15',
    content: '도면상 출입구 단차가 20mm 부족합니다. 상세 도면 확인 부탁드려요.',
  },
  {
    id: '2',
    user: '나 (설계자)',
    time: '오전 11:30',
    content: '확인했습니다. 수정된 DWG 파일 첨부해 드립니다. 2층 출입구 부분 다시 봐주세요.',
    isMe: true,
  },
  {
    id: '3',
    user: '이영희 구조기술사',
    time: '오후 1:45',
    content: '구조 검토 완료했습니다. 수정안대로 시공 시 무리 없습니다.',
  },
]

const SAMPLE_HISTORY = [
  {
    id: '042',
    title: '메인 출입구 단차 조정',
    content: '"도면상 출입구 단차가 20mm 부족합니다. 상세 도면 확인 부탁드려요."',
    time: '방금 전',
    status: 'LIVE'
  },
  {
    id: '041',
    title: '창호 프레임 재질 변경',
    content: '"알루미늄 프레임에서 블랙 스틸로 변경 확정되었습니다."',
    time: '15분 전',
    comments: 3
  },
  {
    id: '040',
    title: '화장실 타일 패턴 터치',
    content: '"B동 2층 화장실 타일 시작점을 왼쪽 벽면으로 고정해주세요."',
    time: '1시간 전',
    status: '해결됨'
  },
  {
    id: '024',
    title: '벽체 마감 확인 필요',
    content: '"벽체 마감 두께가 구조도와 상이합니다. 실측 데이터 업데이트 부탁드립니다."',
    time: '2시간 전'
  }
]

interface CollaborationPanelProps {
  activeTab: 'history' | 'thread'
  onTabChange: (tab: 'history' | 'thread') => void
  selectedPinId: string | null
  onSelectPin: (id: string | null) => void
}

export function CollaborationPanel({
  activeTab,
  onTabChange,
  selectedPinId,
  onSelectPin
}: CollaborationPanelProps) {
  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Tabs */}
      <div className="flex border-b border-[#F0F2F9] shrink-0">
        <button 
          onClick={() => onTabChange('history')}
          className={`flex-1 py-3 text-[11px] font-bold transition-colors border-b-2 ${activeTab === 'history' ? 'text-[#3B45B3] border-[#3B45B3]' : 'text-[#8E95A3] hover:text-[#3B45B3] border-transparent'}`}
        >
          펀치 채팅 기록
        </button>
        <button 
          onClick={() => onTabChange('thread')}
          className={`flex-1 py-3 text-[11px] font-bold transition-colors border-b-2 ${activeTab === 'thread' ? 'text-[#3B45B3] border-[#3B45B3]' : 'text-[#8E95A3] hover:text-[#3B45B3] border-transparent'}`}
        >
          핀 스레드
        </button>
      </div>

      {activeTab === 'history' ? (
        // 펀치 리스트 기록 (히스토리) 뷰
        <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
          <div className="p-4 flex flex-col gap-3 border-b border-[#F0F2F9] shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[13px] font-extrabold text-[#3B45B3]">전체 협업 히스토리</h3>
                <p className="text-[10px] font-bold text-[#ADB5BD]">프로젝트 내 모든 핀 요약 및 대화</p>
              </div>
              <span className="text-[9px] font-black text-[#5D4AD8] bg-[#EEE9FF] px-2 py-0.5 rounded-md">LIVE</span>
            </div>
            <div className="relative mt-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#ADB5BD]" />
              <input
                type="text"
                placeholder="핀 번호 또는 내용 검색"
                className="w-full h-8 pl-8 pr-3 bg-[#F8F9FD] border border-transparent hover:border-[#D9DEF0] focus:border-[#3B45B3] focus:bg-white rounded-lg text-[11px] font-medium outline-none transition-all placeholder:text-[#ADB5BD]"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {SAMPLE_HISTORY.map((item) => (
              <div 
                key={item.id} 
                onClick={() => {
                  onSelectPin(item.id)
                  onTabChange('thread')
                }}
                className="flex flex-col gap-1 cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-[#3B45B3] bg-[#F0F2FF] px-1.5 py-0.5 rounded">#{item.id}</span>
                  <span className="text-[10px] font-bold text-[#ADB5BD]">{item.time}</span>
                </div>
                <h4 className="text-[11px] font-bold text-[#1C1C1E] group-hover:text-[#3B45B3] transition-colors">{item.title}</h4>
                <p className="text-[10px] text-[#6C757D] leading-relaxed line-clamp-2">{item.content}</p>
                {item.comments && (
                  <div className="flex items-center gap-1 mt-1 text-[#ADB5BD]">
                    <MessageSquare size={10} />
                    <span className="text-[10px] font-bold">{item.comments}개의 의견</span>
                  </div>
                )}
                {item.status === '해결됨' && (
                  <div className="mt-1">
                    <span className="text-[9px] font-bold text-[#38D9A9] bg-[#E6FCF5] px-1.5 py-0.5 rounded">해결됨</span>
                  </div>
                )}
              </div>
            ))}
          </div>
          
          <div className="p-4 border-t border-[#F0F2F9] shrink-0">
            <button className="w-full bg-[#3B45B3] text-white py-2.5 rounded-xl text-xs font-bold shadow-md shadow-[#3B45B3]/20 hover:bg-[#2D3691] transition-all flex items-center justify-center gap-2">
              <MessageSquare size={14} />
              새로운 핀 추가하기
            </button>
          </div>
        </div>
      ) : (
        // 핀 스레드 상세 뷰
        <div className="flex-1 flex flex-col min-h-0">
          {/* Thread Header */}
          <div className="p-4 border-b border-[#F0F2F9] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-[#F0F2FF] text-[#3B45B3] rounded-lg">
                <Pin size={14} />
              </div>
              <div>
                <h3 className="text-xs font-extrabold text-[#1C1C1E]">핀 스레드 #{selectedPinId || '042'}</h3>
                <p className="text-[10px] font-bold text-[#ADB5BD]">3명의 참여자</p>
              </div>
            </div>
            <button className="text-[#ADB5BD] hover:text-[#1C1C1E]">
              <MoreVertical size={16} />
            </button>
          </div>

          {/* Chat Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#F8F9FD]/50">
            <div className="text-center">
              <button className="text-[10px] font-bold text-[#ADB5BD] hover:text-[#3B45B3] transition-colors">
                이전 대화 12개 더보기
              </button>
            </div>

            {SAMPLE_MESSAGES.map((msg) => (
              <div key={msg.id} className={`flex gap-3 ${msg.isMe ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
                  msg.isMe ? 'bg-[#3B45B3] text-white' : 'bg-white text-[#1C1C1E] border border-[#E2E6EF]'
                }`}>
                  <User size={16} />
                </div>
                <div className={`flex flex-col gap-1 max-w-[80%] ${msg.isMe ? 'items-end' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-[#1C1C1E]">{msg.user}</span>
                    <span className="text-[9px] font-medium text-[#ADB5BD]">{msg.time}</span>
                  </div>
                  <div className={`p-3 rounded-2xl text-[11px] font-medium leading-relaxed shadow-sm ${
                    msg.isMe 
                      ? 'bg-[#3B45B3] text-white rounded-tr-none' 
                      : 'bg-white text-[#1C1C1E] rounded-tl-none border border-[#F0F2F9]'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Input Area */}
          <div className="p-3 border-t border-[#F0F2F9] bg-white shrink-0">
            <div className="flex gap-2 mb-2 px-1">
              <button className="text-[#ADB5BD] hover:text-[#505764] transition-colors">
                <ImageIcon size={16} />
              </button>
              <button className="text-[#ADB5BD] hover:text-[#505764] transition-colors">
                <Paperclip size={16} />
              </button>
            </div>
            <div className="relative">
              <input
                type="text"
                placeholder="메시지를 입력하세요..."
                className="w-full bg-[#F8F9FD] border border-[#F0F2F9] rounded-xl pl-4 pr-12 py-3 text-xs font-medium focus:border-[#3B45B3] focus:bg-white outline-none transition-all"
              />
              <button className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-[#3B45B3] text-white hover:bg-[#2D3691] rounded-lg transition-colors shadow-sm">
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

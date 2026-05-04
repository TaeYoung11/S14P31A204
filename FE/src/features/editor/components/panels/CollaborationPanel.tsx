import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, FileText, Image as ImageIcon, MessageSquare, Paperclip, Pin, Send, User, X } from 'lucide-react'
import type {
  CollaborationUserType,
  FloorCommentAttachmentInput,
  FloorCommentNotification,
  FloorCommentPin,
} from '../../types'
import { formatRelativeTime } from '@/shared/utils/format'

interface CollaborationPanelProps {
  activeTab: 'history' | 'thread'
  onTabChange: (tab: 'history' | 'thread') => void
  selectedPinId: string | null
  selectedPin: FloorCommentPin | null
  pins: FloorCommentPin[]
  notifications: FloorCommentNotification[]
  unreadNotifications: FloorCommentNotification[]
  currentUserType: CollaborationUserType
  currentUserName: string
  onSelectPin: (id: string) => void
  onCreateCommentReply: (pinId: string, content: string, attachments?: FloorCommentAttachmentInput[]) => void
}

export function CollaborationPanel({
  activeTab,
  onTabChange,
  selectedPinId,
  selectedPin,
  pins,
  notifications,
  unreadNotifications,
  currentUserType,
  currentUserName,
  onSelectPin,
  onCreateCommentReply,
}: CollaborationPanelProps) {
  const THREAD_INITIAL_VISIBLE_COUNT = 8
  const THREAD_LOAD_MORE_COUNT = 12
  const [historySearch, setHistorySearch] = useState('')
  const [replyInput, setReplyInput] = useState('')
  const [threadVisibleCount, setThreadVisibleCount] = useState(THREAD_INITIAL_VISIBLE_COUNT)
  const [pendingAttachments, setPendingAttachments] = useState<FloorCommentAttachmentInput[]>([])
  const pendingAttachmentsRef = useRef<FloorCommentAttachmentInput[]>([])
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const createAttachmentFromFile = (file: File): FloorCommentAttachmentInput => {
    const mimeType = file.type || 'application/octet-stream'
    return {
      kind: mimeType.startsWith('image/') ? 'image' : 'file',
      name: file.name,
      mimeType,
      sizeBytes: file.size,
      url: URL.createObjectURL(file),
    }
  }

  const formatFileSize = (sizeBytes: number): string => {
    if (sizeBytes < 1024) return `${sizeBytes} B`
    const kb = sizeBytes / 1024
    if (kb < 1024) return `${kb.toFixed(1)} KB`
    return `${(kb / 1024).toFixed(1)} MB`
  }

  const pinOrderMap = useMemo(() => {
    const map = new Map<string, number>()
    pins.forEach((pin, index) => map.set(pin.id, index + 1))
    return map
  }, [pins])

  const filteredPins = useMemo(() => {
    const normalized = historySearch.trim().toLowerCase()
    const source = [...pins].reverse()
    if (!normalized) return source
    return source.filter((pin) => {
      const order = pinOrderMap.get(pin.id) ?? 0
      const latest = pin.messages[pin.messages.length - 1]
      const joined = `${order} ${pin.createdByName} ${latest?.content ?? ''}`.toLowerCase()
      return joined.includes(normalized)
    })
  }, [historySearch, pinOrderMap, pins])

  const selectedThread = selectedPin ?? (selectedPinId ? pins.find((pin) => pin.id === selectedPinId) ?? null : null)
  const selectedPinOrder = selectedThread ? (pinOrderMap.get(selectedThread.id) ?? 0) : 0
  const selectedThreadMessages = selectedThread?.messages ?? []
  const hiddenThreadMessageCount = Math.max(selectedThreadMessages.length - threadVisibleCount, 0)
  const visibleThreadMessages = selectedThreadMessages.slice(-threadVisibleCount)

  useEffect(() => {
    const syncTimer = window.setTimeout(() => {
      if (!selectedThread) {
        setThreadVisibleCount(THREAD_INITIAL_VISIBLE_COUNT)
        setPendingAttachments((prev) => {
          prev.forEach((attachment) => URL.revokeObjectURL(attachment.url))
          return []
        })
        return
      }
      setPendingAttachments((prev) => {
        prev.forEach((attachment) => URL.revokeObjectURL(attachment.url))
        return []
      })
      setThreadVisibleCount(Math.min(selectedThread.messages.length, THREAD_INITIAL_VISIBLE_COUNT))
    }, 0)
    return () => window.clearTimeout(syncTimer)
  }, [selectedThread, selectedPinId])

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments
  }, [pendingAttachments])

  useEffect(() => {
    return () => {
      pendingAttachmentsRef.current.forEach((attachment) => URL.revokeObjectURL(attachment.url))
    }
  }, [])

  const addFilesToPending = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const next = Array.from(files).map(createAttachmentFromFile)
    setPendingAttachments((prev) => [...prev, ...next])
  }

  const removePendingAttachment = (targetUrl: string) => {
    setPendingAttachments((prev) => {
      const target = prev.find((attachment) => attachment.url === targetUrl)
      if (target) URL.revokeObjectURL(target.url)
      return prev.filter((attachment) => attachment.url !== targetUrl)
    })
  }

  const handleSubmitReply = () => {
    if (!selectedThread) return
    const normalized = replyInput.trim()
    if (!normalized && pendingAttachments.length === 0) return
    onCreateCommentReply(selectedThread.id, normalized, pendingAttachments)
    setReplyInput('')
    setPendingAttachments([])
  }

  return (
    <div className="flex flex-col h-full bg-white relative">
      <div className="flex border-b border-[#F0F2F9] shrink-0">
        <button
          onClick={() => onTabChange('history')}
          className={`flex-1 py-3 text-[11px] font-bold transition-colors border-b-2 ${activeTab === 'history' ? 'text-[#3B45B3] border-[#3B45B3]' : 'text-[#8E95A3] hover:text-[#3B45B3] border-transparent'}`}
        >
          핀 히스토리
        </button>
        <button
          onClick={() => onTabChange('thread')}
          className={`flex-1 py-3 text-[11px] font-bold transition-colors border-b-2 ${activeTab === 'thread' ? 'text-[#3B45B3] border-[#3B45B3]' : 'text-[#8E95A3] hover:text-[#3B45B3] border-transparent'}`}
        >
          핀 스레드
        </button>
      </div>

      {activeTab === 'history' ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="p-4 border-b border-[#F0F2F9]">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-extrabold text-[#3B45B3]">댓글 핀 목록</h3>
              <span className="text-[10px] font-bold text-[#73819A]">총 {pins.length}개</span>
            </div>
            <input
              type="text"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="핀 번호/내용 검색"
              className="mt-3 w-full h-8 px-3 bg-[#F8F9FD] border border-transparent hover:border-[#D9DEF0] focus:border-[#3B45B3] focus:bg-white rounded-lg text-[11px] font-medium outline-none transition-all placeholder:text-[#ADB5BD]"
            />
          </div>

          <div className="px-4 py-3 border-b border-[#F0F2F9] bg-[#FBFCFF]">
            <div className="flex items-center gap-1.5 text-[#3B45B3]">
              <Bell size={12} />
              <span className="text-[10px] font-bold">읽지 않은 알림 {unreadNotifications.length}건</span>
            </div>
            {unreadNotifications.length === 0 ? (
              <p className="mt-1 text-[10px] text-[#A0A9BD]">새 알림이 없습니다.</p>
            ) : (
              <div className="mt-1.5 space-y-1">
                {unreadNotifications.slice(-3).reverse().map((notification) => (
                  <p key={notification.id} className="text-[10px] text-[#55627D]">
                    {notification.message}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {filteredPins.length === 0 && (
              <div className="rounded-xl border border-dashed border-[#D9DEF0] bg-[#FAFBFF] px-3 py-4 text-center text-[11px] text-[#8E95A3]">
                검색 결과가 없습니다.
              </div>
            )}
            {filteredPins.map((pin) => {
              const order = pinOrderMap.get(pin.id) ?? 0
              const latest = pin.messages[pin.messages.length - 1]
              return (
                <button
                  key={pin.id}
                  onClick={() => {
                    onSelectPin(pin.id)
                    onTabChange('thread')
                  }}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${selectedPinId === pin.id ? 'border-[#3B45B3] bg-[#F4F6FF]' : 'border-[#EEF1F8] bg-white hover:border-[#CED6ED]'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-[#3B45B3] bg-[#EEF1FF] px-1.5 py-0.5 rounded">#{order}</span>
                    <span className="text-[10px] text-[#A0A9BD]">{formatRelativeTime(pin.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-[10px] text-[#6F7C96]">{pin.createdByName}</p>
                  <p className="mt-1 text-[11px] font-bold text-[#1C1C1E] line-clamp-2">{latest?.content ?? ''}</p>
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-[#8E95A3]">
                    <MessageSquare size={10} />
                    {pin.messages.length}개 댓글
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          {!selectedThread ? (
            <div className="flex-1 flex items-center justify-center px-6 text-center text-[11px] text-[#8E95A3]">
              캔버스에서 핀을 선택하거나 빈 위치를 클릭해 새 댓글 핀을 추가하세요.
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-[#F0F2F9] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-[#F0F2FF] text-[#3B45B3] rounded-lg">
                    <Pin size={14} />
                  </div>
                  <div>
                    <h3 className="text-xs font-extrabold text-[#1C1C1E]">핀 스레드 #{selectedPinOrder}</h3>
                    <p className="text-[10px] font-bold text-[#ADB5BD]">{selectedThread.messages.length}개 댓글</p>
                  </div>
                </div>
                <span className="text-[10px] text-[#8A95AC]">{formatRelativeTime(selectedThread.createdAt)}</span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#F8F9FD]/50">
                {hiddenThreadMessageCount > 0 && (
                  <div className="text-center">
                    <button
                      onClick={() => {
                        setThreadVisibleCount((prev) =>
                          Math.min(selectedThreadMessages.length, prev + THREAD_LOAD_MORE_COUNT),
                        )
                      }}
                      className="text-[10px] font-bold text-[#ADB5BD] hover:text-[#3B45B3] transition-colors"
                    >
                      이전 대화 {hiddenThreadMessageCount}개 더보기
                    </button>
                  </div>
                )}
                {visibleThreadMessages.map((message) => {
                  const isMe = message.authorType === currentUserType && message.authorName === currentUserName
                  return (
                    <div key={message.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${isMe ? 'bg-[#3B45B3] text-white' : 'bg-white text-[#1C1C1E] border border-[#E2E6EF]'}`}>
                        <User size={15} />
                      </div>
                      <div className={`flex flex-col gap-1 max-w-[82%] ${isMe ? 'items-end' : ''}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-[#1C1C1E]">{message.authorName}</span>
                          <span className="text-[9px] font-medium text-[#ADB5BD]">{formatRelativeTime(message.createdAt)}</span>
                        </div>
                        <div className={`p-3 rounded-2xl text-[11px] font-medium leading-relaxed shadow-sm ${isMe ? 'bg-[#3B45B3] text-white rounded-tr-none' : 'bg-white text-[#1C1C1E] rounded-tl-none border border-[#F0F2F9]'}`}>
                          {message.content && <p>{message.content}</p>}
                          {(message.attachments?.length ?? 0) > 0 && (
                            <div className={`mt-2 space-y-2 ${isMe ? 'text-white/90' : 'text-[#44506A]'}`}>
                              {(message.attachments ?? []).map((attachment) => (
                                attachment.kind === 'image' ? (
                                  <a
                                    key={attachment.id}
                                    href={attachment.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block"
                                  >
                                    <img
                                      src={attachment.url}
                                      alt={attachment.name}
                                      className="max-h-40 rounded-lg border border-white/20 object-cover"
                                    />
                                  </a>
                                ) : (
                                  <a
                                    key={attachment.id}
                                    href={attachment.url}
                                    download={attachment.name}
                                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] ${isMe ? 'bg-white/15 hover:bg-white/25' : 'bg-[#EEF2FF] hover:bg-[#E4EAFF]'}`}
                                  >
                                    <FileText size={12} />
                                    <span className="truncate">{attachment.name}</span>
                                    <span className="shrink-0 opacity-80">{formatFileSize(attachment.sizeBytes)}</span>
                                  </a>
                                )
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="p-3 border-t border-[#F0F2F9] bg-white shrink-0">
                <div className="mb-2 flex items-center gap-2">
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    className="rounded-md p-1.5 text-[#7D88A0] hover:bg-[#F1F4FF] hover:text-[#3B45B3]"
                    title="이미지 첨부"
                  >
                    <ImageIcon size={14} />
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-md p-1.5 text-[#7D88A0] hover:bg-[#F1F4FF] hover:text-[#3B45B3]"
                    title="파일 첨부"
                  >
                    <Paperclip size={14} />
                  </button>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      addFilesToPending(e.target.files)
                      e.currentTarget.value = ''
                    }}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      addFilesToPending(e.target.files)
                      e.currentTarget.value = ''
                    }}
                  />
                </div>
                {pendingAttachments.length > 0 && (
                  <div className="mb-2 max-h-24 overflow-y-auto space-y-1.5 rounded-lg border border-[#EEF1F8] bg-[#FAFBFF] p-2">
                    {pendingAttachments.map((attachment) => (
                      <div key={attachment.url} className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1">
                        <div className="min-w-0 flex items-center gap-1.5 text-[10px] text-[#55627D]">
                          {attachment.kind === 'image' ? <ImageIcon size={11} /> : <Paperclip size={11} />}
                          <span className="truncate">{attachment.name}</span>
                          <span className="shrink-0 text-[#98A3BA]">{formatFileSize(attachment.sizeBytes)}</span>
                        </div>
                        <button
                          onClick={() => removePendingAttachment(attachment.url)}
                          className="text-[#9AA4BA] hover:text-[#49556F]"
                          title="첨부 제거"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <input
                    type="text"
                    value={replyInput}
                    onChange={(e) => setReplyInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSubmitReply()
                      }
                    }}
                    placeholder="답글을 입력하세요..."
                    className="w-full bg-[#F8F9FD] border border-[#F0F2F9] rounded-xl pl-4 pr-12 py-3 text-xs font-medium focus:border-[#3B45B3] focus:bg-white outline-none transition-all"
                  />
                  <button
                    onClick={handleSubmitReply}
                    disabled={!replyInput.trim() && pendingAttachments.length === 0}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-[#3B45B3] text-white hover:bg-[#2D3691] rounded-lg transition-colors shadow-sm disabled:opacity-40"
                  >
                    <Send size={14} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {notifications.length > 0 && (
        <div className="shrink-0 border-t border-[#F0F2F9] px-4 py-2 bg-[#FCFDFF]">
          <p className="text-[10px] text-[#93A0B6]">알림 기록 {notifications.length}건</p>
        </div>
      )}
    </div>
  )
}

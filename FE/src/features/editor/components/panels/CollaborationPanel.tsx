// 에디터 협업 패널에서 핀별 댓글 스레드를 아코디언으로 표시합니다.
import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, ChevronDown, FileText, MessageSquare, Send, User } from 'lucide-react'
import type {
  CollaborationUserType,
  FloorCommentAttachmentInput,
  FloorCommentNotification,
  FloorCommentPin,
} from '../../types'
import { formatRelativeTime } from '@/shared/utils/format'

interface CollaborationPanelProps {
  selectedPinId: string | null
  selectedPin: FloorCommentPin | null
  pins: FloorCommentPin[]
  notifications: FloorCommentNotification[]
  currentUserType: CollaborationUserType
  currentUserName: string
  onSelectPin: (id: string) => void
  onCreateCommentReply: (pinId: string, content: string, attachments?: FloorCommentAttachmentInput[]) => void
  onResolvePin?: (pinId: string) => void
  onResolveComment?: (pinId: string, commentId: string) => void
  resolvingPinId?: string | null
  resolvingCommentId?: string | null
}

export function CollaborationPanel({
  selectedPinId,
  selectedPin,
  pins,
  notifications,
  currentUserType,
  currentUserName,
  onSelectPin,
  onCreateCommentReply,
  onResolvePin,
  onResolveComment,
  resolvingPinId,
  resolvingCommentId,
}: CollaborationPanelProps) {
  const THREAD_INITIAL_VISIBLE_COUNT = 8
  const THREAD_LOAD_MORE_COUNT = 12
  const [replyInputByPinId, setReplyInputByPinId] = useState<Record<string, string>>({})
  const [threadVisibleCountByPinId, setThreadVisibleCountByPinId] = useState<Record<string, number>>({})
  const threadScrollRef = useRef<HTMLDivElement | null>(null)

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

  const visiblePins = useMemo(() => [...pins].reverse(), [pins])
  const expandedPin = selectedPin ?? (selectedPinId ? pins.find((pin) => pin.id === selectedPinId) ?? null : null)
  const expandedVisibleCount = expandedPin
    ? (threadVisibleCountByPinId[expandedPin.id] ?? THREAD_INITIAL_VISIBLE_COUNT)
    : THREAD_INITIAL_VISIBLE_COUNT
  const expandedPinId = expandedPin?.id ?? null
  const expandedMessages = useMemo(() => {
    if (!expandedPin) return []
    return expandedPin.messages.filter((message) => !message.isPinMessage && message.status !== 'RESOLVED')
  }, [expandedPin])
  const latestExpandedMessageId = expandedMessages[expandedMessages.length - 1]?.id ?? null

  useEffect(() => {
    if (!expandedPinId) return
    const syncVisibleCountTimer = window.setTimeout(() => {
      setThreadVisibleCountByPinId((prev) => ({
        ...prev,
        [expandedPinId]: Math.min(expandedMessages.length, THREAD_INITIAL_VISIBLE_COUNT),
      }))
    }, 0)

    return () => window.clearTimeout(syncVisibleCountTimer)
  }, [expandedPinId, expandedMessages.length])

  useEffect(() => {
    if (!expandedPinId) return
    const scrollTimer = window.setTimeout(() => {
      const threadScrollElement = threadScrollRef.current
      if (!threadScrollElement) return
      threadScrollElement.scrollTop = threadScrollElement.scrollHeight
    }, 0)
    return () => window.clearTimeout(scrollTimer)
  }, [expandedPinId, latestExpandedMessageId, expandedVisibleCount])

  const handleSubmitReply = (pinId: string) => {
    const normalized = (replyInputByPinId[pinId] ?? '').trim()
    if (!normalized) return
    onCreateCommentReply(pinId, normalized)
    setReplyInputByPinId((prev) => ({ ...prev, [pinId]: '' }))
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="shrink-0 border-b border-[#F0F2F9] p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-extrabold text-[#3B45B3]">댓글</h3>
          <span className="text-[10px] font-bold text-[#73819A]">총 {pins.length}개</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {visiblePins.length === 0 && (
          <div className="m-4 border border-dashed border-[#D9DEF0] bg-[#FAFBFF] px-3 py-4 text-center text-[11px] text-[#8E95A3]">
            등록된 댓글이 없습니다.
          </div>
        )}

        {visiblePins.map((pin) => {
          const order = pinOrderMap.get(pin.id) ?? 0
          const isExpanded = selectedPinId === pin.id
          const pinMessage = pin.messages.find((message) => message.isPinMessage) ?? null
          const visibleMessages = pin.messages.filter((message) => !message.isPinMessage && message.status !== 'RESOLVED')
          const latest = visibleMessages[visibleMessages.length - 1] ?? pinMessage
          const lastUpdatedAt = latest?.createdAt ?? pin.createdAt
          const isPinResolved = pinMessage?.status === 'RESOLVED'
          const canResolvePin =
            Boolean(onResolvePin)
            && currentUserType === 'DESIGNER'
            && pinMessage?.authorType === 'CUSTOMER'
            && !isPinResolved
          const threadVisibleCount = threadVisibleCountByPinId[pin.id] ?? THREAD_INITIAL_VISIBLE_COUNT
          const hiddenMessageCount = Math.max(visibleMessages.length - threadVisibleCount, 0)
          const threadMessages = visibleMessages.slice(-threadVisibleCount)
          const replyInput = replyInputByPinId[pin.id] ?? ''

          return (
            <section
              key={pin.id}
              className={`border-b transition-colors ${isExpanded ? 'border-[#DDE3F6] bg-[#F8F9FD]' : 'border-[#EEF1F8] bg-white'
                }`}
            >
              <div className="flex items-start justify-between gap-3 px-3 py-3">
                <button
                  type="button"
                  onClick={() => onSelectPin(pin.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="rounded bg-[#EEF1FF] px-1.5 py-0.5 text-[10px] font-black text-[#3B45B3]">
                      thread #{order}
                    </span>
                    {!isExpanded && pin.hasUnreadCommentByOtherUser && (
                      <span className="h-2 w-2 rounded-full bg-[#ef4444]" />
                    )}
                    {isPinResolved && (
                      <span
                        title="핀 완료"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#2F9E44] text-white"
                      >
                        <CheckCircle2 size={10} />
                      </span>
                    )}
                  </span>
                  {!isExpanded && latest?.authorName && (
                    <span className="mt-1 block truncate text-[10px] text-[#6F7C96]">{latest.authorName}</span>
                  )}
                  <span className={`mt-1 line-clamp-2 text-[11px] font-bold text-[#1C1C1E] ${isExpanded ? 'hidden' : 'block'}`}>
                    {latest?.content ?? ''}
                  </span>
                  <span className={`mt-1 items-center gap-1 text-[10px] text-[#8E95A3] ${isExpanded ? 'hidden' : 'flex'}`}>
                    <MessageSquare size={10} />
                    {visibleMessages.length}개 댓글
                  </span>
                </button>
                <span className="flex shrink-0 items-center gap-2">
                  {isExpanded && canResolvePin && (
                    <button
                      type="button"
                      title="핀 완료"
                      aria-label="핀 완료"
                      onClick={() => onResolvePin?.(pin.id)}
                      disabled={resolvingPinId === pin.id}
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#C7E7D0] text-[#2F9E44] transition-colors hover:bg-[#EAF8EF] disabled:opacity-50"
                    >
                      <CheckCircle2 size={10} />
                    </button>
                  )}
                  <span className="text-[10px] text-[#A0A9BD]">{formatRelativeTime(lastUpdatedAt)}</span>
                  <button
                    type="button"
                    onClick={() => onSelectPin(pin.id)}
                    className="inline-flex h-5 w-5 items-center justify-center"
                    aria-label={isExpanded ? '핀 닫기' : '핀 열기'}
                  >
                    <ChevronDown
                      size={14}
                      className={`text-[#8E95A3] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                </span>
              </div>

              {isExpanded && (
                <div className="border-t border-[#EEF1F8]">
                  <div ref={threadScrollRef} className="max-h-[360px] overflow-y-auto bg-[#F8F9FD]/70 p-4">
                    {hiddenMessageCount > 0 && (
                      <div className="mb-4 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setThreadVisibleCountByPinId((prev) => ({
                              ...prev,
                              [pin.id]: Math.min(visibleMessages.length, threadVisibleCount + THREAD_LOAD_MORE_COUNT),
                            }))
                          }}
                          className="text-[10px] font-bold text-[#ADB5BD] transition-colors hover:text-[#3B45B3]"
                        >
                          이전 댓글 {hiddenMessageCount}개 더 보기
                        </button>
                      </div>
                    )}

                    <div className="space-y-4">
                      {threadMessages.map((message) => {
                        const isMe = message.authorType === currentUserType && message.authorName === currentUserName
                        const canResolveComment =
                          Boolean(onResolveComment)
                          && currentUserType === 'DESIGNER'
                          && !message.isPinMessage
                          && message.status !== 'RESOLVED'

                        return (
                          <div key={message.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                            <div
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-sm ${isMe ? 'bg-[#3B45B3] text-white' : 'border border-[#E2E6EF] bg-white text-[#1C1C1E]'
                                }`}
                            >
                              <User size={15} />
                            </div>
                            <div className={`flex max-w-[82%] flex-col gap-1 ${isMe ? 'items-end' : ''}`}>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-[#1C1C1E]">{message.authorName}</span>
                                <span className="text-[9px] font-medium text-[#ADB5BD]">
                                  {formatRelativeTime(message.createdAt)}
                                </span>
                                {canResolveComment && (
                                  <button
                                    type="button"
                                    title="댓글 완료"
                                    aria-label="댓글 완료"
                                    onClick={() => onResolveComment?.(message.pinId, message.id)}
                                    disabled={resolvingCommentId === message.id}
                                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#C7E7D0] text-[#2F9E44] transition-colors hover:bg-[#EAF8EF] disabled:opacity-50"
                                  >
                                    <CheckCircle2 size={10} />
                                  </button>
                                )}
                              </div>
                              <div
                                className={`rounded-2xl p-3 text-[11px] font-medium leading-relaxed shadow-sm ${isMe
                                  ? 'rounded-tr-none bg-[#3B45B3] text-white'
                                  : 'rounded-tl-none border border-[#F0F2F9] bg-white text-[#1C1C1E]'
                                  }`}
                              >
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
                                          className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] ${isMe ? 'bg-white/15 hover:bg-white/25' : 'bg-[#EEF2FF] hover:bg-[#E4EAFF]'
                                            }`}
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
                  </div>

                  <div className="border-t border-[#F0F2F9] bg-white p-3">
                    <div className="relative">
                      <input
                        type="text"
                        value={replyInput}
                        onChange={(event) => {
                          setReplyInputByPinId((prev) => ({ ...prev, [pin.id]: event.target.value }))
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault()
                            handleSubmitReply(pin.id)
                          }
                        }}
                        placeholder="댓글을 입력하세요."
                        className="w-full rounded-xl border border-[#F0F2F9] bg-[#F8F9FD] py-3 pl-4 pr-12 text-xs font-medium outline-none transition-all focus:border-[#3B45B3] focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleSubmitReply(pin.id)}
                        disabled={!replyInput.trim()}
                        className="absolute right-2 top-1/2 rounded-lg bg-[#3B45B3] p-2 text-white shadow-sm transition-colors -translate-y-1/2 hover:bg-[#2D3691] disabled:opacity-40"
                      >
                        <Send size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )
        })}
      </div>

      {notifications.length > 0 && (
        <div className="shrink-0 border-t border-[#F0F2F9] bg-[#FCFDFF] px-4 py-2">
          <p className="text-[10px] text-[#93A0B6]">최근 알림 {notifications.length}건</p>
        </div>
      )}
    </div>
  )
}

import { editorPinPositionMapper } from '../services/editorPinComment.service'
import type { EditorPinCommentResponse, EditorPinResponse } from '../services/editorPinComment.service'
import type { CollaborationUserType, FloorCommentNotification, FloorCommentPin } from '../types'

interface PinAuthorDirectory {
  creator?: {
    userId: string
    name: string
  } | null
  invitedUsers?: {
    userId: string
    name: string
  }[]
}

const formatPinAuthorName = (authorUserId: string | null, fallbackName: string): string => {
  if (!authorUserId) return fallbackName
  return `사용자 ${authorUserId.slice(0, 8)}`
}

const resolvePinAuthorName = (
  authorUserId: string | null,
  authorNameByUserId: Record<string, string>,
  fallbackName: string,
): string => {
  if (!authorUserId) return fallbackName
  return authorNameByUserId[authorUserId] ?? formatPinAuthorName(authorUserId, fallbackName)
}

/**
 * 프로젝트 작성자/초대자 목록을 댓글 핀 표시용 작성자 디렉터리로 변환한다.
 */
export const buildPinAuthorNameByUserId = (directory: PinAuthorDirectory | undefined): Record<string, string> => {
  if (!directory) return {}
  const nextMap: Record<string, string> = {}

  if (directory.creator?.userId && directory.creator.name) {
    nextMap[directory.creator.userId] = directory.creator.name
  }

  directory.invitedUsers?.forEach((user) => {
    if (!user.userId || !user.name) return
    nextMap[user.userId] = user.name
  })

  return nextMap
}

/**
 * 핀/댓글 API 응답을 캔버스 렌더링용 핀 모델로 변환한다.
 */
export const mapApiPinToFloorCommentPin = (
  pin: EditorPinResponse,
  comments: EditorPinCommentResponse[],
  currentUserId: string | undefined,
  currentUserName: string,
  currentUserType: CollaborationUserType,
  counterpartType: CollaborationUserType,
  authorNameByUserId: Record<string, string>,
): FloorCommentPin => {
  const pinAuthorType = pin.authorUserId && pin.authorUserId === currentUserId ? currentUserType : counterpartType
  const pinAuthorName = pin.authorUserId === currentUserId
    ? currentUserName
    : resolvePinAuthorName(pin.authorUserId, authorNameByUserId, '알 수 없는 작성자')

  const pinMessage = {
    id: `${pin.pinId}:pin`,
    pinId: pin.pinId,
    authorId: pin.authorUserId ?? 'unknown-user',
    authorName: pinAuthorName,
    authorType: pinAuthorType,
    content: pin.content,
    status: pin.status,
    isPinMessage: true,
    createdAt: pin.createdAt,
  }

  const commentMessages = comments.map((comment) => {
    const isCurrentUser = comment.authorUserId === currentUserId
    return {
      id: comment.commentId,
      pinId: pin.pinId,
      authorId: comment.authorUserId ?? 'unknown-user',
      authorName: isCurrentUser
        ? currentUserName
        : resolvePinAuthorName(comment.authorUserId, authorNameByUserId, '다른 작성자'),
      authorType: isCurrentUser ? currentUserType : counterpartType,
      content: comment.content,
      status: comment.status,
      isPinMessage: false,
      createdAt: comment.createdAt,
    }
  })

  return {
    id: pin.pinId,
    x: editorPinPositionMapper.worldXToCanvasX(pin.worldPosition.x),
    y: editorPinPositionMapper.worldYToCanvasY(pin.worldPosition.y),
    createdAt: pin.createdAt,
    createdById: pin.authorUserId ?? 'unknown-user',
    createdByName: pinAuthorName,
    createdByType: pinAuthorType,
    messages: [pinMessage, ...commentMessages].sort(
      (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
    ),
    hasUnreadCommentByOtherUser: pin.hasUnreadCommentByOtherUser,
  }
}

/**
 * 읽지 않은 핀 댓글 목록을 우측 알림 패널 표시용 데이터로 변환한다.
 */
export const buildUnreadCommentNotifications = (
  pins: FloorCommentPin[],
  recipientType: CollaborationUserType,
): FloorCommentNotification[] => {
  const unreadPins = pins.filter((pin) => pin.hasUnreadCommentByOtherUser)
  return unreadPins.map((pin) => ({
    id: `pin-unread-${pin.id}`,
    pinId: pin.id,
    senderName: pin.createdByName,
    recipientType,
    type: 'comment_new',
    // 전체 핀 목록 기준 순번을 유지해 기존 UI 의미를 보존한다.
    message: `#${pins.findIndex((item) => item.id === pin.id) + 1} 핀에 새 댓글이 있습니다.`,
    createdAt: pin.messages[pin.messages.length - 1]?.createdAt ?? pin.createdAt,
    isRead: false,
  }))
}

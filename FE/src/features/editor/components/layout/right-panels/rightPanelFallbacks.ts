import type { EditorRightPanelsProps } from './EditorRightPanels.types'

export const DESIGNER_USER_TYPE = 'DESIGNER'
export const DEFAULT_USER_NAME = '설계자'
export const DEFAULT_TAB: NonNullable<EditorRightPanelsProps['collaborationTab']> = 'history'

/**
 * 인자가 없는 기본 no-op 핸들러
 */
export function noop() {}

/**
 * 핀 선택 기본 no-op 핸들러
 */
export function noopSelectPin(_id: string) {}

/**
 * 댓글 생성 기본 no-op 핸들러
 */
export function noopCreateCommentReply(
  _pinId: string,
  _content: string,
  _attachments?: Parameters<NonNullable<EditorRightPanelsProps['onCreateCommentReply']>>[2],
) {}

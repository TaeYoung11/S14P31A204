// 에디터 오른쪽 패널에 전달할 협업 패널 기본값을 정의합니다.
import type { EditorRightPanelsProps } from './EditorRightPanels.types'

export const DESIGNER_USER_TYPE = 'DESIGNER'
export const DEFAULT_USER_NAME = '사용자'

export function noopSelectPin(_id: string) {}

export function noopCreateCommentReply(
  _pinId: string,
  _content: string,
  _attachments?: Parameters<NonNullable<EditorRightPanelsProps['onCreateCommentReply']>>[2],
) {}

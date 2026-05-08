import type { ComponentProps } from 'react'
import { CollaborationPanel } from '../../panels/CollaborationPanel'
import type { EditorRightPanelsProps } from './EditorRightPanels.types'
import {
  DEFAULT_USER_NAME,
  DESIGNER_USER_TYPE,
  noopCreateCommentReply,
  noopSelectPin,
} from './rightPanelFallbacks'

export type CollaborationPanelProps = ComponentProps<typeof CollaborationPanel>

type CollaborationPanelViewModel = Pick<
  EditorRightPanelsProps,
  | 'selectedPinId'
  | 'selectedPin'
  | 'commentPins'
  | 'commentNotifications'
  | 'currentCollaborationUserType'
  | 'currentCollaborationUserName'
  | 'onSelectPin'
  | 'onCreateCommentReply'
  | 'onResolvePin'
  | 'onResolveComment'
  | 'resolvingPinId'
  | 'resolvingCommentId'
>

/**
 * 협업 도크 입력값을 CollaborationPanel props로 매핑한다.
 */
export function buildCollaborationPanelProps(vm: CollaborationPanelViewModel): CollaborationPanelProps {
  return {
    selectedPinId: vm.selectedPinId ?? null,
    selectedPin: vm.selectedPin ?? null,
    pins: vm.commentPins ?? [],
    notifications: vm.commentNotifications ?? [],
    currentUserType: vm.currentCollaborationUserType ?? DESIGNER_USER_TYPE,
    currentUserName: vm.currentCollaborationUserName ?? DEFAULT_USER_NAME,
    onSelectPin: vm.onSelectPin ?? noopSelectPin,
    onCreateCommentReply: vm.onCreateCommentReply ?? noopCreateCommentReply,
    onResolvePin: vm.onResolvePin,
    onResolveComment: vm.onResolveComment,
    resolvingPinId: vm.resolvingPinId ?? null,
    resolvingCommentId: vm.resolvingCommentId ?? null,
  }
}

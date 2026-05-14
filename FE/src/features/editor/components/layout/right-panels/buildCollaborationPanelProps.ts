import type { ComponentProps } from 'react'
import { CollaborationPanel } from '../../panels/CollaborationPanel'
import type { EditorRightPanelsProps } from './EditorRightPanels.types'
import {
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
  | 'currentCollaborationUserId'
  | 'currentCollaborationUserName'
  | 'onSelectPin'
  | 'onCreateCommentReply'
  | 'onResolvePin'
  | 'onDeletePin'
  | 'onResolveComment'
  | 'resolvingPinId'
  | 'deletingPinId'
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
    currentUserId: vm.currentCollaborationUserId ?? null,
    currentUserName: vm.currentCollaborationUserName,
    onSelectPin: vm.onSelectPin ?? noopSelectPin,
    onCreateCommentReply: vm.onCreateCommentReply ?? noopCreateCommentReply,
    onResolvePin: vm.onResolvePin,
    onDeletePin: vm.onDeletePin,
    onResolveComment: vm.onResolveComment,
    resolvingPinId: vm.resolvingPinId ?? null,
    deletingPinId: vm.deletingPinId ?? null,
    resolvingCommentId: vm.resolvingCommentId ?? null,
  }
}

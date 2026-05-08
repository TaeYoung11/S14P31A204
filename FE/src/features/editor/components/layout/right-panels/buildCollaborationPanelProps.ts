import type { ComponentProps } from 'react'
import { CollaborationPanel } from '../../panels/CollaborationPanel'
import type { EditorRightPanelsProps } from './EditorRightPanels.types'
import {
  DEFAULT_TAB,
  DEFAULT_USER_NAME,
  DESIGNER_USER_TYPE,
  noop,
  noopCreateCommentReply,
  noopSelectPin,
} from './rightPanelFallbacks'

export type CollaborationPanelProps = ComponentProps<typeof CollaborationPanel>

type CollaborationPanelViewModel = Pick<
  EditorRightPanelsProps,
  | 'collaborationTab'
  | 'onCollaborationTabChange'
  | 'selectedPinId'
  | 'selectedPin'
  | 'commentPins'
  | 'commentNotifications'
  | 'unreadCommentNotifications'
  | 'currentCollaborationUserType'
  | 'currentCollaborationUserName'
  | 'onSelectPin'
  | 'onCreateCommentReply'
>

/**
 * 협업 도크 입력값을 CollaborationPanel props로 매핑한다.
 */
export function buildCollaborationPanelProps(vm: CollaborationPanelViewModel): CollaborationPanelProps {
  return {
    activeTab: vm.collaborationTab ?? DEFAULT_TAB,
    onTabChange: vm.onCollaborationTabChange ?? noop,
    selectedPinId: vm.selectedPinId ?? null,
    selectedPin: vm.selectedPin ?? null,
    pins: vm.commentPins ?? [],
    notifications: vm.commentNotifications ?? [],
    unreadNotifications: vm.unreadCommentNotifications ?? [],
    currentUserType: vm.currentCollaborationUserType ?? DESIGNER_USER_TYPE,
    currentUserName: vm.currentCollaborationUserName ?? DEFAULT_USER_NAME,
    onSelectPin: vm.onSelectPin ?? noopSelectPin,
    onCreateCommentReply: vm.onCreateCommentReply ?? noopCreateCommentReply,
  }
}

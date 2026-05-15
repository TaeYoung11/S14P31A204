import type { RightPanelPropsSubset, RightPanelViewModel } from './rightPanelPropsTypes'

/**
 * 협업 코멘트 패널 상태/핸들러를 매핑한다.
 */
export function buildCollaborationRightPanelProps(
  vm: RightPanelViewModel,
): RightPanelPropsSubset<
  | 'isCollaborationMode'
  | 'isAgentPanelMode'
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
> {
  return {
    isCollaborationMode: vm.isCollaborationMode,
    isAgentPanelMode: vm.isAgentPanelMode,
    selectedPinId: vm.selectedPinId,
    selectedPin: vm.selectedCommentPin,
    commentPins: vm.commentPins,
    commentNotifications: vm.commentNotifications,
    currentCollaborationUserType: vm.currentCollaborationUserType,
    currentCollaborationUserName: vm.currentCollaborationUserName,
    onSelectPin: vm.handlePinClick,
    onCreateCommentReply: vm.handleAddCommentReply,
    onResolvePin: vm.handleResolvePin,
    onResolveComment: vm.handleResolveComment,
    resolvingPinId: vm.resolvingPinId,
    resolvingCommentId: vm.resolvingCommentId,
  }
}

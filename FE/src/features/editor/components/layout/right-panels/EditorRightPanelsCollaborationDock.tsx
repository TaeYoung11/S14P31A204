import { CollaborationPanel } from '../../panels/CollaborationPanel'
import type { EditorRightPanelsProps } from './EditorRightPanels.types'
import { buildCollaborationPanelProps } from './buildCollaborationPanelProps'

type CollaborationDockProps = Pick<
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
 * 협업 모드 전용 우측 도크
 * - 버블 모드가 아닌 경우, 일반 패널 대신 협업 패널만 표시한다.
 */
export default function EditorRightPanelsCollaborationDock({
  selectedPinId,
  selectedPin,
  commentPins,
  commentNotifications,
  currentCollaborationUserType,
  currentCollaborationUserName,
  onSelectPin,
  onCreateCommentReply,
  onResolvePin,
  onResolveComment,
  resolvingPinId,
  resolvingCommentId,
}: CollaborationDockProps) {
  const collaborationPanelProps = buildCollaborationPanelProps({
    selectedPinId,
    selectedPin,
    commentPins,
    commentNotifications,
    currentCollaborationUserType,
    currentCollaborationUserName,
    onSelectPin,
    onCreateCommentReply,
    onResolvePin,
    onResolveComment,
    resolvingPinId,
    resolvingCommentId,
  })

  return (
    <div className="relative z-30 flex w-[420px] min-h-0 shrink-0 flex-col overflow-hidden border-l border-[#DFE4F0] bg-white">
      <CollaborationPanel {...collaborationPanelProps} />
    </div>
  )
}

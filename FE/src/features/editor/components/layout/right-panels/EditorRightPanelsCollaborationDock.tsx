import { CollaborationPanel } from '../../panels/CollaborationPanel'
import type { EditorRightPanelsProps } from './EditorRightPanels.types'
import { buildCollaborationPanelProps } from './buildCollaborationPanelProps'

type CollaborationDockProps = Pick<
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
 * 협업 모드 전용 우측 도크
 * - 버블 모드가 아닌 경우, 일반 패널 대신 협업 패널만 표시한다.
 */
export default function EditorRightPanelsCollaborationDock({
  collaborationTab,
  onCollaborationTabChange,
  selectedPinId,
  selectedPin,
  commentPins,
  commentNotifications,
  unreadCommentNotifications,
  currentCollaborationUserType,
  currentCollaborationUserName,
  onSelectPin,
  onCreateCommentReply,
}: CollaborationDockProps) {
  const collaborationPanelProps = buildCollaborationPanelProps({
    collaborationTab,
    onCollaborationTabChange,
    selectedPinId,
    selectedPin,
    commentPins,
    commentNotifications,
    unreadCommentNotifications,
    currentCollaborationUserType,
    currentCollaborationUserName,
    onSelectPin,
    onCreateCommentReply,
  })

  return (
    <div className="relative z-30 flex w-[340px] min-h-0 shrink-0 flex-col overflow-hidden rounded-3xl border border-[#DFE4F0] bg-white/95 shadow-[0_14px_30px_rgba(38,48,95,0.1)] backdrop-blur-sm">
      <CollaborationPanel {...collaborationPanelProps} />
    </div>
  )
}

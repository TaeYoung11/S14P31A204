import { CollaborationModeBar } from '@/features/editor/components/layout/CollaborationModeBar'
import type { CanvasCollaborationBarSectionProps } from './buildCanvasSectionProps'

/**
 * 2D/3D 협업 모드 하단 토글 바
 */
export default function CanvasCollaborationBar({
  mode,
  isCollaborationMode,
  onToggleCollaboration,
}: CanvasCollaborationBarSectionProps) {
  const isSupportedMode = mode === '2d' || mode === '3d'
  if (!isSupportedMode || !isCollaborationMode) return null

  return <CollaborationModeBar onToggle={onToggleCollaboration} />
}

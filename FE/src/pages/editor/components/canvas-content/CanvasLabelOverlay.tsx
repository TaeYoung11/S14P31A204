import { LabelEditOverlay } from '@/features/editor/components/overlays/LabelEditOverlay'
import type { CanvasLabelOverlaySectionProps } from './buildCanvasSectionProps'

/**
 * 버블 모드 라벨 인라인 편집 오버레이
 */
export default function CanvasLabelOverlay({ mode, labelEditState, onConfirm, onCancel }: CanvasLabelOverlaySectionProps) {
  if (mode !== 'bubble' || !labelEditState) return null

  return (
    <LabelEditOverlay
      info={labelEditState}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}

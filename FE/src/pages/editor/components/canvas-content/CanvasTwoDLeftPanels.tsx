import { Suspense, lazy } from 'react'
import { PanelLoadingFallback } from '@/features/editor/components/shared/EditorLoadingFallbacks'
import type { CanvasTwoDLeftPanelsSectionProps } from './buildCanvasSectionProps'

const TwoDLeftPanels = lazy(() =>
  import('@/features/editor/components/layout/TwoDLeftPanels').then((module) => ({ default: module.TwoDLeftPanels })),
)

/**
 * 2D 모드 좌측 레이어/계층 보조 패널
 * - 협업 모드에서는 우측 협업 패널 집중을 위해 숨긴다.
 */
export default function CanvasTwoDLeftPanels({
  mode,
  isCollaborationMode,
  layers,
  activeLayerId,
  isGenerated,
  isLayerOverlayMode,
  selectedOverlayLayerIds,
  overlayOpacityByLayerId,
  onAddLayer,
  onRenameLayer,
  onDeleteLayer,
  onSelectLayer,
  onToggleLayerOverlayMode,
  onToggleOverlayLayer,
  onChangeOverlayLayerOpacity,
  rooms,
  walls,
  openings,
  selectedRoomId,
  onSelectRoom,
}: CanvasTwoDLeftPanelsSectionProps) {
  if (mode !== '2d' || isCollaborationMode) return null

  return (
    <Suspense fallback={<PanelLoadingFallback mode="2d" side="left" />}>
      <TwoDLeftPanels
        layers={layers}
        activeLayerId={activeLayerId}
        isGenerated={isGenerated}
        isLayerOverlayMode={isLayerOverlayMode}
        selectedOverlayLayerIds={selectedOverlayLayerIds}
        overlayOpacityByLayerId={overlayOpacityByLayerId}
        onAddLayer={onAddLayer}
        onRenameLayer={onRenameLayer}
        onDeleteLayer={onDeleteLayer}
        onSelectLayer={onSelectLayer}
        onToggleLayerOverlayMode={onToggleLayerOverlayMode}
        onToggleOverlayLayer={onToggleOverlayLayer}
        onChangeOverlayLayerOpacity={onChangeOverlayLayerOpacity}
        rooms={rooms}
        walls={walls}
        openings={openings}
        selectedRoomId={selectedRoomId}
        onSelectRoom={onSelectRoom}
      />
    </Suspense>
  )
}

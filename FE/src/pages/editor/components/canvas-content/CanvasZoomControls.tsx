import { ZoomControlBar } from '@/features/editor/components/layout/ZoomControlBar'
import type { CanvasZoomControlsSectionProps } from './buildCanvasSectionProps'

/**
 * 캔버스 줌/도구/그리드 제어 바
 */
export default function CanvasZoomControls({
  mode,
  zoom,
  selectedTool,
  isGridVisible,
  isGridSnapEnabled,
  gridSnapIntervalMm,
  onZoomIn,
  onZoomOut,
  onSetZoom,
  onSetTool,
  onToggleGrid,
  onToggleGridSnap,
  onGridSnapIntervalChange,
  isRotationLocked,
  onToggleRotationLock,
  threeDCoordinates,
  selectedCameraViewPreset,
  onSelectCameraViewPreset,
  isThreeDEditingLocked,
}: CanvasZoomControlsSectionProps) {
  if (mode === 'view') return null
  if (mode === '3d' && isThreeDEditingLocked) return null

  return (
    <ZoomControlBar
      zoom={zoom}
      mode={mode}
      selectedTool={selectedTool}
      isGridVisible={isGridVisible}
      isGridSnapEnabled={isGridSnapEnabled}
      gridSnapIntervalMm={gridSnapIntervalMm}
      onZoomIn={onZoomIn}
      onZoomOut={onZoomOut}
      onSetZoom={onSetZoom}
      onSetTool={onSetTool}
      onToggleGrid={onToggleGrid}
      onToggleGridSnap={onToggleGridSnap}
      onGridSnapIntervalChange={onGridSnapIntervalChange}
      isRotationLocked={isRotationLocked}
      onToggleRotationLock={onToggleRotationLock}
      threeDCoordinates={threeDCoordinates}
      selectedCameraViewPreset={selectedCameraViewPreset}
      onSelectCameraViewPreset={onSelectCameraViewPreset}
      isEditingLocked={isThreeDEditingLocked}
    />
  )
}

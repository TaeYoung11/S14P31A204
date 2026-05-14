import { lazy } from 'react'
import { useFreshIfcUrl } from '@/features/editor/hooks/useFreshIfcUrl'
import type { EditorCanvasRenderProps } from '../../types/editorCanvasContentProps'
import type { ThreeDCameraViewPresetCommand, ThreeDCoordinates } from '../canvas-content/buildCanvasSectionProps'

/** ThreeDCanvas는 ThatOpen 기반 Three.js 렌더러를 포함해 무거우므로 lazy 로드한다. */
const ThreeDCanvas = lazy(() =>
  import('@/features/editor/components/canvas/ThreeDCanvas').then((module) => ({
    default: module.ThreeDCanvas,
  })),
)

interface ThreeDModeCanvasProps {
  editorProps: EditorCanvasRenderProps
  scale: number
  isRotationLocked: boolean
  onThreeDCoordinatesChange: (coords: ThreeDCoordinates) => void
  cameraViewPresetCommand: ThreeDCameraViewPresetCommand
}

/**
 * 3D 모드 캔버스 렌더링 전용 컴포넌트.
 *
 * 탭 전환 시 컴포넌트가 언마운트·리마운트되는 구조이므로,
 * `useFreshIfcUrl`을 통해 mount 시마다 presigned URL을 재발급해 만료 오류를 방지한다.
 */
export default function ThreeDModeCanvas({
  editorProps,
  scale,
  isRotationLocked,
  onThreeDCoordinatesChange,
  cameraViewPresetCommand,
}: ThreeDModeCanvasProps) {
  // mount 시마다 fresh presigned URL 발급 (만료된 URL로 인한 403 방지)
  // assetId가 없거나 재발급 실패 시 mock IFC로 폴백
  const freshIfcUrl = useFreshIfcUrl(
    editorProps.currentIfcAssetId,
    editorProps.currentIfcUrl ?? '/mock/shinchan_house.ifc',
  )

  return (
    <ThreeDCanvas
      projectId={editorProps.projectId}
      ifcUrl={freshIfcUrl}
      sitePoints={editorProps.sitePlanPoints}
      isCollaborationMode={editorProps.isCollaborationMode}
      isLibraryOpen={editorProps.isLibraryOpen}
      onToggleLibrary={() => editorProps.setIsLibraryOpen(!editorProps.isLibraryOpen)}
      isGridVisible={editorProps.isGridVisible}
      rooms={editorProps.floorRooms}
      overlayLayers={editorProps.floorLayerOverlayItems}
      selectedId={editorProps.selectedId}
      onSelect={(id) => (id ? editorProps.handleBubbleSelect(id) : editorProps.clearSelection())}
      selectedTool={editorProps.selectedTool}
      scale={scale}
      onWheelZoom={editorProps.handleWheelZoom}
      isRotationLocked={isRotationLocked}
      ifcElementChanges={editorProps.ifcElementChanges}
      selectedIfcElement={editorProps.selectedIfcElement}
      threeDDeleteRequestToken={editorProps.threeDDeleteRequestToken}
      onIfcElementSelect={editorProps.handleSelectIfcElement}
      onIfcElementDelete={editorProps.handleDeleteIfcElement}
      localFloorData={editorProps.localFloorData}
      onThreeDCoordinatesChange={onThreeDCoordinatesChange}
      cameraViewPresetCommand={cameraViewPresetCommand}
      isTransformSnapEnabled={editorProps.isGridSnapEnabled}
      transformSnapIntervalMm={editorProps.gridSnapIntervalMm}
      isEditingLocked={editorProps.isThreeDEditingLocked}
    />
  )
}

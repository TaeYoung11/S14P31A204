import { lazy } from 'react'
import type { EditorCanvasContentProps } from '../../types/editorCanvasContentProps'

const ThreeDCanvas = lazy(() =>
  import('@/features/editor/components/canvas/ThreeDCanvas').then((module) => ({ default: module.ThreeDCanvas })),
)

interface ThreeDModeCanvasProps {
  editorProps: EditorCanvasContentProps
  scale: number
  isRotationLocked: boolean
}

/** 3D 모드 캔버스 렌더링 전용 컴포넌트 */
export default function ThreeDModeCanvas({
  editorProps,
  scale,
  isRotationLocked,
}: ThreeDModeCanvasProps) {
  return (
    <ThreeDCanvas
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
      onIfcElementSelect={editorProps.handleSelectIfcElement}
    />
  )
}

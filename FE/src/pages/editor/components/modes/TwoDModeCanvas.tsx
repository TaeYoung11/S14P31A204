import { lazy } from 'react'
import type { EditorCanvasContentProps } from '../../types/editorCanvasContentProps'

const TwoDCanvas = lazy(() =>
  import('@/features/editor/components/canvas/TwoDCanvas').then((module) => ({ default: module.TwoDCanvas })),
)

interface TwoDModeCanvasProps {
  editorProps: EditorCanvasContentProps
  scale: number
}

/** 2D 모드 캔버스 렌더링 전용 컴포넌트 */
export default function TwoDModeCanvas({ editorProps, scale }: TwoDModeCanvasProps) {
  return (
    <TwoDCanvas
      stageSize={editorProps.stageSize}
      sitePoints={editorProps.sitePlanPoints}
      isCollaborationMode={editorProps.isCollaborationMode}
      selectedPinId={editorProps.selectedPinId}
      commentPins={editorProps.commentPins}
      onPinClick={editorProps.handlePinClick}
      onPinCreate={editorProps.handleCreateCommentPin}
      rooms={editorProps.floorRooms}
      overlayLayers={editorProps.floorLayerOverlayItems}
      connections={editorProps.floorPlanConnections}
      isGenerated={editorProps.isFloorPlanGenerated}
      isGenerating={editorProps.isFloorPlanGenerating}
      onGenerate={editorProps.handleGenerateFloorPlan}
      canGenerate={editorProps.canGenerateFloorPlanFromBubble}
      isGridVisible={editorProps.isGridVisible}
      selectedId={editorProps.selectedId}
      selectedIds={editorProps.selectedIds}
      onSelect={(id, isShift) => (id ? editorProps.handleBubbleSelect(id, isShift) : editorProps.clearSelection())}
      onMarqueeSelect={editorProps.handleMarqueeSelect}
      walls={editorProps.floorWallsForHierarchy}
      openings={editorProps.floorOpenings}
      selectedWallId={editorProps.selectedFloorWallId}
      selectedWallIds={editorProps.selectedFloorWallIds}
      selectedOpeningId={editorProps.selectedFloorOpeningId}
      selectedOpeningIds={editorProps.selectedFloorOpeningIds}
      onWallSelect={editorProps.handleSelectFloorWall}
      onWallCreate={editorProps.handleCreateFloorWall}
      wallCreatePreset={editorProps.wallCreatePreset}
      onWallMove={editorProps.handleMoveFloorWall}
      onWallEndpointChange={editorProps.handleUpdateFloorWallEndpoint}
      onWallDelete={editorProps.handleDeleteFloorWall}
      onOpeningCreate={editorProps.handleCreateFloorOpening}
      onOpeningSelect={editorProps.handleSelectFloorOpening}
      onOpeningMove={editorProps.handleMoveFloorOpening}
      onOpeningDelete={editorProps.handleDeleteFloorOpening}
      onRoomMove={editorProps.handleMoveFloorRoom}
      onRoomResize={editorProps.handleResizeFloorRoom}
      onTwoDMarqueeSelect={editorProps.handleTwoDMarqueeSelect}
      selectedTool={editorProps.selectedTool}
      isGridSnapEnabled={editorProps.isGridSnapEnabled}
      gridSnapIntervalMm={editorProps.gridSnapIntervalMm}
      scale={scale}
      onWheelZoom={editorProps.handleWheelZoom}
    />
  )
}

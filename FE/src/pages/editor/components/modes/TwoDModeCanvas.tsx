import { lazy, useMemo } from 'react'
import type { EditorCanvasRenderProps } from '../../types/editorCanvasContentProps'

const TwoDCanvas = lazy(() =>
  import('@/features/editor/components/canvas/TwoDCanvas').then((module) => ({ default: module.TwoDCanvas })),
)

interface TwoDModeCanvasProps {
  editorProps: EditorCanvasRenderProps
  scale: number
}

/**
 * 2D 평면도 모드의 캔버스 렌더링을 담당한다.
 */
export default function TwoDModeCanvas({ editorProps, scale }: TwoDModeCanvasProps) {
  const visibleCommentPins = useMemo(() => {
    const activeIndex = editorProps.floorLayers.findIndex((layer) => layer.id === editorProps.activeFloorLayerId)
    if (activeIndex < 0) return editorProps.commentPins

    const activeLayer = editorProps.floorLayers[activeIndex]
    const fallbackCeilingHeightMm = 2700
    const floorStartMm = activeLayer.elevationMm ?? activeIndex * fallbackCeilingHeightMm
    const floorHeightMm = activeLayer.ceilingHeightMm ?? fallbackCeilingHeightMm
    const floorEndMm = floorStartMm + floorHeightMm

    return editorProps.commentPins.filter((pin) => pin.worldZ >= floorStartMm && pin.worldZ < floorEndMm)
  }, [editorProps.activeFloorLayerId, editorProps.commentPins, editorProps.floorLayers])

  return (
    <TwoDCanvas
      stageSize={editorProps.stageSize}
      sitePoints={editorProps.sitePlanPoints}
      isCollaborationMode={editorProps.isCollaborationMode}
      selectedPinId={editorProps.selectedPinId}
      commentPins={visibleCommentPins}
      currentUserId={editorProps.currentCollaborationUserId}
      onPinClick={editorProps.handlePinClick}
      onPinCreate={editorProps.handleCreateCommentPin}
      onPinDelete={editorProps.handleDeletePin}
      deletingPinId={editorProps.deletingPinId}
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
      onRoomPolygonChange={editorProps.handleUpdateFloorRoomPolygon}
      onWorkspaceEditStart={editorProps.beginWorkspaceSnapshotTransaction}
      onWorkspaceEditCommit={editorProps.commitWorkspaceSnapshotTransaction}
      onTwoDMarqueeSelect={editorProps.handleTwoDMarqueeSelect}
      selectedTool={editorProps.selectedTool}
      isGridSnapEnabled={editorProps.isGridSnapEnabled}
      gridSnapIntervalMm={editorProps.gridSnapIntervalMm}
      scale={scale}
      onWheelZoom={editorProps.handleWheelZoom}
    />
  )
}

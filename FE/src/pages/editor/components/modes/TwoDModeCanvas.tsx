import { lazy, useMemo } from 'react'
import type { EditorCanvasRenderProps } from '../../types/editorCanvasContentProps'
import { resolveVisibleCommentPinsInTwoD } from '../../utils/twoDVisibleCommentPins'

const TwoDCanvas = lazy(() =>
  import('@/features/editor/components/canvas/TwoDCanvas').then((module) => ({ default: module.TwoDCanvas })),
)

interface TwoDModeCanvasProps {
  editorProps: EditorCanvasRenderProps
  scale: number
  onSelectWallForChat?: (wallId: string) => void
}

/**
 * 2D 평면도 모드의 캔버스 렌더링을 담당한다.
 */
export default function TwoDModeCanvas({ editorProps, scale, onSelectWallForChat }: TwoDModeCanvasProps) {
  const visibleCommentPins = useMemo(
    () => resolveVisibleCommentPinsInTwoD(
      editorProps.floorLayers,
      editorProps.activeFloorLayerId,
      editorProps.commentPins,
    ),
    [editorProps.activeFloorLayerId, editorProps.commentPins, editorProps.floorLayers],
  )

  return (
    <TwoDCanvas
      key={`2d-canvas-${editorProps.projectId ?? 'no-project'}`}
      projectId={editorProps.projectId}
      stageSize={editorProps.stageSize}
      sitePoints={editorProps.sitePlanPoints}
      viewTransform={editorProps.floorCanvasViewTransform}
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
      isCheckingIfcSource={editorProps.isIfcSourceHydrationPending}
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
      selectedWallForChat={editorProps.selectedWallForChat}
      onSelectWallForChat={onSelectWallForChat}
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

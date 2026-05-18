import { Layer, Rect, Stage } from 'react-konva'
import type { MutableRefObject } from 'react'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { CanvasViewTransform, FloorCommentPin, FloorLayerOverlay, FloorOpening, FloorRoom, FloorWall, Point2D } from '../../types'
import { SITE_BOUNDARY_LISTENING } from '../../constants'
import type { AxisAlignedRect } from '../../utils/geometry2d'
import type { DoorInfo } from '../../utils/floorPlanLayout'
import { rotatePointAround } from '../../utils/canvasViewTransform'
import { DimensionGuidesLayer } from './DimensionGuidesLayer'
import CanvasViewTransformGroup from './CanvasViewTransformGroup'
import { CollaborationPinOverlay } from './TwoDCanvasOverlays'
import { TwoDFallbackDoorsLayer } from './TwoDFallbackDoorsLayer'
import { TwoDGridLayer } from './TwoDGridLayer'
import { TwoDOpeningsLayer } from './TwoDOpeningsLayer'
import { TwoDOverlayLayers } from './TwoDOverlayLayers'
import { TwoDRoomsLayer, type RoomDragState } from './TwoDRoomsLayer'
import { TwoDSiteBoundaryLayer } from './TwoDSiteBoundaryLayer'
import { TwoDWallsLayer } from './TwoDWallsLayer'
import type { useCanvasGridLines } from './useCanvasGridLines'
import type { useStagePanInteraction } from './useStagePanInteraction'
import type { useTwoDCanvasDerivedData } from './useTwoDCanvasDerivedData'
import type { useTwoDCanvasStageHandlers } from './twoDCanvasStageHandlers'

interface TwoDCanvasStageProps {
  stageRef: MutableRefObject<Konva.Stage | null>
  stageSize: { width: number; height: number }
  scale: number
  baseOffsetX: number
  baseOffsetY: number
  panOffset: { x: number; y: number }
  isPanMode: boolean
  onStageDragMove: ReturnType<typeof useStagePanInteraction>['onStageDragMove']
  onStageDragStart: ReturnType<typeof useStagePanInteraction>['onStageDragStart']
  onStageDragEnd: ReturnType<typeof useStagePanInteraction>['onStageDragEnd']
  stageHandlers: ReturnType<typeof useTwoDCanvasStageHandlers>
  sitePoints: number[]
  viewTransform?: CanvasViewTransform | null
  isGridVisible: boolean
  gridLines: ReturnType<typeof useCanvasGridLines>
  dimensionGuides: ReturnType<typeof useTwoDCanvasDerivedData>['dimensionGuides']
  overlayLayers: FloorLayerOverlay[]
  rooms: FloorRoom[]
  selectedId: string | null
  selectedIds: string[]
  selectedTool: string
  isWallTool: boolean
  isOpeningTool: boolean
  isResizeTool: boolean
  isWallFirstEditing: boolean
  isPanModeEnabled: boolean
  isInteractionLockedByCollaboration: boolean
  isGridSnapEnabled: boolean
  gridSnapStepPx: number
  sitePolygon: Point2D[]
  siteValidation: ReturnType<typeof useTwoDCanvasDerivedData>['siteValidation']
  roomDragState: RoomDragState | null
  resizingRoomBubbleId: string | null
  canResizeRoom: (roomBubbleId: string, nextRect: AxisAlignedRect) => boolean
  applyRoomResize: (roomBubbleId: string, x: number, y: number, width: number, height: number) => boolean
  beginRoomResize?: () => void
  commitRoomResize?: () => void
  snapResizeHandle: (value: number) => number
  getCanvasPoint: (stage: Konva.Stage) => Point2D | null
  syncHandlePosition: (e: KonvaEventObject<DragEvent>, x: number, y: number) => void
  onRoomMove?: (bubbleId: string, x: number, y: number) => void
  onRoomPolygonChange?: (bubbleId: string, polygon: { x: number; y: number }[]) => void
  onSelect?: (id: string | null, isShift?: boolean) => void
  onWallSelect?: (wallId: string | null, append?: boolean) => void
  onOpeningSelect?: (openingId: string | null, append?: boolean) => void
  onRoomDragStateChange: (next: RoomDragState | null) => void
  onResizingRoomBubbleIdChange: (next: string | null) => void
  onMouseEnter: (e: KonvaEventObject<MouseEvent>) => void
  onMouseLeave: (e: KonvaEventObject<MouseEvent>) => void
  dedupedRenderWalls: FloorWall[]
  selectedWallId: string | null
  selectedWallIds: string[]
  selectedWallGeometryKey: string | null
  chatSelectedWallId?: string | null
  wallById: Map<string, FloorWall>
  openingSnapGuide: { wallId: string; wallPosition: number } | null
  outsideWallIds: Set<string>
  isDrawingWall: boolean
  wallDraftStart: { x: number; y: number } | null
  wallDraftEnd: { x: number; y: number } | null
  wallDraftType: FloorWall['type']
  wallDraftThicknessMm: number
  onWallDelete?: (wallId: string) => void
  onWallEndpointChange?: (wallId: string, endpoint: 'start' | 'end', point: { x: number; y: number }) => void
  onWallDragStart: (next: { wallId: string; lastPoint: { x: number; y: number } } | null) => void
  openings: FloorOpening[]
  selectedOpeningId: string | null
  selectedOpeningIds: string[]
  createOpeningOnWall: (wall: FloorWall, point: Point2D) => void
  onOpeningDelete?: (openingId: string) => void
  onOpeningDragStart: (next: { openingId: string } | null) => void
  onClearOpeningSnapGuide: () => void
  fallbackDoorList: Array<DoorInfo | null>
  isDoorTool: boolean
  promoteFallbackDoorToOpening: (door: DoorInfo) => string | null
  isCollaborationMode: boolean
  commentPins: FloorCommentPin[]
  selectedPinId: string | null
  currentUserId: string | null
  onPinClick?: (id: string) => void
  onPinDelete?: (id: string) => void
  deletingPinId: string | null
  marquee: { x: number; y: number; width: number; height: number } | null
}

/**
 * 2D 평면도 Stage 렌더링 전용 컴포넌트.
 * 이벤트/렌더 조립을 메인 컴포넌트에서 분리해 가독성을 높인다.
 */
export function TwoDCanvasStage({
  stageRef,
  stageSize,
  scale,
  baseOffsetX,
  baseOffsetY,
  panOffset,
  isPanMode,
  onStageDragMove,
  onStageDragStart,
  onStageDragEnd,
  stageHandlers,
  sitePoints,
  viewTransform = null,
  isGridVisible,
  gridLines,
  dimensionGuides,
  overlayLayers,
  rooms,
  selectedId,
  selectedIds,
  selectedTool,
  isWallTool,
  isOpeningTool,
  isResizeTool,
  isWallFirstEditing,
  isPanModeEnabled,
  isInteractionLockedByCollaboration,
  isGridSnapEnabled,
  gridSnapStepPx,
  sitePolygon,
  siteValidation,
  roomDragState,
  resizingRoomBubbleId,
  canResizeRoom,
  applyRoomResize,
  beginRoomResize,
  commitRoomResize,
  snapResizeHandle,
  getCanvasPoint,
  syncHandlePosition,
  onRoomMove,
  onRoomPolygonChange,
  onSelect,
  onWallSelect,
  onOpeningSelect,
  onRoomDragStateChange,
  onResizingRoomBubbleIdChange,
  onMouseEnter,
  onMouseLeave,
  dedupedRenderWalls,
  selectedWallId,
  selectedWallIds,
  selectedWallGeometryKey,
  chatSelectedWallId,
  wallById,
  openingSnapGuide,
  outsideWallIds,
  isDrawingWall,
  wallDraftStart,
  wallDraftEnd,
  wallDraftType,
  wallDraftThicknessMm,
  onWallDelete,
  onWallEndpointChange,
  onWallDragStart,
  openings,
  selectedOpeningId,
  selectedOpeningIds,
  createOpeningOnWall,
  onOpeningDelete,
  onOpeningDragStart,
  onClearOpeningSnapGuide,
  fallbackDoorList,
  isDoorTool,
  promoteFallbackDoorToOpening,
  isCollaborationMode,
  commentPins,
  selectedPinId,
  currentUserId,
  onPinClick,
  onPinDelete,
  deletingPinId,
  marquee,
}: TwoDCanvasStageProps) {
  const pinMarkerScale = Math.min(Math.max(1 / Math.max(scale, 0.01), 0.65), 2.2)

  const getStagePoint = (stage: Konva.Stage): Point2D | null => {
    const pointer = stage.getPointerPosition()
    if (!pointer) return null
    const transform = stage.getAbsoluteTransform().copy()
    transform.invert()
    return transform.point(pointer)
  }

  const getPinDisplayPosition = (pin: FloorCommentPin): Point2D => (
    viewTransform
      ? rotatePointAround(
        { x: pin.x, y: pin.y },
        viewTransform.rotationRadians,
        viewTransform.centerX,
        viewTransform.centerY,
      )
      : { x: pin.x, y: pin.y }
  )

  const findCommentPinHit = (point: Point2D): { pin: FloorCommentPin; action: 'select' | 'delete' } | null => {
    for (let i = commentPins.length - 1; i >= 0; i -= 1) {
      const pin = commentPins[i]
      const base = getPinDisplayPosition(pin)
      const canDeletePin =
        selectedPinId === pin.id &&
        Boolean(onPinDelete) &&
        Boolean(currentUserId) &&
        pin.createdById === currentUserId
      if (canDeletePin) {
        const deleteX = base.x + 26 * pinMarkerScale
        const deleteY = base.y - 24 * pinMarkerScale
        if (Math.hypot(point.x - deleteX, point.y - deleteY) <= 16 * pinMarkerScale) {
          return { pin, action: 'delete' }
        }
      }

      const headHit = Math.hypot(point.x - base.x, point.y - base.y) <= 22 * pinMarkerScale
      const stemHit =
        point.x >= base.x - 10 * pinMarkerScale &&
        point.x <= base.x + 10 * pinMarkerScale &&
        point.y >= base.y + 10 * pinMarkerScale &&
        point.y <= base.y + 36 * pinMarkerScale
      if (headHit || stemHit) return { pin, action: 'select' }
    }
    return null
  }

  const handleCollaborationPinFallback = (e: KonvaEventObject<MouseEvent>): boolean => {
    if (!isCollaborationMode) return false
    const stage = e.target.getStage()
    if (!stage) return false
    const point = getStagePoint(stage)
    if (!point) return false
    const hit = findCommentPinHit(point)
    if (!hit) return false
    e.cancelBubble = true
    if (hit.action === 'delete') {
      const container = stage.container()
      container.style.cursor = 'default'
      if (deletingPinId !== hit.pin.id) onPinDelete?.(hit.pin.id)
      return true
    }
    onPinClick?.(hit.pin.id)
    return true
  }

  const syncCollaborationPinCursor = (e: KonvaEventObject<MouseEvent>) => {
    if (!isCollaborationMode) return
    const stage = e.target.getStage()
    if (!stage) return
    const point = getStagePoint(stage)
    if (!point) return
    const hit = findCommentPinHit(point)
    stage.container().style.cursor = hit ? 'pointer' : (isPanMode ? 'grab' : 'default')
  }

  const handleStageMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    stageHandlers.onMouseMove(e)
    syncCollaborationPinCursor(e)
  }

  const handleStageClick = (e: KonvaEventObject<MouseEvent>) => {
    if (handleCollaborationPinFallback(e)) return
    stageHandlers.onClick(e)
  }

  const handleStageDblClick = (e: KonvaEventObject<MouseEvent>) => {
    if (handleCollaborationPinFallback(e)) return
    stageHandlers.onDblClick(e)
  }

  return (
    <Stage
      ref={stageRef}
      width={stageSize.width}
      height={stageSize.height}
      className="absolute inset-0"
      scaleX={scale}
      scaleY={scale}
      x={baseOffsetX + panOffset.x}
      y={baseOffsetY + panOffset.y}
      draggable={isPanMode}
      onDragMove={onStageDragMove}
      onDragStart={onStageDragStart}
      onDragEnd={onStageDragEnd}
      onMouseDown={stageHandlers.onMouseDown}
      onMouseMove={handleStageMouseMove}
      onMouseUp={stageHandlers.onMouseUp}
      onClick={handleStageClick}
      onDblClick={handleStageDblClick}
      onContextMenu={stageHandlers.onContextMenu}
      onWheel={stageHandlers.onWheel}
    >
      <Layer>
        <TwoDGridLayer isGridVisible={isGridVisible} gridLines={gridLines} />
        {/* 정렬/북향 토글은 렌더 계층 회전으로만 반영한다. */}
        <CanvasViewTransformGroup viewTransform={viewTransform}>
          <TwoDSiteBoundaryLayer
            hasSite={siteValidation.hasSite}
            sitePoints={sitePoints}
            listening={SITE_BOUNDARY_LISTENING}
          />
          <DimensionGuidesLayer guides={dimensionGuides} />
          <TwoDOverlayLayers overlayLayers={overlayLayers} />

          <TwoDRoomsLayer
            rooms={rooms}
            selectedId={selectedId}
            selectedIds={selectedIds}
            selectedTool={selectedTool}
            isPanMode={isPanModeEnabled}
            isWallTool={isWallTool}
            isOpeningTool={isOpeningTool}
            isResizeTool={isResizeTool}
            isWallFirstEditing={isWallFirstEditing}
            isInteractionLockedByCollaboration={isInteractionLockedByCollaboration}
            isGridSnapEnabled={isGridSnapEnabled}
            gridSnapStepPx={gridSnapStepPx}
            hasSite={siteValidation.hasSite}
            sitePolygon={sitePolygon}
            outsideRoomIds={siteValidation.outsideRoomIds}
            roomDragState={roomDragState}
            resizingRoomBubbleId={resizingRoomBubbleId}
            canResizeRoom={canResizeRoom}
            applyRoomResize={applyRoomResize}
            beginRoomResize={beginRoomResize}
            commitRoomResize={commitRoomResize}
            snapResizeHandle={snapResizeHandle}
            getCanvasPoint={getCanvasPoint}
            syncHandlePosition={syncHandlePosition}
            onRoomMove={onRoomMove}
            onRoomPolygonChange={onRoomPolygonChange}
            onSelect={onSelect}
            onWallSelect={onWallSelect}
            onOpeningSelect={onOpeningSelect}
            onRoomDragStateChange={onRoomDragStateChange}
            onResizingRoomBubbleIdChange={onResizingRoomBubbleIdChange}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
          />

          <TwoDWallsLayer
            dedupedRenderWalls={dedupedRenderWalls}
            selectedWallId={selectedWallId}
            selectedWallIds={selectedWallIds}
            selectedWallGeometryKey={selectedWallGeometryKey}
            chatSelectedWallId={chatSelectedWallId}
            outsideWallIds={outsideWallIds}
            wallById={wallById}
            openingSnapGuide={openingSnapGuide}
            isPanMode={isPanModeEnabled}
            isWallTool={isWallTool}
            isOpeningTool={isOpeningTool}
            isResizeTool={isResizeTool}
            isInteractionLockedByCollaboration={isInteractionLockedByCollaboration}
            selectedTool={selectedTool}
            isGridSnapEnabled={isGridSnapEnabled}
            gridSnapStepPx={gridSnapStepPx}
            isDrawingWall={isDrawingWall}
            wallDraftStart={wallDraftStart}
            wallDraftEnd={wallDraftEnd}
            wallDraftType={wallDraftType}
            wallDraftThicknessMm={wallDraftThicknessMm}
            getCanvasPoint={getCanvasPoint}
            createOpeningOnWall={createOpeningOnWall}
            onWallDelete={onWallDelete}
            onWallSelect={onWallSelect}
            onWallEndpointChange={onWallEndpointChange}
            onWallDragStart={onWallDragStart}
          />

          <TwoDOpeningsLayer
            openings={openings}
            wallById={wallById}
            selectedOpeningId={selectedOpeningId}
            selectedOpeningIds={selectedOpeningIds}
            selectedTool={selectedTool}
            isPanMode={isPanModeEnabled}
            isWallTool={isWallTool}
            isOpeningTool={isOpeningTool}
            isInteractionLockedByCollaboration={isInteractionLockedByCollaboration}
            getCanvasPoint={getCanvasPoint}
            createOpeningOnWall={createOpeningOnWall}
            onOpeningDelete={onOpeningDelete}
            onOpeningSelect={onOpeningSelect}
            onWallSelect={onWallSelect}
            onSelect={onSelect}
            onOpeningDragStart={onOpeningDragStart}
            onClearOpeningSnapGuide={onClearOpeningSnapGuide}
          />

          <TwoDFallbackDoorsLayer
            fallbackDoorList={fallbackDoorList}
            isInteractionLockedByCollaboration={isInteractionLockedByCollaboration}
            isPanMode={isPanModeEnabled}
            selectedTool={selectedTool}
            isDoorTool={isDoorTool}
            promoteFallbackDoorToOpening={promoteFallbackDoorToOpening}
            onOpeningDelete={onOpeningDelete}
            onOpeningSelect={onOpeningSelect}
            onWallSelect={onWallSelect}
            onSelect={onSelect}
          />

          {marquee && (
            <Rect
              x={marquee.x}
              y={marquee.y}
              width={marquee.width}
              height={marquee.height}
              fill="rgba(59,69,179,0.07)"
              stroke="#3B45B3"
              strokeWidth={1}
              dash={[4, 3]}
              listening={false}
            />
          )}
        </CanvasViewTransformGroup>
        {isCollaborationMode && (
          <CollaborationPinOverlay
            pins={commentPins}
            viewportScale={scale}
            selectedPinId={selectedPinId}
            currentUserId={currentUserId}
            viewTransform={viewTransform}
            onPinDelete={onPinDelete}
            deletingPinId={deletingPinId}
          />
        )}
      </Layer>
    </Stage>
  )
}

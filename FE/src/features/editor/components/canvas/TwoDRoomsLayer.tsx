import { Group, Line, Shape, Text } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { FloorRoom, Point2D } from '../../types'
import type { AxisAlignedRect } from '../../utils/geometry2d'
import { isPointInsidePolygon, isRectInsidePolygon } from '../../utils/siteBoundaryValidation'
import {
  ROOM_POLYGON_MIN_VERTEX_COUNT,
  getRoomFill,
  getRoomTransformProps,
  getSnappedRoomPosition,
  renderRoomContourPath,
  snapCoordinate,
  toEditablePolygonPoints,
  toPolygonPoints,
  toRectPolygon,
  toRectPolygonPoints,
} from './twoDCanvas.utils'
import { TwoDRoomResizeHandles } from './TwoDRoomResizeHandles'
import { TwoDRoomPolygonHandles } from './TwoDRoomPolygonHandles'

const SITE_OUTSIDE_WARNING = '#DC2626'

function getEstimatedTextWidthUnits(text: string) {
  const normalizedText = text.trim()
  if (!normalizedText) return 1
  return Array.from(normalizedText).reduce((units, char) => {
    if (/\s/.test(char)) return units + 0.35
    if (/[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF\u3000-\u9FFF]/.test(char)) return units + 1
    if (/[A-Z0-9]/.test(char)) return units + 0.68
    return units + 0.58
  }, 0)
}

function fitSingleLineFontSize(text: string, maxWidth: number, maxHeight: number) {
  const textWidthUnits = Math.max(getEstimatedTextWidthUnits(text), 1)
  return Math.max(1, Math.min(maxHeight, maxWidth / textWidthUnits))
}

export interface RoomDragState {
  roomBubbleId: string
  startX: number
  startY: number
  startPointer: Point2D
}

interface TwoDRoomsLayerProps {
  rooms: FloorRoom[]
  selectedId: string | null
  selectedIds: string[]
  selectedTool: string
  isPanMode: boolean
  isWallTool: boolean
  isOpeningTool: boolean
  isResizeTool: boolean
  isWallFirstEditing: boolean
  isInteractionLockedByCollaboration: boolean
  isGridSnapEnabled: boolean
  gridSnapStepPx: number
  hasSite: boolean
  sitePolygon: Point2D[]
  outsideRoomIds: Set<string>
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
  onRoomPolygonChange?: (bubbleId: string, polygon: Point2D[]) => void
  onSelect?: (id: string | null, isShift?: boolean) => void
  onWallSelect?: (wallId: string | null, append?: boolean) => void
  onOpeningSelect?: (openingId: string | null, append?: boolean) => void
  onRoomDragStateChange: (state: RoomDragState | null) => void
  onResizingRoomBubbleIdChange: (bubbleId: string | null) => void
  onMouseEnter: (e: KonvaEventObject<MouseEvent>) => void
  onMouseLeave: (e: KonvaEventObject<MouseEvent>) => void
}

/**
 * 2D Room 렌더링/선택/드래그/리사이즈/폴리곤 편집 레이어
 * - 캔버스의 Room 상호작용을 한 곳에 모아 TwoDCanvas 조립부를 단순화한다.
 */
export function TwoDRoomsLayer({
  rooms,
  selectedId,
  selectedIds,
  selectedTool,
  isPanMode,
  isWallTool,
  isOpeningTool,
  isResizeTool,
  isWallFirstEditing,
  isInteractionLockedByCollaboration,
  isGridSnapEnabled,
  gridSnapStepPx,
  hasSite,
  sitePolygon,
  outsideRoomIds,
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
}: TwoDRoomsLayerProps) {
  return (
    <>
      {rooms.map((room) => {
        const isSelected = selectedIds.includes(room.bubbleId) || selectedId === room.bubbleId
        const isOutsideSite = outsideRoomIds.has(room.bubbleId)
        const contour = room.contour
        const hasContourShape = !!contour && contour.length > 0
        const polygonPoints = toPolygonPoints(room.polygon)
        const editablePolygonPoints = toEditablePolygonPoints(room.polygon)
        const editableRoomPolygonPoints = editablePolygonPoints ?? toRectPolygon(room)
        const hasPolygonShape = polygonPoints !== null
        const hasTransform = !!room.transform
        const hasAdvancedShape = hasContourShape || hasTransform
        const canEditPolygonVertices =
          isSelected &&
          selectedTool === 'selection' &&
          !isPanMode &&
          !isWallFirstEditing &&
          !hasAdvancedShape &&
          onRoomPolygonChange !== undefined
        const canResizeSelectedRoom =
          isSelected &&
          (selectedTool === 'selection' || isResizeTool) &&
          !isWallFirstEditing &&
          !hasPolygonShape &&
          !hasAdvancedShape &&
          !canEditPolygonVertices
        const canResizePolygonRoom =
          isSelected &&
          isResizeTool &&
          !isWallFirstEditing &&
          hasPolygonShape &&
          !hasAdvancedShape &&
          editablePolygonPoints !== null &&
          onRoomPolygonChange !== undefined
        const fill = getRoomFill(room.color)
        const roomStroke = isOutsideSite ? SITE_OUTSIDE_WARNING : isSelected ? '#3B45B3' : '#B8BFCC'
        const labelPaddingX = Math.min(12, Math.max(3, room.width * 0.04))
        const labelPaddingY = Math.min(10, Math.max(3, room.height * 0.04))
        const labelWidth = Math.max(8, room.width - labelPaddingX * 2)
        const labelContentHeight = Math.max(1, room.height - labelPaddingY * 2)
        const areaText = `${room.area.toFixed(1)} m²`
        const labelBoxHeight = labelContentHeight * 0.68
        const areaBoxHeight = labelContentHeight * 0.22
        const labelAreaGap = labelContentHeight * 0.1
        const labelFontSize = fitSingleLineFontSize(room.label, labelWidth, labelBoxHeight / 1.15)
        const areaFontSize = fitSingleLineFontSize(areaText, labelWidth, areaBoxHeight / 1.15)
        const labelLineHeight = labelFontSize * 1.15
        const areaLineHeight = areaFontSize * 1.15
        const labelGroupHeight = labelLineHeight + labelAreaGap + areaLineHeight
        const labelY = room.y + room.height / 2 - labelGroupHeight / 2

        /**
         * 다각형 편집 결과를 검증한 뒤 상위 상태에 반영한다.
         * - 좌표 유효성 / 최소 꼭짓점 수 / 대지 경계 검증을 모두 통과해야 반영한다.
         */
        const applyPolygonChange = (nextPolygon: Point2D[]): boolean => {
          if (!onRoomPolygonChange || nextPolygon.length < ROOM_POLYGON_MIN_VERTEX_COUNT) return false
          const hasInvalidPoint = nextPolygon.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))
          if (hasInvalidPoint) return false
          if (hasSite && nextPolygon.some((point) => !isPointInsidePolygon(point, sitePolygon))) {
            return false
          }
          onRoomPolygonChange(room.bubbleId, nextPolygon)
          return true
        }

        /** 사각형 리사이즈 입력을 현재 다각형 스케일로 변환한다. */
        const applyPolygonResize = (
          nextX: number,
          nextY: number,
          width: number,
          height: number,
        ): boolean => {
          if (!editablePolygonPoints || editablePolygonPoints.length < ROOM_POLYGON_MIN_VERTEX_COUNT) return false
          const nextRect: AxisAlignedRect = {
            x: nextX,
            y: nextY,
            width: Math.max(width, 40),
            height: Math.max(height, 40),
          }
          if (!canResizeRoom(room.bubbleId, nextRect)) return false

          const baseWidth = Math.max(room.width, 1)
          const baseHeight = Math.max(room.height, 1)
          const scaleX = nextRect.width / baseWidth
          const scaleY = nextRect.height / baseHeight
          const nextPolygon = editablePolygonPoints.map((point) => ({
            x: nextRect.x + (point.x - room.x) * scaleX,
            y: nextRect.y + (point.y - room.y) * scaleY,
          }))
          return applyPolygonChange(nextPolygon)
        }

        /** 현재 Room 타입(직사각/다각형)에 맞는 리사이즈 반영 함수를 선택한다. */
        const applyActiveRoomResize = (
          nextX: number,
          nextY: number,
          width: number,
          height: number,
        ) => {
          if (canResizePolygonRoom) return applyPolygonResize(nextX, nextY, width, height)
          return applyRoomResize(room.bubbleId, nextX, nextY, width, height)
        }

        return (
          <Group
            key={room.id}
            listening={!isInteractionLockedByCollaboration}
            onClick={(e) => {
              if (isPanMode || isWallTool) return
              e.cancelBubble = true
              if (isOpeningTool) return
              onWallSelect?.(null)
              onOpeningSelect?.(null)
              if (e.evt.shiftKey) {
                onSelect?.(room.bubbleId, true)
                return
              }
              onSelect?.(isSelected ? null : room.bubbleId, false)
            }}
            draggable={
              selectedTool === 'selection' &&
              !isPanMode &&
              !isWallFirstEditing &&
              resizingRoomBubbleId !== room.bubbleId
            }
            onDragStart={(e) => {
              if (isWallFirstEditing) return
              e.cancelBubble = true
              beginRoomResize?.()
              onWallSelect?.(null)
              onOpeningSelect?.(null)
              if (!isSelected) onSelect?.(room.bubbleId, false)
              const stage = e.target.getStage()
              const point = stage ? getCanvasPoint(stage) : null
              if (!point) return
              onRoomDragStateChange({
                roomBubbleId: room.bubbleId,
                startX: room.x,
                startY: room.y,
                startPointer: point,
              })
            }}
            onDragMove={(e) => {
              if (isWallFirstEditing) return
              const stage = e.target.getStage()
              const point = stage ? getCanvasPoint(stage) : null
              if (!point || !roomDragState || roomDragState.roomBubbleId !== room.bubbleId) {
                e.target.position({ x: 0, y: 0 })
                e.target.getLayer()?.batchDraw()
                return
              }
              const dx = point.x - roomDragState.startPointer.x
              const dy = point.y - roomDragState.startPointer.y
              const rawNextX = snapCoordinate(roomDragState.startX + dx, isGridSnapEnabled, gridSnapStepPx)
              const rawNextY = snapCoordinate(roomDragState.startY + dy, isGridSnapEnabled, gridSnapStepPx)
              const snapped = getSnappedRoomPosition(
                room.bubbleId,
                rawNextX,
                rawNextY,
                room.width,
                room.height,
                rooms,
              )
              if (hasSite) {
                const nextRect: AxisAlignedRect = {
                  x: snapped.x,
                  y: snapped.y,
                  width: room.width,
                  height: room.height,
                }
                if (!isRectInsidePolygon(nextRect, sitePolygon)) {
                  e.target.position({ x: 0, y: 0 })
                  e.target.getLayer()?.batchDraw()
                  return
                }
              }
              onRoomMove?.(room.bubbleId, snapped.x, snapped.y)
              e.target.position({ x: 0, y: 0 })
              e.target.getLayer()?.batchDraw()
            }}
            onDragEnd={(e) => {
              if (isWallFirstEditing) return
              onRoomDragStateChange(null)
              commitRoomResize?.()
              e.target.position({ x: 0, y: 0 })
              e.target.getLayer()?.batchDraw()
            }}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
          >
            <Group {...getRoomTransformProps(room)}>
              {hasContourShape ? (
                <Shape
                  sceneFunc={(context, shape) => {
                    context.beginPath()
                    renderRoomContourPath(context, contour)
                    context.closePath()
                    context.fillStrokeShape(shape)
                  }}
                  fill={fill}
                  stroke={roomStroke}
                  strokeWidth={isSelected ? 2 : 1.5}
                />
              ) : hasPolygonShape ? (
                <Line
                  points={polygonPoints}
                  closed
                  fill={fill}
                  stroke={roomStroke}
                  strokeWidth={isSelected ? 2 : 1.5}
                  lineJoin="round"
                />
              ) : (
                <Line
                  points={toRectPolygonPoints(room)}
                  closed
                  fill={fill}
                  stroke={roomStroke}
                  strokeWidth={isSelected ? 2 : 1.5}
                  lineJoin="round"
                />
              )}
              {isOutsideSite && (
                <Text
                  x={room.x}
                  y={room.y + 4}
                  width={room.width}
                  align="center"
                  text="대지 밖"
                  fontSize={10}
                  fontStyle="bold"
                  fill={SITE_OUTSIDE_WARNING}
                />
              )}
              <Text
                x={room.x + labelPaddingX}
                y={labelY}
                width={labelWidth}
                height={labelLineHeight}
                align="center"
                verticalAlign="middle"
                text={room.label}
                fontSize={labelFontSize}
                lineHeight={1.15}
                fontStyle="bold"
                fill={isSelected ? '#3B45B3' : '#1C1C1E'}
              />
              <Text
                x={room.x + labelPaddingX}
                y={labelY + labelLineHeight + labelAreaGap}
                width={labelWidth}
                height={areaLineHeight}
                align="center"
                verticalAlign="middle"
                text={areaText}
                fontSize={areaFontSize}
                lineHeight={1.15}
                fontStyle="bold"
                fill="#ADB5BD"
              />
            </Group>

            {(canResizeSelectedRoom || canResizePolygonRoom) && (
              <TwoDRoomResizeHandles
                room={room}
                snapResizeHandle={snapResizeHandle}
                applyActiveRoomResize={applyActiveRoomResize}
                syncHandlePosition={syncHandlePosition}
                onRoomDragStateReset={() => onRoomDragStateChange(null)}
                onResizingRoomBubbleIdChange={onResizingRoomBubbleIdChange}
                onResizeStart={beginRoomResize}
                onResizeCommit={commitRoomResize}
              />
            )}

            {canEditPolygonVertices && (
              <TwoDRoomPolygonHandles
                roomId={room.id}
                editableRoomPolygonPoints={editableRoomPolygonPoints}
                isGridSnapEnabled={isGridSnapEnabled}
                gridSnapStepPx={gridSnapStepPx}
                applyPolygonChange={applyPolygonChange}
                syncHandlePosition={syncHandlePosition}
              />
            )}
          </Group>
        )
      })}
    </>
  )
}

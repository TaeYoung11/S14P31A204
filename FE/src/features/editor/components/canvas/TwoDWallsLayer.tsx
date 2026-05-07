import { Group, Line } from 'react-konva'
import type Konva from 'konva'
import type { FloorWall, Point2D } from '../../types'
import {
  DEFAULT_WALL_MATERIAL,
  FLOOR_WALL_MATERIAL_VISUALS,
  FLOOR_WALL_PRESETS,
  FLOOR_WALL_TYPE_OPTIONS,
  FLOOR_WALL_TYPE_VISUALS,
} from '../../constants'
import { getWallGeometryKey } from '../../utils/wallGeometry'
import { TwoDOpeningSnapGuide } from './TwoDOpeningSnapGuide'
import { TwoDSelectionSpecBadge } from './TwoDSelectionSpecBadge'
import { TwoDWallDraftPreview } from './TwoDWallDraftPreview'
import { TwoDWallEndpointHandle } from './TwoDWallEndpointHandle'
import { TwoDWallVisualOverlays } from './TwoDWallVisualOverlays'
import { wallThicknessMmToPx } from './twoDCanvas.utils'

interface OpeningSnapGuideState {
  wallId: string
  wallPosition: number
}

interface TwoDWallsLayerProps {
  dedupedRenderWalls: FloorWall[]
  selectedWallId: string | null
  selectedWallIds: string[]
  selectedWallGeometryKey: string | null
  outsideWallIds: Set<string>
  wallById: Map<string, FloorWall>
  openingSnapGuide: OpeningSnapGuideState | null
  isPanMode: boolean
  isWallTool: boolean
  isOpeningTool: boolean
  isResizeTool: boolean
  isInteractionLockedByCollaboration: boolean
  selectedTool: string
  isGridSnapEnabled: boolean
  gridSnapStepPx: number
  isDrawingWall: boolean
  wallDraftStart: Point2D | null
  wallDraftEnd: Point2D | null
  wallDraftType: FloorWall['type']
  wallDraftThicknessMm: number
  getCanvasPoint: (stage: Konva.Stage) => Point2D | null
  createOpeningOnWall: (wall: FloorWall, point: Point2D) => void
  onWallDelete?: (wallId: string) => void
  onWallSelect?: (wallId: string | null, append?: boolean) => void
  onWallEndpointChange?: (wallId: string, endpoint: 'start' | 'end', point: Point2D) => void
  onWallDragStart: (state: { wallId: string; lastPoint: Point2D }) => void
}

const SITE_OUTSIDE_WARNING = '#DC2626'
const WALL_TYPE_LABEL_BY_VALUE = new Map(FLOOR_WALL_TYPE_OPTIONS.map((option) => [option.value, option.label] as const))
const DEFAULT_WALL_MATERIAL_VISUAL_COLOR = FLOOR_WALL_MATERIAL_VISUALS[DEFAULT_WALL_MATERIAL]?.color ?? '#6B7280'

/**
 * 2D 벽 렌더링 레이어
 * - 벽 본체/선택 핸들/스펙 라벨
 * - 개구부 스냅 가이드
 * - 벽 생성 드래그 미리보기
 */
export function TwoDWallsLayer({
  dedupedRenderWalls,
  selectedWallId,
  selectedWallIds,
  selectedWallGeometryKey,
  outsideWallIds,
  wallById,
  openingSnapGuide,
  isPanMode,
  isWallTool,
  isOpeningTool,
  isResizeTool,
  isInteractionLockedByCollaboration,
  selectedTool,
  isGridSnapEnabled,
  gridSnapStepPx,
  isDrawingWall,
  wallDraftStart,
  wallDraftEnd,
  wallDraftType,
  wallDraftThicknessMm,
  getCanvasPoint,
  createOpeningOnWall,
  onWallDelete,
  onWallSelect,
  onWallEndpointChange,
  onWallDragStart,
}: TwoDWallsLayerProps) {
  const openingGuideWall = openingSnapGuide ? wallById.get(openingSnapGuide.wallId) ?? null : null

  return (
    <>
      {dedupedRenderWalls.map((wall) => {
        const isMultiSelectedWall = selectedWallIds.includes(wall.id)
        const isSelectedWall =
          isMultiSelectedWall ||
          selectedWallId === wall.id ||
          (selectedWallGeometryKey !== null && getWallGeometryKey(wall) === selectedWallGeometryKey)
        const isOutsideSiteWall = outsideWallIds.has(wall.id)
        const presetStroke = FLOOR_WALL_PRESETS[wall.type]?.stroke ?? '#2F3448'
        const wallTypeVisual = FLOOR_WALL_TYPE_VISUALS[wall.type] ?? FLOOR_WALL_TYPE_VISUALS.general
        const wallStroke = isSelectedWall
          ? '#3B45B3'
          : isOutsideSiteWall
            ? SITE_OUTSIDE_WARNING
            : presetStroke
        const strokeWidthPx = wallThicknessMmToPx(wall.thickness)
        const wallDx = wall.end.x - wall.start.x
        const wallDy = wall.end.y - wall.start.y
        const wallLength = Math.hypot(wallDx, wallDy)
        const wallMidX = (wall.start.x + wall.end.x) / 2
        const wallMidY = (wall.start.y + wall.end.y) / 2
        const normalX = wallLength > 0 ? -wallDy / wallLength : 0
        const normalY = wallLength > 0 ? wallDx / wallLength : -1
        const wallTypeLabel = WALL_TYPE_LABEL_BY_VALUE.get(wall.type) ?? wall.type
        const wallMaterialLabel = wall.material?.trim() || DEFAULT_WALL_MATERIAL
        const wallMaterialColor = FLOOR_WALL_MATERIAL_VISUALS[wallMaterialLabel]?.color ?? DEFAULT_WALL_MATERIAL_VISUAL_COLOR
        const materialStrokeWidthPx = Math.min(Math.max(Math.round(strokeWidthPx * 0.45), 2), 10)
        const wallSpecLabel = `${wallTypeLabel} | ${wall.thickness}T / ${wall.heightMm}H | ${wallMaterialLabel}`
        const wallSpecLabelWidth = Math.max(156, wallSpecLabel.length * 6.4 + 14)
        const wallSpecLabelHeight = 18
        const wallSpecLabelX = wallMidX + normalX * (strokeWidthPx + 20) - wallSpecLabelWidth / 2
        const wallSpecLabelY = wallMidY + normalY * (strokeWidthPx + 20) - wallSpecLabelHeight / 2
        return (
          <Group
            key={wall.id}
            listening={!isInteractionLockedByCollaboration && !isResizeTool}
          >
            <Line
              points={[wall.start.x, wall.start.y, wall.end.x, wall.end.y]}
              stroke={wallStroke}
              strokeWidth={isSelectedWall ? strokeWidthPx + 1 : strokeWidthPx}
              lineCap="round"
              lineJoin="round"
              dash={wallTypeVisual.marker === 'dashed' ? wallTypeVisual.dash : undefined}
              shadowColor={isSelectedWall ? '#3B45B3' : undefined}
              shadowBlur={isSelectedWall ? 6 : 0}
              shadowOpacity={isSelectedWall ? 0.2 : 0}
              onClick={(e) => {
                if (isPanMode) return
                e.cancelBubble = true
                const stage = e.target.getStage()
                const point = stage ? getCanvasPoint(stage) : null
                if (isWallTool) return
                if (selectedTool === 'delete') {
                  onWallDelete?.(wall.id)
                  return
                }
                if (isOpeningTool && point) {
                  createOpeningOnWall(wall, point)
                }
              }}
              onMouseDown={(e) => {
                if (selectedTool !== 'selection' || isPanMode) return
                if (e.evt.button !== 0) return
                if (e.evt.shiftKey) {
                  e.cancelBubble = true
                  onWallSelect?.(wall.id, true)
                  return
                }
                const stage = e.target.getStage()
                if (!stage) return
                const point = getCanvasPoint(stage)
                if (!point) return
                e.cancelBubble = true
                onWallSelect?.(wall.id, false)
                onWallDragStart({ wallId: wall.id, lastPoint: point })
              }}
            />
            <TwoDWallVisualOverlays
              wall={wall}
              wallTypeVisual={wallTypeVisual}
              isOutsideSiteWall={isOutsideSiteWall}
              isSelectedWall={isSelectedWall}
              wallMaterialColor={wallMaterialColor}
              materialStrokeWidthPx={materialStrokeWidthPx}
              strokeWidthPx={strokeWidthPx}
              normalX={normalX}
              normalY={normalY}
            />

            {isSelectedWall && (
              <TwoDSelectionSpecBadge
                x={wallSpecLabelX}
                y={wallSpecLabelY}
                width={wallSpecLabelWidth}
                height={wallSpecLabelHeight}
                text={wallSpecLabel}
              />
            )}

            {isSelectedWall && selectedTool === 'selection' && (
              <>
                <TwoDWallEndpointHandle
                  wallId={wall.id}
                  endpoint="start"
                  point={wall.start}
                  isGridSnapEnabled={isGridSnapEnabled}
                  gridSnapStepPx={gridSnapStepPx}
                  onWallEndpointChange={onWallEndpointChange}
                />
                <TwoDWallEndpointHandle
                  wallId={wall.id}
                  endpoint="end"
                  point={wall.end}
                  isGridSnapEnabled={isGridSnapEnabled}
                  gridSnapStepPx={gridSnapStepPx}
                  onWallEndpointChange={onWallEndpointChange}
                />
              </>
            )}
          </Group>
        )
      })}

      {openingSnapGuide && openingGuideWall && (
        <TwoDOpeningSnapGuide
          guideWall={openingGuideWall}
          wallPosition={openingSnapGuide.wallPosition}
        />
      )}

      <TwoDWallDraftPreview
        isWallTool={isWallTool}
        isDrawingWall={isDrawingWall}
        wallDraftStart={wallDraftStart}
        wallDraftEnd={wallDraftEnd}
        wallDraftType={wallDraftType}
        wallDraftThicknessMm={wallDraftThicknessMm}
      />
    </>
  )
}

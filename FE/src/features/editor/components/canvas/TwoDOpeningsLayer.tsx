import { Circle, Group } from 'react-konva'
import type Konva from 'konva'
import type { FloorOpening, FloorWall, Point2D } from '../../types'
import { TwoDOpeningShape } from './TwoDOpeningShape'
import { TwoDSelectionSpecBadge } from './TwoDSelectionSpecBadge'
import { useOpeningInteractionHandlers } from './useOpeningInteractionHandlers'
import { getWallPointAtPosition, openingWidthMmToPx, wallThicknessMmToPx } from './twoDCanvas.utils'

interface TwoDOpeningsLayerProps {
  openings: FloorOpening[]
  wallById: Map<string, FloorWall>
  selectedOpeningId: string | null
  selectedOpeningIds: string[]
  outsideOpeningIds: Set<string>
  selectedTool: string
  isPanMode: boolean
  isWallTool: boolean
  isOpeningTool: boolean
  isInteractionLockedByCollaboration: boolean
  getCanvasPoint: (stage: Konva.Stage) => Point2D | null
  createOpeningOnWall: (wall: FloorWall, point: Point2D) => void
  onOpeningDelete?: (openingId: string) => void
  onOpeningSelect?: (openingId: string | null, append?: boolean) => void
  onWallSelect?: (wallId: string | null, append?: boolean) => void
  onSelect?: (id: string | null, isShift?: boolean) => void
  onOpeningDragStart: (state: { openingId: string }) => void
  onClearOpeningSnapGuide: () => void
}

/**
 * 2D 개구부(문/창문) 렌더링 및 상호작용 레이어
 * - 선택/삭제/드래그 시작 이벤트 처리
 * - 문 스윙/창문 스타일 렌더링
 */
export function TwoDOpeningsLayer({
  openings,
  wallById,
  selectedOpeningId,
  selectedOpeningIds,
  outsideOpeningIds,
  selectedTool,
  isPanMode,
  isWallTool,
  isOpeningTool,
  isInteractionLockedByCollaboration,
  getCanvasPoint,
  createOpeningOnWall,
  onOpeningDelete,
  onOpeningSelect,
  onWallSelect,
  onSelect,
  onOpeningDragStart,
  onClearOpeningSnapGuide,
}: TwoDOpeningsLayerProps) {
  const { createOpeningGroupHandlers } = useOpeningInteractionHandlers({
    isPanMode,
    isWallTool,
    isOpeningTool,
    selectedTool,
    getCanvasPoint,
    createOpeningOnWall,
    onOpeningDelete,
    onOpeningSelect,
    onWallSelect,
    onSelect,
    onOpeningDragStart,
    onClearOpeningSnapGuide,
  })

  return (
    <>
      {openings.map((opening) => {
        const wall = wallById.get(opening.wallId)
        if (!wall) return null
        const anchor = getWallPointAtPosition(wall, opening.wallPosition)
        const angleDeg = (Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x) * 180) / Math.PI
        const openingWidthPx = openingWidthMmToPx(opening.widthMm)
        const isSelectedOpening = selectedOpeningId === opening.id || selectedOpeningIds.includes(opening.id)
        const isOutsideSiteOpening = outsideOpeningIds.has(opening.id)
        const wallStrokePx = wallThicknessMmToPx(wall.thickness)
        const openingTypeLabel = opening.type === 'door' ? '문' : '창문'
        const openingSillLabel = opening.type === 'window' ? ` / ${opening.sillHeightMm ?? 900}SH` : ''
        const openingSpecLabel = `${openingTypeLabel} | ${opening.widthMm}W / ${opening.heightMm}H${openingSillLabel}`
        const openingSpecLabelWidth = Math.max(132, openingSpecLabel.length * 6.4 + 14)
        const openingSpecLabelHeight = 18
        const openingSpecLabelX = -openingSpecLabelWidth / 2
        const openingSpecLabelY = -(Math.max(wallStrokePx + 16, 24))
        const { onClick, onMouseDown } = createOpeningGroupHandlers(opening, wall)

        return (
          <Group
            key={opening.id}
            x={anchor.x}
            y={anchor.y}
            rotation={angleDeg}
            listening={!isInteractionLockedByCollaboration}
            onClick={onClick}
            onMouseDown={onMouseDown}
          >
            <TwoDOpeningShape
              opening={opening}
              openingWidthPx={openingWidthPx}
              wallStrokePx={wallStrokePx}
              isSelectedOpening={isSelectedOpening}
              isOutsideSiteOpening={isOutsideSiteOpening}
            />

            {isSelectedOpening && (
              <>
                <TwoDSelectionSpecBadge
                  x={openingSpecLabelX}
                  y={openingSpecLabelY}
                  width={openingSpecLabelWidth}
                  height={openingSpecLabelHeight}
                  text={openingSpecLabel}
                />
                <Circle x={0} y={0} radius={5} fill="#FFFFFF" stroke="#3B45B3" strokeWidth={2} />
              </>
            )}
          </Group>
        )
      })}
    </>
  )
}

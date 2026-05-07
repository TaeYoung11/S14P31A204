import { Arc, Circle, Group, Line } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { DoorInfo } from '../../utils/floorPlanLayout'

interface TwoDFallbackDoorsLayerProps {
  fallbackDoorList: Array<DoorInfo | null>
  isInteractionLockedByCollaboration: boolean
  isPanMode: boolean
  selectedTool: string
  isDoorTool: boolean
  promoteFallbackDoorToOpening: (door: DoorInfo) => string | null
  onOpeningDelete?: (openingId: string) => void
  onOpeningSelect?: (openingId: string | null, append?: boolean) => void
  onWallSelect?: (wallId: string | null, append?: boolean) => void
  onSelect?: (id: string | null, isShift?: boolean) => void
}

function handleFallbackDoorClick(
  event: KonvaEventObject<MouseEvent>,
  door: DoorInfo,
  params: {
    isPanMode: boolean
    selectedTool: string
    isDoorTool: boolean
    promoteFallbackDoorToOpening: (door: DoorInfo) => string | null
    onOpeningDelete?: (openingId: string) => void
    onOpeningSelect?: (openingId: string | null, append?: boolean) => void
    onWallSelect?: (wallId: string | null, append?: boolean) => void
    onSelect?: (id: string | null, isShift?: boolean) => void
  },
) {
  if (params.isPanMode) return
  event.cancelBubble = true

  if (params.selectedTool === 'delete') {
    const openingId = params.promoteFallbackDoorToOpening(door)
    if (openingId) params.onOpeningDelete?.(openingId)
    return
  }

  if (params.selectedTool === 'selection') {
    const openingId = params.promoteFallbackDoorToOpening(door)
    if (!openingId) return
    params.onOpeningSelect?.(openingId, event.evt.shiftKey)
    params.onWallSelect?.(null)
    params.onSelect?.(null)
    return
  }

  if (!params.isDoorTool) return
  params.promoteFallbackDoorToOpening(door)
}

/**
 * 연결 기반 자동 문 보조 렌더링 레이어
 * - 연결별 개구부 데이터가 없을 때만 시각 힌트/승격 클릭을 제공한다.
 */
export function TwoDFallbackDoorsLayer({
  fallbackDoorList,
  isInteractionLockedByCollaboration,
  isPanMode,
  selectedTool,
  isDoorTool,
  promoteFallbackDoorToOpening,
  onOpeningDelete,
  onOpeningSelect,
  onWallSelect,
  onSelect,
}: TwoDFallbackDoorsLayerProps) {
  return (
    <>
      {fallbackDoorList.map((door) => {
        if (!door) return null

        const commonProps = {
          key: door.key,
          listening: !isInteractionLockedByCollaboration,
          onClick: (event: KonvaEventObject<MouseEvent>) => handleFallbackDoorClick(event, door, {
            isPanMode,
            selectedTool,
            isDoorTool,
            promoteFallbackDoorToOpening,
            onOpeningDelete,
            onOpeningSelect,
            onWallSelect,
            onSelect,
          }),
        }

        if (door.direction === 'vertical' && door.wallX !== undefined && door.doorCenterY !== undefined) {
          const { wallX, doorCenterY, doorW } = door
          const start = doorCenterY - doorW / 2
          return (
            <Group {...commonProps}>
              <Line points={[wallX, start, wallX, start + doorW]} stroke="white" strokeWidth={5} />
              <Circle x={wallX} y={start} radius={2} fill="#3B45B3" />
              <Arc x={wallX} y={start} innerRadius={0} outerRadius={doorW} angle={90} rotation={0} stroke="#3B45B3" strokeWidth={1.5} fill="rgba(59,69,179,0.05)" />
            </Group>
          )
        }

        if (door.direction === 'horizontal' && door.wallY !== undefined && door.doorCenterX !== undefined) {
          const { wallY, doorCenterX, doorW } = door
          const start = doorCenterX - doorW / 2
          return (
            <Group {...commonProps}>
              <Line points={[start, wallY, start + doorW, wallY]} stroke="white" strokeWidth={5} />
              <Circle x={start} y={wallY} radius={2} fill="#3B45B3" />
              <Arc x={start} y={wallY} innerRadius={0} outerRadius={doorW} angle={90} rotation={0} stroke="#3B45B3" strokeWidth={1.5} fill="rgba(59,69,179,0.05)" />
            </Group>
          )
        }

        return null
      })}
    </>
  )
}

import { ChevronDown, ChevronRight, DoorOpen, Minus } from 'lucide-react'
import type { HierarchySectionProps } from '../../layout/right-panels/buildRightPanelSectionProps'
import type { HierarchyGroup } from '../hierarchyPanelData'

interface InspectorFallbackHierarchyProps {
  panelProps: HierarchySectionProps
  roomGroup: HierarchyGroup
  wallGroup?: HierarchyGroup
  openingGroup?: HierarchyGroup
  selectedRoomId: string | null
  selectedFloorWallId: string | null
  selectedFloorOpeningId: string | null
  expandedFallbackRoomIds: string[]
  onToggleFallbackRoomExpand: (roomId: string) => void
}

/** floorRooms가 비어도 기존 group 데이터를 Room 중심 트리로 보여주는 fallback 뷰다. */
export function InspectorFallbackHierarchy({
  panelProps,
  roomGroup,
  wallGroup,
  openingGroup,
  selectedRoomId,
  selectedFloorWallId,
  selectedFloorOpeningId,
  expandedFallbackRoomIds,
  onToggleFallbackRoomExpand,
}: InspectorFallbackHierarchyProps) {
  const roomItems = roomGroup.children
  const wallItems = wallGroup?.children ?? []
  const openingItems = openingGroup?.children ?? []

  return (
    <div className="space-y-2">
      {roomItems.map((roomItem) => {
        const isExpanded =
          expandedFallbackRoomIds.length === 0 || expandedFallbackRoomIds.includes(roomItem.id)
        const isSelectedRoom = selectedRoomId === roomItem.id
        return (
          <div key={`fallback-room-${roomItem.id}`} className="rounded-md px-1 py-1">
            <button
              type="button"
              onClick={() => {
                onToggleFallbackRoomExpand(roomItem.id)
                panelProps.onSelectRoom?.(roomItem.id)
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-[#F6F8FD] ${
                isSelectedRoom ? 'bg-[#EEF2FF]' : ''
              }`}
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span className={`truncate text-[11px] font-extrabold ${isSelectedRoom ? 'text-[#1F2E4D]' : 'text-[#2E3A4D]'}`}>
                {roomItem.label}
              </span>
            </button>

            {isExpanded && (
              <div className="ml-[18px] mt-1 border-l border-[#E6EBF5] pl-4">
                {wallItems.map((wall) => (
                  <button
                    key={`fallback-wall-${wall.id}`}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      panelProps.onSelectWall?.(wall.id)
                    }}
                    className={`flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-[#F6F8FD] ${
                      selectedFloorWallId === wall.id ? 'bg-[#EEF2FF]' : ''
                    }`}
                  >
                    <Minus size={12} className="text-[#5A6982]" />
                    <span className={`text-[10px] font-semibold ${selectedFloorWallId === wall.id ? 'text-[#3B45B3]' : 'text-[#4E5C73]'}`}>
                      {wall.label}
                    </span>
                  </button>
                ))}

                {openingItems.map((opening) => (
                  <button
                    key={`fallback-opening-${opening.id}`}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      panelProps.onSelectOpening?.(opening.id)
                    }}
                    className={`flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-[#F6F8FD] ${
                      selectedFloorOpeningId === opening.id ? 'bg-[#EEF2FF]' : ''
                    }`}
                  >
                    <DoorOpen size={12} className="text-[#5A6982]" />
                    <span className={`text-[10px] font-semibold ${selectedFloorOpeningId === opening.id ? 'text-[#3B45B3]' : 'text-[#4E5C73]'}`}>
                      {opening.label}
                    </span>
                  </button>
                ))}

                {wallItems.length === 0 && openingItems.length === 0 && (
                  <p className="py-1 text-[9px] text-[#97A2B6]">연결 요소 없음</p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

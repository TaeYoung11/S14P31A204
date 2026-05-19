import { ChevronDown, ChevronRight, DoorOpen, Minus } from 'lucide-react'
import type { HierarchySectionProps } from '../../layout/right-panels/buildRightPanelSectionProps'
import type { FloorRoom, FloorWall } from '../../../types'

interface InspectorRoomHierarchyProps {
  panelProps: HierarchySectionProps
  selectedRoomId: string | null
  selectedFloorWallId: string | null
  selectedFloorOpeningId: string | null
  expandedRoomIds: string[]
  showSelectedRoomOnly: boolean
  hierarchyRooms: FloorRoom[]
  roomLabelByBubbleId: Map<string, string>
  wallLabelById: Map<string, string>
  roomWallsByRoomKey: Map<string, FloorWall[]>
  roomOpeningsByRoomKey: Map<string, NonNullable<HierarchySectionProps['floorOpenings']>>
  getRoomKey: (room: FloorRoom) => string
  onExpandAll: () => void
  onCollapseAll: () => void
  onToggleSelectedRoomOnly: () => void
  onToggleRoomExpand: (roomId: string) => void
  onSelectRoomByAnyId: (roomId: string) => void
}

/** 2D Room을 기준으로 연결 Room, 벽, 개구부를 묶어 보여준다. */
export function InspectorRoomHierarchy({
  panelProps,
  selectedRoomId,
  selectedFloorWallId,
  selectedFloorOpeningId,
  expandedRoomIds,
  showSelectedRoomOnly,
  hierarchyRooms,
  roomLabelByBubbleId,
  wallLabelById,
  roomWallsByRoomKey,
  roomOpeningsByRoomKey,
  getRoomKey,
  onExpandAll,
  onCollapseAll,
  onToggleSelectedRoomOnly,
  onToggleRoomExpand,
  onSelectRoomByAnyId,
}: InspectorRoomHierarchyProps) {
  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        <button
          type="button"
          onClick={onExpandAll}
          className="flex-1 rounded-md bg-[#F8FAFC] px-2 py-1 text-[10px] font-bold text-[#4B5873] hover:bg-[#EEF2FF]"
        >
          전체 펼침
        </button>
        <button
          type="button"
          onClick={onCollapseAll}
          className="flex-1 rounded-md bg-[#F8FAFC] px-2 py-1 text-[10px] font-bold text-[#4B5873] hover:bg-[#EEF2FF]"
        >
          전체 닫기
        </button>
        <button
          type="button"
          onClick={onToggleSelectedRoomOnly}
          className={`flex-1 rounded-md px-2 py-1 text-[10px] font-bold ${
            showSelectedRoomOnly ? 'bg-[#3B45B3] text-white' : 'bg-[#F8FAFC] text-[#4B5873] hover:bg-[#EEF2FF]'
          }`}
        >
          선택 Room
        </button>
      </div>

      {hierarchyRooms.length === 0 ? (
        <p className="py-2 text-center text-[11px] text-[#94A3B8]">선택된 Room이 없습니다.</p>
      ) : (
        hierarchyRooms.map((room) => {
          const roomId = getRoomKey(room)
          const isExpanded = expandedRoomIds.includes(roomId)
          const isSelected = selectedRoomId === room.bubbleId || selectedRoomId === room.id
          const roomWalls = roomWallsByRoomKey.get(roomId) ?? []
          const roomOpenings = roomOpeningsByRoomKey.get(roomId) ?? []
          const connectedIds = room.connectedIds ?? []

          return (
            <div key={room.id || roomId} className="rounded-md px-1 py-1">
              <button
                type="button"
                onClick={() => {
                  onToggleRoomExpand(roomId)
                  onSelectRoomByAnyId(room.bubbleId || room.id)
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-[#F6F8FD]"
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className={`truncate text-[11px] font-extrabold ${isSelected ? 'text-[#1F2E4D]' : 'text-[#2E3A4D]'}`}>
                  ({room.label})
                </span>
              </button>

              {isExpanded && (
                <div className="ml-[18px] mt-1 border-l border-[#E6EBF5] pl-4">
                  {connectedIds.map((connectedId, connectedIndex) => (
                    <button
                      key={`${roomId}-connected-${connectedId}`}
                      type="button"
                      onClick={() => onSelectRoomByAnyId(connectedId)}
                      className="flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-[#F6F8FD]"
                    >
                      <Minus size={12} className="text-[#66758C]" />
                      <span className="text-[10px] font-bold text-[#4E5C73]">
                        {roomLabelByBubbleId.get(connectedId) ?? connectedId}
                        {connectedIds.length > 1 ? `_${String(connectedIndex + 1).padStart(2, '0')}` : ''}
                      </span>
                    </button>
                  ))}

                  {roomWalls.map((wall) => (
                    <button
                      key={wall.id}
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
                        {wallLabelById.get(wall.id) ?? wall.id}
                      </span>
                    </button>
                  ))}

                  {roomOpenings.map((opening, openingIndex) => (
                    <button
                      key={opening.id}
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
                        {opening.type === 'door' ? '문' : '창'}_{String(openingIndex + 1).padStart(2, '0')}
                      </span>
                    </button>
                  ))}

                  {connectedIds.length === 0 && roomWalls.length === 0 && roomOpenings.length === 0 && (
                    <p className="py-1 text-[9px] text-[#97A2B6]">연결 요소 없음</p>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

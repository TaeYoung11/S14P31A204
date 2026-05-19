import { useCallback, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, DoorOpen, Eye, EyeOff, Minus, Search } from 'lucide-react'
import type { HierarchySectionProps } from '../../layout/right-panels/buildRightPanelSectionProps'
import type { ElementHierarchyNode, FloorRoom, FloorWall } from '../../../types'
import { lineIntersectsRect, pointInRect } from '../../../utils/geometry2d'
import { buildHierarchyGroups } from '../hierarchyPanelData'

interface InspectorHierarchySectionProps {
  panelProps: HierarchySectionProps | null
}

const AXIS_TOLERANCE = 2

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0.5
  return Math.min(1, Math.max(0, value))
}

function wallTouchesRoom(wall: FloorWall, room: FloorRoom): boolean {
  return lineIntersectsRect(wall.start, wall.end, {
    x: room.x - AXIS_TOLERANCE,
    y: room.y - AXIS_TOLERANCE,
    width: room.width + AXIS_TOLERANCE * 2,
    height: room.height + AXIS_TOLERANCE * 2,
  })
}

function resolveOpeningAnchorPoint(
  opening: NonNullable<HierarchySectionProps['floorOpenings']>[number],
  wallById: Map<string, FloorWall>,
) {
  const wall = wallById.get(opening.wallId)
  if (!wall) return null
  const t = clamp01(opening.wallPosition)
  return {
    x: wall.start.x + (wall.end.x - wall.start.x) * t,
    y: wall.start.y + (wall.end.y - wall.start.y) * t,
  }
}

function roomContainsPoint(room: FloorRoom, point: { x: number; y: number }): boolean {
  return pointInRect(point, {
    x: room.x - AXIS_TOLERANCE,
    y: room.y - AXIS_TOLERANCE,
    width: room.width + AXIS_TOLERANCE * 2,
    height: room.height + AXIS_TOLERANCE * 2,
  })
}

function countElementNodes(node: ElementHierarchyNode): number {
  if (node.kind === 'element') return 1
  return node.children.reduce((sum, child) => sum + countElementNodes(child), 0)
}

function filterElementHierarchyTree(nodes: ElementHierarchyNode[], query: string): ElementHierarchyNode[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return nodes

  const visit = (node: ElementHierarchyNode): ElementHierarchyNode | null => {
    const selfMatches = [
      node.label,
      node.elementId,
      node.floorId,
      node.category,
      node.sourceType,
    ].some((value) => String(value ?? '').toLowerCase().includes(normalizedQuery))
    const children = node.children.map(visit).filter((child): child is ElementHierarchyNode => child != null)
    if (!selfMatches && children.length === 0) return null
    return { ...node, children }
  }

  return nodes.map(visit).filter((node): node is ElementHierarchyNode => node != null)
}

/**
 * 인스펙터의 계층 구조 섹션.
 */
export function InspectorHierarchySection({ panelProps }: InspectorHierarchySectionProps) {
  const rooms = panelProps?.floorRooms ?? []
  const walls = panelProps?.floorWalls ?? []
  const openings = panelProps?.floorOpenings ?? []
  const selectedRoomId = panelProps?.selectedRoomId ?? null
  const selectedFloorWallId = panelProps?.selectedFloorWallId ?? null
  const selectedFloorOpeningId = panelProps?.selectedFloorOpeningId ?? null
  const selectedElementId = panelProps?.selectedElementId ?? null
  const elementHierarchyTree = panelProps?.elementHierarchyTree ?? []
  const [expandedRoomIds, setExpandedRoomIds] = useState<string[]>([])
  const [expandedFallbackRoomIds, setExpandedFallbackRoomIds] = useState<string[]>([])
  const [expandedElementNodeIds, setExpandedElementNodeIds] = useState<string[]>([])
  const [showSelectedRoomOnly, setShowSelectedRoomOnly] = useState(false)
  const [elementSearchQuery, setElementSearchQuery] = useState('')
  const hiddenElementIdSet = useMemo(
    () => new Set(panelProps?.hiddenElementIds ?? []),
    [panelProps?.hiddenElementIds],
  )
  const filteredElementHierarchyTree = useMemo(
    () => filterElementHierarchyTree(elementHierarchyTree, elementSearchQuery),
    [elementHierarchyTree, elementSearchQuery],
  )

  const getRoomKey = useCallback(
    (room: FloorRoom) => {
      if (room.id) return room.id
      if (room.bubbleId) return room.bubbleId
      const originalIndex = rooms.indexOf(room)
      const safeIndex = originalIndex >= 0 ? originalIndex : 0
      return `room-${String(safeIndex + 1).padStart(2, '0')}`
    },
    [rooms],
  )

  const roomLabelByBubbleId = useMemo(() => {
    const map = new Map<string, string>()
    rooms.forEach((room) => {
      if (room.bubbleId) map.set(room.bubbleId, room.label)
    })
    return map
  }, [rooms])

  const roomByEitherId = useMemo(() => {
    const map = new Map<string, FloorRoom>()
    rooms.forEach((room) => {
      if (room.id) map.set(room.id, room)
      if (room.bubbleId) map.set(room.bubbleId, room)
    })
    return map
  }, [rooms])

  const wallLabelById = useMemo(() => {
    const map = new Map<string, string>()
    walls.forEach((wall, index) => {
      map.set(wall.id, `벽_${String(index + 1).padStart(2, '0')}`)
    })
    return map
  }, [walls])

  const roomWallIdSetByRoomKey = useMemo(() => {
    const map = new Map<string, Set<string>>()
    rooms.forEach((room) => {
      const roomKey = getRoomKey(room)
      const touching = new Set<string>()
      walls.forEach((wall) => {
        if (wallTouchesRoom(wall, room)) touching.add(wall.id)
      })
      map.set(roomKey, touching)
    })
    return map
  }, [rooms, walls, getRoomKey])

  const roomOpeningsByRoomKey = useMemo(() => {
    const map = new Map<string, typeof openings>()
    const wallById = new Map(walls.map((wall) => [wall.id, wall]))
    const fallbackRoomKeyByOpeningId = new Map<string, string>()

    openings.forEach((opening) => {
      const anchorPoint = resolveOpeningAnchorPoint(opening, wallById)
      if (!anchorPoint) return
      const ownerRoom = rooms.find((room) => roomContainsPoint(room, anchorPoint))
      if (!ownerRoom) return
      fallbackRoomKeyByOpeningId.set(opening.id, getRoomKey(ownerRoom))
    })

    rooms.forEach((room) => {
      const roomKey = getRoomKey(room)
      const wallIdSet = roomWallIdSetByRoomKey.get(roomKey) ?? new Set<string>()
      map.set(
        roomKey,
        openings.filter((opening) =>
          wallIdSet.has(opening.wallId) || fallbackRoomKeyByOpeningId.get(opening.id) === roomKey),
      )
    })
    return map
  }, [rooms, walls, openings, roomWallIdSetByRoomKey, getRoomKey])

  const roomWallsByRoomKey = useMemo(() => {
    const map = new Map<string, FloorWall[]>()
    rooms.forEach((room) => {
      const roomKey = getRoomKey(room)
      const wallIdSet = roomWallIdSetByRoomKey.get(roomKey) ?? new Set<string>()
      map.set(roomKey, walls.filter((wall) => wallIdSet.has(wall.id)))
    })
    return map
  }, [rooms, walls, roomWallIdSetByRoomKey, getRoomKey])

  const hierarchyRooms = useMemo(() => {
    if (!showSelectedRoomOnly || !selectedRoomId) return rooms
    return rooms.filter((room) => room.bubbleId === selectedRoomId || room.id === selectedRoomId)
  }, [rooms, selectedRoomId, showSelectedRoomOnly])

  const visibleRoomKeys = useMemo(
    () => hierarchyRooms.map(getRoomKey),
    [hierarchyRooms, getRoomKey],
  )

  const handleExpandAll = useCallback(() => {
    setExpandedRoomIds((prev) => {
      const merged = new Set(prev)
      visibleRoomKeys.forEach((key) => merged.add(key))
      return Array.from(merged)
    })
  }, [visibleRoomKeys])

  const handleCollapseAll = useCallback(() => {
    setExpandedRoomIds((prev) => prev.filter((roomId) => !visibleRoomKeys.includes(roomId)))
  }, [visibleRoomKeys])

  const toggleRoomExpand = (roomId: string) => {
    setExpandedRoomIds((prev) => (prev.includes(roomId) ? prev.filter((id) => id !== roomId) : [...prev, roomId]))
  }

  const handleSelectRoomByAnyId = useCallback((roomId: string) => {
    const room = roomByEitherId.get(roomId)
    if (!room) {
      panelProps?.onSelectRoom?.(roomId)
      return
    }
    panelProps?.onSelectRoom?.(room.bubbleId || room.id)
  }, [panelProps, roomByEitherId])

  if (!panelProps) {
    return <p className="text-[11px] text-[#94A3B8]">계층 정보가 없습니다.</p>
  }

  const toggleElementNodeExpand = (nodeId: string) => {
    setExpandedElementNodeIds((prev) => (
      prev.includes(nodeId) ? prev.filter((id) => id !== nodeId) : [...prev, nodeId]
    ))
  }

  const handleSelectElementTreeNode = (node: ElementHierarchyNode) => {
    if (node.kind === 'element' && node.elementId) {
      panelProps.onSelectRegistryElement?.(node.elementId)
      return
    }
    if (!node.floorId) return
    if (node.sourceType === 'IFC_MOCK') {
      panelProps.onSelectIfcStorey?.(node.floorId)
      return
    }
    panelProps.onSelectFloor?.(node.floorId)
  }

  const renderElementTreeNode = (node: ElementHierarchyNode, depth = 0): JSX.Element => {
    const hasChildren = node.children.length > 0
    const isSearching = elementSearchQuery.trim().length > 0
    const isExpanded = isSearching || expandedElementNodeIds.includes(node.id) || depth < 2
    const isSelected = Boolean(node.isSelected || (node.elementId && selectedElementId === node.elementId))
    const isElementHidden = Boolean(node.elementId && hiddenElementIdSet.has(node.elementId))
    const isVisible = node.isVisible !== false && !isElementHidden
    const elementCount = countElementNodes(node)
    const paddingLeft = Math.min(depth * 10, 32)

    return (
      <div key={node.id} className="space-y-0.5">
        <div
          className={`flex items-center gap-1 rounded-md px-1.5 py-1 ${
            isSelected ? 'bg-[#EEF2FF] text-[#3B45B3]' : 'text-[#475569] hover:bg-[#F6F8FD]'
          }`}
          style={{ paddingLeft: `${paddingLeft + 4}px` }}
        >
          <button
            type="button"
            onClick={() => hasChildren && toggleElementNodeExpand(node.id)}
            className={`shrink-0 rounded p-0.5 ${hasChildren ? 'text-[#94A3B8] hover:bg-[#EEF2FF]' : 'text-transparent'}`}
            aria-label={`${node.label} 펼침 전환`}
          >
            {hasChildren
              ? (isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />)
              : <ChevronRight size={12} />}
          </button>
          <button
            type="button"
            onClick={() => handleSelectElementTreeNode(node)}
            className="min-w-0 flex-1 text-left"
          >
            <span className={`block truncate text-[10px] ${isSelected ? 'font-extrabold' : 'font-bold'}`}>
              {node.label}
            </span>
            {node.kind !== 'element' && (
              <span className="block text-[9px] font-semibold text-[#94A3B8]">{elementCount}개 요소</span>
            )}
          </button>
          {node.kind === 'element' && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                if (node.elementId) panelProps.onToggleElementVisibility?.(node.elementId)
              }}
              className={`shrink-0 rounded p-0.5 ${
                isVisible ? 'text-[#3B45B3] hover:bg-[#EEF2FF]' : 'text-[#CBD5E1] hover:bg-[#EEF2FF]'
              }`}
              aria-label={isVisible ? `${node.label} 숨기기` : `${node.label} 표시`}
            >
              {isVisible ? <Eye size={11} /> : <EyeOff size={11} />}
            </button>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div className="space-y-0.5">
            {node.children.map((child) => renderElementTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  if (elementHierarchyTree.length > 0) {
    return (
      <div className="space-y-2">
        <div className="flex h-7 items-center gap-1.5 rounded-md border border-[#E2E8F0] bg-white px-2">
          <Search size={11} className="shrink-0 text-[#94A3B8]" />
          <input
            value={elementSearchQuery}
            onChange={(event) => setElementSearchQuery(event.target.value)}
            placeholder="요소 검색"
            className="min-w-0 flex-1 bg-transparent text-[10px] font-semibold text-[#334155] outline-none placeholder:text-[#94A3B8]"
          />
          <span className="shrink-0 text-[9px] font-bold text-[#94A3B8]">
            {panelProps.elementRegistry?.elements.length ?? 0}
          </span>
        </div>
        {filteredElementHierarchyTree.length > 0 ? (
          <div className="space-y-0.5">
            {filteredElementHierarchyTree.map((node) => renderElementTreeNode(node))}
          </div>
        ) : (
          <p className="py-2 text-center text-[11px] text-[#94A3B8]">검색 결과가 없습니다.</p>
        )}
      </div>
    )
  }

  if (rooms.length > 0) {
    return (
      <div className="space-y-2">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={handleExpandAll}
            className="flex-1 rounded-md bg-[#F8FAFC] px-2 py-1 text-[10px] font-bold text-[#4B5873] hover:bg-[#EEF2FF]"
          >
            전체 펼침
          </button>
          <button
            type="button"
            onClick={handleCollapseAll}
            className="flex-1 rounded-md bg-[#F8FAFC] px-2 py-1 text-[10px] font-bold text-[#4B5873] hover:bg-[#EEF2FF]"
          >
            전체 닫기
          </button>
          <button
            type="button"
            onClick={() => setShowSelectedRoomOnly((prev) => !prev)}
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
                    toggleRoomExpand(roomId)
                    handleSelectRoomByAnyId(room.bubbleId || room.id)
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
                        onClick={() => handleSelectRoomByAnyId(connectedId)}
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

  const hierarchyGroups = panelProps.groups ?? buildHierarchyGroups({
    floorRooms: panelProps.floorRooms,
    floorWalls: panelProps.floorWalls,
    floorOpenings: panelProps.floorOpenings,
    floorLayers: panelProps.floorLayers,
    activeFloorLayerId: panelProps.activeFloorLayerId,
    ifcElementHierarchy: panelProps.ifcElementHierarchy,
  })

  if (hierarchyGroups.length === 0) {
    return <p className="text-[11px] text-[#94A3B8]">계층 정보가 없습니다.</p>
  }

  const roomGroup = hierarchyGroups.find((group) => group.id === 'rooms')
  const wallGroup = hierarchyGroups.find((group) => group.id === 'walls')
  const openingGroup = hierarchyGroups.find((group) => group.id === 'openings')

  // floorRooms가 비어 fallback 렌더 경로로 진입한 경우에도
  // 룸을 부모로 두고 벽/개구부를 자식으로 보여 선택 동선을 일관되게 유지한다.
  if (rooms.length === 0 && roomGroup) {
    const roomItems = roomGroup.children
    const wallItems = wallGroup?.children ?? []
    const openingItems = openingGroup?.children ?? []

    const toggleFallbackRoomExpand = (roomId: string) => {
      setExpandedFallbackRoomIds((prev) => (
        prev.includes(roomId)
          ? prev.filter((id) => id !== roomId)
          : [...prev, roomId]
      ))
    }

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
                  toggleFallbackRoomExpand(roomItem.id)
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

  return (
    <div className="space-y-2">
      {hierarchyGroups.map((group) => (
        <div key={group.id}>
          <div className="flex items-center justify-between rounded-md bg-[#F8FAFC] px-2 py-1">
            <span className="truncate text-[11px] font-extrabold text-[#334155]">{group.name}</span>
            <Eye size={11} className="text-[#94A3B8]" />
          </div>
          <div className="ml-2 mt-1 space-y-1 border-l border-[#E2E8F0] pl-2">
            {group.children.map((child) => {
              const isSelectedRoom = group.id === 'rooms' && (selectedRoomId === child.id)
              const isSelectedWall = group.id === 'walls' && selectedFloorWallId === child.id
              const isSelectedOpening = group.id === 'openings' && selectedFloorOpeningId === child.id
              const isSelected = isSelectedRoom || isSelectedWall || isSelectedOpening

              return (
                <button
                  key={`${group.id}-${child.id}`}
                  type="button"
                  onClick={() => {
                    if (group.id === 'floors') {
                      panelProps.onSelectFloor?.(child.id)
                      return
                    }
                    if (group.id === 'rooms') {
                      handleSelectRoomByAnyId(child.id)
                      return
                    }
                    if (group.id === 'walls') {
                      panelProps.onSelectWall?.(child.id)
                      return
                    }
                    if (group.id === 'openings') {
                      panelProps.onSelectOpening?.(child.id)
                    }
                  }}
                  className={`flex w-full items-center justify-between rounded px-1.5 py-0.5 text-[10px] ${
                    isSelected ? 'bg-[#EEF2FF] text-[#3B45B3]' : 'text-[#64748B] hover:bg-[#F6F8FD]'
                  }`}
                >
                  <span className="truncate">{child.label}</span>
                  <Eye size={10} className={isSelected ? 'text-[#3B45B3]' : 'text-[#CBD5E1]'} />
                </button>
              )
            })}
            {group.children.length === 0 && (
              <p className="px-1.5 py-0.5 text-[10px] text-[#94A3B8]">하위 요소 없음</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

import { useCallback, useMemo, useState } from 'react'
import type { HierarchySectionProps } from '../../layout/right-panels/buildRightPanelSectionProps'
import type { FloorRoom, FloorWall } from '../../../types'
import {
  EMPTY_ELEMENT_HIERARCHY_TREE,
  EMPTY_FLOOR_OPENINGS,
  EMPTY_FLOOR_ROOMS,
  EMPTY_FLOOR_WALLS,
  filterElementHierarchyTree,
  resolveOpeningAnchorPoint,
  roomContainsPoint,
  wallTouchesRoom,
} from './inspectorHierarchySection.utils'

/** 계층 섹션 렌더링에 필요한 상태와 파생 데이터를 한곳에서 만든다. */
export function useInspectorHierarchySectionModel(panelProps: HierarchySectionProps | null) {
  const rooms = panelProps?.floorRooms ?? EMPTY_FLOOR_ROOMS
  const walls = panelProps?.floorWalls ?? EMPTY_FLOOR_WALLS
  const openings = panelProps?.floorOpenings ?? EMPTY_FLOOR_OPENINGS
  const selectedRoomId = panelProps?.selectedRoomId ?? null
  const selectedFloorWallId = panelProps?.selectedFloorWallId ?? null
  const selectedFloorOpeningId = panelProps?.selectedFloorOpeningId ?? null
  const selectedElementId = panelProps?.selectedElementId ?? null
  const elementHierarchyTree = panelProps?.elementHierarchyTree ?? EMPTY_ELEMENT_HIERARCHY_TREE
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

  const handleToggleRoomExpand = useCallback((roomId: string) => {
    setExpandedRoomIds((prev) => (prev.includes(roomId) ? prev.filter((id) => id !== roomId) : [...prev, roomId]))
  }, [])

  const handleSelectRoomByAnyId = useCallback((roomId: string) => {
    const room = roomByEitherId.get(roomId)
    if (!room) {
      panelProps?.onSelectRoom?.(roomId)
      return
    }
    panelProps?.onSelectRoom?.(room.bubbleId || room.id)
  }, [panelProps, roomByEitherId])

  const handleToggleElementNodeExpand = useCallback((nodeId: string) => {
    setExpandedElementNodeIds((prev) => (
      prev.includes(nodeId) ? prev.filter((id) => id !== nodeId) : [...prev, nodeId]
    ))
  }, [])

  const handleToggleFallbackRoomExpand = useCallback((roomId: string) => {
    setExpandedFallbackRoomIds((prev) => (
      prev.includes(roomId)
        ? prev.filter((id) => id !== roomId)
        : [...prev, roomId]
    ))
  }, [])

  return {
    rooms,
    selectedRoomId,
    selectedFloorWallId,
    selectedFloorOpeningId,
    selectedElementId,
    elementHierarchyTree,
    filteredElementHierarchyTree,
    hiddenElementIdSet,
    expandedRoomIds,
    expandedFallbackRoomIds,
    expandedElementNodeIds,
    showSelectedRoomOnly,
    elementSearchQuery,
    hierarchyRooms,
    visibleRoomKeys,
    roomLabelByBubbleId,
    wallLabelById,
    roomWallsByRoomKey,
    roomOpeningsByRoomKey,
    getRoomKey,
    handleExpandAll,
    handleCollapseAll,
    handleToggleRoomExpand,
    handleSelectRoomByAnyId,
    handleToggleElementNodeExpand,
    handleToggleFallbackRoomExpand,
    setElementSearchQuery,
    setShowSelectedRoomOnly,
  }
}

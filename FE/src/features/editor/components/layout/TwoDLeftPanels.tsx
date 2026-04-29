import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, ChevronDown, ChevronRight, DoorOpen, Eye, EyeOff, GripVertical, Layers, Minus, Pencil, Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import type { FloorLayer, FloorOpening, FloorRoom, FloorWall } from '../../types'
import { useFloatingPanelDrag } from '../../hooks/useFloatingPanelDrag'

interface TwoDLeftPanelsProps {
  layers?: FloorLayer[]
  activeLayerId?: string | null
  isGenerated?: boolean
  isLayerOverlayMode?: boolean
  selectedOverlayLayerIds?: string[]
  overlayOpacityByLayerId?: Record<string, number>
  rooms?: FloorRoom[]
  walls?: FloorWall[]
  openings?: FloorOpening[]
  selectedRoomId?: string | null
  onAddLayer?: () => void
  onRenameLayer?: (layerId: string, name: string) => void
  onDeleteLayer?: (layerId: string) => void
  onSelectLayer?: (id: string) => void
  onSelectRoom?: (bubbleId: string) => void
  onToggleLayerOverlayMode?: () => void
  onToggleOverlayLayer?: (layerId: string) => void
  onChangeOverlayLayerOpacity?: (layerId: string, opacity: number) => void
}

const AXIS_TOLERANCE = 2

function rangesOverlap(minA: number, maxA: number, minB: number, maxB: number): boolean {
  return minA <= maxB && maxA >= minB
}

function wallTouchesRoom(wall: FloorWall, room: FloorRoom): boolean {
  const left = room.x
  const right = room.x + room.width
  const top = room.y
  const bottom = room.y + room.height

  const dx = wall.end.x - wall.start.x
  const dy = wall.end.y - wall.start.y

  if (Math.abs(dx) <= AXIS_TOLERANCE) {
    const x = wall.start.x
    const isOnLeft = Math.abs(x - left) <= AXIS_TOLERANCE
    const isOnRight = Math.abs(x - right) <= AXIS_TOLERANCE
    if (!isOnLeft && !isOnRight) return false
    const minY = Math.min(wall.start.y, wall.end.y)
    const maxY = Math.max(wall.start.y, wall.end.y)
    return rangesOverlap(minY, maxY, top, bottom)
  }

  if (Math.abs(dy) <= AXIS_TOLERANCE) {
    const y = wall.start.y
    const isOnTop = Math.abs(y - top) <= AXIS_TOLERANCE
    const isOnBottom = Math.abs(y - bottom) <= AXIS_TOLERANCE
    if (!isOnTop && !isOnBottom) return false
    const minX = Math.min(wall.start.x, wall.end.x)
    const maxX = Math.max(wall.start.x, wall.end.x)
    return rangesOverlap(minX, maxX, left, right)
  }

  return false
}

export function TwoDLeftPanels({
  layers = [],
  activeLayerId = null,
  isGenerated = false,
  isLayerOverlayMode = false,
  selectedOverlayLayerIds = [],
  overlayOpacityByLayerId = {},
  rooms = [],
  walls = [],
  openings = [],
  selectedRoomId = null,
  onAddLayer,
  onRenameLayer,
  onDeleteLayer,
  onSelectLayer,
  onSelectRoom,
  onToggleLayerOverlayMode,
  onToggleOverlayLayer,
  onChangeOverlayLayerOpacity,
}: TwoDLeftPanelsProps) {
  const {
    panelRef: floorPanelRef,
    offset: floorPanelOffset,
    startDrag: startFloorPanelDrag,
    consumeClickSuppressedByDrag: consumeFloorPanelDragClick,
  } = useFloatingPanelDrag({ x: 24, y: 24 })
  const {
    panelRef: hierarchyPanelRef,
    offset: hierarchyPanelOffset,
    startDrag: startHierarchyPanelDrag,
    consumeClickSuppressedByDrag: consumeHierarchyPanelDragClick,
  } = useFloatingPanelDrag({ x: 24, y: 380 })
  const selectedOverlaySet = new Set(selectedOverlayLayerIds)
  const canDeleteAnyLayer = layers.length > 1
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [expandedRoomIds, setExpandedRoomIds] = useState<string[]>([])
  const [isHierarchyMenuOpen, setIsHierarchyMenuOpen] = useState(false)
  const [showSelectedRoomOnly, setShowSelectedRoomOnly] = useState(false)
  const [isFloorPanelOpen, setIsFloorPanelOpen] = useState(true)
  const [isHierarchyPanelOpen, setIsHierarchyPanelOpen] = useState(true)
  const hierarchyMenuRef = useRef<HTMLDivElement | null>(null)

  const roomLabelByBubbleId = useMemo(() => {
    const map = new Map<string, string>()
    rooms.forEach((room) => map.set(room.bubbleId, room.label))
    return map
  }, [rooms])

  const roomWallIdSetByBubbleId = useMemo(() => {
    const map = new Map<string, Set<string>>()
    rooms.forEach((room) => {
      const touching = new Set<string>()
      walls.forEach((wall) => {
        if (wallTouchesRoom(wall, room)) touching.add(wall.id)
      })
      map.set(room.bubbleId, touching)
    })
    return map
  }, [rooms, walls])

  const roomOpeningsByBubbleId = useMemo(() => {
    const map = new Map<string, FloorOpening[]>()
    rooms.forEach((room) => {
      const wallIdSet = roomWallIdSetByBubbleId.get(room.bubbleId) ?? new Set<string>()
      const matched = openings.filter((opening) => wallIdSet.has(opening.wallId))
      map.set(room.bubbleId, matched)
    })
    return map
  }, [rooms, openings, roomWallIdSetByBubbleId])

  const hierarchyRooms = useMemo(() => {
    if (!showSelectedRoomOnly) return rooms
    if (!selectedRoomId) return rooms
    return rooms.filter((room) => room.bubbleId === selectedRoomId)
  }, [rooms, selectedRoomId, showSelectedRoomOnly])

  const startRenameLayer = (layer: FloorLayer) => {
    setEditingLayerId(layer.id)
    setEditingName(layer.name)
  }

  const cancelRenameLayer = () => {
    setEditingLayerId(null)
    setEditingName('')
  }

  const commitRenameLayer = (layerId: string) => {
    onRenameLayer?.(layerId, editingName)
    cancelRenameLayer()
  }

  const handleDeleteLayer = (layer: FloorLayer) => {
    if (!canDeleteAnyLayer) return
    const ok = window.confirm(`"${layer.name}" 층을 삭제하시겠습니까?`)
    if (!ok) return
    onDeleteLayer?.(layer.id)
  }

  const toggleRoomExpand = (bubbleId: string) => {
    setExpandedRoomIds((prev) =>
      prev.includes(bubbleId)
        ? prev.filter((id) => id !== bubbleId)
        : [...prev, bubbleId],
    )
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!isHierarchyMenuOpen) return
      const target = event.target as Node
      if (hierarchyMenuRef.current && !hierarchyMenuRef.current.contains(target)) {
        setIsHierarchyMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isHierarchyMenuOpen])

  return (
    <div className="absolute inset-0 z-10 pointer-events-none">
      <div
        ref={floorPanelRef}
        className={`absolute pointer-events-auto ${isFloorPanelOpen ? 'w-[260px]' : 'w-[44px] h-[44px]'}`}
        style={{ left: floorPanelOffset.x, top: floorPanelOffset.y }}
      >
        {isFloorPanelOpen ? (
          <div className="rounded-2xl border border-[#E2E6EF] bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-[#F0F2F9] px-4 py-3">
              <div className="flex items-center gap-1.5">
                <button
                  onMouseDown={startFloorPanelDrag}
                  className="rounded-md p-0.5 text-[#9AA4B5] hover:bg-[#F3F5FA] hover:text-[#505764] cursor-grab active:cursor-grabbing"
                  title="패널 이동"
                  aria-label="층보기 패널 이동"
                >
                  <GripVertical size={12} />
                </button>
                <p className="text-[11px] font-extrabold text-[#1C1C1E]">층 보기</p>
                <span className="rounded bg-[#F3F6FD] px-1.5 py-0.5 text-[9px] font-bold text-[#7A88A3]">
                  Shift+L
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={isGenerated ? onAddLayer : undefined}
                  disabled={!isGenerated}
                  title={isGenerated ? '새 층 추가' : '평면도 생성 후 층 추가 가능'}
                  className={`rounded-md p-1 ${
                    isGenerated
                      ? 'text-[#6F7C96] hover:bg-[#EEF1F8] hover:text-[#3B45B3]'
                      : 'cursor-not-allowed text-[#D9DEF0]'
                  }`}
                >
                  <Plus size={14} />
                </button>
                <button
                  onClick={() => setIsFloorPanelOpen(false)}
                  className="rounded-md p-1 text-[#ADB5BD] hover:bg-[#EEF1F8] hover:text-[#505764]"
                  title="층보기 닫기"
                  aria-label="층보기 패널 닫기"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>

            {!isGenerated ? (
              <div className="px-4 py-6 text-center text-[10px] text-[#ADB5BD]">
                평면도를 먼저 생성하면 층 편집이 가능합니다.
              </div>
            ) : (
              <div className="max-h-[280px] overflow-y-auto p-3">
                <div className="space-y-2">
                  {layers.map((layer, index) => {
                    const isActive = activeLayerId === layer.id
                    const isOverlaySelected = selectedOverlaySet.has(layer.id)
                    const opacity = overlayOpacityByLayerId[layer.id] ?? 0.35
                    const isOverlayToggleDisabled = isActive
                    const displayName = layer.name || `${index + 1}층 평면도`
                    const isEditing = editingLayerId === layer.id
                    return (
                      <div
                        key={layer.id}
                        className={`rounded-xl border px-2.5 py-2 ${
                          isActive ? 'border-[#C8D2FF] bg-[#F4F6FF]' : 'border-[#EEF1F8] bg-[#FCFDFF]'
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onSelectLayer?.(layer.id)}
                            className="min-w-0 flex-1 text-left"
                          >
                            {isEditing ? (
                              <input
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                onBlur={() => commitRenameLayer(layer.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    commitRenameLayer(layer.id)
                                  }
                                  if (e.key === 'Escape') {
                                    e.preventDefault()
                                    cancelRenameLayer()
                                  }
                                }}
                                autoFocus
                                className="w-full rounded border border-[#C8D2FF] bg-white px-1.5 py-0.5 text-[11px] font-bold text-[#1C1C1E] outline-none"
                              />
                            ) : (
                              <p className={`truncate text-[11px] font-bold ${isActive ? 'text-[#3B45B3]' : 'text-[#1C1C1E]'}`}>
                                {displayName}
                              </p>
                            )}
                            <p className="text-[9px] text-[#9AA4BA]">{isActive ? '활성 층' : '비활성 층'}</p>
                          </button>

                          <button
                            onClick={() => {
                              if (isOverlayToggleDisabled) return
                              if (!isLayerOverlayMode) onToggleLayerOverlayMode?.()
                              onToggleOverlayLayer?.(layer.id)
                            }}
                            disabled={isOverlayToggleDisabled}
                            title={isOverlayToggleDisabled ? '활성 층은 겹쳐보기 대상에서 제외' : '겹쳐보기 토글'}
                            className={`rounded-md p-1 ${
                              isOverlayToggleDisabled
                                ? 'cursor-not-allowed text-[#D4DAE8]'
                                : isOverlaySelected
                                  ? 'bg-[#3B45B3] text-white'
                                  : 'text-[#7C8AA4] hover:bg-[#E8ECF8] hover:text-[#3B45B3]'
                            }`}
                          >
                            {isOverlaySelected ? <Eye size={12} /> : <EyeOff size={12} />}
                          </button>

                          <button
                            onClick={() => startRenameLayer(layer)}
                            title="층 이름 수정"
                            className="rounded-md p-1 text-[#7C8AA4] hover:bg-[#E8ECF8] hover:text-[#3B45B3]"
                          >
                            <Pencil size={12} />
                          </button>

                          <button
                            onClick={() => handleDeleteLayer(layer)}
                            disabled={!canDeleteAnyLayer}
                            title={canDeleteAnyLayer ? '층 삭제' : '최소 1개 층은 유지됩니다'}
                            className={`rounded-md p-1 ${
                              canDeleteAnyLayer
                                ? 'text-[#B56A6A] hover:bg-[#FDEEEE] hover:text-[#C23E3E]'
                                : 'cursor-not-allowed text-[#D9DEE8]'
                            }`}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>

                        {isLayerOverlayMode && !isActive && isOverlaySelected && (
                          <div className="mt-2 flex items-center gap-2">
                            <span className="w-9 text-[9px] text-[#8E95A3]">투명도</span>
                            <input
                              type="range"
                              min={10}
                              max={100}
                              step={5}
                              value={Math.round(opacity * 100)}
                              onChange={(e) => onChangeOverlayLayerOpacity?.(layer.id, Number(e.target.value) / 100)}
                              className="h-1.5 flex-1 accent-[#3B45B3]"
                            />
                            <span className="w-8 text-right text-[9px] font-bold text-[#6F7C96]">
                              {Math.round(opacity * 100)}%
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            onMouseDown={startFloorPanelDrag}
            className="h-full w-full rounded-2xl border border-[#E2E6EF] bg-white shadow-sm flex items-center justify-center cursor-grab active:cursor-grabbing"
            title="드래그로 이동"
          >
            <button
              onClick={() => {
                if (consumeFloorPanelDragClick()) return
                setIsFloorPanelOpen(true)
              }}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-[#5B6A85] hover:bg-[#F3F5FA] hover:text-[#3B45B3] transition-colors"
              title="층 보기"
              aria-label="층보기 패널 열기"
            >
              <Layers size={18} />
            </button>
          </div>
        )}
      </div>

      <div
        ref={hierarchyPanelRef}
        className={`absolute pointer-events-auto ${isHierarchyPanelOpen ? 'w-[260px]' : 'w-[44px] h-[44px]'}`}
        style={{ left: hierarchyPanelOffset.x, top: hierarchyPanelOffset.y }}
      >
        {isHierarchyPanelOpen ? (
          <div className="rounded-2xl border border-[#E2E6EF] bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-[#F0F2F9] px-4 py-3">
              <div className="flex items-center gap-1.5">
                <button
                  onMouseDown={startHierarchyPanelDrag}
                  className="rounded-md p-0.5 text-[#9AA4B5] hover:bg-[#F3F5FA] hover:text-[#505764] cursor-grab active:cursor-grabbing"
                  title="패널 이동"
                  aria-label="계층구조 패널 이동"
                >
                  <GripVertical size={12} />
                </button>
                <p className="text-[11px] font-extrabold text-[#1C1C1E]">계층 구조</p>
              </div>
              <div className="flex items-center gap-1">
                <div ref={hierarchyMenuRef} className="relative">
                  <button
                    onClick={() => setIsHierarchyMenuOpen((prev) => !prev)}
                    className={`rounded-md p-1 ${
                      isHierarchyMenuOpen
                        ? 'bg-[#E9EEFA] text-[#3B45B3]'
                        : 'text-[#8FA0BA] hover:bg-[#EEF1F8] hover:text-[#60708A]'
                    }`}
                    title="계층 구조 옵션"
                  >
                    <SlidersHorizontal size={14} />
                  </button>

                  {isHierarchyMenuOpen && (
                    <div className="absolute right-0 top-8 z-20 w-[220px] rounded-xl border border-[#E1E7F3] bg-white p-2 shadow-lg">
                      <button
                        onClick={() => {
                          setShowSelectedRoomOnly(false)
                          setExpandedRoomIds(rooms.map((room) => room.bubbleId))
                          setIsHierarchyMenuOpen(false)
                        }}
                        className="flex h-9 w-full items-center rounded-md px-3 text-left text-[12px] font-semibold tracking-tight text-[#2F3D55] hover:bg-[#F3F6FD]"
                        style={{ whiteSpace: 'nowrap', wordBreak: 'keep-all' }}
                      >
                        전체 펼치기
                      </button>
                      <button
                        onClick={() => {
                          setShowSelectedRoomOnly(false)
                          setExpandedRoomIds([])
                          setIsHierarchyMenuOpen(false)
                        }}
                        className="mt-1 flex h-9 w-full items-center rounded-md px-3 text-left text-[12px] font-semibold tracking-tight text-[#2F3D55] hover:bg-[#F3F6FD]"
                        style={{ whiteSpace: 'nowrap', wordBreak: 'keep-all' }}
                      >
                        전체 접기
                      </button>
                      <button
                        onClick={() => {
                          setShowSelectedRoomOnly((prev) => {
                            const next = !prev
                            if (next && selectedRoomId) {
                              setExpandedRoomIds([selectedRoomId])
                            }
                            return next
                          })
                          setIsHierarchyMenuOpen(false)
                        }}
                        className={`mt-1 flex h-9 w-full items-center rounded-md px-3 text-left text-[12px] font-semibold tracking-tight ${
                          showSelectedRoomOnly
                            ? 'bg-[#EEF2FF] text-[#3B45B3]'
                            : 'text-[#2F3D55] hover:bg-[#F3F6FD]'
                        }`}
                        style={{ whiteSpace: 'nowrap', wordBreak: 'keep-all' }}
                      >
                        선택 Room만 보기
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setIsHierarchyMenuOpen(false)
                    setIsHierarchyPanelOpen(false)
                  }}
                  className="rounded-md p-1 text-[#ADB5BD] hover:bg-[#EEF1F8] hover:text-[#505764]"
                  title="계층구조 닫기"
                  aria-label="계층구조 패널 닫기"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>

            <div className="max-h-[360px] overflow-y-auto p-3">
              {hierarchyRooms.length === 0 ? (
                <p className="px-2 py-4 text-center text-[10px] text-[#ADB5BD]">표시할 Room이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {hierarchyRooms.map((room) => {
                    const isExpanded = expandedRoomIds.includes(room.bubbleId)
                    const isSelected = selectedRoomId === room.bubbleId
                    const connected = room.connectedIds
                    const roomOpenings = roomOpeningsByBubbleId.get(room.bubbleId) ?? []
                    return (
                      <div key={room.id} className="rounded-lg px-1 py-1">
                        <button
                          onClick={() => {
                            toggleRoomExpand(room.bubbleId)
                            onSelectRoom?.(room.bubbleId)
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[#F6F8FD]"
                        >
                          {isExpanded ? (
                            <ChevronDown size={14} className="text-[#1F2A37]" />
                          ) : (
                            <ChevronRight size={14} className="text-[#1F2A37]" />
                          )}
                          <span className={`truncate text-[11px] font-extrabold ${isSelected ? 'text-[#1F2E4D]' : 'text-[#2E3A4D]'}`}>
                            ({room.label})
                          </span>
                        </button>

                        {isExpanded && (
                          <div className="ml-[18px] mt-1 border-l border-[#E6EBF5] pl-4">
                            {connected.map((connectedId, index) => (
                              <div key={`${room.id}-connected-${connectedId}`} className="flex items-center gap-2 py-1">
                                <Minus size={12} className="text-[#66758C]" />
                                <span className="text-[10px] font-bold text-[#4E5C73]">
                                  {roomLabelByBubbleId.get(connectedId) ?? connectedId}
                                  {connected.length > 1 ? `_${String(index + 1).padStart(2, '0')}` : ''}
                                </span>
                              </div>
                            ))}

                            {roomOpenings.map((opening, index) => (
                              <div key={opening.id} className="flex items-center gap-2 py-1">
                                <DoorOpen size={12} className="text-[#5A6982]" />
                                <span className="text-[10px] font-semibold text-[#4E5C73]">
                                  {opening.type === 'door' ? '문' : '창문'}_{String(index + 1).padStart(2, '0')}
                                </span>
                              </div>
                            ))}

                            {connected.length === 0 && roomOpenings.length === 0 && (
                              <p className="py-1 text-[9px] text-[#97A2B6]">하위 요소 없음</p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div
            onMouseDown={startHierarchyPanelDrag}
            className="h-full w-full rounded-2xl border border-[#E2E6EF] bg-white shadow-sm flex items-center justify-center cursor-grab active:cursor-grabbing"
            title="드래그로 이동"
          >
            <button
              onClick={() => {
                if (consumeHierarchyPanelDragClick()) return
                setIsHierarchyPanelOpen(true)
              }}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-[#5B6A85] hover:bg-[#F3F5FA] hover:text-[#3B45B3] transition-colors"
              title="계층 구조"
              aria-label="계층구조 패널 열기"
            >
              <Box size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

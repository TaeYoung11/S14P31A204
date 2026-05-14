import {
  Box,
  ChevronDown,
  ChevronRight,
  DoorOpen,
  Eye,
  EyeOff,
  Layers,
  Minus,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { DeleteConfirmModal } from '@/shared/components/DeleteConfirmModal'
import type { FloorRoom, FloorWall, PanelOffset } from '../../types'
import { PanelFrame } from '../shared/PanelFrame'
import { BubbleAttributePanel } from './BubbleAttributePanel'
import { ThreeDAttributePanel } from './ThreeDAttributePanel'
import { TwoDAttributePanel } from './TwoDAttributePanel'
import type {
  AttributesSectionProps,
  FloorViewSectionProps,
  HierarchySectionProps,
} from '../layout/right-panels/buildRightPanelSectionProps'

const EMPTY_FLOOR_ROOMS: FloorRoom[] = []
const EMPTY_FLOOR_WALLS: FloorWall[] = []
const EMPTY_FLOOR_OPENINGS: NonNullable<HierarchySectionProps['openings']> = []

interface InspectorPanelProps {
  attributesPanelProps: AttributesSectionProps
  floorViewPanelProps: FloorViewSectionProps | null
  hierarchyPanelProps: HierarchySectionProps | null
}

interface InspectorSectionProps {
  title: string
  icon: ReactNode
  children: ReactNode
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
    if (Math.abs(x - left) > AXIS_TOLERANCE && Math.abs(x - right) > AXIS_TOLERANCE) return false
    return rangesOverlap(Math.min(wall.start.y, wall.end.y), Math.max(wall.start.y, wall.end.y), top, bottom)
  }

  if (Math.abs(dy) <= AXIS_TOLERANCE) {
    const y = wall.start.y
    if (Math.abs(y - top) > AXIS_TOLERANCE && Math.abs(y - bottom) > AXIS_TOLERANCE) return false
    return rangesOverlap(Math.min(wall.start.x, wall.end.x), Math.max(wall.start.x, wall.end.x), left, right)
  }

  return false
}

function InspectorSection({ title, icon, children }: InspectorSectionProps) {
  return (
    <section className="rounded-lg border border-[#E2E8F0] bg-white shadow-sm">
      <div className="flex items-center gap-1.5 border-b border-[#EEF2F7] px-2.5 py-1.5">
        <span className="text-[#3B45B3]">{icon}</span>
        <h3 className="text-[11px] font-extrabold text-[#1F2937]">{title}</h3>
      </div>
      <div className="p-2 text-[11px]">{children}</div>
    </section>
  )
}

function AttributeSection(props: AttributesSectionProps) {
  if (props.mode === 'bubble') {
    return (
      <BubbleAttributePanel
        selectedBubble={props.selectedBubble}
        onLabelChange={props.onLabelChange}
        onTypeChange={props.onTypeChange}
        onWidthChange={props.onWidthChange}
        onHeightChange={props.onHeightChange}
        onRatioChange={props.onRatioChange}
        onColorChange={props.onColorChange}
        connections={props.connections}
        zones={props.zones}
      />
    )
  }

  if (props.mode === '2d') {
    return (
      <TwoDAttributePanel
        selectedBubble={props.selectedBubble}
        selectedWall={props.selectedWall}
        selectedOpening={props.selectedOpening}
        onLabelChange={props.onLabelChange}
        onTypeChange={props.onTypeChange}
        onWidthChange={props.onWidthChange}
        onHeightChange={props.onHeightChange}
        onWidthCommit={props.onWidthCommit}
        onHeightCommit={props.onHeightCommit}
        onRatioChange={props.onRatioChange}
        onWallTypeChange={props.onWallTypeChange}
        onWallThicknessChange={props.onWallThicknessChange}
        onWallHeightChange={props.onWallHeightChange}
        onWallMaterialChange={props.onWallMaterialChange}
        onOpeningSizeChange={props.onOpeningSizeChange}
        onWindowSillHeightChange={props.onWindowSillHeightChange}
        onDoorSwingDirectionChange={props.onDoorSwingDirectionChange}
        onDoorHingeSideChange={props.onDoorHingeSideChange}
      />
    )
  }

  return (
    <ThreeDAttributePanel
      selectedBubble={props.selectedBubble}
      selectedIfcElement={props.selectedIfcElement}
      isEditingLocked={props.isThreeDEditingLocked}
      onLabelChange={props.onLabelChange}
      onWidthChange={props.onWidthChange}
      onHeightChange={props.onHeightChange}
      onThicknessChange={props.onThicknessChange}
      onPositionChange={props.onPositionChange}
      onRotationChange={props.onRotationChange}
      onRoofShapeChange={props.onRoofShapeChange}
      onColorChange={props.onColorChange}
      onMaterialChange={props.onMaterialChange}
    />
  )
}

function FloorViewSection({ panelProps }: { panelProps: FloorViewSectionProps | null }) {
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [pendingDeleteLayer, setPendingDeleteLayer] = useState<{ id: string; name: string } | null>(null)
  const layers = panelProps?.layers ?? []
  const hasLayerData = layers.length > 0
  const selectedOverlaySet = new Set(panelProps?.selectedOverlayLayerIds ?? [])
  const canDeleteAnyLayer = layers.length > 1

  if (!panelProps) return <p className="text-[11px] text-[#94A3B8]">층 정보가 없습니다.</p>

  const cancelRenameLayer = () => {
    setEditingLayerId(null)
    setEditingName('')
  }

  const commitRenameLayer = (layerId: string) => {
    panelProps.onRenameLayer?.(layerId, editingName)
    cancelRenameLayer()
  }

  const handleDeleteLayer = (layerId: string, name: string) => {
    if (!canDeleteAnyLayer) return
    setPendingDeleteLayer({ id: layerId, name })
  }

  const closeDeleteLayerModal = () => {
    setPendingDeleteLayer(null)
  }

  const confirmDeleteLayer = () => {
    if (!pendingDeleteLayer) return
    panelProps.onDeleteLayer?.(pendingDeleteLayer.id)
    closeDeleteLayerModal()
  }

  if (!panelProps.isGenerated && !hasLayerData) {
    return <p className="py-2 text-center text-[11px] text-[#94A3B8]">평면도를 먼저 생성하세요.</p>
  }

  return (
    <>
      <div className="space-y-2">
        {layers.map((layer, index) => {
        const isActive = panelProps.activeLayerId === layer.id
        const isOverlaySelected = selectedOverlaySet.has(layer.id)
        const opacity = panelProps.overlayOpacityByLayerId?.[layer.id] ?? 0.35
        const displayName = layer.name || `${index + 1}F`
        const isEditing = editingLayerId === layer.id

        return (
          <div
            key={layer.id}
            className={`rounded-md border px-2 py-1.5 ${
              isActive ? 'border-[#C8D2FF] bg-[#F4F6FF]' : 'border-[#EEF2F7] bg-[#FCFDFF]'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => panelProps.onSelectLayer?.(layer.id)} className="min-w-0 flex-1 text-left">
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
                  <p className={`truncate text-[11px] font-bold ${isActive ? 'text-[#3B45B3]' : 'text-[#334155]'}`}>
                    {displayName}
                  </p>
                )}
                <p className="text-[9px] text-[#94A3B8]">{isActive ? '활성 층' : '비활성 층'}</p>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (isActive) return
                  if (panelProps.isLayerOverlayMode) {
                    panelProps.onToggleOverlayLayer?.(layer.id)
                    return
                  }
                  panelProps.onSelectSingleOverlayLayer?.(layer.id)
                }}
                disabled={isActive}
                className={`rounded p-1 ${
                  isActive
                    ? 'cursor-not-allowed text-[#3B45B3]'
                    : isOverlaySelected
                      ? 'bg-[#3B45B3] text-white'
                      : 'text-[#64748B] hover:bg-[#EEF2FF] hover:text-[#3B45B3]'
                }`}
                aria-label="층 겹쳐보기"
              >
                {isActive || isOverlaySelected ? <Eye size={12} /> : <EyeOff size={12} />}
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingLayerId(layer.id)
                  setEditingName(displayName)
                }}
                className="rounded p-1 text-[#64748B] hover:bg-[#EEF2FF] hover:text-[#3B45B3]"
                aria-label="층 이름 수정"
              >
                <Pencil size={12} />
              </button>

              <button
                type="button"
                onClick={() => handleDeleteLayer(layer.id, displayName)}
                disabled={!canDeleteAnyLayer}
                className={`rounded p-1 ${
                  canDeleteAnyLayer
                    ? 'text-[#B56A6A] hover:bg-[#FDEEEE] hover:text-[#C23E3E]'
                    : 'cursor-not-allowed text-[#CBD5E1]'
                }`}
                aria-label="층 삭제"
              >
                <Trash2 size={12} />
              </button>
            </div>

            {panelProps.isLayerOverlayMode && !isActive && isOverlaySelected && (
              <div className="mt-2 flex items-center gap-2">
                <span className="w-10 text-[9px] text-[#8E95A3]">투명도</span>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={Math.round(opacity * 100)}
                  onChange={(e) => panelProps.onChangeOverlayLayerOpacity?.(layer.id, Number(e.target.value) / 100)}
                  className="h-1.5 flex-1 accent-[#3B45B3]"
                />
                <span className="w-8 text-right text-[9px] font-bold text-[#6F7C96]">{Math.round(opacity * 100)}%</span>
              </div>
            )}
          </div>
        )
        })}

      <div className="flex items-center justify-between rounded-md bg-[#F8FAFC] px-2 py-1.5">
        <span className="text-[10px] font-bold text-[#4B5873]">층 겹쳐보기</span>
        <button
          type="button"
          onClick={panelProps.onToggleLayerOverlayMode}
          className={`rounded p-1 ${
            panelProps.isLayerOverlayMode
              ? 'bg-[#3B45B3] text-white'
              : 'text-[#64748B] hover:bg-[#EEF2FF] hover:text-[#3B45B3]'
          }`}
          aria-label="층 겹쳐보기 토글"
        >
          {panelProps.isLayerOverlayMode ? <Eye size={12} /> : <EyeOff size={12} />}
        </button>
      </div>

        <button
          type="button"
          onClick={panelProps.onAddLayer}
          className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-[#CBD5E1] py-1.5 text-[11px] font-bold text-[#64748B] hover:border-[#3B45B3] hover:text-[#3B45B3]"
        >
          <Plus size={12} />
          새 층 추가
        </button>
      </div>
      <DeleteConfirmModal
        isOpen={pendingDeleteLayer !== null}
        title="층 삭제"
        message={`"${pendingDeleteLayer?.name ?? ''}" 층을 삭제하시겠습니까?`}
        onClose={closeDeleteLayerModal}
        onConfirm={confirmDeleteLayer}
      />
    </>
  )
}

function HierarchySection({ panelProps }: { panelProps: HierarchySectionProps | null }) {
  const rooms = panelProps?.rooms ?? EMPTY_FLOOR_ROOMS
  const walls = panelProps?.walls ?? EMPTY_FLOOR_WALLS
  const openings = panelProps?.openings ?? EMPTY_FLOOR_OPENINGS
  const selectedRoomId = panelProps?.selectedRoomId ?? null
  const [expandedRoomIds, setExpandedRoomIds] = useState<string[]>([])
  const [showSelectedRoomOnly, setShowSelectedRoomOnly] = useState(false)

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
    const map = new Map<string, typeof openings>()
    rooms.forEach((room) => {
      const wallIdSet = roomWallIdSetByBubbleId.get(room.bubbleId) ?? new Set<string>()
      map.set(room.bubbleId, openings.filter((opening) => wallIdSet.has(opening.wallId)))
    })
    return map
  }, [rooms, openings, roomWallIdSetByBubbleId])

  const hierarchyRooms = useMemo(() => {
    if (!showSelectedRoomOnly || !selectedRoomId) return rooms
    return rooms.filter((room) => room.bubbleId === selectedRoomId)
  }, [rooms, selectedRoomId, showSelectedRoomOnly])

  const toggleRoomExpand = (bubbleId: string) => {
    setExpandedRoomIds((prev) =>
      prev.includes(bubbleId) ? prev.filter((id) => id !== bubbleId) : [...prev, bubbleId],
    )
  }

  if (!panelProps) return <p className="text-[11px] text-[#94A3B8]">계층 구조 정보가 없습니다.</p>

  if (rooms.length === 0) {
    return <p className="py-2 text-center text-[11px] text-[#94A3B8]">표시할 Room이 없습니다.</p>
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setExpandedRoomIds(rooms.map((room) => room.bubbleId))}
          className="flex-1 rounded-md bg-[#F8FAFC] px-2 py-1 text-[10px] font-bold text-[#4B5873] hover:bg-[#EEF2FF]"
        >
          전체 펼침
        </button>
        <button
          type="button"
          onClick={() => setExpandedRoomIds([])}
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

      {hierarchyRooms.map((room) => {
        const isExpanded = expandedRoomIds.includes(room.bubbleId)
        const isSelected = selectedRoomId === room.bubbleId
        const roomOpenings = roomOpeningsByBubbleId.get(room.bubbleId) ?? []

        return (
          <div key={room.id} className="rounded-md px-1 py-1">
            <button
              type="button"
              onClick={() => {
                toggleRoomExpand(room.bubbleId)
                panelProps.onSelectRoom?.(room.bubbleId)
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
                {room.connectedIds.map((connectedId, index) => (
                  <div key={`${room.id}-connected-${connectedId}`} className="flex items-center gap-2 py-1">
                    <Minus size={12} className="text-[#66758C]" />
                    <span className="text-[10px] font-bold text-[#4E5C73]">
                      {roomLabelByBubbleId.get(connectedId) ?? connectedId}
                      {room.connectedIds.length > 1 ? `_${String(index + 1).padStart(2, '0')}` : ''}
                    </span>
                  </div>
                ))}

                {roomOpenings.map((opening, index) => (
                  <div key={opening.id} className="flex items-center gap-2 py-1">
                    <DoorOpen size={12} className="text-[#5A6982]" />
                    <span className="text-[10px] font-semibold text-[#4E5C73]">
                      {opening.type === 'door' ? '문' : '창'}_{String(index + 1).padStart(2, '0')}
                    </span>
                  </div>
                ))}

                {room.connectedIds.length === 0 && roomOpenings.length === 0 && (
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

export function InspectorPanel({
  attributesPanelProps,
  floorViewPanelProps,
  hierarchyPanelProps,
}: InspectorPanelProps) {
  const inspectorOffset: PanelOffset = attributesPanelProps.offset
  const inspectorWidth = Math.max(attributesPanelProps.width, 320)

  return (
    <PanelFrame
      panelKey="attributes"
      title="속성 패널"
      titleIcon={<SlidersHorizontal size={14} className="text-[#3B45B3]" />}
      isOpen={attributesPanelProps.isOpen}
      offset={inspectorOffset}
      width={inspectorWidth}
      fillHeight
      zIndex={attributesPanelProps.zIndex}
      onDragStart={attributesPanelProps.onDragStart}
      onResizeStart={attributesPanelProps.onResizeStart}
      onToggle={attributesPanelProps.onToggle}
    >
      <div className="h-full min-h-0 overflow-y-auto bg-[#F8FAFC] p-2.5 pb-3">
        <div className="space-y-2.5">
          <InspectorSection title="속성" icon={<SlidersHorizontal size={13} />}>
            <AttributeSection {...attributesPanelProps} />
          </InspectorSection>
          <InspectorSection title="층 보기" icon={<Layers size={13} />}>
            <FloorViewSection panelProps={floorViewPanelProps} />
          </InspectorSection>
          <InspectorSection title="계층 구조" icon={<Box size={13} />}>
            <HierarchySection panelProps={hierarchyPanelProps} />
          </InspectorSection>
        </div>
      </div>
    </PanelFrame>
  )
}

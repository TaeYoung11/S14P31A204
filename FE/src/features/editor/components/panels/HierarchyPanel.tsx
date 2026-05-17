import type { MouseEvent as ReactMouseEvent } from 'react'
import { Box, ChevronRight, Eye } from 'lucide-react'
import type { FloorLayer, FloorOpening, FloorRoom, FloorWall, PanelKey, PanelOffset, PanelResizeAxis } from '../../types'
import { PanelFrame } from '../shared/PanelFrame'
import { buildHierarchyGroups, type HierarchyGroup } from './hierarchyPanelData'

// ── Props ─────────────────────────────────────────────────────────────────────

interface HierarchyPanelProps {
  isOpen: boolean
  offset: PanelOffset
  width: number
  height: number
  zIndex?: number
  onDragStart: (key: PanelKey, e: ReactMouseEvent<HTMLElement>) => void
  onResizeStart: (key: PanelKey, axis: PanelResizeAxis, e: ReactMouseEvent<HTMLButtonElement>) => void
  onToggle: (key: PanelKey) => void
  floorRooms?: FloorRoom[]
  floorWalls?: FloorWall[]
  floorOpenings?: FloorOpening[]
  floorLayers?: FloorLayer[]
  activeFloorLayerId?: string | null
  ifcElementHierarchy?: unknown
  groups?: HierarchyGroup[]
}

/**
 * 3D 뷰어 계층 구조 패널
 * 실제 에디터 상태(rooms/walls/openings/ifc hierarchy) 기반 계층을 표시한다.
 */
export function HierarchyPanel({
  isOpen,
  offset,
  width,
  height,
  zIndex,
  onDragStart,
  onResizeStart,
  onToggle,
  floorRooms,
  floorWalls,
  floorOpenings,
  floorLayers,
  activeFloorLayerId,
  ifcElementHierarchy,
  groups,
}: HierarchyPanelProps) {
  const hierarchyGroups = groups ?? buildHierarchyGroups({
    floorRooms,
    floorWalls,
    floorOpenings,
    floorLayers,
    activeFloorLayerId,
    ifcElementHierarchy,
  })

  return (
    <PanelFrame
      panelKey="hierarchy"
      title="계층구조"
      titleIcon={<Box size={14} className="text-[#3B45B3]" />}
      isOpen={isOpen}
      offset={offset}
      width={width}
      height={height}
      zIndex={zIndex}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onToggle={onToggle}
    >
      <div className="p-4 flex flex-col gap-3">
        {hierarchyGroups.length === 0 ? (
          <p className="px-2 py-3 text-center text-[10px] text-[#ADB5BD]">표시할 계층 구조가 없습니다.</p>
        ) : (
          hierarchyGroups.map((group) => (
            <div key={group.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between group cursor-pointer hover:bg-[#F8F9FD] p-1 rounded-md transition-colors">
                <div className="flex items-center gap-1.5 min-w-0">
                  <ChevronRight size={12} className="text-[#ADB5BD] group-hover:text-[#3B45B3] transition-colors" />
                  <span className="text-[11px] font-black text-[#1C1C1E] truncate">{group.name}</span>
                </div>
                <Eye size={12} className="text-[#ADB5BD] hover:text-[#3B45B3] transition-colors" />
              </div>

              <div className="ml-4 pl-3 border-l border-[#F0F2F9] flex flex-col gap-1.5 mt-1">
                {group.children.map((child) => (
                  <div
                    key={`${group.id}-${child.id}`}
                    className="flex items-center justify-between group/item cursor-pointer hover:bg-[#F8F9FD] px-2 py-0.5 rounded-sm transition-colors"
                  >
                    <span className="text-[10px] font-bold text-[#6B7A99] group-hover/item:text-[#3B45B3]">{child.label}</span>
                    <Eye size={10} className="text-[#E2E6EF] group-hover/item:text-[#ADB5BD]" />
                  </div>
                ))}
                {group.children.length === 0 && (
                  <p className="px-2 py-0.5 text-[9px] text-[#A3ACBA]">하위 요소 없음</p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </PanelFrame>
  )
}

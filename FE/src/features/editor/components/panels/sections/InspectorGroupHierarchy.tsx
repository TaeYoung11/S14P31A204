import { Eye } from 'lucide-react'
import type { HierarchySectionProps } from '../../layout/right-panels/buildRightPanelSectionProps'
import type { HierarchyGroup } from '../hierarchyPanelData'

interface InspectorGroupHierarchyProps {
  panelProps: HierarchySectionProps
  groups: HierarchyGroup[]
  selectedRoomId: string | null
  selectedFloorWallId: string | null
  selectedFloorOpeningId: string | null
  onSelectRoomByAnyId: (roomId: string) => void
}

/** Room tree로 묶을 수 없는 일반 hierarchy group 목록을 렌더링한다. */
export function InspectorGroupHierarchy({
  panelProps,
  groups,
  selectedRoomId,
  selectedFloorWallId,
  selectedFloorOpeningId,
  onSelectRoomByAnyId,
}: InspectorGroupHierarchyProps) {
  return (
    <div className="space-y-2">
      {groups.map((group) => (
        <div key={group.id}>
          <div className="flex items-center justify-between rounded-md bg-[#F8FAFC] px-2 py-1">
            <span className="truncate text-[11px] font-extrabold text-[#334155]">{group.name}</span>
            <Eye size={11} className="text-[#94A3B8]" />
          </div>
          <div className="ml-2 mt-1 space-y-1 border-l border-[#E2E8F0] pl-2">
            {group.children.map((child) => {
              const isSelectedRoom = group.id === 'rooms' && selectedRoomId === child.id
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
                      onSelectRoomByAnyId(child.id)
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

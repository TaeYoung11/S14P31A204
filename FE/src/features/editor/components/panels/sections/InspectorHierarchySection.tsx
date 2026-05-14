import { Eye } from 'lucide-react'
import type { HierarchySectionProps } from '../../layout/right-panels/buildRightPanelSectionProps'
import { buildHierarchyGroups } from '../hierarchyPanelData'

interface InspectorHierarchySectionProps {
  panelProps: HierarchySectionProps | null
}

/**
 * 인스펙터의 계층 구조 섹션.
 */
export function InspectorHierarchySection({ panelProps }: InspectorHierarchySectionProps) {
  if (!panelProps) {
    return <p className="text-[11px] text-[#94A3B8]">계층 정보가 없습니다.</p>
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

  return (
    <div className="space-y-2">
      {hierarchyGroups.map((group) => (
        <div key={group.id}>
          <div className="flex items-center justify-between rounded-md bg-[#F8FAFC] px-2 py-1">
            <span className="truncate text-[11px] font-extrabold text-[#334155]">{group.name}</span>
            <Eye size={11} className="text-[#94A3B8]" />
          </div>
          <div className="ml-2 mt-1 space-y-1 border-l border-[#E2E8F0] pl-2">
            {group.children.map((child) => (
              <div key={`${group.id}-${child.id}`} className="flex items-center justify-between rounded px-1.5 py-0.5 text-[10px] text-[#64748B]">
                <span className="truncate">{child.label}</span>
                <Eye size={10} className="text-[#CBD5E1]" />
              </div>
            ))}
            {group.children.length === 0 && (
              <p className="px-1.5 py-0.5 text-[10px] text-[#94A3B8]">하위 요소 없음</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

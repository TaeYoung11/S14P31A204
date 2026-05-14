import { Eye } from 'lucide-react'
import type { HierarchySectionProps } from '../../layout/right-panels/buildRightPanelSectionProps'

interface InspectorHierarchySectionProps {
  panelProps: HierarchySectionProps | null
}

const HIERARCHY_GROUPS = [
  { id: 'ext', name: '외피 요소', children: ['벽체-01', '벽체-02', '창호-01'] },
  { id: 'int', name: '실내 공간', children: ['거실', '주방', '침실'] },
  { id: 'roof', name: '상부 구조', children: ['지붕-A'] },
]

/**
 * 인스펙터의 계층 구조 섹션.
 * 현재는 샘플 그룹을 표시하고, 실제 계층 데이터 연동 시 이 컴포넌트만 교체한다.
 */
export function InspectorHierarchySection({ panelProps }: InspectorHierarchySectionProps) {
  if (!panelProps) {
    return <p className="text-[11px] text-[#94A3B8]">계층 정보가 없습니다.</p>
  }

  return (
    <div className="space-y-2">
      {HIERARCHY_GROUPS.map((group) => (
        <div key={group.id}>
          <div className="flex items-center justify-between rounded-md bg-[#F8FAFC] px-2 py-1">
            <span className="truncate text-[11px] font-extrabold text-[#334155]">{group.name}</span>
            <Eye size={11} className="text-[#94A3B8]" />
          </div>
          <div className="ml-2 mt-1 space-y-1 border-l border-[#E2E8F0] pl-2">
            {group.children.map((child) => (
              <div key={child} className="flex items-center justify-between rounded px-1.5 py-0.5 text-[10px] text-[#64748B]">
                <span className="truncate">{child}</span>
                <Eye size={10} className="text-[#CBD5E1]" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}


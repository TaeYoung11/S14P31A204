import type { MouseEvent as ReactMouseEvent } from 'react'
import { Box, ChevronRight, Eye } from 'lucide-react'
import type { PanelKey, PanelOffset, PanelResizeAxis } from '../../types'
import { PanelFrame } from '../shared/PanelFrame'

// ── 정적 계층 데이터 (추후 API 연동 예정) ────────────────────────────────────

interface HierarchyGroup {
  id: string
  name: string
  children: string[]
}

const HIERARCHY_ITEMS: HierarchyGroup[] = [
  { id: 'ext', name: '외벽 구조', children: ['벽체-01', '벽체-02', '창호-01'] },
  { id: 'int', name: '내부 공간', children: ['거실', '주방', '침실'] },
  { id: 'roof', name: '지붕 상세', children: ['박공지붕-A'] },
]

// ── Props ─────────────────────────────────────────────────────────────────────

interface HierarchyPanelProps {
  isOpen: boolean
  offset: PanelOffset
  width: number
  height: number
  onDragStart: (key: PanelKey, e: ReactMouseEvent<HTMLButtonElement>) => void
  onResizeStart: (key: PanelKey, axis: PanelResizeAxis, e: ReactMouseEvent<HTMLButtonElement>) => void
  onToggle: (key: PanelKey) => void
}

/**
 * 3D 뷰어 계층 구조 패널
 * 건물 요소(외벽·내부 공간·지붕)를 트리 형태로 표시.
 * 현재는 정적 목업 데이터를 렌더링하며, 추후 실제 모델 데이터와 연동 예정.
 */
export function HierarchyPanel({
  isOpen,
  offset,
  width,
  height,
  onDragStart,
  onResizeStart,
  onToggle,
}: HierarchyPanelProps) {
  return (
    <PanelFrame
      panelKey="hierarchy"
      title="계층구조"
      titleIcon={<Box size={14} className="text-[#3B45B3]" />}
      isOpen={isOpen}
      offset={offset}
      width={width}
      height={height}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onToggle={onToggle}
    >
      <div className="p-4 flex flex-col gap-3">
        {HIERARCHY_ITEMS.map((group) => (
          <div key={group.id} className="flex flex-col gap-1">
            {/* 그룹 헤더 */}
            <div className="flex items-center justify-between group cursor-pointer hover:bg-[#F8F9FD] p-1 rounded-md transition-colors">
              <div className="flex items-center gap-1.5 min-w-0">
                <ChevronRight size={12} className="text-[#ADB5BD] group-hover:text-[#3B45B3] transition-colors" />
                <span className="text-[11px] font-black text-[#1C1C1E] truncate">{group.name}</span>
              </div>
              <Eye size={12} className="text-[#ADB5BD] hover:text-[#3B45B3] transition-colors" />
            </div>

            {/* 자식 항목 */}
            <div className="ml-4 pl-3 border-l border-[#F0F2F9] flex flex-col gap-1.5 mt-1">
              {group.children.map((child) => (
                <div
                  key={child}
                  className="flex items-center justify-between group/item cursor-pointer hover:bg-[#F8F9FD] px-2 py-0.5 rounded-sm transition-colors"
                >
                  <span className="text-[10px] font-bold text-[#6B7A99] group-hover/item:text-[#3B45B3]">{child}</span>
                  <Eye size={10} className="text-[#E2E6EF] group-hover/item:text-[#ADB5BD]" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </PanelFrame>
  )
}

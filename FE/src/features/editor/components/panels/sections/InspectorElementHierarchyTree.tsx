import { ChevronDown, ChevronRight, Eye, EyeOff, Search } from 'lucide-react'
import type { HierarchySectionProps } from '../../layout/right-panels/buildRightPanelSectionProps'
import type { ElementHierarchyNode } from '../../../types'
import { countElementNodes } from './inspectorHierarchySection.utils'

interface InspectorElementHierarchyTreeProps {
  panelProps: HierarchySectionProps
  nodes: ElementHierarchyNode[]
  searchQuery: string
  selectedElementId: string | null
  hiddenElementIdSet: Set<string>
  expandedNodeIds: string[]
  collapsedNodeIds: string[]
  onSearchQueryChange: (value: string) => void
  onToggleExpand: (nodeId: string, isExpanded: boolean) => void
}

/** IFC/라이브러리 element registry 기반 계층 트리를 렌더링한다. */
export function InspectorElementHierarchyTree({
  panelProps,
  nodes,
  searchQuery,
  selectedElementId,
  hiddenElementIdSet,
  expandedNodeIds,
  collapsedNodeIds,
  onSearchQueryChange,
  onToggleExpand,
}: InspectorElementHierarchyTreeProps) {
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
    const isSearching = searchQuery.trim().length > 0
    const isAutoExpanded = depth < 2 && !collapsedNodeIds.includes(node.id)
    const isExpanded = isSearching || expandedNodeIds.includes(node.id) || isAutoExpanded
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
            onClick={() => hasChildren && onToggleExpand(node.id, isExpanded)}
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

  return (
    <div className="space-y-2">
      <div className="flex h-7 items-center gap-1.5 rounded-md border border-[#E2E8F0] bg-white px-2">
        <Search size={11} className="shrink-0 text-[#94A3B8]" />
        <input
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="요소 검색"
          className="min-w-0 flex-1 bg-transparent text-[10px] font-semibold text-[#334155] outline-none placeholder:text-[#94A3B8]"
        />
        <span className="shrink-0 text-[9px] font-bold text-[#94A3B8]">
          {panelProps.elementRegistry?.elements.length ?? 0}
        </span>
      </div>
      {nodes.length > 0 ? (
        <div className="space-y-0.5">
          {nodes.map((node) => renderElementTreeNode(node))}
        </div>
      ) : (
        <p className="py-2 text-center text-[11px] text-[#94A3B8]">검색 결과가 없습니다.</p>
      )}
    </div>
  )
}

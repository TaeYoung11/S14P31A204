// 속성, 층 보기, 계층 구조를 하나의 컴팩트 인스펙터로 표시합니다.
import { Box, Layers, SlidersHorizontal } from 'lucide-react'
import { PanelFrame } from '../shared/PanelFrame'
import { BubbleFloorSection, type BubbleFloorSectionProps } from './sections/BubbleFloorSection'
import { InspectorFloorViewSection } from './sections/InspectorFloorViewSection'
import { InspectorHierarchySection } from './sections/InspectorHierarchySection'
import { InspectorSectionFrame } from './sections/InspectorSectionFrame'
import { ModeAwareAttributeSection } from './sections/ModeAwareAttributeSection'
import type {
  AttributesSectionProps,
  FloorViewSectionProps,
  HierarchySectionProps,
} from '../layout/right-panels/buildRightPanelSectionProps'
import { resolveInspectorPanelLayout } from '../../utils/inspectorPanelLayout'

interface InspectorPanelProps {
  attributesPanelProps: AttributesSectionProps
  floorViewPanelProps: FloorViewSectionProps | null
  hierarchyPanelProps: HierarchySectionProps | null
  bubbleFloorSectionProps: BubbleFloorSectionProps
}

function AttributeSection(props: AttributesSectionProps) {
  return <ModeAwareAttributeSection {...props} />
}

export function InspectorPanel({
  attributesPanelProps,
  floorViewPanelProps,
  hierarchyPanelProps,
  bubbleFloorSectionProps,
}: InspectorPanelProps) {
  const inspectorLayout = resolveInspectorPanelLayout({
    offset: attributesPanelProps.offset,
    width: attributesPanelProps.width,
    height: attributesPanelProps.height,
  })

  return (
    <PanelFrame
      panelKey="attributes"
      title="인스펙터"
      titleIcon={<SlidersHorizontal size={14} className="text-[#3B45B3]" />}
      isOpen={attributesPanelProps.isOpen}
      offset={inspectorLayout.offset}
      width={inspectorLayout.width}
      height={inspectorLayout.height}
      zIndex={attributesPanelProps.zIndex}
      onDragStart={attributesPanelProps.onDragStart}
      onResizeStart={attributesPanelProps.onResizeStart}
      onToggle={attributesPanelProps.onToggle}
    >
      <div className="h-full min-h-0 overflow-y-auto bg-[#F8FAFC] p-2.5 pb-3">
        <div className="space-y-2.5">
          <InspectorSectionFrame title="속성 관리자" icon={<SlidersHorizontal size={13} />}>
            <AttributeSection {...attributesPanelProps} />
          </InspectorSectionFrame>
          <InspectorSectionFrame title="층 보기" icon={<Layers size={13} />}>
            {attributesPanelProps.mode === 'bubble'
              ? <BubbleFloorSection {...bubbleFloorSectionProps} />
              : <InspectorFloorViewSection panelProps={floorViewPanelProps} />}
          </InspectorSectionFrame>
          <InspectorSectionFrame title="계층 구조" icon={<Box size={13} />}>
            <InspectorHierarchySection panelProps={hierarchyPanelProps} />
          </InspectorSectionFrame>
        </div>
      </div>
    </PanelFrame>
  )
}

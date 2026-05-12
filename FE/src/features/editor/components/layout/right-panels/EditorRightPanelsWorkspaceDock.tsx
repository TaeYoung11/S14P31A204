import type { EditorRightPanelsProps } from './EditorRightPanels.types'
import {
  BubbleModePanelSection,
} from './EditorRightPanelsPanelSections'
import {
  buildAttributesSectionProps,
  buildFloorViewSectionProps,
  buildHierarchySectionProps,
  buildZoningSectionProps,
} from './buildRightPanelSectionProps'
import { InspectorPanel } from '../../panels/InspectorPanel'

interface WorkspaceDockProps {
  rightDockWidth: number
  props: EditorRightPanelsProps
}

/** 작업 패널을 캔버스 위 부유 패널로 표시합니다. */
export default function EditorRightPanelsWorkspaceDock({ rightDockWidth, props }: WorkspaceDockProps) {
  const attributesPanelProps = buildAttributesSectionProps(props)
  const zoningPanelProps = buildZoningSectionProps(props)
  const floorViewPanelProps = buildFloorViewSectionProps(props)
  const hierarchyPanelProps = buildHierarchySectionProps(props)

  return (
    <div
      className="relative z-[120] flex h-full min-h-0 shrink-0 flex-col gap-4 overflow-visible transition-[width] duration-200"
      style={{ width: Math.max(rightDockWidth, 320) }}
    >
      <InspectorPanel
        attributesPanelProps={attributesPanelProps}
        floorViewPanelProps={floorViewPanelProps}
        hierarchyPanelProps={hierarchyPanelProps}
      />
      <BubbleModePanelSection panelProps={zoningPanelProps} />
    </div>
  )
}

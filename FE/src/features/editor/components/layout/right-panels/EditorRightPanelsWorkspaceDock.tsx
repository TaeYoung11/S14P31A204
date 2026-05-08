import { RotateCcw } from 'lucide-react'
import type { EditorRightPanelsProps } from './EditorRightPanels.types'
import {
  AssistantPanelSection,
  AttributesPanelSection,
  BubbleModePanelSection,
  ThreeDModePanelSection,
} from './EditorRightPanelsPanelSections'
import {
  buildAssistantSectionProps,
  buildAttributesSectionProps,
  buildFloorViewSectionProps,
  buildHierarchySectionProps,
  buildZoningSectionProps,
} from './buildRightPanelSectionProps'

interface WorkspaceDockProps {
  rightDockWidth: number
  props: EditorRightPanelsProps
}

/**
 * 일반 편집 모드 우측 도크
 * - 속성/조닝/층/계층/어시스턴트 패널을 모드에 맞춰 조합한다.
 */
export default function EditorRightPanelsWorkspaceDock({ rightDockWidth, props }: WorkspaceDockProps) {
  const attributesPanelProps = buildAttributesSectionProps(props)
  const zoningPanelProps = buildZoningSectionProps(props)
  const floorViewPanelProps = buildFloorViewSectionProps(props)
  const hierarchyPanelProps = buildHierarchySectionProps(props)
  const assistantPanelProps = buildAssistantSectionProps(props)

  return (
    <div
      className="relative z-30 flex max-h-[calc(100vh-160px)] min-h-0 shrink-0 flex-col gap-4 overflow-x-hidden overflow-y-auto pb-4 transition-[width] duration-200"
      style={{ width: rightDockWidth }}
    >
      <button
        type="button"
        onClick={props.onResetPanelPositions}
        className="absolute right-1 top-1 z-20 flex h-8 w-8 items-center justify-center rounded-xl border border-[#DFE4F0] bg-white/95 text-[#6F7C96] shadow-sm transition-colors hover:bg-[#F3F6FD] hover:text-[#3B45B3]"
        title="패널 위치 초기화"
        aria-label="패널 위치 초기화"
      >
        <RotateCcw size={13} />
      </button>

      <AttributesPanelSection panelProps={attributesPanelProps} />
      <BubbleModePanelSection panelProps={zoningPanelProps} />
      <ThreeDModePanelSection floorViewPanelProps={floorViewPanelProps} hierarchyPanelProps={hierarchyPanelProps} />
      <AssistantPanelSection panelProps={assistantPanelProps} />
    </div>
  )
}

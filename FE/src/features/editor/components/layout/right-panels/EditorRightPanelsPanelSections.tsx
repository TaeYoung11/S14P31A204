import { AssistantPanel } from '../../panels/AssistantPanel'
import { AttributesPanel } from '../../panels/AttributesPanel'
import { FloorViewPanel } from '../../panels/FloorViewPanel'
import { HierarchyPanel } from '../../panels/HierarchyPanel'
import type {
  AssistantSectionProps,
  AttributesSectionProps,
  FloorViewSectionProps,
  HierarchySectionProps,
} from './buildRightPanelSectionProps'

interface AttributesPanelSectionProps {
  panelProps: AttributesSectionProps
}
interface ThreeDModePanelSectionProps {
  floorViewPanelProps: FloorViewSectionProps | null
  hierarchyPanelProps: HierarchySectionProps | null
}
interface AssistantPanelSectionProps {
  panelProps: AssistantSectionProps | null
}

/**
 * 공통 속성 패널 섹션
 */
export function AttributesPanelSection({ panelProps }: AttributesPanelSectionProps) {
  return <AttributesPanel {...panelProps} />
}

/**
 * 3D 모드 전용 층/계층 패널 섹션
 */
export function ThreeDModePanelSection({ floorViewPanelProps, hierarchyPanelProps }: ThreeDModePanelSectionProps) {
  if (!floorViewPanelProps || !hierarchyPanelProps) return null
  return (
    <>
      <FloorViewPanel {...floorViewPanelProps} />
      <HierarchyPanel {...hierarchyPanelProps} />
    </>
  )
}

/**
 * 어시스턴트 패널 섹션
 */
export function AssistantPanelSection({ panelProps }: AssistantPanelSectionProps) {
  if (!panelProps) return null
  return <AssistantPanel {...panelProps} />
}

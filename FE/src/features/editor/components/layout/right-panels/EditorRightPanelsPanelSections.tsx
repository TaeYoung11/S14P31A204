import { AssistantPanel } from '../../panels/AssistantPanel'
import { AttributesPanel } from '../../panels/AttributesPanel'
import { FloorViewPanel } from '../../panels/FloorViewPanel'
import { HierarchyPanel } from '../../panels/HierarchyPanel'
import { ZoningPanel } from '../../panels/ZoningPanel'
import type {
  AssistantSectionProps,
  AttributesSectionProps,
  FloorViewSectionProps,
  HierarchySectionProps,
  ZoningSectionProps,
} from './buildRightPanelSectionProps'

interface AttributesPanelSectionProps {
  panelProps: AttributesSectionProps
}
interface BubbleModePanelSectionProps {
  panelProps: ZoningSectionProps | null
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
 * 버블 모드 전용 조닝 패널 섹션
 */
export function BubbleModePanelSection({ panelProps }: BubbleModePanelSectionProps) {
  if (!panelProps) return null
  return <ZoningPanel {...panelProps} />
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

import type { EditorRightPanelProps } from '../types/editorRightPanelProps'
import { buildAssistantRightPanelProps } from './right-panel-props/buildAssistantRightPanelProps'
import { buildAttributeRightPanelProps } from './right-panel-props/buildAttributeRightPanelProps'
import { buildBubbleFloorRightPanelProps } from './right-panel-props/buildBubbleFloorRightPanelProps'
import { buildCollaborationRightPanelProps } from './right-panel-props/buildCollaborationRightPanelProps'
import { buildFloorLayerRightPanelProps } from './right-panel-props/buildFloorLayerRightPanelProps'
import { buildHierarchyRightPanelProps } from './right-panel-props/buildHierarchyRightPanelProps'
import { buildPanelLayoutRightPanelProps } from './right-panel-props/buildPanelLayoutRightPanelProps'
import type { RightPanelViewModel } from './right-panel-props/rightPanelPropsTypes'
import { buildZoningRightPanelProps } from './right-panel-props/buildZoningRightPanelProps'

/**
 * EditorPage ViewModel을 우측 패널 전용 props로 매핑한다.
 * 조합 컴포넌트는 배치/렌더링 책임만 갖고, 매핑 책임은 유틸로 분리한다.
 */
export function buildEditorRightPanelProps(vm: RightPanelViewModel): EditorRightPanelProps {
  return {
    ...buildPanelLayoutRightPanelProps(vm),
    ...buildCollaborationRightPanelProps(vm),
    ...buildAttributeRightPanelProps(vm),
    ...buildBubbleFloorRightPanelProps(vm),
    ...buildFloorLayerRightPanelProps(vm),
    ...buildHierarchyRightPanelProps(vm),
    ...buildZoningRightPanelProps(vm),
    ...buildAssistantRightPanelProps(vm),
  }
}

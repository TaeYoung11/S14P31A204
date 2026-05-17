import type { PanelOffset } from '../types'

interface InspectorPanelLayoutInput {
  offset: PanelOffset
  width: number
  height: number
}

interface InspectorPanelLayout {
  offset: PanelOffset
  width: number
  height: number
}

/**
 * 인스펙터 패널 최소 레이아웃을 계산한다.
 * 패널이 너무 작아져 내부 섹션이 깨지는 상황을 방지하기 위해 최소값을 강제한다.
 */
export function resolveInspectorPanelLayout(input: InspectorPanelLayoutInput): InspectorPanelLayout {
  return {
    offset: input.offset,
    width: Math.max(input.width, 320),
    height: Math.max(input.height, 560),
  }
}


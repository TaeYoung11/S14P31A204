import type { BubbleFloor, ConnectionStyle } from '../../types'

/**
 * 속성 패널이 표시하는 선택 버블의 핵심 데이터.
 * 패널 섹션 컴포넌트들이 동일 타입을 재사용하도록 분리한다.
 */
export interface BubbleInfo {
  id: string
  floor?: number
  label: string
  type: string
  widthMm: number
  heightMm: number
  ratio: number
  color: string
  material?: string
}

/** 선택 버블과 연결된 관계 정보. */
export interface BubbleConnectionInfo {
  targetId: string
  targetLabel: string
  style: ConnectionStyle
}

/** 선택 버블이 속한 조닝 요약 정보. */
export interface BubbleZoneInfo {
  id: string
  name: string
  color: string
  source?: 'auto' | 'manual'
}

/**
 * 기본 속성 편집 섹션에서 사용하는 액션 인터페이스.
 * 이벤트 핸들러 시그니처를 한 곳에서 관리해 섹션 간 일관성을 유지한다.
 */
export interface BubbleBasicFieldActions {
  onLabelChange: (id: string, label: string) => void
  onTypeChange: (id: string, type: string) => void
  onWidthChange: (id: string, width: number) => void
  onHeightChange: (id: string, height: number) => void
  onRatioChange: (id: string, ratio: number) => void
  onColorChange: (id: string, color: string) => void
  onFloorChange?: (id: string, floor: number) => void
}

/** 기본 속성 편집 섹션 입력 모델. */
export interface BubbleBasicFieldSectionModel extends BubbleBasicFieldActions {
  selectedBubble: BubbleInfo
  bubbleFloors: BubbleFloor[]
}


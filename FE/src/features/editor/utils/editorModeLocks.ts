import type { EditorMode, PhaseStatus } from '../types'

/**
 * 2D/3D 모드에서 변환 파이프라인이 진행 중(CONVERTING)인지 판별한다.
 * 이 상태에서는 조회성 상호작용만 허용하고 편집성 동작을 잠근다.
 */
export const isTwoDOrThreeDConverting = (
  phaseStatus: PhaseStatus,
  mode: EditorMode,
) => phaseStatus === 'CONVERTING' && (mode === '2d' || mode === '3d')

/**
 * CONVERTING 중에도 허용할 도구인지 판별한다.
 * - 허용: selection, hand
 * - 차단: delete/rotate/scale 및 기타 편집 도구
 */
export const isToolAllowedDuringConverting = (tool: string) => (
  tool === 'selection' || tool === 'hand'
)

/**
 * 3D 라이브러리 프리셋 타입 분류
 * - 지붕, 외벽, 내벽, 창문, 방문, 현관문, 계단, 기둥, 바닥, 천장, 가구
 */
export type ThreeDLibraryPresetType =
  | 'roof'
  | 'exterior-wall'
  | 'interior-wall'
  | 'window'
  | 'room-door'
  | 'front-door'
  | 'stairs'
  | 'column'
  | 'floor'
  | 'ceiling'
  | 'furniture'

/**
 * 3D 라이브러리 단일 프리셋 데이터 계약
 * - id: 고유 식별자
 * - type: 프리셋 분류
 * - dimensions: 치수 문자열 (mm 단위 표시용)
 * - color: 기본 표시 색상 (HEX)
 * - lengthMm / heightMm / thicknessMm: 실제 치수값 (없으면 dimensions 파싱으로 산출)
 * - position: 씬 내 배치 위치 (사용자 이동 후 저장됨)
 * - rotation: 씬 내 회전값(Euler, radian)
 * - scale: 씬 내 스케일값
 */
export interface ThreeDLibraryPreset {
  id: string
  type: ThreeDLibraryPresetType
  name: string
  description: string
  dimensions: string
  color: string
  previewImageUrl?: string
  material?: string
  lengthMm?: number
  heightMm?: number
  thicknessMm?: number
  storeyExpressId?: number | null
  position?: { x: number; y: number; z: number }
  rotation?: { x: number; y: number; z: number }
  scale?: { x: number; y: number; z: number }
}

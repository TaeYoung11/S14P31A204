import { normalizeSnapIntervalMm, toRotationSnapRadians } from '../../utils/threeDSnap.utils'

type TransformMode = 'translate' | 'rotate' | 'scale'

export type TransformSnapControl = {
  rotationSnap?: number | null
  translationSnap?: number | null
  scaleSnap?: number | null
  setRotationSnap?: (radians: number | null) => void
  setTranslationSnap?: (distance: number | null) => void
  setScaleSnap?: (scale: number | null) => void
}

interface ApplyTransformSnapParams {
  control: TransformSnapControl
  transformMode: TransformMode
  snapEnabled: boolean
  snapIntervalMm: number
  isShiftSnap: boolean
  worldUnitsPerMm: number
}

/**
 * TransformControls의 이동/회전/크기 스냅을 한 곳에서 동기화한다.
 * - 이동: mm -> world units
 * - 회전: mm 간격 옵션을 각도 step으로 매핑
 * - 크기: scaleSnap(factor)은 의미가 달라 혼선을 줄 수 있어 비활성화하고,
 *   실제 mm 기준 보정은 objectChange 단계에서 별도 처리한다.
 */
export const applyTransformSnap = ({
  control,
  transformMode,
  snapEnabled,
  snapIntervalMm,
  isShiftSnap,
  worldUnitsPerMm,
}: ApplyTransformSnapParams) => {
  const shouldApply = snapEnabled || isShiftSnap
  const normalizedIntervalMm = normalizeSnapIntervalMm(snapIntervalMm)

  const nextTranslationSnap = (
    shouldApply && transformMode === 'translate'
      ? normalizedIntervalMm * worldUnitsPerMm
      : null
  )
  control.setTranslationSnap?.(nextTranslationSnap)
  control.translationSnap = nextTranslationSnap

  const nextRotationSnap = (
    shouldApply && transformMode === 'rotate'
      ? toRotationSnapRadians(normalizedIntervalMm)
      : null
  )
  control.setRotationSnap?.(nextRotationSnap)
  control.rotationSnap = nextRotationSnap

  const nextScaleSnap = null
  control.setScaleSnap?.(nextScaleSnap)
  control.scaleSnap = nextScaleSnap
}

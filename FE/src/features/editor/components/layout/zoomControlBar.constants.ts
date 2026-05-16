import type { ThreeDCameraViewPreset } from '@/pages/editor/components/canvas-content/buildCanvasSectionProps'

/**
 * 카메라 프리셋 버튼 메타데이터.
 */
export const CAMERA_VIEW_PRESETS: Array<{ key: ThreeDCameraViewPreset; label: string; title: string }> = [
  { key: 'top', label: '상단', title: '상단 뷰' },
  { key: 'front', label: '정면', title: '정면 뷰' },
  { key: 'side', label: '측면', title: '측면 뷰' },
  { key: 'perspective', label: '원근', title: '원근 뷰' },
]

/**
 * 2D/3D 공통 스냅 간격 선택 옵션(mm).
 */
export const GRID_SNAP_INTERVAL_OPTIONS = [
  { value: 100, label: '100mm' },
  { value: 250, label: '250mm' },
  { value: 500, label: '500mm' },
]

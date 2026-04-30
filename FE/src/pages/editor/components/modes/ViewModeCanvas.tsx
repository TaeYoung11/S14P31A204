import { lazy } from 'react'

const RealisticViewer = lazy(() =>
  import('@/features/editor/components/canvas/RealisticViewer').then((module) => ({ default: module.RealisticViewer })),
)

interface ViewModeCanvasProps {
  onExport: () => void
}

/** 뷰 모드(렌더 뷰어) 전용 컴포넌트 */
export default function ViewModeCanvas({ onExport }: ViewModeCanvasProps) {
  return <RealisticViewer onExport={onExport} />
}


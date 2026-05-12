import BubbleModeCanvas from '../modes/BubbleModeCanvas'
import ThreeDModeCanvas from '../modes/ThreeDModeCanvas'
import TwoDModeCanvas from '../modes/TwoDModeCanvas'
import ViewModeCanvas from '../modes/ViewModeCanvas'
import type { CanvasModeRendererSectionProps } from './buildCanvasSectionProps'

/**
 * 모드별 캔버스 본문 렌더러
 * - 버블/2D/3D/뷰 모드 본문을 분기한다.
 */
export default function CanvasModeRenderer({
  mode,
  canvasZoom,
  renderProps,
  onOpenExport,
  isRotationLocked,
  onThreeDCoordinatesChange,
  cameraViewPresetCommand,
}: CanvasModeRendererSectionProps) {
  const scale = canvasZoom / 100

  if (mode === 'bubble') {
    return <BubbleModeCanvas editorProps={renderProps} scale={scale} />
  }

  if (mode === '2d') {
    return <TwoDModeCanvas editorProps={renderProps} scale={scale} />
  }

  if (mode === '3d') {
    return (
      <ThreeDModeCanvas
        editorProps={renderProps}
        scale={scale}
        isRotationLocked={isRotationLocked}
        onThreeDCoordinatesChange={onThreeDCoordinatesChange}
        cameraViewPresetCommand={cameraViewPresetCommand}
      />
    )
  }

  if (mode === 'view') {
    return <ViewModeCanvas onExport={onOpenExport} />
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center whitespace-pre-line px-10 text-center font-medium text-[#ADB5BD] opacity-50">
      캔버스 준비 중...
    </div>
  )
}

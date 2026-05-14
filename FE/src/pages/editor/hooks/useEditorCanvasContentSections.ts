import { useCallback, useMemo, useState } from 'react'
import type { EditorCanvasRenderProps } from '../types/editorCanvasContentProps'
import {
  buildCanvasCollaborationBarSectionProps,
  type ThreeDCameraViewPreset,
  buildCanvasLabelOverlaySectionProps,
  buildCanvasModeRendererSectionProps,
  buildCanvasZoomControlsSectionProps,
  type ThreeDCoordinates,
} from '../components/canvas-content/buildCanvasSectionProps'

interface UseEditorCanvasContentSectionsResult {
  isViewMode: boolean
  modeRendererSectionProps: ReturnType<typeof buildCanvasModeRendererSectionProps>
  labelOverlaySectionProps: ReturnType<typeof buildCanvasLabelOverlaySectionProps>
  zoomControlsSectionProps: ReturnType<typeof buildCanvasZoomControlsSectionProps>
  collaborationBarSectionProps: ReturnType<typeof buildCanvasCollaborationBarSectionProps>
}

/**
 * EditorCanvasContent 조합에 필요한 UI 상태와 섹션 props 계산을 담당한다.
 * 컴포넌트 본문에는 배치/렌더링 코드만 남기기 위해 분리한다.
 */
export function useEditorCanvasContentSections(
  renderProps: EditorCanvasRenderProps,
): UseEditorCanvasContentSectionsResult {
  // 회전 잠금/좌표는 캔버스 영역 UI 상태이므로 페이지 전역 상태와 분리해 로컬 관리한다.
  const [isRotationLocked, setIsRotationLocked] = useState(false)
  const [threeDCoordinates, setThreeDCoordinates] = useState<ThreeDCoordinates>({ x: 0, y: 0, z: 0 })
  // 기본은 자유 뷰이며, 프리셋 버튼을 눌렀을 때만 해당 버튼을 활성 상태로 표시한다.
  const [selectedCameraViewPreset, setSelectedCameraViewPreset] = useState<ThreeDCameraViewPreset | null>(null)
  // 초기 마운트 시 프리셋을 강제로 적용하지 않고, 사용자가 뷰 버튼을 눌렀을 때만 적용한다.
  const [cameraViewPresetToken, setCameraViewPresetToken] = useState(0)
  const isViewMode = renderProps.mode === 'view'

  const toggleRotationLock = useCallback(() => {
    setIsRotationLocked((prev) => !prev)
  }, [])

  const handleSelectCameraViewPreset = useCallback((preset: ThreeDCameraViewPreset) => {
    setSelectedCameraViewPreset(preset)
    setCameraViewPresetToken((prev) => prev + 1)
  }, [])

  const modeRendererSectionProps = useMemo(
    // 모드 본문 렌더러에 전달할 props를 한 곳에서 조합해 재사용성을 높인다.
    () =>
      buildCanvasModeRendererSectionProps(
        renderProps,
        isRotationLocked,
        setThreeDCoordinates,
        { preset: selectedCameraViewPreset ?? 'perspective', token: cameraViewPresetToken },
      ),
    [cameraViewPresetToken, isRotationLocked, renderProps, selectedCameraViewPreset],
  )

  const labelOverlaySectionProps = useMemo(
    () => buildCanvasLabelOverlaySectionProps(renderProps),
    [renderProps],
  )

  const zoomControlsSectionProps = useMemo(
    () =>
      buildCanvasZoomControlsSectionProps(
        renderProps,
        isRotationLocked,
        toggleRotationLock,
        threeDCoordinates,
        selectedCameraViewPreset,
        handleSelectCameraViewPreset,
      ),
    [handleSelectCameraViewPreset, isRotationLocked, renderProps, selectedCameraViewPreset, threeDCoordinates, toggleRotationLock],
  )

  const collaborationBarSectionProps = useMemo(
    () => buildCanvasCollaborationBarSectionProps(renderProps),
    [renderProps],
  )

  return {
    isViewMode,
    modeRendererSectionProps,
    labelOverlaySectionProps,
    zoomControlsSectionProps,
    collaborationBarSectionProps,
  }
}

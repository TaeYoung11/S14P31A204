import { useCallback, useMemo, useState } from 'react'
import type { EditorCanvasRenderProps } from '../types/editorCanvasContentProps'
import {
  buildCanvasCollaborationBarSectionProps,
  buildCanvasLabelOverlaySectionProps,
  buildCanvasModeRendererSectionProps,
  buildCanvasTwoDLeftPanelsSectionProps,
  buildCanvasZoomControlsSectionProps,
  type ThreeDCoordinates,
} from '../components/canvas-content/buildCanvasSectionProps'

interface UseEditorCanvasContentSectionsResult {
  isViewMode: boolean
  modeRendererSectionProps: ReturnType<typeof buildCanvasModeRendererSectionProps>
  labelOverlaySectionProps: ReturnType<typeof buildCanvasLabelOverlaySectionProps>
  twoDLeftPanelsSectionProps: ReturnType<typeof buildCanvasTwoDLeftPanelsSectionProps>
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
  const isViewMode = renderProps.mode === 'view'

  const toggleRotationLock = useCallback(() => {
    setIsRotationLocked((prev) => !prev)
  }, [])

  const modeRendererSectionProps = useMemo(
    // 모드 본문 렌더러에 전달할 props를 한 곳에서 조합해 재사용성을 높인다.
    () =>
      buildCanvasModeRendererSectionProps(
        renderProps,
        isRotationLocked,
        setThreeDCoordinates,
      ),
    [isRotationLocked, renderProps],
  )

  const labelOverlaySectionProps = useMemo(
    () => buildCanvasLabelOverlaySectionProps(renderProps),
    [renderProps],
  )

  const twoDLeftPanelsSectionProps = useMemo(
    () => buildCanvasTwoDLeftPanelsSectionProps(renderProps),
    [renderProps],
  )

  const zoomControlsSectionProps = useMemo(
    () =>
      buildCanvasZoomControlsSectionProps(
        renderProps,
        isRotationLocked,
        toggleRotationLock,
        threeDCoordinates,
      ),
    [isRotationLocked, renderProps, threeDCoordinates, toggleRotationLock],
  )

  const collaborationBarSectionProps = useMemo(
    () => buildCanvasCollaborationBarSectionProps(renderProps),
    [renderProps],
  )

  return {
    isViewMode,
    modeRendererSectionProps,
    labelOverlaySectionProps,
    twoDLeftPanelsSectionProps,
    zoomControlsSectionProps,
    collaborationBarSectionProps,
  }
}

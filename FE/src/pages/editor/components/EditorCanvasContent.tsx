import { Suspense } from 'react'
import { ModeCanvasLoadingFallback } from '@/features/editor/components/shared/EditorLoadingFallbacks'
import type { EditorCanvasContentProps, EditorCanvasRenderProps } from '../types/editorCanvasContentProps'
import { useEditorCanvasContentSections } from '../hooks/useEditorCanvasContentSections'
import CanvasCollaborationBar from './canvas-content/CanvasCollaborationBar'
import CanvasLabelOverlay from './canvas-content/CanvasLabelOverlay'
import CanvasModeRenderer from './canvas-content/CanvasModeRenderer'
import CanvasZoomControls from './canvas-content/CanvasZoomControls'

/**
 * 에디터 중앙 캔버스 영역 조합 컴포넌트
 * - 모드별 본문/오버레이/보조 패널/컨트롤 배치만 담당한다.
 */
export default function EditorCanvasContent(props: EditorCanvasContentProps) {
  const { containerRef, ...canvasRenderProps } = props
  const renderProps: EditorCanvasRenderProps = canvasRenderProps
  const { isWorkspaceBootstrapping } = renderProps
  const {
    isViewMode,
    modeRendererSectionProps,
    labelOverlaySectionProps,
    zoomControlsSectionProps,
    collaborationBarSectionProps,
  } = useEditorCanvasContentSections(renderProps)

  return (
    <main
      ref={containerRef}
      className={`relative h-full w-full min-w-0 flex-1 overflow-hidden ${
        isViewMode
          ? 'bg-[#0A0A0B]'
          : 'rounded-3xl border border-[#E2E6EF] bg-[linear-gradient(180deg,#ffffff_0%,#f9fbff_100%)] shadow-[0_16px_36px_rgba(32,44,94,0.12)]'
      }`}
    >
      {isWorkspaceBootstrapping ? (
        <ModeCanvasLoadingFallback mode={renderProps.mode} />
      ) : (
        <>
          <Suspense fallback={<ModeCanvasLoadingFallback mode={renderProps.mode} />}>
            <CanvasModeRenderer {...modeRendererSectionProps} />
          </Suspense>
          <CanvasLabelOverlay {...labelOverlaySectionProps} />
          <CanvasZoomControls {...zoomControlsSectionProps} />
          <CanvasCollaborationBar {...collaborationBarSectionProps} />
        </>
      )}
    </main>
  )
}

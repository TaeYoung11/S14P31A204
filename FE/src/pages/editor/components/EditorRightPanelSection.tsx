import { Suspense, lazy } from 'react'
import { PanelLoadingFallback } from '@/features/editor/components/shared/EditorLoadingFallbacks'
import type { EditorRightPanelProps } from '../types/editorRightPanelProps'

const EditorRightPanels = lazy(() =>
  import('@/features/editor/components/layout/EditorRightPanels').then((module) => ({ default: module.EditorRightPanels })),
)

interface EditorRightPanelSectionProps {
  mode: EditorRightPanelProps['mode']
  rightPanelProps: EditorRightPanelProps
}

/**
 * 에디터 우측 패널 영역.
 * 속성/조닝/AI 패널과 플로어 레이어 패널을 lazy 로딩으로 렌더링한다.
 */
export default function EditorRightPanelSection({ mode, rightPanelProps }: EditorRightPanelSectionProps) {
  if (mode === 'view' || mode === 'bubble') return null

  return (
    <Suspense fallback={<PanelLoadingFallback mode={mode} side="right" />}>
      <EditorRightPanels {...rightPanelProps} />
    </Suspense>
  )
}

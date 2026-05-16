import { useMemo } from 'react'
import { useFloatingPanelDrag } from '@/features/editor/hooks/useFloatingPanelDrag'
import type { EditorPageViewModel } from '../types/editorPageViewModel'

const LEFT_TOOLBAR_INITIAL_OFFSET = { x: 28, y: 56 }
const LEFT_TOOLBAR_DRAG_MARGIN = 16

/**
 * EditorPage 화면 배치 전용 훅.
 * Page에는 조립 코드만 남기고, 패널 표시 조건/드래그 위치 계산을 분리한다.
 */
export function useEditorPageLayout(vm: EditorPageViewModel) {
  const shouldLiftRightPanel = useMemo(
    () => (vm.isCollaborationMode || vm.isAgentPanelMode) && vm.mode !== 'view',
    [vm.isAgentPanelMode, vm.isCollaborationMode, vm.mode],
  )
  const shouldShowLeftToolbar = useMemo(
    () => vm.mode !== 'view' && !vm.isEditorReadOnly,
    [vm.isEditorReadOnly, vm.mode],
  )

  const {
    panelRef: leftToolbarRef,
    offset: leftToolbarOffset,
    startDrag: startLeftToolbarDrag,
  } = useFloatingPanelDrag(LEFT_TOOLBAR_INITIAL_OFFSET, LEFT_TOOLBAR_DRAG_MARGIN)

  return {
    shouldLiftRightPanel,
    shouldShowLeftToolbar,
    leftToolbarRef,
    leftToolbarOffset,
    startLeftToolbarDrag,
  }
}

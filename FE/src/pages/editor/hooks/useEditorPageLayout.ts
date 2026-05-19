import { useMemo } from 'react'
import type { EditorPageViewModel } from '../types/editorPageViewModel'

/**
 * EditorPage 화면 배치 전용 훅.
 * Page에는 조립 코드만 남기고, 패널 표시 조건/드래그 위치 계산을 분리한다.
 */
export function useEditorPageLayout(vm: EditorPageViewModel) {
  const shouldLiftRightPanel = useMemo(
    () => vm.mode !== 'view',
    [vm.mode],
  )
  const shouldShowLeftToolbar = useMemo(
    () => vm.mode !== 'view' && !vm.isEditorReadOnly,
    [vm.isEditorReadOnly, vm.mode],
  )

  return {
    shouldLiftRightPanel,
    shouldShowLeftToolbar,
  }
}

import { formatAreaM2, formatAreaPyeong } from '@/features/project/utils/siteGeometry'
import type { EditorHeaderProps } from '../types/editorHeaderProps'
import type { EditorPageViewModel } from '../types/editorPageViewModel'

type HeaderViewModel = Pick<
  EditorPageViewModel,
  | 'mode'
  | 'setMode'
  | 'handleOpenInviteModal'
  | 'handleOpenIFCExportModal'
  | 'handleOpenExportSelectionModal'
  | 'saveStatus'
  | 'siteAreaM2'
>

/**
 * EditorPage ViewModel을 헤더 props로 매핑한다.
 * - 페이지 컴포넌트는 조립만 담당하도록 표시 문자열/액션 분기를 여기로 이동한다.
 */
export function buildEditorHeaderProps(vm: HeaderViewModel): EditorHeaderProps {
  const siteAreaLabel = vm.siteAreaM2
    ? `${formatAreaM2(vm.siteAreaM2)} (${formatAreaPyeong(vm.siteAreaM2)})`
    : undefined

  return {
    mode: vm.mode,
    onModeChange: vm.setMode,
    onOpenInvite: vm.handleOpenInviteModal,
    onSave: vm.mode === '3d' ? vm.handleOpenIFCExportModal : vm.handleOpenExportSelectionModal,
    saveStatus: vm.saveStatus,
    siteAreaLabel,
  }
}

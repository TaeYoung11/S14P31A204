import type { RightPanelPropsSubset, RightPanelViewModel } from './rightPanelPropsTypes'

/**
 * LLM 어시스턴트 패널 상태/핸들러를 매핑한다.
 */
export function buildAssistantRightPanelProps(
  vm: RightPanelViewModel,
): RightPanelPropsSubset<
  | 'llmProvider'
  | 'llmPrompt'
  | 'llmStatus'
  | 'llmIsLoading'
  | 'llmMessage'
  | 'llmSuggestions'
  | 'llmPreview'
  | 'llmCanRun'
  | 'llmActiveJobId'
  | 'llmJobProgress'
  | 'llmChatLogs'
  | 'llmIsChatLogsLoading'
  | 'onLlmPromptChange'
  | 'onRunLlmEdit'
  | 'onApplyLlmEdit'
  | 'onDiscardLlmEdit'
  | 'floorProjectImportMessage'
  | 'onImportFloorProjectIfc'
> {
  return {
    llmProvider: vm.llmProvider,
    llmPrompt: vm.llmPrompt,
    llmStatus: vm.llmStatus,
    llmIsLoading: vm.llmIsLoading,
    llmMessage: vm.llmMessage,
    llmSuggestions: vm.llmSuggestions,
    llmPreview: vm.llmPreview,
    llmCanRun: vm.llmCanRun,
    llmActiveJobId: vm.llmActiveJobId,
    llmJobProgress: vm.llmJobProgress,
    llmChatLogs: vm.llmChatLogs,
    llmIsChatLogsLoading: vm.llmIsChatLogsLoading,
    onLlmPromptChange: vm.setLlmPrompt,
    onRunLlmEdit: vm.runLlmEdit,
    onApplyLlmEdit: vm.applyLlmEdit,
    onDiscardLlmEdit: vm.discardLlmEdit,
    floorProjectImportMessage: vm.floorProjectImportMessage,
    onImportFloorProjectIfc: vm.importFloorProjectFromIfc,
  }
}

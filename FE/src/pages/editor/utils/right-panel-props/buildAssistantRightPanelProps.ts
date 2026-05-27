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
  | 'selectedWallForChat'
  | 'llmCanRun'
  | 'llmActiveJobId'
  | 'llmJobProgress'
  | 'llmClarificationArtifact'
  | 'llmChatLogs'
  | 'llmIsChatLogsLoading'
  | 'onLlmPromptChange'
  | 'onRunLlmEdit'
  | 'onApplyLlmEdit'
  | 'onDiscardLlmEdit'
  | 'onSelectLlmAlternative'
  | 'onClearSelectedWall'
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
    selectedWallForChat: vm.selectedWallForChat,
    llmCanRun: vm.llmCanRun,
    llmActiveJobId: vm.llmActiveJobId,
    llmJobProgress: vm.llmJobProgress,
    llmClarificationArtifact: vm.llmClarificationArtifact,
    llmChatLogs: vm.llmChatLogs,
    llmIsChatLogsLoading: vm.llmIsChatLogsLoading,
    onLlmPromptChange: vm.setLlmPrompt,
    onRunLlmEdit: vm.runLlmEdit,
    onApplyLlmEdit: vm.applyLlmEdit,
    onDiscardLlmEdit: vm.discardLlmEdit,
    onSelectLlmAlternative: vm.selectLlmAlternative,
    onClearSelectedWall: vm.clearSelectedWallForChat,
    floorProjectImportMessage: vm.floorProjectImportMessage,
    onImportFloorProjectIfc: vm.importFloorProjectFromIfc,
  }
}

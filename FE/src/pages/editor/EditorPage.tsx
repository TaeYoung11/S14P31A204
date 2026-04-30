import EditorHeader from '../../features/editor/components/layout/EditorHeader'
import EditorLeftSidebar from '../../features/editor/components/layout/EditorLeftSidebar'
import EditorToolbar from '../../features/editor/components/layout/EditorToolbar'
import { useEditorPage } from '../../features/editor/hooks/useEditorPage'
import EditorCanvasContent from './components/EditorCanvasContent'
import EditorModalLayer from './components/EditorModalLayer'
import EditorRightPanelSection from './components/EditorRightPanelSection'
import {
  buildEditorCanvasContentProps,
  buildEditorLeftSidebarProps,
  buildEditorModalLayerProps,
  buildEditorRightPanelProps,
} from './utils'

/** 에디터 페이지 조합 컴포넌트: 모달/좌측도구/캔버스/우측패널 배치만 담당 */
export default function EditorPage() {
  const vm = useEditorPage()
  const canvasContentProps = buildEditorCanvasContentProps(vm)
  const modalLayerProps = buildEditorModalLayerProps(vm)
  const sidebarProps = buildEditorLeftSidebarProps(vm)
  const rightPanelProps = buildEditorRightPanelProps(vm)

  return (
    <div className="flex flex-col h-screen w-screen bg-[#F0F2F9] text-[#1D1E20] overflow-hidden font-sans">
      <EditorModalLayer {...modalLayerProps} />

      <EditorHeader
        mode={vm.mode}
        onModeChange={vm.setMode}
        onOpenInvite={vm.handleOpenInviteModal}
        onSave={vm.mode === '3d' ? vm.handleOpenIFCExportModal : vm.handleOpenExportSelectionModal}
        saveStatus={vm.saveStatus}
      />
      <EditorToolbar mode={vm.mode} onModeChange={vm.setMode} />

      <div className={`flex flex-1 relative overflow-hidden ${vm.mode === 'view' ? '' : 'px-6 pb-6 gap-6'}`}>
        {vm.mode !== 'view' && (
          <EditorLeftSidebar {...sidebarProps} />
        )}

        <EditorCanvasContent {...canvasContentProps} />
        <EditorRightPanelSection mode={vm.mode} rightPanelProps={rightPanelProps} />
      </div>
    </div>
  )
}

import EditorHeader from '../../features/editor/components/layout/EditorHeader'
import EditorLeftSidebar from '../../features/editor/components/layout/EditorLeftSidebar'
import EditorToolbar from '../../features/editor/components/layout/EditorToolbar'
import { useEditorPage } from '../../features/editor/hooks/useEditorPage'
import EditorCanvasContent from './components/EditorCanvasContent'
import EditorModalLayer from './components/EditorModalLayer'
import EditorRightPanelSection from './components/EditorRightPanelSection'
import {
  buildEditorCanvasContentProps,
  buildEditorHeaderProps,
  buildEditorLeftSidebarProps,
  buildEditorModalLayerProps,
  buildEditorRightPanelProps,
} from './utils'

/** 에디터 페이지 조합 컴포넌트: 모달/좌측도구/캔버스/우측패널 배치만 담당 */
export default function EditorPage() {
  const vm = useEditorPage()
  const headerProps = buildEditorHeaderProps(vm)
  const canvasContentProps = buildEditorCanvasContentProps(vm)
  const modalLayerProps = buildEditorModalLayerProps(vm)
  const sidebarProps = buildEditorLeftSidebarProps(vm)
  const rightPanelProps = buildEditorRightPanelProps(vm)

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_12%_10%,#f8f9ff_0%,#edf1fb_36%,#e8edf9_70%,#e6ebf8_100%)] text-[#1D1E20] font-sans">
      <div className="pointer-events-none absolute -left-24 top-16 h-64 w-64 rounded-full bg-[#7B86FF]/12 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-120px] right-[-80px] h-80 w-80 rounded-full bg-[#5A69DD]/12 blur-3xl" />
      <EditorModalLayer {...modalLayerProps} />

      <EditorHeader {...headerProps} />
      <EditorToolbar mode={vm.mode} projectName={vm.currentProjectName} onModeChange={vm.setMode} />

      <div className={`relative z-10 flex min-w-0 flex-1 overflow-hidden ${vm.mode === 'view' ? '' : 'gap-5 px-5 pb-5 pt-3'}`}>
        {vm.mode !== 'view' && (
          <EditorLeftSidebar {...sidebarProps} />
        )}

        <EditorCanvasContent {...canvasContentProps} />
        <EditorRightPanelSection mode={vm.mode} rightPanelProps={rightPanelProps} />
      </div>
    </div>
  )
}

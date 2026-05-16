import EditorHeader from '../../features/editor/components/layout/EditorHeader'
import EditorLeftSidebar from '../../features/editor/components/layout/EditorLeftSidebar'
import EditorToolbar from '../../features/editor/components/layout/EditorToolbar'
import { useEditorPage } from '../../features/editor/hooks/useEditorPage'
import { useEditorProjectSwitcher } from '../../features/editor/hooks/useEditorProjectSwitcher'
import { useFloatingPanelDrag } from '../../features/editor/hooks/useFloatingPanelDrag'
import EditorCanvasContent from './components/EditorCanvasContent'
import EditorModalLayer from './components/EditorModalLayer'
import EditorProjectSwitchSidebar from './components/EditorProjectSwitchSidebar'
import EditorRightPanelSection from './components/EditorRightPanelSection'
import ProjectCommentToast from '@/features/project/components/ProjectCommentToast'
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
  const projectSwitcher = useEditorProjectSwitcher()
  const headerProps = buildEditorHeaderProps(vm)
  const canvasContentProps = buildEditorCanvasContentProps(vm)
  const modalLayerProps = buildEditorModalLayerProps(vm)
  const sidebarProps = buildEditorLeftSidebarProps(vm)
  const rightPanelProps = buildEditorRightPanelProps(vm)
  const shouldLiftRightPanel = (vm.isCollaborationMode || vm.isAgentPanelMode) && vm.mode !== 'view'
  const shouldShowLeftToolbar = vm.mode !== 'view' && !vm.isEditorReadOnly
  const {
    panelRef: leftToolbarRef,
    offset: leftToolbarOffset,
    startDrag: startLeftToolbarDrag,
  } = useFloatingPanelDrag({ x: 28, y: 56 }, 16)

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_12%_10%,#f8f9ff_0%,#edf1fb_36%,#e8edf9_70%,#e6ebf8_100%)] text-[#1D1E20] font-sans">
      <div className="pointer-events-none absolute -left-24 top-16 h-64 w-64 rounded-full bg-[#7B86FF]/12 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-120px] right-[-80px] h-80 w-80 rounded-full bg-[#5A69DD]/12 blur-3xl" />
      <EditorModalLayer {...modalLayerProps} />
      <ProjectCommentToast
        toast={vm.projectCommentToast}
        onClose={vm.onCloseProjectCommentToast}
        onOpenProject={vm.onOpenProjectFromCommentToast}
      />

      <EditorProjectSwitchSidebar
        isOpen={projectSwitcher.isOpen}
        projects={projectSwitcher.projects}
        search={projectSwitcher.search}
        isLoading={projectSwitcher.isLoading}
        onSearchChange={projectSwitcher.setSearch}
        onProjectSelect={projectSwitcher.selectProject}
        onClose={projectSwitcher.close}
      />

      <EditorHeader
        {...headerProps}
        onOpenProjectSwitcher={projectSwitcher.open}
      />
      <div className="relative z-10 flex min-w-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <EditorToolbar
            mode={vm.mode}
            projectName={vm.currentProjectName}
            onModeChange={vm.setMode}
            isTrueNorthView={vm.isTrueNorthView}
            onToggleTrueNorthView={() => vm.setIsTrueNorthView(!vm.isTrueNorthView)}
            onUndo={vm.handleUndo}
            onRedo={vm.handleRedo}
            canUndo={vm.canUndo}
            canRedo={vm.canRedo}
          />

          <div className={`relative min-w-0 flex-1 overflow-hidden ${vm.mode === 'view' ? '' : 'px-5 pb-5 pt-3'}`}>
            <EditorCanvasContent {...canvasContentProps} />

            {shouldShowLeftToolbar && (
              <div
                ref={leftToolbarRef}
                className="absolute z-[130] h-[calc(100%-112px)]"
                style={{ left: leftToolbarOffset.x, top: leftToolbarOffset.y }}
              >
                <div
                  className="absolute left-2 right-2 top-1 z-10 h-6 cursor-grab rounded-xl active:cursor-grabbing"
                  onMouseDown={startLeftToolbarDrag}
                  title="툴바 이동"
                  aria-label="툴바 이동"
                />
                <EditorLeftSidebar {...sidebarProps} />
              </div>
            )}

            {!shouldLiftRightPanel && (
              <div className="absolute bottom-24 right-8 top-6 z-[120]">
                <EditorRightPanelSection mode={vm.mode} rightPanelProps={rightPanelProps} />
              </div>
            )}
          </div>
        </div>

        {shouldLiftRightPanel && (
          <EditorRightPanelSection mode={vm.mode} rightPanelProps={rightPanelProps} />
        )}
      </div>
    </div>
  )
}

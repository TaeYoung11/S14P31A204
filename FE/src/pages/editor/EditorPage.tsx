import EditorHeader from '../../features/editor/components/layout/EditorHeader'
import EditorLeftSidebar from '../../features/editor/components/layout/EditorLeftSidebar'
import EditorToolbar from '../../features/editor/components/layout/EditorToolbar'
import { useEditorPage } from '../../features/editor/hooks/useEditorPage'
import { useEditorProjectSwitcher } from '../../features/editor/hooks/useEditorProjectSwitcher'
import EditorCanvasContent from './components/EditorCanvasContent'
import EditorModalLayer from './components/EditorModalLayer'
import EditorProjectSwitchSidebar from './components/EditorProjectSwitchSidebar'
import EditorRightPanelSection from './components/EditorRightPanelSection'
import { useEditorPageLayout } from './hooks/useEditorPageLayout'
import { CompassControl } from '@/features/editor/components/canvas/CompassControl'
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
  const {
    shouldLiftRightPanel,
    shouldShowLeftToolbar,
  } = useEditorPageLayout(vm)

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
      <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
        <EditorToolbar
          mode={vm.mode}
          projectName={vm.currentProjectName}
          onModeChange={vm.setMode}
          onUndo={vm.handleUndo}
          onRedo={vm.handleRedo}
          canUndo={vm.canUndo}
          canRedo={vm.canRedo}
        />

        <div className={`flex min-w-0 flex-1 overflow-hidden ${vm.mode === 'view' ? '' : 'gap-2 px-5 pb-5 pt-3'}`}>
          {shouldShowLeftToolbar && (
            <div className="flex min-h-0 shrink-0">
              <EditorLeftSidebar {...sidebarProps} />
            </div>
          )}

          <div className="relative min-w-0 flex-1 overflow-hidden">
            <EditorCanvasContent {...canvasContentProps} />

            {(vm.mode === 'bubble' || vm.mode === '2d') && (
              <div className="absolute right-6 top-6 z-[125]">
                <CompassControl
                  rotationRadians={vm.userViewRotationRadians}
                  projectNorthRotationRadians={vm.projectNorthViewRotationRadians}
                  onToggleProjectNorth={vm.toggleProjectNorthViewRotation}
                />
              </div>
            )}
          </div>

          {shouldLiftRightPanel && (
            <EditorRightPanelSection mode={vm.mode} rightPanelProps={rightPanelProps} />
          )}
        </div>
      </div>
    </div>
  )
}

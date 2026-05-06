import { MessagesSquare } from 'lucide-react'
import type { EditorLeftSidebarProps } from './EditorLeftSidebar.types'
import BubbleSidebarTools from './sidebar/BubbleSidebarTools'
import GridToggleButton from './sidebar/GridToggleButton'
import SelectionToolButton from './sidebar/SelectionToolButton'
import SidebarFooterActions from './sidebar/SidebarFooterActions'
import SidebarToolButton from './sidebar/SidebarToolButton'
import ThreeDSidebarTools from './sidebar/ThreeDSidebarTools'
import TwoDSidebarTools from './sidebar/TwoDSidebarTools'

/**
 * 에디터 왼쪽 도구 사이드바
 * - 모드별 도구 그룹 렌더링만 담당한다.
 * - 계산/검증 로직은 상위 훅에서 전달된 값만 사용한다.
 */
export default function EditorLeftSidebar({
  mode,
  isLineStyleModalOpen,
  isLibraryOpen,
  isGridVisible,
  selectedTool,
  onToolSelect,
  onAddSpace,
  onToggleCollaboration,
  onToggleLibrary,
  onToggleGrid,
  onExportIFC,
  onGenerateFloorPlan,
  onAutoLayoutBubbles,
  canGenerateFloorPlan = false,
  canAutoLayoutBubbles = false,
  isFloorPlanGenerated = false,
  isBubbleReadOnly = false,
  isEditorReadOnly = false,
  hasDeletableSelection = false,
  onDeleteSelected,
}: EditorLeftSidebarProps) {
  const shouldShowFooterActions = mode === '2d' || mode === '3d'

  if (isEditorReadOnly) {
    return (
      <aside className="mt-0 flex h-full min-h-0 w-[84px] shrink-0 self-stretch flex-col overflow-hidden rounded-3xl border border-[#DFE4F0] bg-white/95 py-4 shadow-[0_14px_30px_rgba(38,48,95,0.1)] backdrop-blur-sm">
        <div className="scrollbar-hide flex min-h-0 w-full flex-1 flex-col items-center overflow-x-hidden overflow-y-auto py-2">
          <div className="flex w-full flex-col items-center gap-2 px-1.5">
            <SelectionToolButton selectedTool={selectedTool} onToolSelect={onToolSelect} />
            {(mode === '2d' || mode === '3d') && (
              <GridToggleButton isGridVisible={isGridVisible} onToggleGrid={onToggleGrid} />
            )}
          </div>
        </div>

        {(mode === '2d' || mode === '3d') && (
          <div className="flex w-full flex-col items-center gap-2 border-t border-[#EEF2FA] bg-white/80 px-1.5 py-4">
            <SidebarToolButton
              label="협업"
              isActive
              onClick={onToggleCollaboration}
              icon={<MessagesSquare size={24} />}
            />
          </div>
        )}
      </aside>
    )
  }

  return (
    <aside className="mt-0 flex h-full min-h-0 w-[84px] shrink-0 self-stretch flex-col overflow-hidden rounded-3xl border border-[#DFE4F0] bg-white/95 py-4 shadow-[0_14px_30px_rgba(38,48,95,0.1)] backdrop-blur-sm">
      <div className="scrollbar-hide flex min-h-0 w-full flex-1 flex-col items-center overflow-x-hidden overflow-y-auto py-2">
        <div className="flex w-full flex-col items-center gap-2 px-1.5">
          {mode === 'bubble' && (
            <BubbleSidebarTools
              selectedTool={selectedTool}
              isLineStyleModalOpen={isLineStyleModalOpen}
              isBubbleReadOnly={isBubbleReadOnly}
              canGenerateFloorPlan={canGenerateFloorPlan}
              canAutoLayoutBubbles={canAutoLayoutBubbles}
              isFloorPlanGenerated={isFloorPlanGenerated}
              hasDeletableSelection={hasDeletableSelection}
              onToolSelect={onToolSelect}
              onAddSpace={onAddSpace}
              onGenerateFloorPlan={onGenerateFloorPlan}
              onAutoLayoutBubbles={onAutoLayoutBubbles}
              onDeleteSelected={onDeleteSelected}
            />
          )}

          {mode === '2d' && (
            <TwoDSidebarTools
              selectedTool={selectedTool}
              isGridVisible={isGridVisible}
              hasDeletableSelection={hasDeletableSelection}
              onToolSelect={onToolSelect}
              onToggleGrid={onToggleGrid}
              onDeleteSelected={onDeleteSelected}
            />
          )}

          {mode === '3d' && (
            <ThreeDSidebarTools
              selectedTool={selectedTool}
              isGridVisible={isGridVisible}
              isLibraryOpen={isLibraryOpen}
              hasDeletableSelection={hasDeletableSelection}
              onToolSelect={onToolSelect}
              onToggleGrid={onToggleGrid}
              onToggleLibrary={onToggleLibrary}
              onExportIFC={onExportIFC}
              onDeleteSelected={onDeleteSelected}
            />
          )}
        </div>
      </div>

      {shouldShowFooterActions && <SidebarFooterActions onToggleCollaboration={onToggleCollaboration} />}
    </aside>
  )
}

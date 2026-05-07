import DeleteToolButton from './DeleteToolButton'
import GridToggleButton from './GridToggleButton'
import SelectionToolButton from './SelectionToolButton'

interface SidebarCoreToolsProps {
  selectedTool: string
  hasDeletableSelection: boolean
  onToolSelect: (tool: string) => void
  onDeleteSelected?: () => void
  showSelectionTool?: boolean
  showDeleteTool?: boolean
  showGridToggle?: boolean
  isGridVisible?: boolean
  onToggleGrid?: () => void
}

/**
 * 2D/3D 공통 기본 도구 묶음.
 * - 선택
 * - 삭제
 * - (옵션) 그리드 토글
 */
export default function SidebarCoreTools({
  selectedTool,
  hasDeletableSelection,
  onToolSelect,
  onDeleteSelected,
  showSelectionTool = true,
  showDeleteTool = true,
  showGridToggle = false,
  isGridVisible,
  onToggleGrid,
}: SidebarCoreToolsProps) {
  return (
    <>
      {showSelectionTool && (
        <SelectionToolButton selectedTool={selectedTool} onToolSelect={onToolSelect} />
      )}
      {showDeleteTool && (
        <DeleteToolButton
          selectedTool={selectedTool}
          onToolSelect={onToolSelect}
          hasDeletableSelection={hasDeletableSelection}
          onDeleteSelected={onDeleteSelected}
        />
      )}
      {showGridToggle && (
        <GridToggleButton isGridVisible={isGridVisible} onToggleGrid={onToggleGrid} />
      )}
    </>
  )
}

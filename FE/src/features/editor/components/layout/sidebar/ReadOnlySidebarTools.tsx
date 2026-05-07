import type { EditorMode } from '@/features/editor/types'
import GridToggleButton from './GridToggleButton'
import SelectionToolButton from './SelectionToolButton'

interface ReadOnlySidebarToolsProps {
  mode: EditorMode
  selectedTool: string
  isGridVisible?: boolean
  onToolSelect: (tool: string) => void
  onToggleGrid?: () => void
}

/**
 * 읽기 전용 에디터의 좌측 사이드바 도구 묶음.
 * - 선택/그리드 조회 기능만 허용
 */
export default function ReadOnlySidebarTools({
  mode,
  selectedTool,
  isGridVisible,
  onToolSelect,
  onToggleGrid,
}: ReadOnlySidebarToolsProps) {
  const showGridToggle = mode === '2d' || mode === '3d'

  return (
    <>
      <SelectionToolButton selectedTool={selectedTool} onToolSelect={onToolSelect} />
      {showGridToggle && (
        <GridToggleButton isGridVisible={isGridVisible} onToggleGrid={onToggleGrid} />
      )}
    </>
  )
}

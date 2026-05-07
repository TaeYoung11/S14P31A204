import { DoorOpen, LayoutGrid, Scaling, Square, type LucideIcon } from 'lucide-react'
import SidebarCoreTools from './SidebarCoreTools'
import SidebarToolButton from './SidebarToolButton'

interface TwoDSidebarToolsProps {
  selectedTool: string
  isGridVisible?: boolean
  hasDeletableSelection: boolean
  onToolSelect: (tool: string) => void
  onToggleGrid?: () => void
  onDeleteSelected?: () => void
}

interface TwoDToolItem {
  id: string
  icon: LucideIcon
  label: string
}

const TOOLS_2D: TwoDToolItem[] = [
  { id: 'wall', icon: Square, label: '벽체' },
  { id: 'door', icon: DoorOpen, label: '문' },
  { id: 'window', icon: LayoutGrid, label: '창문' },
  { id: 'resize', icon: Scaling, label: '크기조정' },
]

/**
 * 2D 모드 전용 도구 그룹
 */
export default function TwoDSidebarTools({
  selectedTool,
  isGridVisible,
  hasDeletableSelection,
  onToolSelect,
  onToggleGrid,
  onDeleteSelected,
}: TwoDSidebarToolsProps) {
  return (
    <>
      <SidebarCoreTools
        selectedTool={selectedTool}
        hasDeletableSelection={hasDeletableSelection}
        onToolSelect={onToolSelect}
        showDeleteTool={false}
      />

      {TOOLS_2D.map(({ id, icon: Icon, label }) => (
        <SidebarToolButton
          key={id}
          label={label}
          isActive={selectedTool === id}
          onClick={() => onToolSelect(id)}
          icon={<Icon size={24} />}
        />
      ))}

      <SidebarCoreTools
        selectedTool={selectedTool}
        hasDeletableSelection={hasDeletableSelection}
        onToolSelect={onToolSelect}
        onDeleteSelected={onDeleteSelected}
        showSelectionTool={false}
        showGridToggle
        isGridVisible={isGridVisible}
        onToggleGrid={onToggleGrid}
      />
    </>
  )
}

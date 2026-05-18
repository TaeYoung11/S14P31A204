import { DoorOpen, HousePlus, LayoutGrid, Scaling, Square, type LucideIcon } from 'lucide-react'
import AddSpaceToolButton from './AddSpaceToolButton'
import SidebarCoreTools from './SidebarCoreTools'
import SidebarToolButton from './SidebarToolButton'

interface TwoDSidebarToolsProps {
  selectedTool: string
  isGridVisible?: boolean
  hasDeletableSelection: boolean
  isDeleteActionLocked?: boolean
  onToolSelect: (tool: string) => void
  onAddRoom?: () => void
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
  isDeleteActionLocked = false,
  onToolSelect,
  onAddRoom,
  onToggleGrid,
  onDeleteSelected,
}: TwoDSidebarToolsProps) {
  return (
    <>
      <SidebarCoreTools
        selectedTool={selectedTool}
        hasDeletableSelection={hasDeletableSelection}
        isDeleteDisabled={isDeleteActionLocked}
        onToolSelect={onToolSelect}
        showDeleteTool={false}
      />

      <AddSpaceToolButton
        label="방"
        title="방 생성"
        isDisabled={!onAddRoom}
        onClick={onAddRoom}
        icon={<HousePlus size={24} />}
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
        isDeleteDisabled={isDeleteActionLocked}
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

import { Download, Home } from 'lucide-react'
import SidebarCoreTools from './SidebarCoreTools'
import SidebarToolButton from './SidebarToolButton'

interface ThreeDSidebarToolsProps {
  selectedTool: string
  isLibraryOpen?: boolean
  isGridVisible?: boolean
  hasDeletableSelection: boolean
  isDeleteActionLocked?: boolean
  onToolSelect: (tool: string) => void
  onToggleLibrary?: () => void
  onToggleGrid?: () => void
  onDeleteSelected?: () => void
  onExportIFC?: () => void
}

/**
 * 3D 모드 전용 도구 그룹
 */
export default function ThreeDSidebarTools({
  selectedTool,
  isLibraryOpen = false,
  isGridVisible,
  hasDeletableSelection,
  isDeleteActionLocked = false,
  onToolSelect,
  onToggleLibrary,
  onToggleGrid,
  onDeleteSelected,
  onExportIFC,
}: ThreeDSidebarToolsProps) {
  return (
    <>
      <SidebarCoreTools
        selectedTool={selectedTool}
        hasDeletableSelection={hasDeletableSelection}
        isDeleteDisabled={isDeleteActionLocked}
        onToolSelect={onToolSelect}
        onDeleteSelected={onDeleteSelected}
        showGridToggle
        isGridVisible={isGridVisible}
        onToggleGrid={onToggleGrid}
      />

      <SidebarToolButton
        label="라이브러리"
        isActive={isLibraryOpen}
        onClick={onToggleLibrary}
        icon={<Home size={24} />}
      />

      <SidebarToolButton
        label="IFC 내보내기"
        onClick={onExportIFC}
        icon={<Download size={24} />}
      />
    </>
  )
}

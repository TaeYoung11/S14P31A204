import { Download, Home } from 'lucide-react'
import SidebarCoreTools from './SidebarCoreTools'
import SidebarToolButton from './SidebarToolButton'

interface ThreeDSidebarToolsProps {
  selectedTool: string
  isGridVisible?: boolean
  isLibraryOpen?: boolean
  hasDeletableSelection: boolean
  onToolSelect: (tool: string) => void
  onToggleGrid?: () => void
  onToggleLibrary?: () => void
  onExportIFC?: () => void
  onDeleteSelected?: () => void
}

/**
 * 3D 모드 전용 도구 그룹
 */
export default function ThreeDSidebarTools({
  selectedTool,
  isGridVisible,
  isLibraryOpen = false,
  hasDeletableSelection,
  onToolSelect,
  onToggleGrid,
  onToggleLibrary,
  onExportIFC,
  onDeleteSelected,
}: ThreeDSidebarToolsProps) {
  return (
    <>
      <SidebarCoreTools
        selectedTool={selectedTool}
        hasDeletableSelection={hasDeletableSelection}
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

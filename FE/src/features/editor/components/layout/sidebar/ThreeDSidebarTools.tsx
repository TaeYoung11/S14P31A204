import { Home } from 'lucide-react'
import SidebarCoreTools from './SidebarCoreTools'
import SidebarToolButton from './SidebarToolButton'

interface ThreeDSidebarToolsProps {
  selectedTool: string
  isLibraryOpen?: boolean
  hasDeletableSelection: boolean
  onToolSelect: (tool: string) => void
  onToggleLibrary?: () => void
  onDeleteSelected?: () => void
}

/**
 * 3D 모드 전용 도구 그룹
 */
export default function ThreeDSidebarTools({
  selectedTool,
  isLibraryOpen = false,
  hasDeletableSelection,
  onToolSelect,
  onToggleLibrary,
  onDeleteSelected,
}: ThreeDSidebarToolsProps) {
  return (
    <>
      <SidebarCoreTools
        selectedTool={selectedTool}
        hasDeletableSelection={hasDeletableSelection}
        onToolSelect={onToolSelect}
        onDeleteSelected={onDeleteSelected}
      />

      <SidebarToolButton
        label="라이브러리"
        isActive={isLibraryOpen}
        onClick={onToggleLibrary}
        icon={<Home size={24} />}
      />
    </>
  )
}

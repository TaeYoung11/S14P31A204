import { Grid3X3 } from 'lucide-react'
import SidebarToolButton from './SidebarToolButton'

interface GridToggleButtonProps {
  isGridVisible?: boolean
  onToggleGrid?: () => void
}

/**
 * 2D/3D 공통 그리드 토글 버튼
 */
export default function GridToggleButton({ isGridVisible = false, onToggleGrid }: GridToggleButtonProps) {
  return (
    <SidebarToolButton
      label="그리드"
      isActive={isGridVisible}
      onClick={onToggleGrid}
      icon={<Grid3X3 size={24} />}
    />
  )
}

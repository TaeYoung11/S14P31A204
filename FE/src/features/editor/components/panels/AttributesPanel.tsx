import type { MouseEvent as ReactMouseEvent } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import type { BubbleFloor, EditorMode, FloorOpening, FloorWall, IfcElementInfo, PanelKey, PanelOffset, PanelResizeAxis } from '../../types'
import type { BubbleConnectionInfo, BubbleInfo, BubbleZoneInfo } from './BubbleAttributePanel'
import { PanelFrame } from '../shared/PanelFrame'
import { ModeAwareAttributeSection } from './sections/ModeAwareAttributeSection'

export interface AttributesPanelProps {
  mode: EditorMode
  isOpen: boolean
  offset: PanelOffset
  width: number
  height: number
  zIndex?: number
  selectedBubble: BubbleInfo | null
  isThreeDEditingLocked?: boolean
  selectedWall?: FloorWall | null
  selectedOpening?: FloorOpening | null
  selectedIfcElement?: IfcElementInfo | null
  connections: BubbleConnectionInfo[]
  zones: BubbleZoneInfo[]
  onLabelChange: (id: string, label: string) => void
  onTypeChange: (id: string, type: string) => void
  onWidthChange: (id: string, width: number) => void
  onHeightChange: (id: string, height: number) => void
  onThicknessChange?: (id: string, thickness: number) => void
  onPositionChange?: (id: string, axis: 'x' | 'y' | 'z', value: number) => void
  onRotationChange?: (id: string, axis: 'x' | 'y' | 'z', degrees: number) => void
  onRoofShapeChange?: (id: string, shape: 'flat' | 'gable') => void
  onWidthCommit?: (id: string, width: number) => void
  onHeightCommit?: (id: string, height: number) => void
  onRatioChange: (id: string, ratio: number) => void
  onColorChange: (id: string, color: string) => void
  onBubbleFloorChange?: (id: string, floor: number) => void
  bubbleFloors?: BubbleFloor[]
  onMaterialChange?: (id: string, material: string) => void
  onWallTypeChange?: (id: string, type: FloorWall['type']) => void
  onWallThicknessChange?: (id: string, thicknessMm: number) => void
  onWallHeightChange?: (id: string, heightMm: number) => void
  onWallMaterialChange?: (id: string, material: string) => void
  onOpeningSizeChange?: (id: string, widthMm: number, heightMm: number) => void
  onWindowSillHeightChange?: (id: string, sillHeightMm: number) => void
  onDoorSwingDirectionChange?: (id: string, swingDirection: NonNullable<FloorOpening['doorSwingDirection']>) => void
  onDoorHingeSideChange?: (id: string, hingeSide: NonNullable<FloorOpening['doorHingeSide']>) => void
  onDragStart: (key: PanelKey, e: ReactMouseEvent<HTMLElement>) => void
  onResizeStart: (key: PanelKey, axis: PanelResizeAxis, e: ReactMouseEvent<HTMLButtonElement>) => void
  onToggle: (key: PanelKey) => void
}

/** 모드(버블/2D/3D)에 따라 알맞은 속성 패널을 렌더링 */
export function AttributesPanel({
  ...props
}: AttributesPanelProps) {
  return (
    <PanelFrame
      panelKey="attributes"
      title="속성 관리자"
      titleIcon={<SlidersHorizontal size={14} className="text-[#3B45B3]" />}
      isOpen={props.isOpen}
      offset={props.offset}
      width={props.width}
      height={props.height}
      zIndex={props.zIndex}
      onDragStart={props.onDragStart}
      onResizeStart={props.onResizeStart}
      onToggle={props.onToggle}
    >
      <ModeAwareAttributeSection {...props} />
    </PanelFrame>
  )
}

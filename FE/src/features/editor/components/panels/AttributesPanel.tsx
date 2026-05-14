import type { MouseEvent as ReactMouseEvent } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import type { EditorMode, FloorOpening, FloorWall, IfcElementInfo, PanelKey, PanelOffset, PanelResizeAxis } from '../../types'
import { BubbleAttributePanel, type BubbleConnectionInfo, type BubbleInfo, type BubbleZoneInfo } from './BubbleAttributePanel'
import { TwoDAttributePanel } from './TwoDAttributePanel'
import { ThreeDAttributePanel } from './ThreeDAttributePanel'
import { PanelFrame } from '../shared/PanelFrame'

interface AttributesPanelProps {
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
  mode,
  isOpen,
  offset,
  width,
  height,
  zIndex,
  selectedBubble,
  isThreeDEditingLocked = false,
  selectedWall,
  selectedOpening,
  selectedIfcElement,
  connections,
  zones,
  onLabelChange,
  onTypeChange,
  onWidthChange,
  onHeightChange,
  onThicknessChange,
  onPositionChange,
  onRotationChange,
  onRoofShapeChange,
  onWidthCommit,
  onHeightCommit,
  onRatioChange,
  onColorChange,
  onMaterialChange,
  onWallTypeChange,
  onWallThicknessChange,
  onWallHeightChange,
  onWallMaterialChange,
  onOpeningSizeChange,
  onWindowSillHeightChange,
  onDoorSwingDirectionChange,
  onDoorHingeSideChange,
  onDragStart,
  onResizeStart,
  onToggle,
}: AttributesPanelProps) {
  return (
    <PanelFrame
      panelKey="attributes"
      title="속성 관리자"
      titleIcon={<SlidersHorizontal size={14} className="text-[#3B45B3]" />}
      isOpen={isOpen}
      offset={offset}
      width={width}
      height={height}
      zIndex={zIndex}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onToggle={onToggle}
    >
      {mode === 'bubble' && (
        <BubbleAttributePanel
          selectedBubble={selectedBubble}
          onLabelChange={onLabelChange}
          onTypeChange={onTypeChange}
          onWidthChange={onWidthChange}
          onHeightChange={onHeightChange}
          onRatioChange={onRatioChange}
          onColorChange={onColorChange}
          connections={connections}
          zones={zones}
        />
      )}
      {mode === '2d' && (
        <TwoDAttributePanel 
          selectedBubble={selectedBubble}
          selectedWall={selectedWall}
          selectedOpening={selectedOpening}
          onLabelChange={onLabelChange}
          onTypeChange={onTypeChange}
          onWidthChange={onWidthChange}
          onHeightChange={onHeightChange}
          onWidthCommit={onWidthCommit}
          onHeightCommit={onHeightCommit}
          onRatioChange={onRatioChange}
          onWallTypeChange={onWallTypeChange}
          onWallThicknessChange={onWallThicknessChange}
          onWallHeightChange={onWallHeightChange}
          onWallMaterialChange={onWallMaterialChange}
          onOpeningSizeChange={onOpeningSizeChange}
          onWindowSillHeightChange={onWindowSillHeightChange}
          onDoorSwingDirectionChange={onDoorSwingDirectionChange}
          onDoorHingeSideChange={onDoorHingeSideChange}
        />
      )}
      {mode === '3d' && (
        <ThreeDAttributePanel
          selectedBubble={selectedBubble}
          selectedIfcElement={selectedIfcElement}
          isEditingLocked={isThreeDEditingLocked}
          onLabelChange={onLabelChange}
          onWidthChange={onWidthChange}
          onHeightChange={onHeightChange}
          onThicknessChange={onThicknessChange}
          onPositionChange={onPositionChange}
          onRotationChange={onRotationChange}
          onRoofShapeChange={onRoofShapeChange}
          onColorChange={onColorChange}
          onMaterialChange={onMaterialChange}
        />
      )}
    </PanelFrame>
  )
}

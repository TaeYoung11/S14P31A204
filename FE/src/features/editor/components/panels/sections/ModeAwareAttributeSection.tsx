import type { BubbleFloor, EditorMode, FloorOpening, FloorWall, IfcElementInfo } from '../../../types'
import { BubbleAttributePanel, type BubbleConnectionInfo, type BubbleInfo, type BubbleZoneInfo } from '../BubbleAttributePanel'
import { ThreeDAttributePanel } from '../ThreeDAttributePanel'
import { TwoDAttributePanel } from '../TwoDAttributePanel'

export interface ModeAwareAttributeSectionProps {
  mode: EditorMode
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
}

/** 버블/2D/3D 모드에 맞는 속성 패널 본문을 렌더링한다. */
export function ModeAwareAttributeSection(props: ModeAwareAttributeSectionProps) {
  if (props.mode === 'bubble') {
    return (
      <BubbleAttributePanel
        selectedBubble={props.selectedBubble}
        onLabelChange={props.onLabelChange}
        onTypeChange={props.onTypeChange}
        onWidthChange={props.onWidthChange}
        onHeightChange={props.onHeightChange}
        onRatioChange={props.onRatioChange}
        onColorChange={props.onColorChange}
        onFloorChange={props.onBubbleFloorChange}
        bubbleFloors={props.bubbleFloors}
        connections={props.connections}
        zones={props.zones}
      />
    )
  }

  if (props.mode === '2d') {
    return (
      <TwoDAttributePanel
        selectedBubble={props.selectedBubble}
        selectedWall={props.selectedWall}
        selectedOpening={props.selectedOpening}
        onLabelChange={props.onLabelChange}
        onTypeChange={props.onTypeChange}
        onWidthChange={props.onWidthChange}
        onHeightChange={props.onHeightChange}
        onWidthCommit={props.onWidthCommit}
        onHeightCommit={props.onHeightCommit}
        onRatioChange={props.onRatioChange}
        onWallTypeChange={props.onWallTypeChange}
        onWallThicknessChange={props.onWallThicknessChange}
        onWallHeightChange={props.onWallHeightChange}
        onWallMaterialChange={props.onWallMaterialChange}
        onOpeningSizeChange={props.onOpeningSizeChange}
        onWindowSillHeightChange={props.onWindowSillHeightChange}
        onDoorSwingDirectionChange={props.onDoorSwingDirectionChange}
        onDoorHingeSideChange={props.onDoorHingeSideChange}
      />
    )
  }

  if (props.mode === '3d') {
    return (
      <ThreeDAttributePanel
        selectedBubble={props.selectedBubble}
        selectedIfcElement={props.selectedIfcElement}
        isEditingLocked={props.isThreeDEditingLocked ?? false}
        onLabelChange={props.onLabelChange}
        onWidthChange={props.onWidthChange}
        onHeightChange={props.onHeightChange}
        onThicknessChange={props.onThicknessChange}
        onPositionChange={props.onPositionChange}
        onRotationChange={props.onRotationChange}
        onRoofShapeChange={props.onRoofShapeChange}
        onColorChange={props.onColorChange}
        onMaterialChange={props.onMaterialChange}
      />
    )
  }

  return null
}

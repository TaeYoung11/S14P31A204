import type { RightPanelPropsSubset, RightPanelViewModel } from './rightPanelPropsTypes'

/**
 * 우측 속성 패널에 필요한 선택 객체/수정 핸들러를 매핑한다.
 */
export function buildAttributeRightPanelProps(
  vm: RightPanelViewModel,
): RightPanelPropsSubset<
  | 'selectedBubble'
  | 'isThreeDEditingLocked'
  | 'selectedWall'
  | 'selectedOpening'
  | 'selectedIfcElement'
  | 'selectedBubbleConnections'
  | 'selectedBubbleZones'
  | 'onLabelChange'
  | 'onTypeChange'
  | 'onWidthChange'
  | 'onHeightChange'
  | 'onThicknessChange'
  | 'onPositionChange'
  | 'onRotationChange'
  | 'onRoofShapeChange'
  | 'onWidthCommit'
  | 'onHeightCommit'
  | 'onRatioChange'
  | 'onColorChange'
  | 'onBubbleFloorChange'
  | 'onMaterialChange'
  | 'onWallTypeChange'
  | 'onWallThicknessChange'
  | 'onWallHeightChange'
  | 'onWallMaterialChange'
  | 'onOpeningSizeChange'
  | 'onWindowSillHeightChange'
  | 'onDoorSwingDirectionChange'
  | 'onDoorHingeSideChange'
> {
  return {
    selectedBubble: vm.selectedBubble,
    isThreeDEditingLocked: vm.isThreeDEditingLocked,
    selectedWall: vm.selectedFloorWall,
    selectedOpening: vm.selectedFloorOpening,
    selectedIfcElement: vm.selectedIfcElement,
    selectedBubbleConnections: vm.selectedBubbleConnections,
    selectedBubbleZones: vm.selectedBubbleZones,
    onLabelChange: vm.handleLabelChange,
    onTypeChange: vm.handleTypeChange,
    onWidthChange: vm.handleWidthChange,
    onHeightChange: vm.handleHeightChange,
    onThicknessChange: vm.handleThicknessChange,
    onPositionChange: vm.handlePositionChange,
    onRotationChange: vm.handleRotationChange,
    onRoofShapeChange: vm.handleRoofShapeChange,
    onWidthCommit: vm.handleWidthCommit,
    onHeightCommit: vm.handleHeightCommit,
    onRatioChange: vm.handleRatioChange,
    onColorChange: vm.handleColorChange,
    onBubbleFloorChange: vm.handleSelectedBubbleFloorChange,
    onMaterialChange: vm.handleMaterialChange,
    onWallTypeChange: vm.handleUpdateFloorWallType,
    onWallThicknessChange: vm.handleUpdateFloorWallThickness,
    onWallHeightChange: vm.handleUpdateFloorWallHeight,
    onWallMaterialChange: vm.handleUpdateFloorWallMaterial,
    onOpeningSizeChange: vm.handleUpdateFloorOpeningSize,
    onWindowSillHeightChange: vm.handleUpdateFloorWindowSillHeight,
    onDoorSwingDirectionChange: vm.handleUpdateFloorDoorSwingDirection,
    onDoorHingeSideChange: vm.handleUpdateFloorDoorHingeSide,
  }
}

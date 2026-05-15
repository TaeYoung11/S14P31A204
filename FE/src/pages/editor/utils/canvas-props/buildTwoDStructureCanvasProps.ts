import type { EditorPageViewModel } from '../../types/editorPageViewModel'
import type { CanvasPropsSubset } from './canvasPropsSubset'
import { createSafeFloorRoomPolygonHandler } from '../floorRoomPolygonGuard'

/**
 * 2D 벽/개구부/룸 편집 상태와 핸들러를 매핑한다.
 */
export function buildTwoDStructureCanvasProps(
  vm: EditorPageViewModel,
): CanvasPropsSubset<
  | 'floorWallsForHierarchy'
  | 'floorOpenings'
  | 'selectedFloorWallId'
  | 'selectedFloorWallIds'
  | 'selectedFloorOpeningId'
  | 'selectedFloorOpeningIds'
  | 'handleSelectFloorWall'
  | 'handleCreateFloorWall'
  | 'wallCreatePreset'
  | 'handleMoveFloorWall'
  | 'handleUpdateFloorWallEndpoint'
  | 'handleDeleteFloorWall'
  | 'handleCreateFloorOpening'
  | 'handleSelectFloorOpening'
  | 'handleMoveFloorOpening'
  | 'handleDeleteFloorOpening'
  | 'handleMoveFloorRoom'
  | 'handleResizeFloorRoom'
  | 'handleUpdateFloorRoomPolygon'
  | 'beginWorkspaceSnapshotTransaction'
  | 'commitWorkspaceSnapshotTransaction'
  | 'handleTwoDMarqueeSelect'
> {
  const safeHandleUpdateFloorRoomPolygon = createSafeFloorRoomPolygonHandler(
    vm.handleUpdateFloorRoomPolygon,
  )

  return {
    floorWallsForHierarchy: vm.floorWallsForHierarchy,
    floorOpenings: vm.floorOpenings,
    selectedFloorWallId: vm.selectedFloorWallId,
    selectedFloorWallIds: vm.selectedFloorWallIds,
    selectedFloorOpeningId: vm.selectedFloorOpeningId,
    selectedFloorOpeningIds: vm.selectedFloorOpeningIds,
    handleSelectFloorWall: vm.handleSelectFloorWall,
    handleCreateFloorWall: vm.handleCreateFloorWall,
    wallCreatePreset: vm.wallCreatePreset,
    handleMoveFloorWall: vm.handleMoveFloorWall,
    handleUpdateFloorWallEndpoint: vm.handleUpdateFloorWallEndpoint,
    handleDeleteFloorWall: vm.handleDeleteFloorWall,
    handleCreateFloorOpening: vm.handleCreateFloorOpening,
    handleSelectFloorOpening: vm.handleSelectFloorOpening,
    handleMoveFloorOpening: vm.handleMoveFloorOpening,
    handleDeleteFloorOpening: vm.handleDeleteFloorOpening,
    handleMoveFloorRoom: vm.handleMoveFloorRoom,
    handleResizeFloorRoom: vm.handleResizeFloorRoom,
    handleUpdateFloorRoomPolygon: safeHandleUpdateFloorRoomPolygon,
    beginWorkspaceSnapshotTransaction: vm.beginWorkspaceSnapshotTransaction,
    commitWorkspaceSnapshotTransaction: vm.commitWorkspaceSnapshotTransaction,
    handleTwoDMarqueeSelect: vm.handleTwoDMarqueeSelect,
  }
}

import type { EditorPageViewModel } from '../../types/editorPageViewModel'
import type { CanvasPropsSubset } from './canvasPropsSubset'
import { createSafeFloorRoomPolygonHandler } from '../floorRoomPolygonGuard'
import { pickCanvasProps } from './pickCanvasProps'

const TWO_D_STRUCTURE_KEYS = [
  'floorWallsForHierarchy',
  'floorOpenings',
  'selectedFloorWallId',
  'selectedFloorWallIds',
  'selectedFloorOpeningId',
  'selectedFloorOpeningIds',
  'handleSelectFloorWall',
  'handleCreateFloorWall',
  'wallCreatePreset',
  'handleMoveFloorWall',
  'handleUpdateFloorWallEndpoint',
  'handleDeleteFloorWall',
  'handleCreateFloorOpening',
  'handleSelectFloorOpening',
  'handleMoveFloorOpening',
  'handleDeleteFloorOpening',
  'handleMoveFloorRoom',
  'handleResizeFloorRoom',
  'handleUpdateFloorRoomPolygon',
  'beginWorkspaceSnapshotTransaction',
  'commitWorkspaceSnapshotTransaction',
  'handleTwoDMarqueeSelect',
] as const

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
  const props = pickCanvasProps(vm, TWO_D_STRUCTURE_KEYS)

  return {
    ...props,
    handleUpdateFloorRoomPolygon: safeHandleUpdateFloorRoomPolygon,
  }
}

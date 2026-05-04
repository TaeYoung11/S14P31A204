import type { FloorOpening, FloorWall, Point2D } from '../types'

/** 2D 점 좌표를 전송용 튜플로 변환한다. */
export const toPointTuple = (point: Point2D): [number, number] => [point.x, point.y]

/** 벽 편집 상태를 실시간 command payload로 직렬화한다. */
export const serializeWallForCommand = (wall: FloorWall) => ({
  start: toPointTuple(wall.start),
  end: toPointTuple(wall.end),
  thickness: wall.thickness,
  height: wall.heightMm,
  wall_type: wall.type,
})

/** 개구부 편집 상태를 실시간 command payload로 직렬화한다. */
export const serializeOpeningForCommand = (opening: FloorOpening) => ({
  wall_id: opening.wallId,
  wall_position: opening.wallPosition,
  width: opening.widthMm,
  height: opening.heightMm,
  sill_height: opening.sillHeightMm,
  door_hinge_side: opening.doorHingeSide,
  door_swing_direction: opening.doorSwingDirection,
})

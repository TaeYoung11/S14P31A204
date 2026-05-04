import type { FloorRoom } from '../types'

interface RoomPosition {
  x: number
  y: number
}

interface RoomRectUpdate {
  x: number
  y: number
  width: number
  height: number
  widthMm: number
  heightMm: number
  area: number
}

/**
 * FloorRoom을 (dx, dy)만큼 평행이동한다.
 * 폴리곤/컨투어/트랜스폼 원점도 함께 이동해 IFC 원형상 좌표 일관성을 유지한다.
 */
export function translateFloorRoom(
  room: FloorRoom,
  dx: number,
  dy: number,
  absolute?: RoomPosition,
): FloorRoom {
  return {
    ...room,
    x: absolute?.x ?? room.x + dx,
    y: absolute?.y ?? room.y + dy,
    polygon: room.polygon?.map((point) => ({ x: point.x + dx, y: point.y + dy })),
    contour: room.contour?.map((segment) =>
      segment.type === 'line'
        ? {
            type: 'line' as const,
            from: { x: segment.from.x + dx, y: segment.from.y + dy },
            to: { x: segment.to.x + dx, y: segment.to.y + dy },
          }
        : {
            ...segment,
            center: { x: segment.center.x + dx, y: segment.center.y + dy },
          },
    ),
    transform: room.transform
      ? {
          ...room.transform,
          origin: room.transform.origin
            ? { x: room.transform.origin.x + dx, y: room.transform.origin.y + dy }
            : room.transform.origin,
        }
      : undefined,
  }
}

/**
 * 직사각형 기반 편집값으로 Room bbox/치수/면적을 갱신한다.
 * 임의 폴리곤 리사이즈는 지원하지 않으므로 geometry 필드는 제거한다.
 */
export function toRectFloorRoom(room: FloorRoom, next: RoomRectUpdate): FloorRoom {
  return {
    ...room,
    x: next.x,
    y: next.y,
    width: next.width,
    height: next.height,
    widthMm: next.widthMm,
    heightMm: next.heightMm,
    area: next.area,
    polygon: undefined,
    contour: undefined,
    transform: undefined,
  }
}

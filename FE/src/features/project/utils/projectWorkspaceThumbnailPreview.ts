import type { WorkspaceHistorySnapshotResponse } from '@/features/editor/services/workspaceSave.service'
import type { BubbleData, ConnectionData, FloorRoom, FloorWall } from '@/features/editor/types'

export interface PreviewBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export const WORKSPACE_THUMBNAIL_VIEWBOX_WIDTH = 680
export const WORKSPACE_THUMBNAIL_VIEWBOX_HEIGHT = 240

const PREVIEW_PADDING = 28
const EMPTY_BOUNDS: PreviewBounds = {
  minX: 0,
  minY: 0,
  maxX: WORKSPACE_THUMBNAIL_VIEWBOX_WIDTH,
  maxY: WORKSPACE_THUMBNAIL_VIEWBOX_HEIGHT,
}

const numberOr = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const mergeBounds = (bounds: PreviewBounds, next: PreviewBounds): PreviewBounds => ({
  minX: Math.min(bounds.minX, next.minX),
  minY: Math.min(bounds.minY, next.minY),
  maxX: Math.max(bounds.maxX, next.maxX),
  maxY: Math.max(bounds.maxY, next.maxY),
})

export const bubbleBounds = (bubble: BubbleData): PreviewBounds => ({
  minX: numberOr(bubble.x, 0),
  minY: numberOr(bubble.y, 0),
  maxX: numberOr(bubble.x, 0) + Math.max(1, numberOr(bubble.width, 1)),
  maxY: numberOr(bubble.y, 0) + Math.max(1, numberOr(bubble.height, 1)),
})

export const roomBounds = (room: FloorRoom): PreviewBounds => {
  if (room.polygon && room.polygon.length > 0) {
    return room.polygon.reduce<PreviewBounds>(
      (acc, point) =>
        mergeBounds(acc, {
          minX: point.x,
          minY: point.y,
          maxX: point.x,
          maxY: point.y,
        }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    )
  }

  return {
    minX: numberOr(room.x, 0),
    minY: numberOr(room.y, 0),
    maxX: numberOr(room.x, 0) + Math.max(1, numberOr(room.width, 1)),
    maxY: numberOr(room.y, 0) + Math.max(1, numberOr(room.height, 1)),
  }
}

export const buildPreviewBounds = (items: PreviewBounds[]): PreviewBounds => {
  if (items.length === 0) return EMPTY_BOUNDS

  const bounds = items.reduce<PreviewBounds>(
    mergeBounds,
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  )
  if (
    !Number.isFinite(bounds.minX) ||
    !Number.isFinite(bounds.minY) ||
    !Number.isFinite(bounds.maxX) ||
    !Number.isFinite(bounds.maxY)
  ) {
    return EMPTY_BOUNDS
  }

  return bounds
}

/**
 * 저장된 워크스페이스 좌표를 카드 썸네일 SVG viewBox 안으로 맞춰 투영한다.
 */
export const createThumbnailProjector = (bounds: PreviewBounds) => {
  const contentWidth = Math.max(1, bounds.maxX - bounds.minX)
  const contentHeight = Math.max(1, bounds.maxY - bounds.minY)
  const scale = Math.min(
    (WORKSPACE_THUMBNAIL_VIEWBOX_WIDTH - PREVIEW_PADDING * 2) / contentWidth,
    (WORKSPACE_THUMBNAIL_VIEWBOX_HEIGHT - PREVIEW_PADDING * 2) / contentHeight,
  )
  const offsetX = (WORKSPACE_THUMBNAIL_VIEWBOX_WIDTH - contentWidth * scale) / 2
  const offsetY = (WORKSPACE_THUMBNAIL_VIEWBOX_HEIGHT - contentHeight * scale) / 2

  return (x: number, y: number) => ({
    x: offsetX + (x - bounds.minX) * scale,
    y: offsetY + (y - bounds.minY) * scale,
  })
}

export const getThumbnailBubbles = (
  history?: WorkspaceHistorySnapshotResponse | null,
): BubbleData[] =>
  history?.bubble.snapshot?.bubbles ?? history?.floorPlan.snapshot?.bubbles ?? []

export const getThumbnailConnections = (
  history?: WorkspaceHistorySnapshotResponse | null,
): ConnectionData[] =>
  history?.bubble.snapshot?.connections ?? history?.floorPlan.snapshot?.connections ?? []

export const getThumbnailRooms = (
  history?: WorkspaceHistorySnapshotResponse | null,
): FloorRoom[] => {
  const snapshot = history?.floorPlan.snapshot
  const layers = snapshot?.layout?.floorLayers ?? []
  const activeLayer = layers.find((layer) => layer.id === snapshot?.layout?.activeFloorLayerId) ?? layers[0]
  return activeLayer?.rooms ?? []
}

export const getThumbnailWalls = (
  history?: WorkspaceHistorySnapshotResponse | null,
): FloorWall[] =>
  history?.floorPlan.snapshot?.layout?.floorWalls ?? []

export const formatThumbnailArea = (value: unknown): string => {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(numeric) && numeric > 0 ? `${numeric.toFixed(1)} m2` : ''
}

export const buildRoomPolygonPoints = (
  room: FloorRoom,
  project: ReturnType<typeof createThumbnailProjector>,
): string => {
  if (room.polygon && room.polygon.length > 0) {
    return room.polygon
      .map((point) => {
        const projected = project(point.x, point.y)
        return `${projected.x},${projected.y}`
      })
      .join(' ')
  }

  const topLeft = project(room.x, room.y)
  const topRight = project(room.x + room.width, room.y)
  const bottomRight = project(room.x + room.width, room.y + room.height)
  const bottomLeft = project(room.x, room.y + room.height)
  return [topLeft, topRight, bottomRight, bottomLeft]
    .map((point) => `${point.x},${point.y}`)
    .join(' ')
}

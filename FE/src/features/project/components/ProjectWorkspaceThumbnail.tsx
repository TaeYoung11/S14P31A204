import type { EditorMode, BubbleData, ConnectionData, FloorRoom, FloorWall } from '@/features/editor/types'
import type { WorkspaceHistorySnapshotResponse } from '@/features/editor/services/workspaceSave.service'

interface ProjectWorkspaceThumbnailProps {
  mode: Exclude<EditorMode, 'view'>
  history?: WorkspaceHistorySnapshotResponse | null
}

interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

const VIEWBOX_WIDTH = 680
const VIEWBOX_HEIGHT = 240
const PADDING = 28

const EMPTY_BOUNDS: Bounds = { minX: 0, minY: 0, maxX: VIEWBOX_WIDTH, maxY: VIEWBOX_HEIGHT }

const numberOr = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const mergeBounds = (bounds: Bounds, next: Bounds): Bounds => ({
  minX: Math.min(bounds.minX, next.minX),
  minY: Math.min(bounds.minY, next.minY),
  maxX: Math.max(bounds.maxX, next.maxX),
  maxY: Math.max(bounds.maxY, next.maxY),
})

const bubbleBounds = (bubble: BubbleData): Bounds => ({
  minX: numberOr(bubble.x, 0),
  minY: numberOr(bubble.y, 0),
  maxX: numberOr(bubble.x, 0) + Math.max(1, numberOr(bubble.width, 1)),
  maxY: numberOr(bubble.y, 0) + Math.max(1, numberOr(bubble.height, 1)),
})

const roomBounds = (room: FloorRoom): Bounds => {
  if (room.polygon && room.polygon.length > 0) {
    return room.polygon.reduce<Bounds>((acc, point) => mergeBounds(acc, {
      minX: point.x,
      minY: point.y,
      maxX: point.x,
      maxY: point.y,
    }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity })
  }

  return {
    minX: numberOr(room.x, 0),
    minY: numberOr(room.y, 0),
    maxX: numberOr(room.x, 0) + Math.max(1, numberOr(room.width, 1)),
    maxY: numberOr(room.y, 0) + Math.max(1, numberOr(room.height, 1)),
  }
}

const buildBounds = (items: Bounds[]): Bounds => {
  if (items.length === 0) return EMPTY_BOUNDS
  const bounds = items.reduce<Bounds>(mergeBounds, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity })
  if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY) || !Number.isFinite(bounds.maxX) || !Number.isFinite(bounds.maxY)) {
    return EMPTY_BOUNDS
  }
  return bounds
}

const createProjector = (bounds: Bounds) => {
  const contentWidth = Math.max(1, bounds.maxX - bounds.minX)
  const contentHeight = Math.max(1, bounds.maxY - bounds.minY)
  const scale = Math.min((VIEWBOX_WIDTH - PADDING * 2) / contentWidth, (VIEWBOX_HEIGHT - PADDING * 2) / contentHeight)
  const offsetX = (VIEWBOX_WIDTH - contentWidth * scale) / 2
  const offsetY = (VIEWBOX_HEIGHT - contentHeight * scale) / 2

  return (x: number, y: number) => ({
    x: offsetX + (x - bounds.minX) * scale,
    y: offsetY + (y - bounds.minY) * scale,
  })
}

const getBubbles = (history?: WorkspaceHistorySnapshotResponse | null): BubbleData[] =>
  history?.bubble.snapshot?.bubbles ?? history?.floorPlan.snapshot?.bubbles ?? []

const getConnections = (history?: WorkspaceHistorySnapshotResponse | null): ConnectionData[] =>
  history?.bubble.snapshot?.connections ?? history?.floorPlan.snapshot?.connections ?? []

const getRooms = (history?: WorkspaceHistorySnapshotResponse | null): FloorRoom[] => {
  const snapshot = history?.floorPlan.snapshot
  const layers = snapshot?.layout?.floorLayers ?? []
  const activeLayer = layers.find((layer) => layer.id === snapshot?.layout?.activeFloorLayerId) ?? layers[0]
  return activeLayer?.rooms ?? []
}

const getWalls = (history?: WorkspaceHistorySnapshotResponse | null): FloorWall[] =>
  history?.floorPlan.snapshot?.layout?.floorWalls ?? []

const formatArea = (value: unknown): string => {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(numeric) && numeric > 0 ? `${numeric.toFixed(1)} m2` : ''
}

function EmptyPreview() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#eef2ff] via-white to-[#e0f2fe]">
      <span className="text-xs font-black text-[#94a3b8]">Preview</span>
    </div>
  )
}

function BubblePreview({ history }: { history?: WorkspaceHistorySnapshotResponse | null }) {
  const bubbles = getBubbles(history)
  const connections = getConnections(history)
  if (bubbles.length === 0) return <EmptyPreview />

  const bubbleById = new Map(bubbles.map((bubble) => [bubble.id, bubble]))
  const project = createProjector(buildBounds(bubbles.map(bubbleBounds)))

  return (
    <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} className="h-full w-full bg-[#f3f4ff]">
      {connections.map((connection, index) => {
        const from = bubbleById.get(connection.from)
        const to = bubbleById.get(connection.to)
        if (!from || !to) return null
        const fromPoint = project(from.x + from.width / 2, from.y + from.height / 2)
        const toPoint = project(to.x + to.width / 2, to.y + to.height / 2)
        return (
          <line
            key={`${connection.from}-${connection.to}-${index}`}
            x1={fromPoint.x}
            y1={fromPoint.y}
            x2={toPoint.x}
            y2={toPoint.y}
            stroke="#4f46e5"
            strokeWidth={connection.type === 'bold' ? 3 : 2}
            strokeDasharray={connection.type === 'dashed' ? '8 8' : undefined}
            opacity={0.55}
          />
        )
      })}
      {bubbles.map((bubble) => {
        const topLeft = project(bubble.x, bubble.y)
        const bottomRight = project(bubble.x + bubble.width, bubble.y + bubble.height)
        const cx = (topLeft.x + bottomRight.x) / 2
        const cy = (topLeft.y + bottomRight.y) / 2
        const rx = Math.max(36, Math.abs(bottomRight.x - topLeft.x) / 2)
        const ry = Math.max(24, Math.abs(bottomRight.y - topLeft.y) / 2)
        return (
          <g key={bubble.id}>
            <ellipse cx={cx} cy={cy + 4} rx={rx} ry={ry} fill="#cbd5e1" opacity={0.28} />
            <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#ffffff" stroke="#e5e7eb" strokeWidth={2} />
            <text x={cx} y={cy - 10} textAnchor="middle" className="fill-[#111827] text-[28px] font-black">
              {bubble.label || '공간'}
            </text>
            <text x={cx} y={cy + 24} textAnchor="middle" className="fill-[#9ca3af] text-[16px] font-black">
              {formatArea(bubble.ratio)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

const roomPoints = (room: FloorRoom, project: ReturnType<typeof createProjector>) => {
  if (room.polygon && room.polygon.length > 0) {
    return room.polygon.map((point) => {
      const projected = project(point.x, point.y)
      return `${projected.x},${projected.y}`
    }).join(' ')
  }

  const topLeft = project(room.x, room.y)
  const topRight = project(room.x + room.width, room.y)
  const bottomRight = project(room.x + room.width, room.y + room.height)
  const bottomLeft = project(room.x, room.y + room.height)
  return [topLeft, topRight, bottomRight, bottomLeft].map((point) => `${point.x},${point.y}`).join(' ')
}

function TwoDPreview({ history }: { history?: WorkspaceHistorySnapshotResponse | null }) {
  const rooms = getRooms(history)
  const walls = getWalls(history)
  if (rooms.length === 0) return <BubblePreview history={history} />

  const project = createProjector(buildBounds([
    ...rooms.map(roomBounds),
    ...walls.flatMap((wall) => [
      { minX: wall.start.x, minY: wall.start.y, maxX: wall.start.x, maxY: wall.start.y },
      { minX: wall.end.x, minY: wall.end.y, maxX: wall.end.x, maxY: wall.end.y },
    ]),
  ]))

  return (
    <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} className="h-full w-full bg-[#f8fafc]">
      <defs>
        <pattern id="project-card-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#e5e7eb" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill="url(#project-card-grid)" opacity={0.65} />
      {rooms.map((room) => {
        const center = project(room.x + room.width / 2, room.y + room.height / 2)
        return (
          <g key={room.id}>
            <polygon points={roomPoints(room, project)} fill="#eef2ff" stroke="#475569" strokeWidth={2} opacity={0.82} />
            <text x={center.x} y={center.y - 6} textAnchor="middle" className="fill-[#111827] text-[24px] font-black">
              {room.label || '공간'}
            </text>
            <text x={center.x} y={center.y + 22} textAnchor="middle" className="fill-[#9ca3af] text-[15px] font-black">
              {formatArea(room.area)}
            </text>
          </g>
        )
      })}
      {walls.map((wall) => {
        const start = project(wall.start.x, wall.start.y)
        const end = project(wall.end.x, wall.end.y)
        return <line key={wall.id} x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#111827" strokeWidth={3} opacity={0.65} />
      })}
    </svg>
  )
}

function ThreeDPreview({ history }: { history?: WorkspaceHistorySnapshotResponse | null }) {
  const rooms = getRooms(history)
  if (rooms.length === 0) return <TwoDPreview history={history} />
  const project = createProjector(buildBounds(rooms.map(roomBounds)))

  return (
    <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} className="h-full w-full bg-gradient-to-br from-[#f8fafc] to-[#e0f2fe]">
      {rooms.map((room) => {
        const topLeft = project(room.x, room.y)
        const bottomRight = project(room.x + room.width, room.y + room.height)
        const x = topLeft.x
        const y = topLeft.y
        const width = Math.max(36, bottomRight.x - topLeft.x)
        const height = Math.max(28, bottomRight.y - topLeft.y)
        const depth = Math.min(24, Math.max(10, width * 0.12))
        return (
          <g key={room.id}>
            <polygon points={`${x},${y} ${x + depth},${y - depth} ${x + width + depth},${y - depth} ${x + width},${y}`} fill="#ffffff" stroke="#cbd5e1" />
            <polygon points={`${x + width},${y} ${x + width + depth},${y - depth} ${x + width + depth},${y + height - depth} ${x + width},${y + height}`} fill="#dbeafe" stroke="#cbd5e1" />
            <rect x={x} y={y} width={width} height={height} fill="#eff6ff" stroke="#64748b" strokeWidth={2} />
            <text x={x + width / 2} y={y + height / 2} textAnchor="middle" className="fill-[#111827] text-[20px] font-black">
              {room.label || '공간'}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default function ProjectWorkspaceThumbnail({ mode, history }: ProjectWorkspaceThumbnailProps) {
  if (mode === 'bubble') return <BubblePreview history={history} />
  if (mode === '2d') return <TwoDPreview history={history} />
  return <ThreeDPreview history={history} />
}

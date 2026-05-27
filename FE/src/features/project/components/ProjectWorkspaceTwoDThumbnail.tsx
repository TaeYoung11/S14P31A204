import ProjectWorkspaceBubbleThumbnail from '@/features/project/components/ProjectWorkspaceBubbleThumbnail'
import type { WorkspaceHistorySnapshotResponse } from '@/features/editor/services/workspaceSave.service'
import {
  WORKSPACE_THUMBNAIL_VIEWBOX_HEIGHT,
  WORKSPACE_THUMBNAIL_VIEWBOX_WIDTH,
  buildPreviewBounds,
  buildRoomPolygonPoints,
  createThumbnailProjector,
  formatThumbnailArea,
  getThumbnailRooms,
  getThumbnailWalls,
  roomBounds,
} from '@/features/project/utils/projectWorkspaceThumbnailPreview'

interface ProjectWorkspaceTwoDThumbnailProps {
  history?: WorkspaceHistorySnapshotResponse | null
}

/** 2D 평면도 스냅샷의 방과 벽을 프로젝트 카드 안에 맞춰 렌더링한다. */
export default function ProjectWorkspaceTwoDThumbnail({
  history,
}: ProjectWorkspaceTwoDThumbnailProps) {
  const rooms = getThumbnailRooms(history)
  const walls = getThumbnailWalls(history)
  if (rooms.length === 0) return <ProjectWorkspaceBubbleThumbnail history={history} />

  const project = createThumbnailProjector(buildPreviewBounds([
    ...rooms.map(roomBounds),
    ...walls.flatMap((wall) => [
      { minX: wall.start.x, minY: wall.start.y, maxX: wall.start.x, maxY: wall.start.y },
      { minX: wall.end.x, minY: wall.end.y, maxX: wall.end.x, maxY: wall.end.y },
    ]),
  ]))

  return (
    <svg
      viewBox={`0 0 ${WORKSPACE_THUMBNAIL_VIEWBOX_WIDTH} ${WORKSPACE_THUMBNAIL_VIEWBOX_HEIGHT}`}
      className="h-full w-full bg-[#f8fafc]"
    >
      <defs>
        <pattern id="project-card-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#e5e7eb" strokeWidth="1" />
        </pattern>
      </defs>
      <rect
        width={WORKSPACE_THUMBNAIL_VIEWBOX_WIDTH}
        height={WORKSPACE_THUMBNAIL_VIEWBOX_HEIGHT}
        fill="url(#project-card-grid)"
        opacity={0.65}
      />
      {rooms.map((room) => {
        const center = project(room.x + room.width / 2, room.y + room.height / 2)

        return (
          <g key={room.id}>
            <polygon
              points={buildRoomPolygonPoints(room, project)}
              fill="#eef2ff"
              stroke="#475569"
              strokeWidth={2}
              opacity={0.82}
            />
            <text x={center.x} y={center.y - 6} textAnchor="middle" className="fill-[#111827] text-[24px] font-black">
              {room.label || '공간'}
            </text>
            <text x={center.x} y={center.y + 22} textAnchor="middle" className="fill-[#9ca3af] text-[15px] font-black">
              {formatThumbnailArea(room.area)}
            </text>
          </g>
        )
      })}
      {walls.map((wall) => {
        const start = project(wall.start.x, wall.start.y)
        const end = project(wall.end.x, wall.end.y)

        return (
          <line
            key={wall.id}
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            stroke="#111827"
            strokeWidth={3}
            opacity={0.65}
          />
        )
      })}
    </svg>
  )
}

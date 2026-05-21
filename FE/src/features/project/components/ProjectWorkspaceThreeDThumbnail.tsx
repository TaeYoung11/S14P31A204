import ProjectWorkspaceTwoDThumbnail from '@/features/project/components/ProjectWorkspaceTwoDThumbnail'
import type { WorkspaceHistorySnapshotResponse } from '@/features/editor/services/workspaceSave.service'
import {
  WORKSPACE_THUMBNAIL_VIEWBOX_HEIGHT,
  WORKSPACE_THUMBNAIL_VIEWBOX_WIDTH,
  buildPreviewBounds,
  createThumbnailProjector,
  getThumbnailRooms,
  roomBounds,
} from '@/features/project/utils/projectWorkspaceThumbnailPreview'

interface ProjectWorkspaceThreeDThumbnailProps {
  history?: WorkspaceHistorySnapshotResponse | null
}

/** 3D 작업 모드 카드에서 2D 방 스냅샷을 간단한 입체 블록으로 보여준다. */
export default function ProjectWorkspaceThreeDThumbnail({
  history,
}: ProjectWorkspaceThreeDThumbnailProps) {
  const rooms = getThumbnailRooms(history)
  if (rooms.length === 0) return <ProjectWorkspaceTwoDThumbnail history={history} />

  const project = createThumbnailProjector(buildPreviewBounds(rooms.map(roomBounds)))

  return (
    <svg
      viewBox={`0 0 ${WORKSPACE_THUMBNAIL_VIEWBOX_WIDTH} ${WORKSPACE_THUMBNAIL_VIEWBOX_HEIGHT}`}
      className="h-full w-full bg-gradient-to-br from-[#f8fafc] to-[#e0f2fe]"
    >
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
            <polygon
              points={`${x},${y} ${x + depth},${y - depth} ${x + width + depth},${y - depth} ${x + width},${y}`}
              fill="#ffffff"
              stroke="#cbd5e1"
            />
            <polygon
              points={`${x + width},${y} ${x + width + depth},${y - depth} ${x + width + depth},${y + height - depth} ${x + width},${y + height}`}
              fill="#dbeafe"
              stroke="#cbd5e1"
            />
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

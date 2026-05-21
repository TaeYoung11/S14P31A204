import ProjectWorkspaceEmptyPreview from '@/features/project/components/ProjectWorkspaceEmptyPreview'
import type { WorkspaceHistorySnapshotResponse } from '@/features/editor/services/workspaceSave.service'
import {
  WORKSPACE_THUMBNAIL_VIEWBOX_HEIGHT,
  WORKSPACE_THUMBNAIL_VIEWBOX_WIDTH,
  bubbleBounds,
  buildPreviewBounds,
  createThumbnailProjector,
  formatThumbnailArea,
  getThumbnailBubbles,
  getThumbnailConnections,
} from '@/features/project/utils/projectWorkspaceThumbnailPreview'

interface ProjectWorkspaceBubbleThumbnailProps {
  history?: WorkspaceHistorySnapshotResponse | null
}

/** 버블 다이어그램 스냅샷을 프로젝트 카드용 SVG 썸네일로 축약한다. */
export default function ProjectWorkspaceBubbleThumbnail({
  history,
}: ProjectWorkspaceBubbleThumbnailProps) {
  const bubbles = getThumbnailBubbles(history)
  const connections = getThumbnailConnections(history)
  if (bubbles.length === 0) return <ProjectWorkspaceEmptyPreview />

  const bubbleById = new Map(bubbles.map((bubble) => [bubble.id, bubble]))
  const project = createThumbnailProjector(buildPreviewBounds(bubbles.map(bubbleBounds)))

  return (
    <svg
      viewBox={`0 0 ${WORKSPACE_THUMBNAIL_VIEWBOX_WIDTH} ${WORKSPACE_THUMBNAIL_VIEWBOX_HEIGHT}`}
      className="h-full w-full bg-[#f3f4ff]"
    >
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
              {formatThumbnailArea(bubble.ratio)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

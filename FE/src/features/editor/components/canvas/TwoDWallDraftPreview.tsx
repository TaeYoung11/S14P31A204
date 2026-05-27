import { Line } from 'react-konva'
import type { FloorWall, Point2D } from '../../types'
import { FLOOR_WALL_PRESETS } from '../../constants'
import { wallThicknessMmToPx } from './twoDCanvas.utils'

interface TwoDWallDraftPreviewProps {
  isWallTool: boolean
  isDrawingWall: boolean
  wallDraftStart: Point2D | null
  wallDraftEnd: Point2D | null
  wallDraftType: FloorWall['type']
  wallDraftThicknessMm: number
}

/**
 * 벽 생성 중 드래프트 선분 미리보기를 렌더링한다.
 */
export function TwoDWallDraftPreview({
  isWallTool,
  isDrawingWall,
  wallDraftStart,
  wallDraftEnd,
  wallDraftType,
  wallDraftThicknessMm,
}: TwoDWallDraftPreviewProps) {
  if (!isWallTool || !isDrawingWall || !wallDraftStart || !wallDraftEnd) return null

  return (
    <Line
      points={[wallDraftStart.x, wallDraftStart.y, wallDraftEnd.x, wallDraftEnd.y]}
      stroke={FLOOR_WALL_PRESETS[wallDraftType]?.stroke ?? '#3B45B3'}
      strokeWidth={wallThicknessMmToPx(wallDraftThicknessMm)}
      lineCap="round"
      dash={[8, 6]}
    />
  )
}

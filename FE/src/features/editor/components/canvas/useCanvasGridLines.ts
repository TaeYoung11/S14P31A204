import { useMemo } from 'react'

interface UseCanvasGridLinesParams {
  isGridVisible: boolean
  stageWidth: number
  stageHeight: number
  scale: number
  baseOffsetX: number
  baseOffsetY: number
  panOffsetX: number
  panOffsetY: number
  gridStepPx: number
}

export interface GridLines {
  minor: number[][]
  major: number[][]
}

const MIN_GRID_SCREEN_STEP_PX = 12
const MAX_GRID_LINES_PER_AXIS = 240

/**
 * 현재 줌/패닝 상태를 반영한 캔버스 그리드 선분 목록을 생성한다.
 */
export function useCanvasGridLines({
  isGridVisible,
  stageWidth,
  stageHeight,
  scale,
  baseOffsetX,
  baseOffsetY,
  panOffsetX,
  panOffsetY,
  gridStepPx,
}: UseCanvasGridLinesParams): GridLines {
  return useMemo(() => {
    if (!isGridVisible || stageWidth === 0 || stageHeight === 0) {
      return { minor: [] as number[][], major: [] as number[][] }
    }
    const baseMinorStep = Math.max(gridStepPx, 1)
    const majorEvery = 5
    const minor: number[][] = []
    const major: number[][] = []

    const safeScale = scale === 0 ? 1 : scale
    const stageX = baseOffsetX + panOffsetX
    const stageY = baseOffsetY + panOffsetY
    const worldMinX = (-stageX) / safeScale
    const worldMaxX = (stageWidth - stageX) / safeScale
    const worldMinY = (-stageY) / safeScale
    const worldMaxY = (stageHeight - stageY) / safeScale
    const worldWidth = Math.max(worldMaxX - worldMinX, 0)
    const worldHeight = Math.max(worldMaxY - worldMinY, 0)
    const screenStep = baseMinorStep * Math.abs(safeScale)
    const screenStepFactor = screenStep > 0 ? Math.ceil(MIN_GRID_SCREEN_STEP_PX / screenStep) : 1
    const xLineCountFactor = Math.ceil(worldWidth / (baseMinorStep * MAX_GRID_LINES_PER_AXIS))
    const yLineCountFactor = Math.ceil(worldHeight / (baseMinorStep * MAX_GRID_LINES_PER_AXIS))
    const minorStepFactor = Math.max(1, screenStepFactor, xLineCountFactor, yLineCountFactor)
    const minorStep = baseMinorStep * minorStepFactor

    const startXIndex = Math.floor(worldMinX / minorStep)
    const endXIndex = Math.ceil(worldMaxX / minorStep)
    const startYIndex = Math.floor(worldMinY / minorStep)
    const endYIndex = Math.ceil(worldMaxY / minorStep)
    const startX = startXIndex * minorStep
    const endX = endXIndex * minorStep
    const startY = startYIndex * minorStep
    const endY = endYIndex * minorStep

    for (let xIndex = startXIndex; xIndex <= endXIndex; xIndex += 1) {
      const x = xIndex * minorStep
      const pts = [x, startY, x, endY]
      if (xIndex % majorEvery === 0) major.push(pts)
      else minor.push(pts)
    }
    for (let yIndex = startYIndex; yIndex <= endYIndex; yIndex += 1) {
      const y = yIndex * minorStep
      const pts = [startX, y, endX, y]
      if (yIndex % majorEvery === 0) major.push(pts)
      else minor.push(pts)
    }
    return { minor, major }
  }, [isGridVisible, stageWidth, stageHeight, scale, baseOffsetX, baseOffsetY, panOffsetX, panOffsetY, gridStepPx])
}

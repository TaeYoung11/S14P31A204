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
}

export interface GridLines {
  minor: number[][]
  major: number[][]
}

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
}: UseCanvasGridLinesParams): GridLines {
  return useMemo(() => {
    if (!isGridVisible || stageWidth === 0 || stageHeight === 0) {
      return { minor: [] as number[][], major: [] as number[][] }
    }
    const MINOR = 50
    const MAJOR = 250
    const minor: number[][] = []
    const major: number[][] = []

    const safeScale = scale === 0 ? 1 : scale
    const stageX = baseOffsetX + panOffsetX
    const stageY = baseOffsetY + panOffsetY
    const worldMinX = (-stageX) / safeScale
    const worldMaxX = (stageWidth - stageX) / safeScale
    const worldMinY = (-stageY) / safeScale
    const worldMaxY = (stageHeight - stageY) / safeScale

    const startX = Math.floor(worldMinX / MINOR) * MINOR
    const endX = Math.ceil(worldMaxX / MINOR) * MINOR
    const startY = Math.floor(worldMinY / MINOR) * MINOR
    const endY = Math.ceil(worldMaxY / MINOR) * MINOR

    for (let x = startX; x <= endX; x += MINOR) {
      const pts = [x, startY, x, endY]
      if (x % MAJOR === 0) major.push(pts)
      else minor.push(pts)
    }
    for (let y = startY; y <= endY; y += MINOR) {
      const pts = [startX, y, endX, y]
      if (y % MAJOR === 0) major.push(pts)
      else minor.push(pts)
    }
    return { minor, major }
  }, [isGridVisible, stageWidth, stageHeight, scale, baseOffsetX, baseOffsetY, panOffsetX, panOffsetY])
}

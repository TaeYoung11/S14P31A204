// 2D 벽 생성 도구의 기본 타입, 두께, 높이 preset 상태를 관리하는 훅입니다.
import { useState } from 'react'
import { FLOOR_WALL_PRESETS } from '../constants'
import type { FloorWall } from '../types'

export interface FloorWallCreatePreset {
  type: FloorWall['type']
  thickness: number
  heightMm: number
}

export function useFloorWallToolState() {
  const [wallCreatePreset, setWallCreatePreset] = useState<FloorWallCreatePreset>({
    type: 'general',
    thickness: FLOOR_WALL_PRESETS.general.thickness,
    heightMm: FLOOR_WALL_PRESETS.general.heightMm,
  })

  return {
    wallCreatePreset,
    setWallCreatePreset,
  }
}

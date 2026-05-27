import type { EditorCanvasRenderProps } from '../types/editorCanvasContentProps'

/**
 * 활성 2D 레이어의 고도 범위에 포함되는 핀만 필터링한다.
 * - 활성 레이어를 찾지 못하면 안전하게 빈 목록을 반환한다.
 * - elevationMm 누락 레이어는 이전 레이어 끝 고도 기준으로 연속 배치해 범위를 추정한다.
 */
export function resolveVisibleCommentPinsInTwoD(
  floorLayers: EditorCanvasRenderProps['floorLayers'],
  activeFloorLayerId: EditorCanvasRenderProps['activeFloorLayerId'],
  commentPins: EditorCanvasRenderProps['commentPins'],
): EditorCanvasRenderProps['commentPins'] {
  if (floorLayers.length === 0) return commentPins
  if (!activeFloorLayerId) return []

  const hasActiveLayer = floorLayers.some((layer) => layer.id === activeFloorLayerId)
  if (!hasActiveLayer) return []

  const fallbackCeilingHeightMm = 2700
  let runningStartMm = 0
  const rangesByLayerId = new Map<string, { startMm: number; endMm: number }>()

  floorLayers.forEach((layer) => {
    const layerStartMm = Number.isFinite(layer.elevationMm) ? layer.elevationMm as number : runningStartMm
    const layerHeightMm = Number.isFinite(layer.ceilingHeightMm) && (layer.ceilingHeightMm as number) > 0
      ? (layer.ceilingHeightMm as number)
      : fallbackCeilingHeightMm
    const layerEndMm = layerStartMm + layerHeightMm
    rangesByLayerId.set(layer.id, { startMm: layerStartMm, endMm: layerEndMm })
    runningStartMm = layerEndMm
  })

  const activeRange = rangesByLayerId.get(activeFloorLayerId)
  if (!activeRange) return []

  const floorStartMm = activeRange.startMm
  const floorEndMm = activeRange.endMm

  return commentPins.filter((pin) => pin.worldZ >= floorStartMm && pin.worldZ < floorEndMm)
}

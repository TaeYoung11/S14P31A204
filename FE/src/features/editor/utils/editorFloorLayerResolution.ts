import type { IfcStoreyInfo } from '../components/canvas/thatopen/ifcPropertyParser'
import type { ThreeDLibraryPreset } from '../components/canvas/threeDLibrary.types'
import type { FloorLayer } from '../types'

/**
 * 저장/실시간 동기화 payload에서 복원한 IFC 층 이름 override를 정규화한다.
 * expressId는 문자열 key로 저장되므로 NaN key와 빈 이름을 제거해 후속 비교를 단순화한다.
 */
export const normalizeIfcStoreyNameOverrides = (
  overrides?: Record<string, string> | null,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(overrides ?? {})
      .map(([id, name]) => [String(Number(id)), name.trim()] as const)
      .filter(([id, name]) => id !== 'NaN' && name.length > 0),
  )

/**
 * 로드된 IFC 층 목록에 사용자가 수정한 표시명을 덧씌운다.
 * 원본 expressId는 유지하고 패널/저장에 필요한 name만 갱신한다.
 */
export const applyIfcStoreyNameOverrides = (
  storeys: IfcStoreyInfo[],
  overrides: Record<string, string>,
): IfcStoreyInfo[] => {
  if (Object.keys(overrides).length === 0) return storeys
  return storeys.map((storey) => {
    const overrideName = overrides[String(storey.expressId)]
    return overrideName ? { ...storey, name: overrideName } : storey
  })
}

const normalizeFloorLayerNameToken = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, '')

/**
 * 2D에서 자동 생성된 3D 라이브러리 요소가 floorLayerId 없이 남아 있는 경우의 표시 층을 결정한다.
 * 기존 floorLayerId가 유효하면 그대로 사용하고, 지붕/천장/바닥 요소만 층 이름과 타입으로 보정한다.
 */
export const resolveLibraryElementFloorLayerId = (
  element: Pick<ThreeDLibraryPreset, 'floorLayerId' | 'type' | 'name'>,
  floorLayers: FloorLayer[],
  activeFloorLayerId: string | null,
): string | null => {
  if (element.floorLayerId && floorLayers.some((layer) => layer.id === element.floorLayerId)) {
    return element.floorLayerId
  }
  if (floorLayers.length === 0) return element.floorLayerId ?? activeFloorLayerId

  const findLayerByNameTokens = (tokens: string[]) =>
    floorLayers.find((layer) => {
      const nameToken = normalizeFloorLayerNameToken(layer.name)
      const storeyNameToken = normalizeFloorLayerNameToken(layer.storeyName ?? '')
      return tokens.some((token) => nameToken.includes(token) || storeyNameToken.includes(token))
    })?.id ?? null

  if (element.type === 'roof') {
    return findLayerByNameTokens(['옥상', '지붕', 'roof', 'rooftop', 'top']) ??
      floorLayers[floorLayers.length - 1]?.id ??
      activeFloorLayerId
  }
  if (element.type === 'ceiling') {
    return findLayerByNameTokens(['천장', 'ceiling']) ?? activeFloorLayerId ?? floorLayers[0]?.id ?? null
  }
  if (element.type === 'floor') {
    return findLayerByNameTokens(['바닥', 'floor']) ?? activeFloorLayerId ?? floorLayers[0]?.id ?? null
  }

  return activeFloorLayerId ?? floorLayers[0]?.id ?? null
}

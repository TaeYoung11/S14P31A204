import * as turf from '@turf/turf'
import { normalizePolygonRing, validatePolygonRing } from '@/features/project/utils/sitePolygon'

const EARTH_RADIUS_M = 6378137
const M2_PER_PYEONG = 3.305785

interface LngLatPoint {
  lng: number
  lat: number
}

interface XYPoint {
  x: number
  y: number
}

interface SiteCanvasTransformOptions {
  targetWidth: number
  targetHeight: number
  padding?: number
  fitRatio?: number
}

interface SiteRealScaleTransformOptions {
  mmPerPx: number
  centerX: number
  centerY: number
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180
}

function normalizeRing(ring: number[][]): LngLatPoint[] {
  return ring
    .filter((point) => Array.isArray(point) && point.length >= 2)
    .map(([lng, lat]) => ({ lng: Number(lng), lat: Number(lat) }))
    .filter((point) => Number.isFinite(point.lng) && Number.isFinite(point.lat))
}

function toClosedLinearRing(ring: number[][]): number[][] | null {
  const normalizedRing = normalizePolygonRing(ring)
  const validation = validatePolygonRing(normalizedRing)
  if (!validation.isValid) return null

  const [firstLng, firstLat] = normalizedRing[0]
  const [lastLng, lastLat] = normalizedRing[normalizedRing.length - 1]
  const isClosed = firstLng === lastLng && firstLat === lastLat

  return isClosed ? normalizedRing : [...normalizedRing, [firstLng, firstLat]]
}

function projectRingToLocalMeters(ring: number[][]): XYPoint[] {
  const points = normalizeRing(ring)
  if (points.length < 3) return []

  const centroidLatRad = toRadians(points.reduce((sum, point) => sum + point.lat, 0) / points.length)
  const centroidLngRad = toRadians(points.reduce((sum, point) => sum + point.lng, 0) / points.length)
  const cosLat = Math.cos(centroidLatRad)

  if (!Number.isFinite(cosLat) || cosLat === 0) return []

  return points.map((point) => {
    const latRad = toRadians(point.lat)
    const lngRad = toRadians(point.lng)
    return {
      x: EARTH_RADIUS_M * (lngRad - centroidLngRad) * cosLat,
      y: EARTH_RADIUS_M * (latRad - centroidLatRad),
    }
  })
}

/**
 * 경위도(4326) 링을 로컬 접평면으로 근사 투영해 면적(m²)을 계산한다.
 * - 대상 스케일이 '대지' 수준(상대적으로 작은 다각형)일 때 충분히 안정적인 값
 */
export function calculateSiteAreaM2(ring: number[][]): number | null {
  const closedRing = toClosedLinearRing(ring)
  if (!closedRing) return null

  try {
    const polygon = turf.polygon([closedRing])
    const area = turf.area(polygon)
    return Number.isFinite(area) && area > 0 ? area : null
  } catch {
    return null
  }
}

/**
 * 실면적 기준의 로컬 미터 좌표를 캔버스 영역으로 축소 투영한다.
 * - 실면적 데이터는 유지하고, 렌더링 좌표만 화면에 맞게 축소한다.
 */
export function mapSiteRingToCanvasPoints(
  ring: number[][],
  { targetWidth, targetHeight, padding = 0, fitRatio = 1 }: SiteCanvasTransformOptions,
): XYPoint[] | null {
  const projected = projectRingToLocalMeters(ring)
  if (projected.length < 3) return null

  const xs = projected.map((point) => point.x)
  const ys = projected.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  const width = maxX - minX
  const height = maxY - minY
  if (width <= 0 || height <= 0) return null

  const safeTargetWidth = Math.max(targetWidth, 1)
  const safeTargetHeight = Math.max(targetHeight, 1)
  const safePadding = Math.max(padding, 0)

  const innerWidth = Math.max(safeTargetWidth - safePadding * 2, 1)
  const innerHeight = Math.max(safeTargetHeight - safePadding * 2, 1)
  const baseFitScale = Math.min(innerWidth / width, innerHeight / height)
  const safeFitRatio = Math.min(Math.max(fitRatio, 0.2), 1)
  const fitScale = baseFitScale * safeFitRatio
  if (!Number.isFinite(fitScale) || fitScale <= 0) return null

  const scaledWidth = width * fitScale
  const scaledHeight = height * fitScale
  const offsetX = safePadding + (innerWidth - scaledWidth) / 2
  const offsetY = safePadding + (innerHeight - scaledHeight) / 2

  return projected.map((point) => ({
    x: offsetX + (point.x - minX) * fitScale,
    y: offsetY + (point.y - minY) * fitScale,
  }))
}

/**
 * 실측 기반(mm/px)으로 대지 폴리곤을 캔버스 좌표로 변환한다.
 * - 지도의 위경도 링을 로컬 미터 좌표로 투영
 * - 편집기의 mm/px 스케일로 px 환산
 * - 지정한 중심점(centerX/centerY)에 배치
 */
export function mapSiteRingToCanvasPointsByMmScale(
  ring: number[][],
  { mmPerPx, centerX, centerY }: SiteRealScaleTransformOptions,
): XYPoint[] | null {
  const projected = projectRingToLocalMeters(ring)
  if (projected.length < 3) return null

  const safeMmPerPx = Number.isFinite(mmPerPx) && mmPerPx > 0 ? mmPerPx : 25
  const pxPerMeter = 1000 / safeMmPerPx

  const xs = projected.map((point) => point.x)
  const ys = projected.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const centerProjectedX = (minX + maxX) / 2
  const centerProjectedY = (minY + maxY) / 2

  return projected.map((point) => ({
    x: centerX + (point.x - centerProjectedX) * pxPerMeter,
    y: centerY + (point.y - centerProjectedY) * pxPerMeter,
  }))
}

export function toPyeong(areaM2: number): number {
  return areaM2 / M2_PER_PYEONG
}

export function formatAreaM2(areaM2: number): string {
  return `${Math.round(areaM2).toLocaleString('ko-KR')} ㎡`
}

export function formatAreaPyeong(areaM2: number): string {
  return `${toPyeong(areaM2).toFixed(1)} 평`
}

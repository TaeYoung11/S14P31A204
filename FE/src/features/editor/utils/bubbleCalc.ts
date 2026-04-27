/**
 * 버블 다이어그램 크기·면적 계산 유틸리티
 * 순수 함수만 포함 (사이드이펙트 없음)
 */

/** 면적(m²)으로 버블 캔버스 크기(px) 계산 */
export function calcBubbleSize(ratio: number): number {
  return Math.max(80, Math.sqrt(ratio) * 20)
}

/** 가로·세로(mm)로 면적(m²) 계산 */
export function calcAreaM2FromMm(widthMm: number, heightMm: number): number {
  return (widthMm * heightMm) / 1_000_000
}

/** 면적(m²)과 종횡비로 가로·세로(mm) 역산 */
export function calcMmDimensionsByAreaAndAspect(areaM2: number, aspectRatio: number) {
  const safeArea = areaM2 > 0 ? areaM2 : 1
  const safeAspect = aspectRatio > 0 ? aspectRatio : 1
  const areaMm2 = safeArea * 1_000_000
  const heightMm = Math.sqrt(areaMm2 / safeAspect)
  const widthMm = heightMm * safeAspect
  return { widthMm, heightMm }
}

/** 면적(m²)과 종횡비로 캔버스 px 크기 계산 */
export function calcPxDimensionsByAreaAndAspect(areaM2: number, aspectRatio: number) {
  const side = calcBubbleSize(areaM2 > 0 ? areaM2 : 1)
  const safeAspect = aspectRatio > 0 ? aspectRatio : 1
  const width = side * Math.sqrt(safeAspect)
  const height = side / Math.sqrt(safeAspect)
  return { width, height }
}

/** 문자열을 양수로 파싱 (유효하지 않으면 null 반환) */
export function parsePositiveNumber(value: string): number | null {
  const parsed = Number.parseFloat(value)
  if (Number.isNaN(parsed) || parsed <= 0) return null
  return parsed
}

/** 색상 값을 #RRGGBB 형식으로 정규화 */
export function normalizeColorValue(color: string): string {
  const normalized = color.trim().toUpperCase()
  return normalized.startsWith('#') ? normalized : `#${normalized}`
}

/** 조닝 자동 색상 결정 (흰색이면 기본값 사용) */
export function resolveAutoZoneColor(color: string | undefined, defaultColor: string): string {
  const normalized = normalizeColorValue(color ?? defaultColor)
  return normalized === '#FFFFFF' ? defaultColor : normalized
}

/** HEX 색상을 rgba() 문자열로 변환 */
export function hexToRgba(hexColor: string, alpha: number): string {
  const hex = hexColor.replace('#', '')
  if (hex.length !== 6) return `rgba(59, 69, 179, ${alpha})`
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** 대지 다각형 원본 좌표를 스테이지 정중앙 기준으로 이동 */
export function centerSitePoints(rawPoints: number[], stageWidth: number, stageHeight: number): number[] {
  const xs = rawPoints.filter((_, i) => i % 2 === 0)
  const ys = rawPoints.filter((_, i) => i % 2 === 1)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const dx = stageWidth / 2 - cx
  const dy = stageHeight / 2 - cy
  return rawPoints.map((v, i) => (i % 2 === 0 ? v + dx : v + dy))
}

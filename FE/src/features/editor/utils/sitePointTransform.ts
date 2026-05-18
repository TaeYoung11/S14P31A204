interface FitSitePointsOptions {
  padding?: number
  fitRatio?: number
}

export interface FlatPointsBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
  width: number
  height: number
  cx: number
  cy: number
}

/** [x1,y1,x2,y2,...] 평면 좌표 배열의 경계 박스를 계산 */
export function getFlatPointsBounds(points: number[]): FlatPointsBounds | null {
  if (!Array.isArray(points) || points.length < 6) return null
  const xs = points.filter((_, index) => index % 2 === 0)
  const ys = points.filter((_, index) => index % 2 === 1)
  if (xs.length < 3 || ys.length < 3) return null

  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const width = maxX - minX
  const height = maxY - minY
  if (width <= 0 || height <= 0) return null

  return {
    minX,
    maxX,
    minY,
    maxY,
    width,
    height,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  }
}

/** 모든 좌표를 동일 오프셋(dx, dy)으로 평행 이동 */
export function translateFlatPoints(points: number[], dx: number, dy: number): number[] {
  return points.map((value, index) => (index % 2 === 0 ? value + dx : value + dy))
}

/** 중심점(cx, cy) 기준으로 평면 좌표를 스케일링 */
export function scaleFlatPointsAround(points: number[], scale: number, cx: number, cy: number): number[] {
  return points.map((value, index) => {
    const base = index % 2 === 0 ? cx : cy
    return base + (value - base) * scale
  })
}

/** 중심점(cx, cy) 기준으로 평면 좌표를 회전한다. */
export function rotateFlatPointsAround(points: number[], radians: number, cx: number, cy: number): number[] {
  if (!Number.isFinite(radians) || Math.abs(radians) < 1e-9) return [...points]
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const rotated: number[] = []
  for (let i = 0; i + 1 < points.length; i += 2) {
    const dx = points[i] - cx
    const dy = points[i + 1] - cy
    rotated.push(cx + dx * cos - dy * sin)
    rotated.push(cy + dx * sin + dy * cos)
  }
  return rotated
}

function normalizeUndirectedAngle(radians: number): number {
  let angle = radians
  while (angle >= Math.PI / 2) angle -= Math.PI
  while (angle < -Math.PI / 2) angle += Math.PI
  return angle
}

/**
 * 다각형의 에지 방향을 길이 가중 평균해 주축 각도를 구한다.
 * 반대 방향(180도 차이)은 동일 축으로 취급한다.
 */
export function getDominantEdgeAngleRadians(points: number[]): number | null {
  if (!Array.isArray(points) || points.length < 8) return null
  let sumCos2 = 0
  let sumSin2 = 0
  let validEdgeCount = 0
  const count = Math.floor(points.length / 2)

  for (let i = 0; i < count; i += 1) {
    const currentX = points[i * 2]
    const currentY = points[i * 2 + 1]
    const nextIndex = (i + 1) % count
    const nextX = points[nextIndex * 2]
    const nextY = points[nextIndex * 2 + 1]
    const dx = nextX - currentX
    const dy = nextY - currentY
    const length = Math.hypot(dx, dy)
    if (!Number.isFinite(length) || length <= 1e-6) continue
    const angle = normalizeUndirectedAngle(Math.atan2(dy, dx))
    // 180도 대칭 축 평균을 위해 2배각 벡터 평균을 사용한다.
    sumCos2 += Math.cos(angle * 2) * length
    sumSin2 += Math.sin(angle * 2) * length
    validEdgeCount += 1
  }

  if (validEdgeCount === 0) return null
  return normalizeUndirectedAngle(0.5 * Math.atan2(sumSin2, sumCos2))
}

/**
 * 평면 좌표 다각형을 화면 축 기준으로 반듯하게 정렬한다.
 * 반환 rotationRadians는 입력 points를 회전시킨 각도(라디안)다.
 */
export function alignFlatPointsToAxis(points: number[]): { points: number[]; rotationRadians: number } {
  const bounds = getFlatPointsBounds(points)
  const dominant = getDominantEdgeAngleRadians(points)
  if (!bounds || dominant === null) {
    return { points: [...points], rotationRadians: 0 }
  }
  const rotationRadians = -dominant
  return {
    points: rotateFlatPointsAround(points, rotationRadians, bounds.cx, bounds.cy),
    rotationRadians,
  }
}

/** 평면 좌표 외곽을 감싸는 축정렬 작업 프레임(사각형) 좌표를 생성한다. */
export function buildAxisAlignedFrameFromFlatPoints(points: number[], insetPx = 18): number[] {
  const bounds = getFlatPointsBounds(points)
  if (!bounds) return []
  const maxInset = Math.max(0, Math.min(bounds.width, bounds.height) * 0.2)
  const safeInset = Math.min(Math.max(insetPx, 0), maxInset)
  const minX = bounds.minX + safeInset
  const maxX = bounds.maxX - safeInset
  const minY = bounds.minY + safeInset
  const maxY = bounds.maxY - safeInset
  if (!(maxX > minX && maxY > minY)) {
    return [
      bounds.minX, bounds.minY,
      bounds.maxX, bounds.minY,
      bounds.maxX, bounds.maxY,
      bounds.minX, bounds.maxY,
    ]
  }
  return [
    minX, minY,
    maxX, minY,
    maxX, maxY,
    minX, maxY,
  ]
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

/**
 * 대지 원본 좌표계를 스테이지 크기에 비례해 리스케일한 뒤 중앙 정렬한다.
 * - 좌표 비율(종횡비)은 유지
 * - stageSize 변화 시 대지가 고정 px처럼 보이지 않도록 반응형으로 맞춘다.
 */
export function fitSitePointsToStage(
  rawPoints: number[],
  stageWidth: number,
  stageHeight: number,
  { padding = 0, fitRatio = 1 }: FitSitePointsOptions = {},
): number[] {
  if (!Array.isArray(rawPoints) || rawPoints.length < 6) return rawPoints

  const xs = rawPoints.filter((_, i) => i % 2 === 0)
  const ys = rawPoints.filter((_, i) => i % 2 === 1)
  if (xs.length < 3 || ys.length < 3) return rawPoints

  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const width = maxX - minX
  const height = maxY - minY
  if (width <= 0 || height <= 0) return centerSitePoints(rawPoints, stageWidth, stageHeight)

  const safeStageWidth = Math.max(stageWidth, 1)
  const safeStageHeight = Math.max(stageHeight, 1)
  const safePadding = Math.max(padding, 0)
  const innerWidth = Math.max(safeStageWidth - safePadding * 2, 1)
  const innerHeight = Math.max(safeStageHeight - safePadding * 2, 1)
  const safeFitRatio = Math.min(Math.max(fitRatio, 0.2), 1)
  const scale = Math.min(innerWidth / width, innerHeight / height) * safeFitRatio
  if (!Number.isFinite(scale) || scale <= 0) return centerSitePoints(rawPoints, stageWidth, stageHeight)

  const scaledWidth = width * scale
  const scaledHeight = height * scale
  const offsetX = safePadding + (innerWidth - scaledWidth) / 2
  const offsetY = safePadding + (innerHeight - scaledHeight) / 2

  return rawPoints.map((value, index) => {
    if (index % 2 === 0) return offsetX + (value - minX) * scale
    return offsetY + (value - minY) * scale
  })
}

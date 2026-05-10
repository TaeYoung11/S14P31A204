import type {
  BubbleData,
  ConnectionData,
  EditorMode,
  FloorCommentAttachment,
  FloorCommentAttachmentInput,
  Point2D,
} from '../types'
import type { AxisAlignedRect } from './geometry2d'
import type {
  FloorPlanRoomType,
  LayoutImportV2,
  LayoutImportV2Boundary,
} from '../services/floorPlanGenerate.contract'

const DEFAULT_FLOOR_PLAN_MM_PER_PX = 25
/**
 * 사용 가능한 실제 대지가 없을 때 생성 payload에 적용하는 기본 경계 여백입니다.
 * 기존 화면 fallback 여백(80px * 25mm/px)에 맞춘 호환 기본값이며,
 * 제품/AI 생성 품질 기준으로 확정된 최종 최적값은 아닙니다.
 */
export const DEFAULT_LAYOUT_BOUNDARY_PADDING_MM = 2000
const EPSILON = 1e-9
const EDITOR_MODES: EditorMode[] = ['bubble', '2d', '3d', 'view']

export type LayoutImportBoundarySource = 'site' | 'default' | 'none'
export type LayoutImportBoundaryFallbackReason = 'site-loading' | 'missing-site' | 'site-mapping-failed'
export type LayoutImportBoundaryOmitReason =
  | 'empty-bubbles'
  | 'invalid-bubble-bounds'
  | 'invalid-padding'
  | 'invalid-site-boundary'

export type LayoutImportBoundaryInput =
  | { source: 'site'; sitePlanPoints: number[] }
  | { source: 'default'; paddingMm: number; fallbackReason?: LayoutImportBoundaryFallbackReason }
  | { source: 'none'; reason?: LayoutImportBoundaryOmitReason }

export interface LayoutImportBoundaryLogMetadata {
  boundarySource: LayoutImportBoundarySource
  boundaryIncluded: boolean
  fallbackReason?: LayoutImportBoundaryFallbackReason
  paddingMm?: number
  boundaryOmitReason?: LayoutImportBoundaryOmitReason
}

function normalizeFloorPlanRoomType(rawType: string): FloorPlanRoomType {
  const normalized = rawType.trim().toLowerCase()
  switch (normalized) {
    case '거실':
    case 'living':
      return 'living'
    case '침실':
    case 'bedroom':
    case '방':
      return 'bedroom'
    case '주방':
    case 'kitchen':
      return 'kitchen'
    case '화장실':
    case 'bathroom':
      return 'bathroom'
    case '복도':
    case 'corridor':
    case '현관':
      return 'corridor'
    case '사무실':
    case 'office':
      return 'office'
    default:
      return 'other'
  }
}

function toFiniteNumber(value: number): number {
  return Number.isFinite(value) ? value : Number.NaN
}

function toPositiveMillimeter(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  const rounded = Math.round(value)
  return rounded > 0 ? rounded : 0
}

/** 버블 위치(좌상단)를 버블 중심(mm)으로 변환 */
function toBubbleCenterMillimeterPosition(bubble: BubbleData, mmPerPx: number) {
  return {
    x: toFiniteNumber((bubble.x + bubble.width / 2) * mmPerPx),
    y: toFiniteNumber((bubble.y + bubble.height / 2) * mmPerPx),
  }
}

export function resolveMmPerPxForFloorPlan(bubbles: BubbleData[]): number {
  for (const bubble of bubbles) {
    if (Number.isFinite(bubble.widthMm) && Number.isFinite(bubble.width) && bubble.widthMm > 0 && bubble.width > 0) {
      return bubble.widthMm / bubble.width
    }
    if (Number.isFinite(bubble.heightMm) && Number.isFinite(bubble.height) && bubble.heightMm > 0 && bubble.height > 0) {
      return bubble.heightMm / bubble.height
    }
  }
  return DEFAULT_FLOOR_PLAN_MM_PER_PX
}

function toConnectionStrength(type: ConnectionData['type']): number {
  if (type === 'bold') return 1
  if (type === 'thin') return 0.6
  return 0.3
}

function toBoundaryPolygonPairs(sitePlanPoints: number[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = []
  for (let index = 0; index + 1 < sitePlanPoints.length; index += 2) {
    const x = sitePlanPoints[index]
    const y = sitePlanPoints[index + 1]
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    pairs.push([x, y])
  }
  return pairs
}

function isSameCoordinatePair(a: [number, number], b: [number, number]): boolean {
  return Math.abs(a[0] - b[0]) < EPSILON && Math.abs(a[1] - b[1]) < EPSILON
}

function stripClosingCoordinatePair(polygon: Array<[number, number]>): Array<[number, number]> {
  if (polygon.length < 2) return polygon
  const first = polygon[0]
  const last = polygon[polygon.length - 1]
  return isSameCoordinatePair(first, last) ? polygon.slice(0, -1) : polygon
}

function getUniqueBubbles(bubbles: BubbleData[]): BubbleData[] {
  const uniqueBubbles = new Map<string, BubbleData>()
  bubbles.forEach((bubble) => {
    if (!uniqueBubbles.has(bubble.id)) uniqueBubbles.set(bubble.id, bubble)
  })
  return [...uniqueBubbles.values()]
}

function getSignedPolygonArea(polygon: Array<[number, number]>): number {
  if (polygon.length < 3) return 0
  let doubledArea = 0
  for (let index = 0; index < polygon.length; index += 1) {
    const [x1, y1] = polygon[index]
    const [x2, y2] = polygon[(index + 1) % polygon.length]
    doubledArea += x1 * y2 - x2 * y1
  }
  return doubledArea / 2
}

function toLayoutImportBoundaryFromPolygonMm(
  polygonMm: Array<[number, number]>,
): LayoutImportV2Boundary | null {
  const normalizedPolygon = stripClosingCoordinatePair(polygonMm)
  if (normalizedPolygon.length < 3) return null

  const signedArea = getSignedPolygonArea(normalizedPolygon)
  if (!Number.isFinite(signedArea) || signedArea === 0) return null

  return {
    floor: 1,
    polygon: signedArea > 0 ? normalizedPolygon : [...normalizedPolygon].reverse(),
  }
}

function toSiteLayoutImportBoundary(
  sitePlanPoints: number[],
  mmPerPx: number,
): LayoutImportV2Boundary | null {
  const polygonPx = stripClosingCoordinatePair(toBoundaryPolygonPairs(sitePlanPoints))
  if (polygonPx.length < 3) return null

  const polygonMm = polygonPx.map(([x, y]) => [x * mmPerPx, y * mmPerPx] as [number, number])
  return toLayoutImportBoundaryFromPolygonMm(polygonMm)
}

function toDefaultLayoutImportBoundary(
  bubbles: BubbleData[],
  mmPerPx: number,
  paddingMm: number,
): { boundary: LayoutImportV2Boundary | null; omitReason?: LayoutImportBoundaryOmitReason } {
  if (bubbles.length === 0) return { boundary: null, omitReason: 'empty-bubbles' }
  if (!Number.isFinite(paddingMm) || paddingMm <= 0) return { boundary: null, omitReason: 'invalid-padding' }

  const validBubbles = bubbles.filter((bubble) => (
    Number.isFinite(bubble.x) &&
    Number.isFinite(bubble.y) &&
    Number.isFinite(bubble.width) &&
    Number.isFinite(bubble.height) &&
    bubble.width > 0 &&
    bubble.height > 0
  ))
  if (validBubbles.length === 0) return { boundary: null, omitReason: 'invalid-bubble-bounds' }

  const minX = Math.min(...validBubbles.map((bubble) => bubble.x))
  const minY = Math.min(...validBubbles.map((bubble) => bubble.y))
  const maxX = Math.max(...validBubbles.map((bubble) => bubble.x + bubble.width))
  const maxY = Math.max(...validBubbles.map((bubble) => bubble.y + bubble.height))
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return { boundary: null, omitReason: 'invalid-bubble-bounds' }
  }
  if (maxX <= minX || maxY <= minY) return { boundary: null, omitReason: 'invalid-bubble-bounds' }

  const minXMm = minX * mmPerPx - paddingMm
  const minYMm = minY * mmPerPx - paddingMm
  const maxXMm = maxX * mmPerPx + paddingMm
  const maxYMm = maxY * mmPerPx + paddingMm
  const boundary = toLayoutImportBoundaryFromPolygonMm([
    [minXMm, minYMm],
    [maxXMm, minYMm],
    [maxXMm, maxYMm],
    [minXMm, maxYMm],
  ])

  return boundary ? { boundary } : { boundary: null, omitReason: 'invalid-bubble-bounds' }
}

function toLayoutImportBoundaryFromInput(
  boundaryInput: LayoutImportBoundaryInput,
  bubbles: BubbleData[],
  mmPerPx: number,
): { boundary: LayoutImportV2Boundary | null; omitReason?: LayoutImportBoundaryOmitReason } {
  if (boundaryInput.source === 'site') {
    const boundary = toSiteLayoutImportBoundary(boundaryInput.sitePlanPoints, mmPerPx)
    return boundary ? { boundary } : { boundary: null, omitReason: 'invalid-site-boundary' }
  }
  if (boundaryInput.source === 'default') {
    return toDefaultLayoutImportBoundary(bubbles, mmPerPx, boundaryInput.paddingMm)
  }
  return { boundary: null, omitReason: boundaryInput.reason }
}

export function getLayoutImportBoundaryLogMetadata(
  boundaryInput: LayoutImportBoundaryInput,
  bubbles: BubbleData[],
  layoutImport: LayoutImportV2,
): LayoutImportBoundaryLogMetadata {
  const boundaryIncluded = Boolean(layoutImport.boundaries?.length)
  const mmPerPx = resolveMmPerPxForFloorPlan(bubbles)
  const boundaryResult = boundaryIncluded
    ? { boundary: layoutImport.boundaries?.[0] ?? null }
    : toLayoutImportBoundaryFromInput(boundaryInput, getUniqueBubbles(bubbles), mmPerPx)

  return {
    boundarySource: boundaryInput.source,
    boundaryIncluded,
    ...(boundaryInput.source === 'default' ? {
      fallbackReason: boundaryInput.fallbackReason,
      paddingMm: boundaryInput.paddingMm,
    } : {}),
    ...(!boundaryIncluded && boundaryResult.omitReason ? { boundaryOmitReason: boundaryResult.omitReason } : {}),
  }
}

/**
 * 버블/연결선 상태를 Floor Plan 생성 API의 layoutImport(v2) payload로 변환한다.
 * - room id 중복 제거
 * - room 타입/치수 정규화
 * - 유효한 room 쌍만 adjacency로 매핑
 */
export function buildFloorPlanLayoutImportPayload(
  projectId: string,
  projectName: string,
  bubbles: BubbleData[],
  connections: ConnectionData[],
  boundaryInput: LayoutImportBoundaryInput,
): LayoutImportV2 {
  const mmPerPx = resolveMmPerPxForFloorPlan(bubbles)
  const uniqueBubbles = getUniqueBubbles(bubbles)

  const rooms = uniqueBubbles.map((bubble) => {
    const center = toBubbleCenterMillimeterPosition(bubble, mmPerPx)
    return {
      id: bubble.id,
      name: bubble.label.trim() || bubble.id,
      type: normalizeFloorPlanRoomType(bubble.type),
      width: toPositiveMillimeter(bubble.widthMm),
      height: toPositiveMillimeter(bubble.heightMm),
      floor: 1,
      x: center.x,
      y: center.y,
      angle: 0,
      locked: false,
      zoneId: null,
    }
  })

  const roomIdSet = new Set(rooms.map((room) => room.id))
  const adjacency = connections
    .filter((connection) => roomIdSet.has(connection.from) && roomIdSet.has(connection.to))
    .map((connection) => ({
      from_room_id: connection.from,
      to_room_id: connection.to,
      strength: toConnectionStrength(connection.type),
    }))
  const boundary = toLayoutImportBoundaryFromInput(boundaryInput, uniqueBubbles, mmPerPx).boundary

  return {
    schema_version: 'v2',
    id: projectId,
    name: projectName.trim() || '프로젝트',
    rooms: rooms.map((room) => ({ ...room })),
    ...(adjacency.length > 0 ? { adjacency } : {}),
    ...(boundary ? { boundaries: [boundary] } : {}),
    generation_options: {
      generate_spaces: true,
      generate_walls: true,
      generate_slabs: true,
      generate_roof: true,
      generate_openings: false,
    },
    generation_policy: {
      boundary_wall_mode: 'outer_boundary',
      shared_wall_policy: 'from_adjacency',
      roof_shape: 'flat',
    },
  }
}

/** URL 파라미터에서 모드 파싱 — 허용 목록 외 값은 기본 모드(bubble)로 처리 */
export function resolveEditorMode(value: string | null): EditorMode {
  return EDITOR_MODES.includes(value as EditorMode) ? (value as EditorMode) : 'bubble'
}

/** 경량 랜덤 ID 생성기 (로컬 임시 객체 전용) */
export function createLocalId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** 2D 벽 고유 ID 생성 */
export function createFloorWallId(): string {
  return `wall-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

/** 2D 개구부 고유 ID 생성 */
export function createFloorOpeningId(): string {
  return `opening-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

/** Room polygon이 유효한 최소 다각형인지 확인 */
export function isFinitePolygonPoints(points: Point2D[]): boolean {
  return points.length >= 3 && points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
}

/** shoelace 공식으로 polygon 면적(px²)을 계산한다. */
export function getPolygonAreaPx(points: Point2D[]): number {
  if (points.length < 3) return 0
  let sum = 0
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i]
    const next = points[(i + 1) % points.length]
    sum += current.x * next.y - next.x * current.y
  }
  return Math.abs(sum) / 2
}

/** polygon의 axis-aligned bounding box를 계산한다. */
export function getPolygonBounds(points: Point2D[]) {
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}

/** 직사각형 리사이즈 비율을 polygon 꼭짓점에 적용해 좌표를 스케일한다. */
export function scalePolygonToRect(
  polygon: Point2D[],
  fromRect: AxisAlignedRect,
  toRect: AxisAlignedRect,
): Point2D[] {
  const baseWidth = Math.max(fromRect.width, 1)
  const baseHeight = Math.max(fromRect.height, 1)
  const scaleX = toRect.width / baseWidth
  const scaleY = toRect.height / baseHeight
  return polygon.map((point) => ({
    x: toRect.x + (point.x - fromRect.x) * scaleX,
    y: toRect.y + (point.y - fromRect.y) * scaleY,
  }))
}

/** 댓글 입력 첨부를 화면 상태에서 사용하는 첨부 타입으로 정규화한다. */
export function normalizeCommentAttachments(
  attachments: FloorCommentAttachmentInput[] = [],
): FloorCommentAttachment[] {
  return attachments.map((attachment) => ({
    id: createLocalId('attachment'),
    kind: attachment.kind,
    name: attachment.name,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    url: attachment.url,
  }))
}

/** 두 연결선 쌍이 동일한지 비교 (방향 무관) */
export function isSameConnection(
  a: { from: string; to: string },
  b: { from: string; to: string },
): boolean {
  return (a.from === b.from && a.to === b.to) || (a.from === b.to && a.to === b.from)
}

/** 단일 선택 + 멀티 선택 목록을 중복 없이 합친다. */
export function mergeSelectedIds(primaryIds: string[], focusedId: string | null): string[] {
  return Array.from(new Set([
    ...primaryIds,
    ...(focusedId ? [focusedId] : []),
  ]))
}

/** auto-shared 벽 ID를 대응되는 auto-door 개구부 ID로 변환한다. */
export function toAutoDoorOpeningIdFromWallId(wallId: string): string | null {
  if (!wallId.startsWith('auto-shared-')) return null
  const pair = wallId.replace(/^auto-shared-/, '').replace(/-seg-\d+$/, '')
  return pair ? `auto-door-${pair}` : null
}

/** 삭제 벽 목록에서 함께 숨겨야 할 auto-door 개구부 ID 목록을 계산한다. */
export function collectAutoDoorOpeningIdsFromWallIds(wallIds: Iterable<string>): string[] {
  const openingIdSet = new Set<string>()
  for (const wallId of wallIds) {
    const openingId = toAutoDoorOpeningIdFromWallId(wallId)
    if (openingId) openingIdSet.add(openingId)
  }
  return Array.from(openingIdSet)
}

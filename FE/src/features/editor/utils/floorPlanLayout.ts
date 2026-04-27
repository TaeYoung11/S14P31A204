/**
 * 버블 다이어그램 → 2D 평면도 레이아웃 변환 알고리즘
 *
 * 접근법: BFS 기반 인접 배치
 *  1. 연결선이 많은 버블부터 BFS 시작
 *  2. 연결된 버블들은 서로 맞닿도록(공유 벽) 배치
 *  3. 연결 없는 버블들은 이전 그룹 오른쪽에 배치
 *  4. mm 단위 좌표계에서 배치 후, 캔버스 크기에 맞게 스케일·중앙 정렬
 */

import type { BubbleData, ConnectionData, FloorRoom } from '../types'

/** mm 단위의 방 사각형 (내부 계산용) */
interface RectMm {
  id: string
  x: number
  y: number
  w: number
  h: number
}

/** 두 사각형이 겹치는지 확인 (접촉은 겹침 아님) */
function hasOverlap(x: number, y: number, w: number, h: number, placed: RectMm[]): boolean {
  return placed.some(
    (r) => x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y,
  )
}

/**
 * anchor 사각형 주변 6개 방향에서 targetW × targetH 가 들어갈 위치 탐색
 * 성공 시 위치 반환, 실패 시 null
 */
function findAdjacentPosition(
  anchor: RectMm,
  targetW: number,
  targetH: number,
  placed: RectMm[],
): { x: number; y: number } | null {
  const candidates = [
    { x: anchor.x + anchor.w, y: anchor.y },                          // 오른쪽 (상단 정렬)
    { x: anchor.x, y: anchor.y + anchor.h },                          // 아래 (좌측 정렬)
    { x: anchor.x - targetW, y: anchor.y },                           // 왼쪽 (상단 정렬)
    { x: anchor.x, y: anchor.y - targetH },                           // 위 (좌측 정렬)
    { x: anchor.x + anchor.w, y: anchor.y + anchor.h - targetH },     // 오른쪽 (하단 정렬)
    { x: anchor.x - targetW, y: anchor.y + anchor.h - targetH },      // 왼쪽 (하단 정렬)
  ]
  for (const c of candidates) {
    if (!hasOverlap(c.x, c.y, targetW, targetH, placed)) return c
  }
  return null
}

/** 모든 배치된 방의 오른쪽 끝 + gap 위치를 반환 (fallback) */
function fallbackPosition(_w: number, _h: number, placed: RectMm[], gapMm = 0): { x: number; y: number } {
  if (placed.length === 0) return { x: 0, y: 0 }
  const rightmostX = Math.max(...placed.map((r) => r.x + r.w))
  return { x: rightmostX + gapMm, y: 0 }
}

/**
 * 버블 데이터 + 연결선 → 평면도 방 목록 변환
 *
 * @param bubbles  버블 다이어그램 데이터
 * @param connections  연결선 데이터
 * @param canvasWidth  캔버스 가로 px
 * @param canvasHeight 캔버스 세로 px
 */
export function generateFloorPlanLayout(
  bubbles: BubbleData[],
  connections: ConnectionData[],
  canvasWidth: number,
  canvasHeight: number,
): FloorRoom[] {
  if (bubbles.length === 0) return []

  // ── 1. 인접 그래프 구축 ──────────────────────────────────────────────────
  const adjacency = new Map<string, string[]>()
  bubbles.forEach((b) => adjacency.set(b.id, []))
  connections.forEach((c) => {
    adjacency.get(c.from)?.push(c.to)
    adjacency.get(c.to)?.push(c.from)
  })

  // ── 2. BFS 순서 결정: 연결 수 내림차순 → 면적 내림차순 ───────────────────
  const sorted = [...bubbles].sort(
    (a, b) =>
      (adjacency.get(b.id)?.length ?? 0) - (adjacency.get(a.id)?.length ?? 0) ||
      b.ratio - a.ratio,
  )

  const bubbleMap = new Map(bubbles.map((b) => [b.id, b]))
  const placed: RectMm[] = []
  const placedMap = new Map<string, RectMm>()
  const visited = new Set<string>()

  // ── 3. 연결 컴포넌트별 BFS 배치 ─────────────────────────────────────────
  for (const seed of sorted) {
    if (visited.has(seed.id)) continue

    // 새 컴포넌트 시작: 이전 그룹 오른쪽 + 800mm 갭
    const startPos =
      placed.length === 0
        ? { x: 0, y: 0 }
        : fallbackPosition(seed.widthMm, seed.heightMm, placed, 800)

    const seedRect: RectMm = {
      id: seed.id,
      x: startPos.x,
      y: startPos.y,
      w: seed.widthMm,
      h: seed.heightMm,
    }
    placed.push(seedRect)
    placedMap.set(seed.id, seedRect)
    visited.add(seed.id)

    // BFS 내부 탐색
    const queue: string[] = [seed.id]
    while (queue.length > 0) {
      const currentId = queue.shift()!
      const currentRect = placedMap.get(currentId)!
      const neighbors = adjacency.get(currentId) ?? []

      for (const neighborId of neighbors) {
        if (visited.has(neighborId)) continue
        visited.add(neighborId)
        queue.push(neighborId)

        const neighbor = bubbleMap.get(neighborId)!
        const pos =
          findAdjacentPosition(currentRect, neighbor.widthMm, neighbor.heightMm, placed) ??
          fallbackPosition(neighbor.widthMm, neighbor.heightMm, placed, 800)

        const rect: RectMm = {
          id: neighborId,
          x: pos.x,
          y: pos.y,
          w: neighbor.widthMm,
          h: neighbor.heightMm,
        }
        placed.push(rect)
        placedMap.set(neighborId, rect)
      }
    }
  }

  // ── 4. 바운딩 박스 계산 ──────────────────────────────────────────────────
  const minX = Math.min(...placed.map((r) => r.x))
  const minY = Math.min(...placed.map((r) => r.y))
  const maxX = Math.max(...placed.map((r) => r.x + r.w))
  const maxY = Math.max(...placed.map((r) => r.y + r.h))
  const layoutW = maxX - minX
  const layoutH = maxY - minY

  // ── 5. 캔버스 크기에 맞게 스케일 조정 + 중앙 정렬 ───────────────────────
  const PAD = 80
  const scaleX = layoutW > 0 ? (canvasWidth - PAD * 2) / layoutW : 1
  const scaleY = layoutH > 0 ? (canvasHeight - PAD * 2) / layoutH : 1
  // 최대 0.15 px/mm 로 제한 (거대한 방이 캔버스를 가득 채우지 않도록)
  const scale = Math.min(scaleX, scaleY, 0.15)

  const offsetX = (canvasWidth - layoutW * scale) / 2 - minX * scale
  const offsetY = (canvasHeight - layoutH * scale) / 2 - minY * scale

  // ── 6. FloorRoom 배열 반환 ───────────────────────────────────────────────
  return bubbles.map((bubble) => {
    const rect = placedMap.get(bubble.id)!
    return {
      id: bubble.id,
      bubbleId: bubble.id,
      label: bubble.label,
      type: bubble.type,
      x: rect.x * scale + offsetX,
      y: rect.y * scale + offsetY,
      width: rect.w * scale,
      height: rect.h * scale,
      area: bubble.ratio,
      color: bubble.color,
      connectedIds: adjacency.get(bubble.id) ?? [],
    }
  })
}

// ── 도어 감지 유틸 ──────────────────────────────────────────────────────────

export interface DoorInfo {
  key: string
  direction: 'vertical' | 'horizontal'
  /** 수직 공유벽: 벽 x 좌표 */
  wallX?: number
  /** 수평 공유벽: 벽 y 좌표 */
  wallY?: number
  /** 수직 공유벽: 문 열림 중심 y */
  doorCenterY?: number
  /** 수평 공유벽: 문 열림 중심 x */
  doorCenterX?: number
  /** 문 폭 (px) */
  doorW: number
}

const WALL_STROKE = 3
const DOOR_TOL = 3 // 공유벽 감지 허용 오차 (px)

/**
 * 두 방이 공유하는 벽을 찾아 문 정보 반환
 * 맞닿지 않으면 null
 */
export function findSharedWall(a: FloorRoom, b: FloorRoom, key: string): DoorInfo | null {
  // 수직 공유벽: A 오른쪽 = B 왼쪽
  if (Math.abs(a.x + a.width - b.x) < DOOR_TOL) {
    const overlapTop = Math.max(a.y, b.y) + WALL_STROKE
    const overlapBottom = Math.min(a.y + a.height, b.y + b.height) - WALL_STROKE
    if (overlapBottom - overlapTop > 20) {
      const doorCenterY = (overlapTop + overlapBottom) / 2
      const doorW = Math.min(50, (overlapBottom - overlapTop) * 0.45)
      return { key, direction: 'vertical', wallX: a.x + a.width, doorCenterY, doorW }
    }
  }
  // 수직 공유벽: B 오른쪽 = A 왼쪽
  if (Math.abs(b.x + b.width - a.x) < DOOR_TOL) {
    const overlapTop = Math.max(a.y, b.y) + WALL_STROKE
    const overlapBottom = Math.min(a.y + a.height, b.y + b.height) - WALL_STROKE
    if (overlapBottom - overlapTop > 20) {
      const doorCenterY = (overlapTop + overlapBottom) / 2
      const doorW = Math.min(50, (overlapBottom - overlapTop) * 0.45)
      return { key, direction: 'vertical', wallX: b.x + b.width, doorCenterY, doorW }
    }
  }
  // 수평 공유벽: A 아래 = B 위
  if (Math.abs(a.y + a.height - b.y) < DOOR_TOL) {
    const overlapLeft = Math.max(a.x, b.x) + WALL_STROKE
    const overlapRight = Math.min(a.x + a.width, b.x + b.width) - WALL_STROKE
    if (overlapRight - overlapLeft > 20) {
      const doorCenterX = (overlapLeft + overlapRight) / 2
      const doorW = Math.min(50, (overlapRight - overlapLeft) * 0.45)
      return { key, direction: 'horizontal', wallY: a.y + a.height, doorCenterX, doorW }
    }
  }
  // 수평 공유벽: B 아래 = A 위
  if (Math.abs(b.y + b.height - a.y) < DOOR_TOL) {
    const overlapLeft = Math.max(a.x, b.x) + WALL_STROKE
    const overlapRight = Math.min(a.x + a.width, b.x + b.width) - WALL_STROKE
    if (overlapRight - overlapLeft > 20) {
      const doorCenterX = (overlapLeft + overlapRight) / 2
      const doorW = Math.min(50, (overlapRight - overlapLeft) * 0.45)
      return { key, direction: 'horizontal', wallY: b.y + a.height, doorCenterX, doorW }
    }
  }
  return null
}

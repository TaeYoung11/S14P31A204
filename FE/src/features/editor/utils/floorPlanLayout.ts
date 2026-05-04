/**
 * 버블 다이어그램 → 2D 평면도 레이아웃 변환 알고리즘
 *
 * 좌표계 통일 원칙:
 *  - Bubble/2D/3D 모두 동일한 월드 좌표(px on canvas)를 공유한다.
 *  - 2D 자동 생성 시 버블의 x/y/width/height를 재배치하지 않고 그대로 사용한다.
 */

import type { BubbleData, ConnectionData, FloorRoom } from '../types'

/**
 * 버블 데이터 + 연결선 → 평면도 방 목록 변환
 *
 * @param bubbles  버블 다이어그램 데이터
 * @param connections  연결선 데이터
 * @param _canvasWidth  캔버스 가로 px (시그니처 호환용)
 * @param _canvasHeight 캔버스 세로 px (시그니처 호환용)
 */
export function generateFloorPlanLayout(
  bubbles: BubbleData[],
  connections: ConnectionData[],
  _canvasWidth: number,
  _canvasHeight: number,
): FloorRoom[] {
  if (bubbles.length === 0) return []

  // 연결선 기반 인접 그래프는 connectedIds 계산에만 사용한다.
  const adjacency = new Map<string, string[]>()
  bubbles.forEach((b) => adjacency.set(b.id, []))
  connections.forEach((c) => {
    adjacency.get(c.from)?.push(c.to)
    adjacency.get(c.to)?.push(c.from)
  })

  // 버블 좌표를 그대로 2D Room으로 반영해 모드 전환 시 1:1 일관성을 보장한다.
  return bubbles.map((bubble) => {
    return {
      id: bubble.id,
      bubbleId: bubble.id,
      label: bubble.label,
      type: bubble.type,
      x: bubble.x,
      y: bubble.y,
      width: bubble.width,
      height: bubble.height,
      widthMm: bubble.widthMm,
      heightMm: bubble.heightMm,
      area: bubble.ratio,
      color: bubble.color,
      material: bubble.material,
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
      return { key, direction: 'horizontal', wallY: b.y + b.height, doorCenterX, doorW }
    }
  }
  return null
}

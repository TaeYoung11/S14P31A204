import type { BubbleData, ConnectionData, Point2D } from '../types'
import { isPointInsidePolygon, toCanvasPolygon } from './siteBoundaryValidation.ts'

interface ForceLayoutOptions {
  bubbles: BubbleData[]
  connections: ConnectionData[]
  sitePoints: number[]
}

interface ForceNode {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  rx: number
  ry: number
}

function buildSiteCentroid(polygon: Point2D[]): Point2D {
  const sum = polygon.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 },
  )
  const count = Math.max(polygon.length, 1)
  return { x: sum.x / count, y: sum.y / count }
}

function getBubbleSamplePoints(node: ForceNode): Point2D[] {
  return [
    { x: node.x, y: node.y },
    { x: node.x + node.rx, y: node.y },
    { x: node.x - node.rx, y: node.y },
    { x: node.x, y: node.y + node.ry },
    { x: node.x, y: node.y - node.ry },
  ]
}

function isNodeInsideSite(node: ForceNode, sitePolygon: Point2D[]): boolean {
  const samples = getBubbleSamplePoints(node)
  return samples.every((point) => isPointInsidePolygon(point, sitePolygon))
}

function pullNodeTowardCentroid(node: ForceNode, centroid: Point2D, strength: number) {
  node.vx += (centroid.x - node.x) * strength
  node.vy += (centroid.y - node.y) * strength
}

function nudgeNodeInside(node: ForceNode, sitePolygon: Point2D[], centroid: Point2D) {
  for (let step = 0; step < 6; step += 1) {
    if (isNodeInsideSite(node, sitePolygon)) return
    node.x += (centroid.x - node.x) * 0.18
    node.y += (centroid.y - node.y) * 0.18
  }
}

/**
 * Force-Directed 기반 버블 자동 배치.
 * - 연결선: 스프링 힘으로 묶음
 * - 버블 간: 반발 + 충돌 분리
 * - 대지 경계: 중심점으로 당겨 내부 유지
 */
export function runForceDirectedBubbleLayout({
  bubbles,
  connections,
  sitePoints,
}: ForceLayoutOptions): BubbleData[] {
  if (!Array.isArray(bubbles) || bubbles.length === 0) return bubbles

  const sitePolygon = toCanvasPolygon(sitePoints)
  if (sitePolygon.length < 3) return bubbles

  const centroid = buildSiteCentroid(sitePolygon)
  const nodes: ForceNode[] = bubbles.map((bubble) => ({
    id: bubble.id,
    x: bubble.x + bubble.width / 2,
    y: bubble.y + bubble.height / 2,
    vx: 0,
    vy: 0,
    rx: bubble.width / 2,
    ry: bubble.height / 2,
  }))
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const))

  const uniqueEdges = Array.from(
    new Set(
      connections
        .filter((connection) => connection.from !== connection.to)
        .map((connection) => [connection.from, connection.to].sort().join('::')),
    ),
  )
    .map((key) => key.split('::'))
    .filter(([fromId, toId]) => nodeById.has(fromId) && nodeById.has(toId))

  const bubbleCount = nodes.length
  const iterations = Math.min(Math.max(120, bubbleCount * 20), 320)
  const repulsion = 34000
  const spring = 0.014
  const damping = 0.9
  const timeStep = 0.22

  for (let iter = 0; iter < iterations; iter += 1) {
    for (let i = 0; i < nodes.length; i += 1) {
      const a = nodes[i]
      if (!a) continue
      for (let j = i + 1; j < nodes.length; j += 1) {
        const b = nodes[j]
        if (!b) continue

        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.hypot(dx, dy) || 0.0001
        const nx = dx / dist
        const ny = dy / dist
        const radiusA = Math.max(a.rx, a.ry)
        const radiusB = Math.max(b.rx, b.ry)
        const minDist = radiusA + radiusB + 12

        const repelForce = repulsion / (dist * dist)
        const overlapForce = dist < minDist ? (minDist - dist) * 0.28 : 0
        const force = repelForce + overlapForce

        a.vx -= nx * force
        a.vy -= ny * force
        b.vx += nx * force
        b.vy += ny * force
      }
    }

    uniqueEdges.forEach(([fromId, toId]) => {
      const fromNode = nodeById.get(fromId)
      const toNode = nodeById.get(toId)
      if (!fromNode || !toNode) return

      const dx = toNode.x - fromNode.x
      const dy = toNode.y - fromNode.y
      const dist = Math.hypot(dx, dy) || 0.0001
      const nx = dx / dist
      const ny = dy / dist
      const rest = Math.max(fromNode.rx, fromNode.ry) + Math.max(toNode.rx, toNode.ry) + 42
      const delta = dist - rest
      const force = delta * spring

      fromNode.vx += nx * force
      fromNode.vy += ny * force
      toNode.vx -= nx * force
      toNode.vy -= ny * force
    })

    nodes.forEach((node) => {
      if (!isNodeInsideSite(node, sitePolygon)) {
        pullNodeTowardCentroid(node, centroid, 0.12)
      }
    })

    nodes.forEach((node) => {
      node.vx *= damping
      node.vy *= damping
      node.x += node.vx * timeStep
      node.y += node.vy * timeStep
      nudgeNodeInside(node, sitePolygon, centroid)
    })
  }

  nodes.forEach((node) => {
    for (let step = 0; step < 120; step += 1) {
      if (isNodeInsideSite(node, sitePolygon)) break
      node.x += (centroid.x - node.x) * 0.08
      node.y += (centroid.y - node.y) * 0.08
    }
  })

  return bubbles.map((bubble) => {
    const node = nodeById.get(bubble.id)
    if (!node) return bubble
    return {
      ...bubble,
      x: Number((node.x - bubble.width / 2).toFixed(2)),
      y: Number((node.y - bubble.height / 2).toFixed(2)),
    }
  })
}

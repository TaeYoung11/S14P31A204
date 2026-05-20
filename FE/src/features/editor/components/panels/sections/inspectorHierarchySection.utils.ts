import type { HierarchySectionProps } from '../../layout/right-panels/buildRightPanelSectionProps'
import type { ElementHierarchyNode, FloorRoom, FloorWall } from '../../../types'
import { lineIntersectsRect, pointInRect } from '../../../utils/geometry2d'

const AXIS_TOLERANCE = 2

export const EMPTY_FLOOR_ROOMS: FloorRoom[] = []
export const EMPTY_FLOOR_WALLS: FloorWall[] = []
export const EMPTY_FLOOR_OPENINGS: NonNullable<HierarchySectionProps['floorOpenings']> = []
export const EMPTY_ELEMENT_HIERARCHY_TREE: ElementHierarchyNode[] = []

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0.5
  return Math.min(1, Math.max(0, value))
}

/** Room 외곽선과 거의 맞닿은 벽도 같은 Room 하위 요소로 묶기 위해 허용 오차를 둔다. */
export function wallTouchesRoom(wall: FloorWall, room: FloorRoom): boolean {
  return lineIntersectsRect(wall.start, wall.end, {
    x: room.x - AXIS_TOLERANCE,
    y: room.y - AXIS_TOLERANCE,
    width: room.width + AXIS_TOLERANCE * 2,
    height: room.height + AXIS_TOLERANCE * 2,
  })
}

/** Opening의 벽 위 비율 좌표를 실제 2D 평면 좌표로 환산한다. */
export function resolveOpeningAnchorPoint(
  opening: NonNullable<HierarchySectionProps['floorOpenings']>[number],
  wallById: Map<string, FloorWall>,
) {
  const wall = wallById.get(opening.wallId)
  if (!wall) return null
  const t = clamp01(opening.wallPosition)
  return {
    x: wall.start.x + (wall.end.x - wall.start.x) * t,
    y: wall.start.y + (wall.end.y - wall.start.y) * t,
  }
}

/** Opening anchor가 Room 내부나 경계 근처에 있는지 판정한다. */
export function roomContainsPoint(room: FloorRoom, point: { x: number; y: number }): boolean {
  return pointInRect(point, {
    x: room.x - AXIS_TOLERANCE,
    y: room.y - AXIS_TOLERANCE,
    width: room.width + AXIS_TOLERANCE * 2,
    height: room.height + AXIS_TOLERANCE * 2,
  })
}

/** 그룹 노드까지 포함된 계층 트리에서 실제 element leaf 개수를 센다. */
export function countElementNodes(node: ElementHierarchyNode): number {
  if (node.kind === 'element') return 1
  return node.children.reduce((sum, child) => sum + countElementNodes(child), 0)
}

/** 검색어와 매칭되는 노드 및 그 부모 경로만 남겨 계층 트리를 필터링한다. */
export function filterElementHierarchyTree(nodes: ElementHierarchyNode[], query: string): ElementHierarchyNode[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return nodes

  const visit = (node: ElementHierarchyNode): ElementHierarchyNode | null => {
    const selfMatches = [
      node.label,
      node.elementId,
      node.floorId,
      node.category,
      node.sourceType,
    ].some((value) => String(value ?? '').toLowerCase().includes(normalizedQuery))
    const children = node.children.map(visit).filter((child): child is ElementHierarchyNode => child != null)
    if (!selfMatches && children.length === 0) return null
    return { ...node, children }
  }

  return nodes.map(visit).filter((node): node is ElementHierarchyNode => node != null)
}

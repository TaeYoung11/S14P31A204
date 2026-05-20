import { describe, expect, it } from 'vitest'
import { buildBubbleFloorLayers } from '@/features/editor/hooks/useFloorPlan'
import type { BubbleData, FloorRoom } from '@/features/editor/types'

const createBubble = (id: string, floor: number): BubbleData => ({
  id,
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  widthMm: 3000,
  heightMm: 3000,
  label: id,
  type: 'room',
  ratio: 9,
  color: '#ffffff',
  floor,
})

const createRoom = (bubbleId: string): FloorRoom => ({
  id: bubbleId,
  bubbleId,
  label: bubbleId,
  type: 'room',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  widthMm: 3000,
  heightMm: 3000,
  area: 9,
  color: '#ffffff',
  connectedIds: [],
})

describe('buildBubbleFloorLayers', () => {
  it('keeps generated 2D rooms separated by their bubble floor', () => {
    const layers = buildBubbleFloorLayers(
      [
        createBubble('room-1', 1),
        createBubble('room-2', 2),
        createBubble('room-3', 2),
      ],
      [createRoom('room-1'), createRoom('room-2'), createRoom('room-3')],
    )

    expect(layers.map((layer) => layer.id)).toEqual(['floor-1', 'floor-2'])
    expect(layers[0].rooms.map((room) => room.bubbleId)).toEqual(['room-1'])
    expect(layers[1].rooms.map((room) => room.bubbleId)).toEqual(['room-2', 'room-3'])
  })
})

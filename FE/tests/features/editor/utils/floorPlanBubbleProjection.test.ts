import { describe, expect, it } from 'vitest'
import { buildFloorPlanBubbleProjection } from '@/features/editor/utils/floorPlanBubbleProjection'
import type { BubbleData, ConnectionData, FloorLayer, ZoneData } from '@/features/editor/types'

const previousBubble = (overrides: Partial<BubbleData> = {}): BubbleData => ({
  id: 'bubble-1',
  floor: 1,
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  widthMm: 2500,
  heightMm: 2500,
  label: 'Old room',
  type: 'old',
  ratio: 6.25,
  area: '6.3 m2',
  color: '#ffffff',
  material: 'wood',
  index: '07',
  ...overrides,
})

describe('buildFloorPlanBubbleProjection', () => {
  it('projects generated floor rooms into read-only bubble state while preserving stable bubble ids', () => {
    const floorLayers: FloorLayer[] = [
      {
        id: 'floor-2',
        name: '2F',
        rooms: [
          {
            id: 'room-1',
            bubbleId: 'bubble-1',
            label: 'Living',
            type: 'living',
            x: 10,
            y: 20,
            width: 120,
            height: 80,
            widthMm: 3000,
            heightMm: 2000,
            area: 6,
            color: '#ffcc00',
            material: 'tile',
            connectedIds: ['room-2'],
          },
          {
            id: 'room-2',
            bubbleId: 'bubble-2',
            label: 'Kitchen',
            type: 'kitchen',
            x: 180,
            y: 20,
            width: 100,
            height: 90,
            widthMm: 2500,
            heightMm: 2250,
            area: 5.625,
            color: '#00ccff',
            connectedIds: ['bubble-1'],
          },
        ],
      },
    ]
    const previousConnections: ConnectionData[] = [
      { id: 'connection-1', from: 'bubble-1', to: 'bubble-2', type: 'bold', intent: 'open_passage' },
    ]
    const previousZones: ZoneData[] = [
      { id: 'zone-1', name: 'Public', color: '#eeeeee', bubbleIds: ['bubble-1', 'deleted-bubble'], source: 'manual' },
    ]

    const projection = buildFloorPlanBubbleProjection({
      floorLayers,
      previousBubbles: [previousBubble()],
      previousConnections,
      previousZones,
    })

    expect(projection.bubbles).toMatchObject([
      {
        id: 'bubble-1',
        floor: 2,
        label: 'Living',
        type: 'living',
        x: 0,
        y: 0,
        widthMm: 3000,
        heightMm: 2000,
        ratio: 6,
        color: '#ffcc00',
        material: 'tile',
        index: '07',
      },
      {
        id: 'bubble-2',
        floor: 2,
        label: 'Kitchen',
        type: 'kitchen',
        ratio: 5.625,
        color: '#00ccff',
        index: '02',
      },
    ])
    expect(projection.connections).toEqual([
      { id: 'connection-1', from: 'bubble-1', to: 'bubble-2', type: 'bold', intent: 'open_passage' },
    ])
    expect(projection.zones).toEqual([
      { id: 'zone-1', name: 'Public', color: '#eeeeee', bubbleIds: ['bubble-1'], source: 'manual' },
    ])
    expect(projection.floorMeta).toEqual({
      namesByFloor: { 2: '2F' },
      extraFloors: [],
    })
    expect(projection.availableFloors).toEqual([2])
  })

  it('keeps existing bubble connections and diagram positions when generated rooms omit adjacency', () => {
    const floorLayers: FloorLayer[] = [
      {
        id: 'floor-1',
        name: '1F',
        rooms: [
          {
            id: 'room-1',
            bubbleId: 'bubble-1',
            label: 'Room 1',
            type: 'other',
            x: 20,
            y: 20,
            width: 100,
            height: 100,
            widthMm: 2500,
            heightMm: 2500,
            area: 6.25,
            color: '#cccccc',
            connectedIds: [],
          },
          {
            id: 'room-2',
            bubbleId: 'bubble-2',
            label: 'Room 2',
            type: 'other',
            x: 30,
            y: 30,
            width: 100,
            height: 100,
            widthMm: 2500,
            heightMm: 2500,
            area: 6.25,
            color: '#dddddd',
            connectedIds: [],
          },
        ],
      },
    ]

    const projection = buildFloorPlanBubbleProjection({
      floorLayers,
      previousBubbles: [
        previousBubble({ id: 'bubble-1', x: 100, y: 100 }),
        previousBubble({ id: 'bubble-2', x: 300, y: 140, index: '02' }),
      ],
      previousConnections: [{ id: 'connection-1', from: 'bubble-1', to: 'bubble-2', type: 'thin' }],
      previousZones: [],
    })

    expect(projection.bubbles.map((bubble) => ({ id: bubble.id, x: bubble.x, y: bubble.y }))).toEqual([
      { id: 'bubble-1', x: 100, y: 100 },
      { id: 'bubble-2', x: 300, y: 140 },
    ])
    expect(projection.connections).toEqual([
      { id: 'connection-1', from: 'bubble-1', to: 'bubble-2', type: 'thin' },
    ])
  })

  it('does not create bubble lines from 2D room adjacency alone', () => {
    const floorLayers: FloorLayer[] = [
      {
        id: 'floor-1',
        name: '1F',
        rooms: [
          {
            id: 'room-1',
            bubbleId: 'bubble-1',
            label: 'Room 1',
            type: 'other',
            x: 20,
            y: 20,
            width: 100,
            height: 100,
            widthMm: 2500,
            heightMm: 2500,
            area: 6.25,
            color: '#cccccc',
            connectedIds: ['room-2', 'bubble-2'],
          },
          {
            id: 'room-2',
            bubbleId: 'bubble-2',
            label: 'Room 2',
            type: 'other',
            x: 140,
            y: 20,
            width: 100,
            height: 100,
            widthMm: 2500,
            heightMm: 2500,
            area: 6.25,
            color: '#dddddd',
            connectedIds: ['room-1', 'bubble-1'],
          },
        ],
      },
    ]

    const projection = buildFloorPlanBubbleProjection({
      floorLayers,
      previousBubbles: [],
      previousConnections: [],
      previousZones: [],
    })

    expect(projection.connections).toEqual([])
  })
})

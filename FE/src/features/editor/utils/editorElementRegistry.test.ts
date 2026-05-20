import { describe, expect, it } from 'vitest'
import type { FloorLayer, FloorWall } from '../types'
import type { ThreeDLibraryPreset } from '../components/canvas/threeDLibrary.types'
import {
  buildElementHierarchyTree,
  buildElementRegistry,
  filterRegistryElementsByFloors,
  getVisibleRegistryElements,
  resolveRegistryElementSelectionTarget,
} from './editorElementRegistry'

describe('editorElementRegistry floor and hierarchy sync', () => {
  it('keeps 2D walls from every floor in the common registry', () => {
    const registry = buildElementRegistry({
      floorLayers: [
        { id: 'floor-1', name: '1F', rooms: [] },
        { id: 'floor-2', name: '2F', rooms: [] },
      ] as FloorLayer[],
      floorWalls: [
        { id: 'wall-1', floorLayerId: 'floor-1', type: 'interior', thickness: 120 },
        { id: 'wall-2', floorLayerId: 'floor-2', type: 'interior', thickness: 120 },
      ] as FloorWall[],
      activeFloorLayerId: 'floor-1',
    })

    expect(registry.elements.map((element) => element.elementId)).toEqual(
      expect.arrayContaining(['2d:wall:wall-1', '2d:wall:wall-2']),
    )
  })

  it('maps library elements to 2D floor layers when no IFC storey is assigned', () => {
    const registry = buildElementRegistry({
      floorLayers: [{ id: 'floor-2', name: '2F', rooms: [] }] as FloorLayer[],
      libraryElements: [{
        id: 'chair-1',
        type: 'furniture',
        name: 'Chair',
        description: '',
        dimensions: '',
        color: '#ffffff',
        floorLayerId: 'floor-2',
      }] as ThreeDLibraryPreset[],
      activeFloorLayerId: 'floor-2',
    })

    const libraryElement = registry.elements.find((element) => element.elementId === 'library:chair-1')
    expect(libraryElement?.floorId).toBe('floor-2')
    expect(resolveRegistryElementSelectionTarget(libraryElement!)).toEqual({ kind: 'library', id: 'chair-1' })
  })

  it('computes hierarchy visibility from floor visibility and element hidden state', () => {
    const registry = buildElementRegistry({
      floorLayers: [
        { id: 'floor-1', name: '1F', rooms: [] },
        { id: 'floor-2', name: '2F', rooms: [] },
      ] as FloorLayer[],
      floorWalls: [
        { id: 'wall-1', floorLayerId: 'floor-1', type: 'interior', thickness: 120 },
        { id: 'wall-2', floorLayerId: 'floor-2', type: 'interior', thickness: 120 },
      ] as FloorWall[],
      activeFloorLayerId: 'floor-1',
      hiddenElementIds: ['2d:wall:wall-1'],
    })
    const tree = buildElementHierarchyTree(registry)
    const allNodes = JSON.stringify(tree)

    expect(allNodes).toContain('"id":"2d:wall:wall-1"')
    expect(allNodes).toContain('"isVisible":false')
  })

  it('filters elements by floor and applies floor-first visibility policy', () => {
    const registry = buildElementRegistry({
      floorLayers: [
        { id: 'floor-1', name: '1F', rooms: [] },
        { id: 'floor-2', name: '2F', rooms: [] },
      ] as FloorLayer[],
      floorWalls: [
        { id: 'wall-1', floorLayerId: 'floor-1', type: 'interior', thickness: 120 },
        { id: 'wall-2', floorLayerId: 'floor-2', type: 'interior', thickness: 120 },
      ] as FloorWall[],
      activeFloorLayerId: 'floor-1',
    })

    expect(filterRegistryElementsByFloors(registry, ['floor-2']).map((element) => element.elementId)).toEqual(['2d:wall:wall-2'])
    expect(getVisibleRegistryElements(registry).map((element) => element.elementId)).toEqual(['2d:wall:wall-1'])
  })
})

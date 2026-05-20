import { describe, expect, it } from 'vitest'
import { createMovedIfcProxyVisibilityFilter } from './movedIfcProxyVisibility'

describe('createMovedIfcProxyVisibilityFilter', () => {
  it('hides moved IFC proxies outside the active and overlay storeys', () => {
    const filter = createMovedIfcProxyVisibilityFilter({
      allIds: new Set([1, 2, 3]),
      activeStoreyExpressId: 10,
      storeyMap: new Map([
        [10, new Set([1])],
        [20, new Set([2])],
      ]),
      overlayStoreyExpressIds: [],
      deletedLocalIds: new Set(),
      hiddenLocalIds: new Set(),
    })

    expect(filter({ hideLocalIds: [1] })).toEqual({ visible: true, opacity: 1 })
    expect(filter({ hideLocalIds: [2] })).toEqual({ visible: false, opacity: 0 })
  })

  it('applies overlay opacity to moved IFC proxies in overlay storeys', () => {
    const filter = createMovedIfcProxyVisibilityFilter({
      allIds: new Set([1, 2]),
      activeStoreyExpressId: 10,
      storeyMap: new Map([
        [10, new Set([1])],
        [20, new Set([2])],
      ]),
      overlayStoreyExpressIds: [20],
      overlayIfcStoreyOpacityByExpressId: { 20: 0.4 },
      deletedLocalIds: new Set(),
      hiddenLocalIds: new Set(),
    })

    expect(filter({ hideLocalIds: [2] })).toEqual({ visible: true, opacity: 0.6 })
  })

  it('prioritizes element hidden state over active or overlay storey visibility', () => {
    const filter = createMovedIfcProxyVisibilityFilter({
      allIds: new Set([1, 2]),
      activeStoreyExpressId: 10,
      storeyMap: new Map([
        [10, new Set([1])],
        [20, new Set([2])],
      ]),
      overlayStoreyExpressIds: [20],
      deletedLocalIds: new Set(),
      hiddenLocalIds: new Set([2]),
    })

    expect(filter({ hideLocalIds: [2] })).toEqual({ visible: false, opacity: 0 })
  })
})

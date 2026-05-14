/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ThreeDAttributePanel } from './ThreeDAttributePanel'
import type { IfcElementInfo } from '../../types'

const SAMPLE_ROOF_ELEMENT: IfcElementInfo = {
  id: 'roof-1',
  name: '지붕',
  ifcClass: 'IfcRoof',
  category: 'roof',
  source: 'ifc',
  expressId: 101,
  lengthMm: 4000,
  heightMm: 1200,
  thicknessMm: 200,
  positionX: 0,
  positionY: 0,
  positionZ: 0,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  color: '#A3472C',
  material: 'Tile',
  properties: {},
}

describe('ThreeDAttributePanel', () => {
  let container: HTMLDivElement
  let root: Root
  let previousActEnvironmentFlag: unknown

  beforeEach(() => {
    previousActEnvironmentFlag = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown }).IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: unknown }).IS_REACT_ACT_ENVIRONMENT = previousActEnvironmentFlag
  })

  it('3D 편집 잠금 시 속성 입력 UI를 disabled 처리한다', () => {
    act(() => {
      root.render(
        <ThreeDAttributePanel
          selectedBubble={null}
          selectedIfcElement={SAMPLE_ROOF_ELEMENT}
          isEditingLocked
          onLabelChange={vi.fn()}
          onWidthChange={vi.fn()}
          onHeightChange={vi.fn()}
          onThicknessChange={vi.fn()}
          onPositionChange={vi.fn()}
          onRotationChange={vi.fn()}
          onRoofShapeChange={vi.fn()}
          onColorChange={vi.fn()}
          onMaterialChange={vi.fn()}
        />,
      )
    })

    const numberInputs = Array.from(container.querySelectorAll('input[type="number"]')) as HTMLInputElement[]
    const roofShapeSelect = container.querySelector('select') as HTMLSelectElement | null
    const disabledButtons = Array.from(container.querySelectorAll('button:disabled')) as HTMLButtonElement[]

    expect(numberInputs.length).toBeGreaterThan(0)
    numberInputs.forEach((input) => {
      expect(input.disabled).toBe(true)
    })
    expect(roofShapeSelect?.disabled).toBe(true)
    expect(disabledButtons.length).toBeGreaterThan(0)
  })
})

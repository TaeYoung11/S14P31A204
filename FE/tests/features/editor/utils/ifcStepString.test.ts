// IFC STEP 문자열 디코딩 유틸을 검증하는 테스트
import { describe, expect, it } from 'vitest'
import { decodeIfcStepString, normalizeIfcDisplayText } from '@/features/editor/utils/ifcStepString'

describe('decodeIfcStepString', () => {
  it('decodes IFC STEP unicode escape sequences', () => {
    expect(decodeIfcStepString('\\X2\\AC70C2E4\\X0\\')).toBe('거실')
  })

  it('keeps invalid hex length sequences unchanged', () => {
    expect(decodeIfcStepString('A\\X2\\ABC\\X0\\B')).toBe('A\\X2\\ABC\\X0\\B')
  })
})

describe('normalizeIfcDisplayText', () => {
  it('decodes and trims display text', () => {
    expect(normalizeIfcDisplayText('  \\X2\\AC70C2E4\\X0\\  ')).toBe('거실')
  })
})



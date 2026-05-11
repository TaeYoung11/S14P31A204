import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { decodeIfcStepString, normalizeIfcDisplayText } from './ifcStepString.ts'

describe('decodeIfcStepString', () => {
  it('decodes IFC STEP unicode escape sequences', () => {
    assert.equal(decodeIfcStepString('\\X2\\AC70C2E4\\X0\\'), '거실')
  })

  it('keeps invalid hex length sequences unchanged', () => {
    assert.equal(decodeIfcStepString('A\\X2\\ABC\\X0\\B'), 'A\\X2\\ABC\\X0\\B')
  })
})

describe('normalizeIfcDisplayText', () => {
  it('decodes and trims display text', () => {
    assert.equal(normalizeIfcDisplayText('  \\X2\\AC70C2E4\\X0\\  '), '거실')
  })
})

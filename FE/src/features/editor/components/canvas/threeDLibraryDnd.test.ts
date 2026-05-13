import { describe, expect, it } from 'vitest'
import {
  THREE_D_LIBRARY_PRESET_MIME,
  hasLibraryPresetInDataTransfer,
  readLibraryPresetFromDataTransfer,
  writeLibraryPresetToDataTransfer,
} from './threeDLibraryDnd'
import type { ThreeDLibraryPreset } from './threeDLibrary.types'

function createMockDataTransfer() {
  const store = new Map<string, string>()
  return {
    get types() {
      return Array.from(store.keys())
    },
    setData(type: string, value: string) {
      store.set(type, value)
    },
    getData(type: string) {
      return store.get(type) ?? ''
    },
  } as unknown as DataTransfer
}

const SAMPLE_PRESET: ThreeDLibraryPreset = {
  id: 'preset-roof-1',
  type: 'roof',
  name: '지붕 프리셋',
  description: '테스트용 지붕',
  dimensions: '4000x2400x300',
  color: '#A3472C',
}

describe('threeDLibraryDnd', () => {
  it('커스텀 MIME이 있을 때만 라이브러리 드롭으로 판정한다', () => {
    const withMime = createMockDataTransfer()
    withMime.setData(THREE_D_LIBRARY_PRESET_MIME, JSON.stringify(SAMPLE_PRESET))
    expect(hasLibraryPresetInDataTransfer(withMime)).toBe(true)

    const plainTextOnly = createMockDataTransfer()
    plainTextOnly.setData('text/plain', JSON.stringify(SAMPLE_PRESET))
    expect(hasLibraryPresetInDataTransfer(plainTextOnly)).toBe(false)
  })

  it('write/read 라운드트립이 정상 동작한다', () => {
    const dataTransfer = createMockDataTransfer()
    writeLibraryPresetToDataTransfer(dataTransfer, SAMPLE_PRESET)
    expect(readLibraryPresetFromDataTransfer(dataTransfer)).toEqual(SAMPLE_PRESET)
  })
})

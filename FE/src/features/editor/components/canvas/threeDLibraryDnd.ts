import type { ThreeDLibraryPreset } from './threeDLibrary.types'

export const THREE_D_LIBRARY_PRESET_MIME = 'application/x-batang-3d-library-preset'

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isPresetPayload = (value: unknown): value is ThreeDLibraryPreset => {
  if (!isObject(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.type === 'string' &&
    typeof value.name === 'string' &&
    typeof value.description === 'string' &&
    typeof value.dimensions === 'string' &&
    typeof value.color === 'string'
  )
}

export const writeLibraryPresetToDataTransfer = (
  dataTransfer: DataTransfer,
  preset: ThreeDLibraryPreset,
) => {
  const payload = JSON.stringify(preset)
  dataTransfer.setData(THREE_D_LIBRARY_PRESET_MIME, payload)
  dataTransfer.setData('text/plain', payload)
}

export const hasLibraryPresetInDataTransfer = (dataTransfer: DataTransfer) => {
  const types = Array.from(dataTransfer.types ?? [])
  // 일반 텍스트 드롭과 충돌하지 않도록 커스텀 MIME만 허용한다.
  return types.includes(THREE_D_LIBRARY_PRESET_MIME)
}

export const readLibraryPresetFromDataTransfer = (dataTransfer: DataTransfer) => {
  const rawPayload =
    dataTransfer.getData(THREE_D_LIBRARY_PRESET_MIME) || dataTransfer.getData('text/plain')
  if (!rawPayload) return null
  try {
    const parsed = JSON.parse(rawPayload)
    return isPresetPayload(parsed) ? parsed : null
  } catch {
    return null
  }
}

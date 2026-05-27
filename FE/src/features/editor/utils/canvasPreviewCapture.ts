import type Konva from 'konva'

interface CapturePreviewOptions {
  backgroundColor?: string
  mimeType?: 'image/jpeg' | 'image/png'
  pixelRatio?: number
  quality?: number
}

const DEFAULT_BACKGROUND_COLOR = '#ffffff'
const DEFAULT_MIME_TYPE = 'image/jpeg'
const DEFAULT_CAPTURE_PIXEL_RATIO = 1.25
const DEFAULT_CAPTURE_QUALITY = 0.95

export function captureCanvasWithBackground(
  sourceCanvas: HTMLCanvasElement,
  {
    backgroundColor = DEFAULT_BACKGROUND_COLOR,
    mimeType = DEFAULT_MIME_TYPE,
    quality = DEFAULT_CAPTURE_QUALITY,
  }: CapturePreviewOptions = {},
): string {
  const canvas = document.createElement('canvas')
  canvas.width = sourceCanvas.width
  canvas.height = sourceCanvas.height

  const context = canvas.getContext('2d')
  if (!context) return sourceCanvas.toDataURL(mimeType, quality)

  context.fillStyle = backgroundColor
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(sourceCanvas, 0, 0)

  return canvas.toDataURL(mimeType, quality)
}

export function captureKonvaStagePreview(
  stage: Konva.Stage,
  options: CapturePreviewOptions = {},
): string {
  const pixelRatio = options.pixelRatio ?? DEFAULT_CAPTURE_PIXEL_RATIO
  const sourceCanvas = stage.toCanvas({ pixelRatio })
  return captureCanvasWithBackground(sourceCanvas, options)
}

import type { EditorMode } from '@/features/editor/types'
import { projectService } from '@/features/project/services/project.service'
import { saveProjectWorkspaceThumbnailUrl } from '@/features/project/utils/projectWorkspaceThumbnailCache'

type WorkspaceThumbnailMode = Exclude<EditorMode, 'view'>

const SAVE_DEBOUNCE_MS = 800
const SERVER_THUMBNAIL_MAX_SIDE = 640
const SERVER_THUMBNAIL_QUALITY = 0.72
const SERVER_THUMBNAIL_MAX_DATA_URL_LENGTH = 900_000
const pendingTimers = new Map<string, number>()
const lastSavedByKey = new Map<string, string>()

const isWorkspaceThumbnailMode = (mode: EditorMode): mode is WorkspaceThumbnailMode =>
  mode === 'bubble' || mode === '2d' || mode === '3d'

const getSaveKey = (projectId: string, mode: WorkspaceThumbnailMode): string => `${projectId}:${mode}`

const resizeDataImageForServer = (imageUrl: string): Promise<string> => {
  if (!imageUrl.startsWith('data:image/')) return Promise.resolve(imageUrl)

  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const sourceWidth = image.naturalWidth || image.width
      const sourceHeight = image.naturalHeight || image.height
      const maxSide = Math.max(sourceWidth, sourceHeight)
      if (maxSide <= SERVER_THUMBNAIL_MAX_SIDE) {
        resolve(imageUrl)
        return
      }

      const scale = SERVER_THUMBNAIL_MAX_SIDE / maxSide
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(sourceWidth * scale))
      canvas.height = Math.max(1, Math.round(sourceHeight * scale))

      const context = canvas.getContext('2d')
      if (!context) {
        resolve(imageUrl)
        return
      }
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', SERVER_THUMBNAIL_QUALITY))
    }
    image.onerror = () => resolve(imageUrl)
    image.src = imageUrl
  })
}

export function saveProjectWorkspaceThumbnail(
  projectId: string | null | undefined,
  mode: EditorMode,
  imageUrl: string | null | undefined,
): void {
  saveProjectWorkspaceThumbnailUrl(projectId, mode, imageUrl)
  if (!projectId || !imageUrl || !isWorkspaceThumbnailMode(mode)) return

  const saveKey = getSaveKey(projectId, mode)
  if (lastSavedByKey.get(saveKey) === imageUrl) return

  const previousTimer = pendingTimers.get(saveKey)
  if (previousTimer !== undefined) {
    window.clearTimeout(previousTimer)
  }

  const timerId = window.setTimeout(() => {
    pendingTimers.delete(saveKey)
    void resizeDataImageForServer(imageUrl).then((thumbnailUrl) =>
      thumbnailUrl.startsWith('data:image/') || thumbnailUrl.length > SERVER_THUMBNAIL_MAX_DATA_URL_LENGTH
        ? null
        : projectService.updateThumbnail(projectId, {
            thumbnailUrl,
            thumbnailMode: mode,
          }),
    ).then(() => {
      lastSavedByKey.set(saveKey, imageUrl)
    }).catch(() => {
      // 서버 저장 실패 시 기존 localStorage 썸네일/fallback 동작을 유지한다.
    })
  }, SAVE_DEBOUNCE_MS)
  pendingTimers.set(saveKey, timerId)
}

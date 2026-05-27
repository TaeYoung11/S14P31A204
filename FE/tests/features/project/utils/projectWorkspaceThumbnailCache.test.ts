/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  readProjectWorkspaceThumbnailUrl,
  saveProjectWorkspaceThumbnailUrl,
} from '@/features/project/utils/projectWorkspaceThumbnailCache'

describe('projectWorkspaceThumbnailCache', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('stores a captured thumbnail per project and mode', () => {
    const twoDImageUrl = 'data:image/jpeg;base64,abc'
    const threeDImageUrl = 'data:image/jpeg;base64,def'

    saveProjectWorkspaceThumbnailUrl('project-1', '2d', twoDImageUrl)
    saveProjectWorkspaceThumbnailUrl('project-1', '3d', threeDImageUrl)

    expect(readProjectWorkspaceThumbnailUrl('project-1', '2d')).toBe(twoDImageUrl)
    expect(readProjectWorkspaceThumbnailUrl('project-1', '3d')).toBe(threeDImageUrl)
  })

  it('ignores view mode because render thumbnails use the render cache', () => {
    saveProjectWorkspaceThumbnailUrl('project-1', 'view', 'data:image/jpeg;base64,abc')

    expect(readProjectWorkspaceThumbnailUrl('project-1')).toBeNull()
  })
})

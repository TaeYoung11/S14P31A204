import { beforeEach, describe, expect, it, vi } from 'vitest'
import { projectThumbnailService } from '@/features/project/services/projectThumbnail.service'

const { apiGetMock } = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
}))

vi.mock('@/shared/lib/axios', () => ({
  api: {
    get: apiGetMock,
  },
}))

describe('projectThumbnailService', () => {
  beforeEach(() => {
    apiGetMock.mockReset()
  })

  it('returns the latest successful render image url', async () => {
    apiGetMock.mockResolvedValueOnce({
      data: {
        data: [
          {
            renderId: 'render-running',
            status: 'RUNNING',
            createdAt: '2026-05-20T01:00:00Z',
            imageUrl: 'https://example.com/running.png',
          },
          {
            renderId: 'render-latest-success',
            status: 'SUCCEEDED',
            createdAt: '2026-05-19T01:00:00Z',
            completedAt: '2026-05-19T01:10:00Z',
            renderUrls: {
              frontDiagonalLeftUrl: 'https://example.com/latest-left.png',
            },
          },
          {
            renderId: 'render-older-success',
            status: 'SUCCEEDED',
            createdAt: '2026-05-18T01:00:00Z',
            imageUrl: 'https://example.com/older.png',
          },
        ],
      },
    })

    await expect(projectThumbnailService.getLatestRenderedImageUrl('project-1'))
      .resolves.toBe('https://example.com/latest-left.png')
  })

  it('skips blank and internal storage urls when resolving a thumbnail', async () => {
    apiGetMock.mockResolvedValueOnce({
      data: {
        data: {
          renders: [
            {
              renderId: 'render-1',
              status: 'SUCCEEDED',
              created_at: '2026-05-19T01:00:00Z',
              render_urls: {
                frontDiagonalLeftUrl: '',
                front_diagonal_right_url: 's3://batang/private-render.png',
              },
              presigned_url: ' https://example.com/presigned.png ',
            },
          ],
        },
      },
    })

    await expect(projectThumbnailService.getLatestRenderedImageUrl('project-1'))
      .resolves.toBe('https://example.com/presigned.png')
  })
})

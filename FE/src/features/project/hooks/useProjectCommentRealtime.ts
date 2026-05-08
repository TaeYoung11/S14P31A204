// 프로젝트 댓글 SSE 이벤트를 구독하고 새 댓글 토스트 상태를 관리한다.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ProjectCommentCreatedEvent } from '@/features/project/services/projectComment.service'
import { clearAuthState, redirectToLoginIfNeeded, refreshAccessToken } from '@/shared/lib/authToken'
import { getRuntimeEnvString } from '@/shared/lib/runtimeEnv'
import { useAuthStore } from '@/shared/stores/authStore'
import type { Project } from '@/shared/types'

interface SseEventMessage {
  event: string
  data: string
}

export interface ProjectCommentToastState {
  projectId: string
  projectName: string
  pinId: string
  commentId: string
  content: string
  createdAt: string
}

const DEFAULT_API_BASE_URL = '/api/v1'
const NOTIFICATION_STREAM_PATH = '/notifications/stream'
const COMMENT_CREATED_EVENT = 'comment-created'
const RECONNECT_DELAY_MS = 3000
const TOAST_DURATION_MS = 5000

class SseAuthError extends Error {}

const resolveNotificationStreamUrl = (): string => {
  const apiBaseUrl = getRuntimeEnvString('VITE_API_URL', DEFAULT_API_BASE_URL)
  return `${apiBaseUrl.replace(/\/$/, '')}${NOTIFICATION_STREAM_PATH}`
}

const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const timeoutId = window.setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeoutId)
        resolve()
      },
      { once: true },
    )
  })

const parseSseBlock = (block: string): SseEventMessage | null => {
  const lines = block.split('\n')
  const eventLine = lines.find((line) => line.startsWith('event:'))
  const dataLines = lines.filter((line) => line.startsWith('data:'))
  if (!eventLine || dataLines.length === 0) return null

  return {
    event: eventLine.slice('event:'.length).trim(),
    data: dataLines.map((line) => line.slice('data:'.length).trim()).join('\n'),
  }
}

const readSseStream = async (
  token: string,
  signal: AbortSignal,
  onMessage: (message: SseEventMessage) => void,
): Promise<void> => {
  const response = await fetch(resolveNotificationStreamUrl(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'text/event-stream',
    },
    signal,
  })

  if (!response.ok || !response.body) {
    if (response.status === 401) {
      throw new SseAuthError('SSE stream unauthorized.')
    }
    throw new Error(`SSE stream failed with status ${response.status}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (!signal.aborted) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''

    blocks.forEach((block) => {
      const message = parseSseBlock(block)
      if (message) onMessage(message)
    })
  }
}

const parseCommentCreatedEvent = (data: string): ProjectCommentCreatedEvent | null => {
  try {
    const parsed = JSON.parse(data) as ProjectCommentCreatedEvent
    if (!parsed.projectId || !parsed.pinId || !parsed.commentId) return null
    return parsed
  } catch {
    return null
  }
}

export const useProjectCommentRealtime = (projects: Project[]) => {
  const token = useAuthStore((state) => state.token)
  const queryClient = useQueryClient()
  const [toast, setToast] = useState<ProjectCommentToastState | null>(null)
  const projectNameById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  )

  const handleMessage = useCallback(
    (message: SseEventMessage) => {
      if (message.event !== COMMENT_CREATED_EVENT) return

      const payload = parseCommentCreatedEvent(message.data)
      if (!payload) return

      void queryClient.invalidateQueries({ queryKey: ['projects', 'comments'] })

      setToast({
        projectId: payload.projectId,
        projectName: projectNameById.get(payload.projectId) ?? '프로젝트',
        pinId: payload.pinId,
        commentId: payload.commentId,
        content: payload.content,
        createdAt: payload.createdAt,
      })
    },
    [projectNameById, queryClient],
  )

  useEffect(() => {
    if (!token) return undefined

    const controller = new AbortController()

    const connect = async () => {
      while (!controller.signal.aborted) {
        try {
          const accessToken = useAuthStore.getState().token
          if (!accessToken) return

          await readSseStream(accessToken, controller.signal, handleMessage)
        } catch (error) {
          if (error instanceof SseAuthError && !controller.signal.aborted) {
            try {
              await refreshAccessToken()
              continue
            } catch (refreshError) {
              console.warn('[project-comment-sse] token refresh failed:', refreshError)
              clearAuthState()
              redirectToLoginIfNeeded()
              return
            }
          }

          if (!controller.signal.aborted) {
            console.warn('[project-comment-sse] stream disconnected:', error)
          }
        }

        if (!controller.signal.aborted) {
          await sleep(RECONNECT_DELAY_MS, controller.signal)
        }
      }
    }

    void connect()

    return () => controller.abort()
  }, [handleMessage, token])

  useEffect(() => {
    if (!toast) return undefined
    const timeoutId = window.setTimeout(() => setToast(null), TOAST_DURATION_MS)
    return () => window.clearTimeout(timeoutId)
  }, [toast])

  return {
    toast,
    dismissToast: () => setToast(null),
  }
}

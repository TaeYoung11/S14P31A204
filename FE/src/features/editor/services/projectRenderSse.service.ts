// 렌더링 SSE 알림 스트림을 구독하고 render 이벤트만 전달한다.
import { clearAuthState, redirectToLoginIfNeeded, refreshAccessToken } from '@/shared/lib/authToken'
import { getRuntimeEnvString } from '@/shared/lib/runtimeEnv'
import { useAuthStore } from '@/shared/stores/authStore'
import type { ProjectRenderSseEvent, ProjectRenderSsePayload } from '../types/projectRender.dto'

interface SseEventMessage {
  event: string
  data: string
}

interface SubscribeProjectRenderSseOptions {
  signal: AbortSignal
  onEvent: (event: ProjectRenderSseEvent) => void
}

const DEFAULT_API_BASE_URL = '/api/v1'
const NOTIFICATION_STREAM_PATH = '/notifications/stream'
const RENDER_EVENT_PREFIX = 'RENDER_'

class SseAuthError extends Error { }

const resolveNotificationStreamUrl = (): string => {
  const apiBaseUrl = getRuntimeEnvString('VITE_API_URL', DEFAULT_API_BASE_URL)
  return `${apiBaseUrl.replace(/\/$/, '')}${NOTIFICATION_STREAM_PATH}`
}

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

const parseRenderPayload = (data: string): ProjectRenderSsePayload | null => {
  try {
    const parsed = JSON.parse(data) as ProjectRenderSsePayload
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
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

export async function subscribeProjectRenderSse({
  signal,
  onEvent,
}: SubscribeProjectRenderSseOptions): Promise<void> {
  const handleMessage = (message: SseEventMessage) => {
    if (!message.event.startsWith(RENDER_EVENT_PREFIX)) return

    const payload = parseRenderPayload(message.data)
    if (!payload) return

    onEvent({ event: message.event, payload })
  }

  try {
    const accessToken = useAuthStore.getState().token
    if (!accessToken) return

    await readSseStream(accessToken, signal, handleMessage)
  } catch (error) {
    if (error instanceof SseAuthError && !signal.aborted) {
      try {
        await refreshAccessToken()
        const refreshedToken = useAuthStore.getState().token
        if (refreshedToken && !signal.aborted) {
          await readSseStream(refreshedToken, signal, handleMessage)
        }
      } catch {
        clearAuthState()
        redirectToLoginIfNeeded()
      }
    }
  }
}

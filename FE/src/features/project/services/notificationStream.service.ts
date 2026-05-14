import { clearAuthState, redirectToLoginIfNeeded, refreshAccessToken } from '@/shared/lib/authToken'
import { getRuntimeEnvString } from '@/shared/lib/runtimeEnv'
import { useAuthStore } from '@/shared/stores/authStore'

interface SseEventMessage {
  event: string
  data: string
}

type NotificationStreamListener = (message: SseEventMessage) => void

const DEFAULT_API_BASE_URL = '/api/v1'
const NOTIFICATION_STREAM_PATH = '/notifications/stream'
const RECONNECT_DELAY_MS = 3000

class SseAuthError extends Error { }

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

class NotificationStreamService {
  private listeners = new Set<NotificationStreamListener>()
  private controller: AbortController | null = null
  private connectPromise: Promise<void> | null = null

  subscribe(listener: NotificationStreamListener): () => void {
    this.listeners.add(listener)
    this.ensureRunning()

    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) {
        this.stop()
      }
    }
  }

  private stop(): void {
    this.controller?.abort()
    this.controller = null
    this.connectPromise = null
  }

  private ensureRunning(): void {
    if (this.connectPromise || this.listeners.size === 0) return

    const controller = new AbortController()
    this.controller = controller
    this.connectPromise = this.connectLoop(controller).finally(() => {
      if (this.controller === controller) {
        this.controller = null
        this.connectPromise = null
      }
      if (this.listeners.size > 0) {
        this.ensureRunning()
      }
    })
  }

  private emit(message: SseEventMessage): void {
    this.listeners.forEach((listener) => listener(message))
  }

  private async connectLoop(controller: AbortController): Promise<void> {
    while (!controller.signal.aborted && this.listeners.size > 0) {
      try {
        const accessToken = useAuthStore.getState().token
        if (!accessToken) {
          await sleep(RECONNECT_DELAY_MS, controller.signal)
          continue
        }

        await readSseStream(accessToken, controller.signal, (message) => this.emit(message))
      } catch (error) {
        if (error instanceof SseAuthError && !controller.signal.aborted) {
          try {
            await refreshAccessToken()
            continue
          } catch {
            clearAuthState()
            redirectToLoginIfNeeded()
            return
          }
        }

        if (!controller.signal.aborted) {
          console.warn('[notification-sse] stream disconnected:', error)
        }
      }

      if (!controller.signal.aborted) {
        await sleep(RECONNECT_DELAY_MS, controller.signal)
      }
    }
  }
}

const notificationStreamService = new NotificationStreamService()

export type { SseEventMessage }
export { notificationStreamService }

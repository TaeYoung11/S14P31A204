import { notificationStreamService } from '@/features/project/services/notificationStream.service'
import type { ProjectRenderSseEvent, ProjectRenderSsePayload } from '../types/projectRender.dto'

interface SubscribeProjectRenderSseOptions {
  signal: AbortSignal
  onEvent: (event: ProjectRenderSseEvent) => void
}

const RENDER_EVENT_PREFIX = 'RENDER_'

const parseRenderPayload = (data: string): ProjectRenderSsePayload | null => {
  try {
    const parsed = JSON.parse(data) as ProjectRenderSsePayload
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export async function subscribeProjectRenderSse({
  signal,
  onEvent,
}: SubscribeProjectRenderSseOptions): Promise<void> {
  const unsubscribe = notificationStreamService.subscribe((message) => {
    if (!message.event.startsWith(RENDER_EVENT_PREFIX)) return

    const payload = parseRenderPayload(message.data)
    if (!payload) return

    onEvent({ event: message.event, payload })
  })

  if (signal.aborted) {
    unsubscribe()
    return
  }

  await new Promise<void>((resolve) => {
    signal.addEventListener(
      'abort',
      () => {
        unsubscribe()
        resolve()
      },
      { once: true },
    )
  })
}

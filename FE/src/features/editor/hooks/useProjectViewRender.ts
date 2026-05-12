// 뷰어 모드 렌더링 목록 조회, 생성 요청, SSE 갱신을 관리한다.
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createProjectRender,
  DEFAULT_VIEW_RENDER_REQUEST,
  fetchProjectRenders,
  resolveProjectRenderImageUrl,
  type CreateProjectRenderRequest,
  type ProjectRenderResponse,
} from '../services/projectRender.service'
import { subscribeProjectRenderSse } from '../services/projectRenderSse.service'
import { useAuthStore } from '@/shared/stores/authStore'
import { useProjectNotificationToastStore } from '@/features/project/stores/projectNotificationToastStore'

export interface ViewRenderPreset {
  id: string
  label: string
  request: CreateProjectRenderRequest
}

export type ViewRenderStatus = 'idle' | 'loading' | 'succeeded' | 'failed'

export const VIEW_RENDER_PRESETS: ViewRenderPreset[] = [
  {
    id: 'daylight',
    label: 'Daylight',
    request: DEFAULT_VIEW_RENDER_REQUEST,
  },
  {
    id: 'dusk',
    label: 'Dusk',
    request: {
      ...DEFAULT_VIEW_RENDER_REQUEST,
      prompt: `${DEFAULT_VIEW_RENDER_REQUEST.prompt}, warm dusk lighting`,
      style: { ...DEFAULT_VIEW_RENDER_REQUEST.style, timeOfDay: 'DUSK' },
    },
  },
  {
    id: 'night',
    label: 'Night',
    request: {
      ...DEFAULT_VIEW_RENDER_REQUEST,
      prompt: `${DEFAULT_VIEW_RENDER_REQUEST.prompt}, dramatic night lighting`,
      style: { ...DEFAULT_VIEW_RENDER_REQUEST.style, timeOfDay: 'NIGHT' },
    },
  },
  {
    id: 'interior',
    label: 'Interior',
    request: {
      ...DEFAULT_VIEW_RENDER_REQUEST,
      prompt: 'Photorealistic architectural interior rendering of the current IFC building model, realistic materials, soft daylight, high quality visualization',
      style: { ...DEFAULT_VIEW_RENDER_REQUEST.style, viewpoint: 'INTERIOR' },
    },
  },
]

interface ProjectViewRenderState {
  imageUrl: string | null
  renders: ProjectRenderResponse[]
  status: ViewRenderStatus
  errorMessage: string | null
  isRequesting: boolean
  requestRender: (request?: CreateProjectRenderRequest) => Promise<void>
}

const IN_PROGRESS_STATUSES = new Set(['QUEUED', 'RUNNING', 'PROCESSING'])

const normalizeRenderValue = (value: string | null | undefined): string | null => {
  const normalized = value?.trim().toUpperCase()
  return normalized && normalized.length > 0 ? normalized : null
}

const matchesPreset = (render: ProjectRenderResponse, preset: ViewRenderPreset): boolean => {
  const renderTimeOfDay = normalizeRenderValue(render.style?.timeOfDay)
  const renderViewpoint = normalizeRenderValue(render.style?.viewpoint)
  const presetTimeOfDay = normalizeRenderValue(preset.request.style?.timeOfDay)
  const presetViewpoint = normalizeRenderValue(preset.request.style?.viewpoint)

  return (!presetTimeOfDay || renderTimeOfDay === presetTimeOfDay)
    && (!presetViewpoint || renderViewpoint === presetViewpoint)
}

const hasDisplayableImage = (render: ProjectRenderResponse): boolean =>
  Boolean((render.presignedUrl ?? render.imageUrl)?.trim())

const pickDisplayRender = (
  renders: ProjectRenderResponse[],
  preset: ViewRenderPreset,
): ProjectRenderResponse | null =>
  renders.find((render) =>
    render.status === 'SUCCEEDED' && hasDisplayableImage(render) && matchesPreset(render, preset)
  )
  ?? renders.find((render) => render.status === 'SUCCEEDED' && hasDisplayableImage(render))
  ?? null

const hasInProgressRender = (renders: ProjectRenderResponse[], preset: ViewRenderPreset): boolean =>
  renders.some((render) =>
    IN_PROGRESS_STATUSES.has(render.status) && matchesPreset(render, preset)
  )
  || renders.some((render) => IN_PROGRESS_STATUSES.has(render.status))

export function useProjectViewRender(
  projectId: string | undefined,
  presetIndex: number,
): ProjectViewRenderState {
  const token = useAuthStore((state) => state.token)
  const pushToast = useProjectNotificationToastStore((state) => state.pushToast)
  const preset = useMemo(
    () => VIEW_RENDER_PRESETS[presetIndex] ?? VIEW_RENDER_PRESETS[0],
    [presetIndex],
  )
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [renders, setRenders] = useState<ProjectRenderResponse[]>([])
  const [status, setStatus] = useState<ViewRenderStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isRequesting, setIsRequesting] = useState(false)

  const applyRenderList = useCallback(
    (nextRenders: ProjectRenderResponse[]) => {
      const displayRender = pickDisplayRender(nextRenders, preset)
      setRenders(nextRenders)
      setErrorMessage(null)

      if (displayRender) {
        setImageUrl(resolveProjectRenderImageUrl(displayRender))
        setStatus('succeeded')
        return
      }

      setStatus(hasInProgressRender(nextRenders, preset) ? 'loading' : 'idle')
    },
    [preset],
  )

  const loadRenderList = useCallback(async (signal: AbortSignal) => {
    if (!projectId) return

    try {
      const nextRenders = await fetchProjectRenders(projectId, signal)
      if (signal.aborted) return
      applyRenderList(nextRenders)
    } catch (error: unknown) {
      if (signal.aborted) return
      const message = error instanceof Error ? error.message : 'Project render failed.'
      setStatus('failed')
      setErrorMessage(message)
    }
  }, [applyRenderList, projectId])

  const requestRender = useCallback(async (request: CreateProjectRenderRequest = preset.request) => {
    if (!projectId) {
      setStatus('failed')
      setErrorMessage('프로젝트 정보를 확인할 수 없어 렌더링을 요청할 수 없습니다.')
      return
    }
    if (isRequesting) return

    const abortController = new AbortController()
    setIsRequesting(true)
    setStatus('loading')
    setErrorMessage(null)

    try {
      await createProjectRender(projectId, request, abortController.signal)
      await loadRenderList(abortController.signal)
    } catch (error: unknown) {
      if (abortController.signal.aborted) return
      const message = error instanceof Error ? error.message : 'Project render request failed.'
      setStatus('failed')
      setErrorMessage(message)
      pushToast({
        id: `render-request-failed:${projectId}:${Date.now()}`,
        type: 'render_failed',
        groupKey: `render:${projectId}:request`,
        projectId,
        title: '렌더링 요청 실패',
        message,
        durationMs: 8000,
      })
    } finally {
      setIsRequesting(false)
    }
  }, [isRequesting, loadRenderList, preset.request, projectId, pushToast])

  useEffect(() => {
    if (!projectId) return

    const abortController = new AbortController()
    Promise.resolve().then(() => {
      void loadRenderList(abortController.signal)
    })

    return () => {
      abortController.abort()
    }
  }, [loadRenderList, projectId])

  useEffect(() => {
    if (!projectId || !token) return

    const abortController = new AbortController()
    void subscribeProjectRenderSse({
      signal: abortController.signal,
      onEvent: ({ event, payload }) => {
        if (payload.projectId !== projectId) return

        if (event === 'RENDER_COMPLETED') {
          pushToast({
            id: `render-completed:${projectId}:${payload.renderId ?? payload.jobId ?? Date.now()}`,
            type: 'render_completed',
            groupKey: `render:${projectId}:${payload.renderId ?? payload.jobId ?? 'latest'}`,
            projectId,
            title: '렌더링 완료',
            message: '렌더링 이미지가 생성되었습니다.',
            durationMs: 5000,
          })
        }

        if (event === 'RENDER_FAILED') {
          pushToast({
            id: `render-failed:${projectId}:${payload.renderId ?? payload.jobId ?? Date.now()}`,
            type: 'render_failed',
            groupKey: `render:${projectId}:${payload.renderId ?? payload.jobId ?? 'latest'}`,
            projectId,
            title: '렌더링 실패',
            message: payload.message ?? '렌더링 작업이 실패했습니다. 잠시 후 다시 시도해주세요.',
            durationMs: 8000,
          })
        }

        void loadRenderList(abortController.signal)
      },
    })

    return () => {
      abortController.abort()
    }
  }, [loadRenderList, projectId, pushToast, token])

  return {
    imageUrl,
    renders,
    status,
    errorMessage,
    isRequesting,
    requestRender,
  }
}

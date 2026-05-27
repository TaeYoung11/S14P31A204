import { useCallback, useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type {
  ProjectCommentCreatedEvent,
  ProjectCommentListItem,
} from '@/features/project/services/projectComment.service'
import type { Project } from '@/shared/types'
import { useProjectNotificationToastStore } from '@/features/project/stores/projectNotificationToastStore'
import { notificationStreamService } from '@/features/project/services/notificationStream.service'
import { projectQueryKeys } from '@/features/project/constants/projectQueryKeys'
import { parseBackendDateAsKst } from '@/shared/utils/format'

export interface ProjectCommentToastState {
  projectId: string
  projectName: string
  pinId: string
  commentId: string
  content: string
  createdAt: string
}

interface UseProjectCommentRealtimeOptions {
  onCommentCreated?: (payload: ProjectCommentCreatedEvent) => void
}

const DEFAULT_REALTIME_OPTIONS: UseProjectCommentRealtimeOptions = {}
const COMMENT_CREATED_EVENT = 'comment-created'
const TOAST_DURATION_MS = 5000
const MAX_COMMENT_ITEMS = 50
const FALLBACK_PROJECT_NAME = '프로젝트'

const parseCommentCreatedEvent = (data: string): ProjectCommentCreatedEvent | null => {
  try {
    const parsed = JSON.parse(data) as ProjectCommentCreatedEvent
    if (!parsed.projectId || !parsed.pinId || !parsed.commentId) return null
    return {
      ...parsed,
      content: typeof parsed.content === 'string' ? parsed.content : '',
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

const compareCommentTimeDesc = (left: ProjectCommentListItem, right: ProjectCommentListItem): number => {
  return parseBackendDateAsKst(right.lastCommentAt).getTime() - parseBackendDateAsKst(left.lastCommentAt).getTime()
}

const mergeRealtimeComment = (
  currentComments: ProjectCommentListItem[] | undefined,
  nextComment: ProjectCommentListItem,
): ProjectCommentListItem[] => {
  const previousComments = currentComments ?? []
  const previousSamePin = previousComments.find((comment) => comment.pinId === nextComment.pinId)
  const mergedComment = {
    ...nextComment,
    pinContent: previousSamePin?.pinContent ?? nextComment.pinContent,
  }

  return [
    mergedComment,
    ...previousComments.filter((comment) => comment.pinId !== nextComment.pinId),
  ]
    .sort(compareCommentTimeDesc)
    .slice(0, MAX_COMMENT_ITEMS)
}

export const useProjectCommentRealtime = (
  projects: Project[],
  options = DEFAULT_REALTIME_OPTIONS,
) => {
  const pushToast = useProjectNotificationToastStore((state) => state.pushToast)
  const queryClient = useQueryClient()
  const projectNameById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  )

  const handleMessage = useCallback(
    (event: string, data: string) => {
      if (event !== COMMENT_CREATED_EVENT) return

      const payload = parseCommentCreatedEvent(data)
      if (!payload) return
      options.onCommentCreated?.(payload)

      const realtimeComment: ProjectCommentListItem = {
        projectId: payload.projectId,
        projectName: projectNameById.get(payload.projectId) ?? FALLBACK_PROJECT_NAME,
        pinId: payload.pinId,
        pinContent: '',
        lastCommentAt: payload.createdAt,
      }

      queryClient.setQueriesData<ProjectCommentListItem[]>(
        { queryKey: projectQueryKeys.commentsRoot() },
        (currentComments) => mergeRealtimeComment(currentComments, realtimeComment),
      )

      pushToast({
        id: `comment:${payload.projectId}:${payload.pinId}`,
        type: 'comment',
        groupKey: `comment:${payload.projectId}:${payload.pinId}`,
        projectId: payload.projectId,
        pinId: payload.pinId,
        title: realtimeComment.projectName,
        message: payload.content ?? '',
        durationMs: TOAST_DURATION_MS,
      })
    },
    [options, projectNameById, pushToast, queryClient],
  )

  useEffect(() => {
    const unsubscribe = notificationStreamService.subscribe((message) => {
      handleMessage(message.event, message.data)
    })

    return () => unsubscribe()
  }, [handleMessage])

  return {
    toast: null as ProjectCommentToastState | null,
    dismissToast: () => undefined,
  }
}

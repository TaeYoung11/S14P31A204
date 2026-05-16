// 프로젝트 메인 화면의 핀 댓글 조회와 읽음 처리를 담당한다.
import { api } from '@/shared/lib/axios'
import type { Project } from '@/shared/types'
import { DEFAULT_PIN_CONTENT } from '@/shared/constants/pin'

interface ApiResponse<T> {
  status: number
  message: string
  data: T
}

interface ProjectPinResponse {
  pinId: string
  content?: string
  createdAt: string
  lastCommentAt?: string | null
  hasUnreadCommentByOtherUser: boolean
}

interface GetProjectPinsResponse {
  pins: ProjectPinResponse[]
  hasNext: boolean
}

export interface ProjectCommentListItem {
  projectId: string
  projectName: string
  pinId: string
  pinContent: string
  lastCommentAt: string
}

export interface ProjectCommentCreatedEvent {
  projectId: string
  pinId: string
  commentId: string
  authorUserId: string
  content?: string | null
  createdAt: string
}

const PIN_PAGE_SIZE = 50
const MAX_COMMENT_ITEMS = 50

const fetchProjectPins = async (projectId: string): Promise<ProjectPinResponse[]> => {
  const pins: ProjectPinResponse[] = []
  let page = 1
  let hasNext = true

  while (hasNext) {
    const response = await api.get<ApiResponse<GetProjectPinsResponse>>(`/projects/${projectId}/pins`, {
      params: { page, size: PIN_PAGE_SIZE },
    })
    const data = response.data.data

    pins.push(...(data.pins ?? []))
    hasNext = data.hasNext
    page += 1
  }

  return pins
}

const compareCommentTimeDesc = (left: ProjectCommentListItem, right: ProjectCommentListItem): number => {
  return new Date(right.lastCommentAt).getTime() - new Date(left.lastCommentAt).getTime()
}

const toProjectCommentItem = (
  project: Project,
  pin: ProjectPinResponse,
): ProjectCommentListItem => ({
  projectId: project.id,
  projectName: project.name,
  pinId: pin.pinId,
  pinContent: pin.content?.trim() === DEFAULT_PIN_CONTENT ? '' : (pin.content ?? ''),
  lastCommentAt: pin.lastCommentAt ?? pin.createdAt,
})

const fetchProjectComments = async (project: Project): Promise<ProjectCommentListItem[]> => {
  const pins = await fetchProjectPins(project.id)
  const commentPins = pins
    .filter((pin) => pin.hasUnreadCommentByOtherUser)
    .sort((left, right) => {
      const rightTime = right.lastCommentAt ? new Date(right.lastCommentAt).getTime() : 0
      const leftTime = left.lastCommentAt ? new Date(left.lastCommentAt).getTime() : 0
      return rightTime - leftTime
    })

  return commentPins.map((pin) => toProjectCommentItem(project, pin))
}

export const projectCommentService = {
  getCommentsForProjects: async (projects: Project[]): Promise<ProjectCommentListItem[]> => {
    if (projects.length === 0) return []

    const commentsByProject = await Promise.allSettled(projects.map(fetchProjectComments))
    return commentsByProject
      .filter((result): result is PromiseFulfilledResult<ProjectCommentListItem[]> => result.status === 'fulfilled')
      .map((result) => result.value)
      .flat()
      .sort(compareCommentTimeDesc)
      .slice(0, MAX_COMMENT_ITEMS)
  },
}

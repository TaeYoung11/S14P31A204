// 에디터 화면의 핀과 댓글 API 요청을 담당합니다.
import { api } from '@/shared/lib/axios'
import { DEFAULT_PIN_CONTENT } from '@/shared/constants/pin'
import { FLOOR_MM_PER_PX } from '../constants'

interface ApiResponse<T> {
  status: number
  message: string
  data: T
}

interface PinPositionResponse {
  x: number | null
  y: number | null
  z: number | null
}

export interface EditorPinResponse {
  pinId: string
  authorUserId: string | null
  status: string
  cameraPosition: PinPositionResponse
  worldPosition: PinPositionResponse
  targetElementId: string
  content: string
  commentCount: number
  lastCommentAt: string | null
  lastCommentAuthorUserId: string | null
  pinnedByOtherUser: boolean
  unreadPinByCurrentUser: boolean
  hasUnreadCommentByOtherUser: boolean
  createdAt: string
  updatedAt: string
}

interface GetProjectPinsResponse {
  pins: EditorPinResponse[]
  hasNext: boolean
}

export interface EditorPinCommentResponse {
  commentId: string
  pinId: string
  authorUserId: string | null
  content: string
  status: string
  commentedByOtherUser: boolean
  unreadByCurrentUser: boolean
  createdAt: string
  updatedAt: string
}

interface GetPinCommentsResponse {
  comments: EditorPinCommentResponse[]
  hasNext: boolean
}

interface CreatePinResponse {
  pinId: string
}

interface CreatePinCommentResponse {
  commentId: string
}

interface ResolvePinCommentResponse {
  commentId: string
  pinId: string
  status: string
  resolvedByUserId: string | null
  resolvedAt: string | null
  updatedAt: string
}

interface ResolvePinResponse {
  pinId: string
  status: string
  resolvedByUserId: string | null
  resolvedAt: string | null
  updatedAt: string
}

const PAGE_SIZE = 50
const DEFAULT_TARGET_ELEMENT_ID = 'floor-plan'
const DEFAULT_2D_PIN_FLOOR_ELEVATION_MM = 0
const DEFAULT_2D_PIN_CAMERA_HEIGHT_MM = 10_000

const toWorldPositionRequest = (x: number, y: number, floorElevationMm = DEFAULT_2D_PIN_FLOOR_ELEVATION_MM) => ({
  x: Math.round(x * FLOOR_MM_PER_PX),
  y: Math.round(y * FLOOR_MM_PER_PX),
  z: floorElevationMm,
})

const toCameraPositionRequest = (x: number, y: number, floorElevationMm = DEFAULT_2D_PIN_FLOOR_ELEVATION_MM) => ({
  x: Math.round(x * FLOOR_MM_PER_PX),
  y: Math.round(y * FLOOR_MM_PER_PX),
  z: floorElevationMm + DEFAULT_2D_PIN_CAMERA_HEIGHT_MM,
})

export const editorPinPositionMapper = {
  worldXToCanvasX: (x: number | null | undefined) => (x ?? 0) / FLOOR_MM_PER_PX,
  worldYToCanvasY: (y: number | null | undefined) => (y ?? 0) / FLOOR_MM_PER_PX,
}

const fetchAllPinComments = async (
  projectId: string,
  pinId: string,
): Promise<EditorPinCommentResponse[]> => {
  const comments: EditorPinCommentResponse[] = []
  let page = 1
  let hasNext = true

  while (hasNext) {
    const response = await api.get<ApiResponse<GetPinCommentsResponse>>(
      `/projects/${projectId}/pins/${pinId}/comments`,
      { params: { page, size: PAGE_SIZE } },
    )
    const data = response.data.data

    comments.push(...(data.comments ?? []))
    hasNext = data.hasNext
    page += 1
  }

  return comments
}

const fetchAllPins = async (projectId: string): Promise<EditorPinResponse[]> => {
  const pins: EditorPinResponse[] = []
  let page = 1
  let hasNext = true

  while (hasNext) {
    const response = await api.get<ApiResponse<GetProjectPinsResponse>>(`/projects/${projectId}/pins`, {
      params: { page, size: PAGE_SIZE },
    })
    const data = response.data.data

    pins.push(...(data.pins ?? []))
    hasNext = data.hasNext
    page += 1
  }

  return pins
}

export const editorPinCommentService = {
  getPinsWithComments: async (projectId: string) => {
    const pins = await fetchAllPins(projectId)
    const commentsByPin = await Promise.all(
      pins.map(async (pin) => ({
        pinId: pin.pinId,
        comments: await fetchAllPinComments(projectId, pin.pinId),
      })),
    )
    const commentMap = new Map(commentsByPin.map((item) => [item.pinId, item.comments]))

    return pins.map((pin) => ({
      pin,
      comments: commentMap.get(pin.pinId) ?? [],
    }))
  },

  createPin: async (
    projectId: string,
    x: number,
    y: number,
    content?: string,
    floorElevationMm = DEFAULT_2D_PIN_FLOOR_ELEVATION_MM,
  ): Promise<CreatePinResponse> => {
    const normalizedContent = content?.trim() || DEFAULT_PIN_CONTENT
    const response = await api.post<ApiResponse<CreatePinResponse>>(`/projects/${projectId}/pins`, {
      cameraPosition: toCameraPositionRequest(x, y, floorElevationMm),
      worldPosition: toWorldPositionRequest(x, y, floorElevationMm),
      targetElementId: DEFAULT_TARGET_ELEMENT_ID,
      content: normalizedContent,
    })
    return response.data.data
  },

  createComment: async (projectId: string, pinId: string, content: string): Promise<CreatePinCommentResponse> => {
    const response = await api.post<ApiResponse<CreatePinCommentResponse>>(
      `/projects/${projectId}/pins/${pinId}/comments`,
      { content },
    )
    return response.data.data
  },

  markCommentsAsRead: async (projectId: string, pinId: string): Promise<void> => {
    await api.post(`/projects/${projectId}/pins/${pinId}/comments/read`)
  },

  resolveComment: async (
    projectId: string,
    pinId: string,
    commentId: string,
  ): Promise<ResolvePinCommentResponse> => {
    const response = await api.patch<ApiResponse<ResolvePinCommentResponse>>(
      `/projects/${projectId}/pins/${pinId}/comments/${commentId}/resolve`,
    )
    return response.data.data
  },

  resolvePin: async (projectId: string, pinId: string): Promise<ResolvePinResponse> => {
    const response = await api.patch<ApiResponse<ResolvePinResponse>>(`/projects/${projectId}/pins/${pinId}/resolve`)
    return response.data.data
  },
}

export const editorPinCommentQueryKeys = {
  pins: (projectId: string | null | undefined) => ['editor', 'pins', projectId] as const,
}

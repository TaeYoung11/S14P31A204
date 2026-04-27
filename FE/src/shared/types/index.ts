// =====================
// 사용자
// =====================
export type UserType = 'DESIGNER' | 'CLIENT'

export interface User {
  id: string
  email: string
  name: string
  user_type: UserType
  created_at: string
}

export interface AuthTokens {
  access_token: string
}

// =====================
// 프로젝트
// =====================
export interface Project {
  id: string
  name: string
  description: string
  owner_id: string
  created_at: string
  updated_at: string
  thumbnail_url?: string
  member_count: number
  ifc_uploaded: boolean
}

export interface ProjectMember {
  id: string
  user: User
  role: UserType
  joined_at: string
}

export interface CreateProjectDto {
  name: string
  description: string
}

export interface UpdateProjectDto {
  name?: string
  description?: string
}

// =====================
// 3D 뷰어 / 모델
// =====================
export type AuthoringTool =
  | 'select'
  | 'wall'
  | 'slab'
  | 'column'
  | 'beam'
  | 'door'
  | 'window'
  | 'stair'
  | 'roof'
  | 'move'
  | 'rotate'
  | 'delete'
  | 'measure'

export interface ElementProperties {
  expressID: number
  guid?: string
  type?: string
  name?: string
  [key: string]: unknown
}

export interface AuthoringOperation {
  tool: AuthoringTool
  params: Record<string, number | string>
  position?: { x: number; y: number; z: number }
}

export interface RenderStyle {
  time_of_day: 'morning' | 'noon' | 'evening' | 'night'
  viewpoint: 'exterior' | 'interior' | 'aerial'
  season: 'spring' | 'summer' | 'autumn' | 'winter'
  weather: 'clear' | 'cloudy' | 'rainy'
}

export interface RenderPreviewResponse {
  image_b64: string
  prompt: string
  generation_time_sec: number
}

// =====================
// 2D 평면도
// =====================
export interface Room {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  color: string
  storey_id: string
}

export interface WallLine {
  id: string
  points: number[]
  storey_id: string
}

export interface Storey {
  id: string
  name: string
  elevation: number
}

export interface FloorPlan {
  storeys: Storey[]
  rooms: Room[]
  walls: WallLine[]
}

// =====================
// 버블 다이어그램
// =====================
export interface BubbleNode {
  id: string
  label: string
  area: number // m²
  color: string
  zone?: string
  x?: number
  y?: number
}

export interface BubbleLink {
  id: string
  source: string
  target: string
  strength: number // 0~1, 연결 강도
}

export interface BubbleDiagram {
  nodes: BubbleNode[]
  links: BubbleLink[]
}

// =====================
// 댓글 핀
// =====================
export type PinType = '2d' | '3d'

export interface Pin {
  id: string
  project_id: string
  type: PinType
  position: {
    x: number
    y: number
    z?: number
  }
  storey_id?: string
  resolved: boolean
  created_by: string
  created_at: string
  comment_count: number
}

export interface Comment {
  id: string
  pin_id: string
  content: string
  author: User
  created_at: string
  updated_at: string
  resolved: boolean
}

// =====================
// 실시간 (STOMP)
// =====================
export interface PresenceState {
  session_id: string
  user: User
  selection?: number // expressID
  color: string
}

export interface LockState {
  element_guid: string
  locked_by: string
  locked_at: string
}

export interface PreviewState {
  element_guid: string
  preview_data: unknown
}

export type WebSocketMessageType =
  | 'model_update'
  | 'model_reset'
  | 'processing'
  | 'presence.state'
  | 'lock.state'
  | 'preview.state'
  | 'pin.new'
  | 'commit.accepted'
  | 'commit.rejected'

export interface WebSocketMessage {
  type: WebSocketMessageType
  payload: unknown
  timestamp: string
}

// =====================
// 채팅 (LLM)
// =====================
export type ChatStatus = 'idle' | 'analyzing' | 'modifying' | 'success' | 'error'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  status?: ChatStatus
  created_at: string
}

// =====================
// 알림
// =====================
export interface Notification {
  id: string
  type: 'pin_new' | 'comment_new' | 'model_update'
  message: string
  link?: string
  read: boolean
  created_at: string
}

// =====================
// API 공통
// =====================
export interface ApiError {
  message: string
  status: number
}

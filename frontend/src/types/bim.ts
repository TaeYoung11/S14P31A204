export interface BIMElementProperty {
  before?: unknown
  after?: unknown
}

export interface BIMChange {
  guid: string
  element_type: string
  operation: 'modify' | 'delete' | 'add'
  properties_changed?: Record<string, BIMElementProperty>
  geometry_changed?: boolean
}

export interface DeltaResponse {
  type: 'model_update'
  project_id: string
  timestamp: string
  changes: BIMChange[]
  model_revision?: number
}

export interface StatusResponse {
  type: 'processing' | 'error'
  status?: string
  message: string
  code?: string
}

export interface StoreyInfo {
  id?: number
  guid: string
  name: string
  elevation?: number
}

export interface ProjectMeta {
  storeys: StoreyInfo[]
  schema?: string
  start_mode?: 'blank' | 'upload'
  model_revision?: number
  authoring_supported?: boolean
}

export interface Project {
  id: string
  name: string
  description?: string
  ifc_uploaded: boolean
  meta_info?: ProjectMeta
}

export interface HistoryItem {
  id: string
  command_text: string
  action_type: string
  created_at: string
  affected_elements_count: number
}

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

export interface AuthoringPoint {
  x: number
  y: number
  z: number
}

export interface AuthoringDraft {
  start?: AuthoringPoint
  end?: AuthoringPoint
  position?: AuthoringPoint
}

export interface AuthoringSession {
  session_id: string
  display_name: string
  project_id: string
  model_revision: number
}

export interface PresenceSession {
  session_id: string
  display_name: string
  last_seen: string
  selection?: string | null
}

export interface PreviewBoundingBox {
  min: AuthoringPoint
  max: AuthoringPoint
}

export interface AuthoringPreview {
  operation_id: string
  session_id: string
  action: 'create' | 'update' | 'delete'
  element_type: string
  label: string
  storey_guid?: string | null
  host_guid?: string | null
  geometry: Record<string, unknown>
  semantics: Record<string, unknown>
  bbox: PreviewBoundingBox
  lock_scope: string
  lock_scope_key: string
  warnings: string[]
}

export interface AuthoringLock {
  lock_id: string
  scope: string
  scope_key: string
  label: string
  session_id: string
  bbox?: PreviewBoundingBox
  expires_at: string
}

export interface PresenceStateMessage {
  type: 'presence.state'
  project_id: string
  model_revision: number
  sessions: PresenceSession[]
}

export interface LockStateMessage {
  type: 'lock.state'
  project_id: string
  locks: AuthoringLock[]
}

export interface PreviewStateMessage {
  type: 'preview.state'
  project_id: string
  previews: AuthoringPreview[]
}

export interface CommitAcceptedMessage {
  type: 'commit.accepted'
  project_id: string
  session_id: string
  model_revision: number
  changes: BIMChange[]
}

export interface CommitRejectedMessage {
  type: 'commit.rejected'
  project_id: string
  session_id: string
  message: string
}

export interface ConnectedMessage {
  type: 'connected'
  project_id: string
  message: string
  model_revision?: number
}

export interface ResetMessage {
  type: 'model_reset'
  message: string
}

export type ServerMessage =
  | DeltaResponse
  | StatusResponse
  | PresenceStateMessage
  | LockStateMessage
  | PreviewStateMessage
  | CommitAcceptedMessage
  | CommitRejectedMessage
  | ConnectedMessage
  | ResetMessage

import type {
  BubbleData,
  ConnectionData,
  ConnectionStyle,
  FloorDoorHingeSide,
  FloorDoorSwingDirection,
  FloorOpening,
  FloorWall,
  FloorWallType,
  Point2D,
} from '../types'

/** LLM 편집 요청 진행 상태 */
export type LlmEditStatus = 'idle' | 'loading' | 'running' | 'preview' | 'ambiguous' | 'error' | 'applied' | 'clarification_required'

/** clarification alternatives 한 항목 */
export interface ClarificationAlternative {
  alternative_id: string
  title: string
  description: string
  fill: Record<string, unknown>
  affected_entities: string[]
  warnings: string[]
  metrics: string[]
}

/** MinIO clarification/detail.v1.json 아티팩트 스키마 */
export interface ClarificationArtifact {
  schema_version: 'v1'
  kind: 'needs_clarification' | 'alternatives'
  question: string
  alternatives: ClarificationAlternative[]
  parsed_command_preview: Record<string, unknown> | null
  policy_plan: Record<string, unknown> | null
  job_id: string
  step_no: number
  clarification_request_id: string
  timestamp: string
}

export type LlmEditSceneType = 'TWO_D' | 'THREE_D'

export interface LlmChatLogItem {
  id: string
  type: string
  subType: string | null
  content: string
  senderName: string | null
  timestamp: string
  jobId: string | null
  jobType: string | null
  jobStatus: string | null
}

/** LLM이 반환하는 버블 다이어그램 수정 명령 */
export type LlmEditOperation =
  | {
      kind: 'add_connection'
      fromId: string
      toId: string
      style?: ConnectionStyle
    }
  | {
      kind: 'remove_connection'
      fromId: string
      toId: string
    }
  | {
      kind: 'rename_bubble'
      bubbleId: string
      nextLabel: string
    }
  | {
      kind: 'add_bubble'
      label: string
      type?: string
      nearBubbleId?: string
    }
  | {
      kind: 'add_wall'
      start: Point2D
      end: Point2D
      type?: FloorWallType
      thickness?: number
      heightMm?: number
    }
  | {
      kind: 'update_wall'
      wallId: string
      start?: Point2D
      end?: Point2D
      type?: FloorWallType
      thickness?: number
      heightMm?: number
    }
  | {
      kind: 'delete_wall'
      wallId: string
    }
  | {
      kind: 'add_opening'
      openingType: FloorOpening['type']
      wallId: string
      wallPosition: number
      widthMm?: number
      heightMm?: number
      sillHeightMm?: number
      doorHingeSide?: FloorDoorHingeSide
      doorSwingDirection?: FloorDoorSwingDirection
    }
  | {
      kind: 'update_opening'
      openingId: string
      wallId?: string
      wallPosition?: number
      widthMm?: number
      heightMm?: number
      sillHeightMm?: number
      doorHingeSide?: FloorDoorHingeSide
      doorSwingDirection?: FloorDoorSwingDirection
    }
  | {
      kind: 'delete_opening'
      openingId: string
    }

/** LLM 편집 결과 요약 항목 (UI 표시용) */
export interface LlmEditChangeItem {
  id: string
  text: string
}

/** LLM 편집 미리보기 데이터 */
export interface LlmEditPreview {
  summary: string
  changes: LlmEditChangeItem[]
  bubbles: BubbleData[]
  connections: ConnectionData[]
  floorWalls: FloorWall[]
  floorOpenings: FloorOpening[]
}

/** LLM 서비스 성공 응답 */
export interface LlmEditOkResponse {
  kind: 'ok'
  summary: string
  operations: LlmEditOperation[]
}

/** LLM 서비스 모호 응답 */
export interface LlmEditAmbiguousResponse {
  kind: 'ambiguous'
  message: string
  suggestions: string[]
}

/** LLM 서비스 실패 응답 */
export interface LlmEditErrorResponse {
  kind: 'error'
  message: string
}

/** LLM 서비스 응답 유니온 타입 */
export type LlmEditResponse = LlmEditOkResponse | LlmEditAmbiguousResponse | LlmEditErrorResponse

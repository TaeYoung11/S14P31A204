/** 에디터 화면 전체에서 공유하는 타입 정의 */

/** 편집 모드: 버블 다이어그램 / 2D 평면도 / 3D 뷰어 */
export type EditorMode = 'bubble' | '2d' | '3d' | 'view'

export interface IfcElementInfo {
  id: string
  name: string
  ifcClass: string
  category: string
  source?: 'ifc' | 'library'
  expressId?: number | string
  globalId?: string
  lengthMm?: number
  heightMm?: number
  thicknessMm?: number
  roofShape?: 'flat' | 'gable'
  positionX?: number
  positionY?: number
  positionZ?: number
  rotationX?: number
  rotationY?: number
  rotationZ?: number
  color?: string
  material?: string
  properties: Record<string, string | number | boolean>
}

export interface IfcElementChange {
  expressId: number
  globalId?: string
  ifcClass?: string
  lengthMm?: number
  heightMm?: number
  thicknessMm?: number
  roofShape?: 'flat' | 'gable'
  positionX?: number
  positionY?: number
  positionZ?: number
  rotationX?: number
  rotationY?: number
  rotationZ?: number
  color?: string
  material?: string
  deleted?: boolean
}

/** 연결선 스타일 */
export type ConnectionStyle = 'bold' | 'thin' | 'dashed'

/** 조닝 색상 지정 방식 */
export type ZoneColorMode = 'auto' | 'manual'

/** 우측 패널 식별자 */
export type PanelKey = 'attributes' | 'zoning' | 'assistant' | 'floorView' | 'hierarchy'

/** 우측 패널 좌표 오프셋 */
export interface PanelOffset {
  x: number
  y: number
}

/** 우측 패널 리사이즈 방향 */
export type PanelResizeAxis = 'x' | 'y' | 'both'

/** 버블(공간) 데이터 */
export interface BubbleData {
  id: string
  x: number         // 캔버스 X 위치 (px)
  y: number         // 캔버스 Y 위치 (px)
  width: number     // 캔버스 렌더링 가로 (px)
  height: number    // 캔버스 렌더링 세로 (px)
  widthMm: number   // 실제 가로 (mm)
  heightMm: number  // 실제 세로 (mm)
  label: string     // 공간 이름
  type: string      // 방 종류
  ratio: number     // 면적 (m²)
  area: string      // 버블 내 표시 문자열
  color: string     // 버블 배경 색상
  material?: string // 주요 재질
  index: string     // 표시 번호 (예: '01')
}

/** 공간 간 연결선 */
export interface ConnectionData {
  from: string
  to: string
  type: ConnectionStyle
}

/** 연결선 생성용 공간 쌍 */
export interface ConnectionPair {
  from: string
  to: string
}

/** 조닝 영역 */
export interface ZoneData {
  id: string
  name: string
  color: string
  bubbleIds: string[]
  source: ZoneColorMode
}

/** 선 스타일 선택 옵션 */
export interface LineStyleOption {
  value: ConnectionStyle
  title: string
  description: string
}

/** 2D 좌표 */
export interface Point2D {
  x: number
  y: number
}

/** 2D 벽 타입 분류 */
export type FloorWallType = 'general' | 'exterior' | 'loadBearing' | 'partition'
export type FloorOpeningType = 'door' | 'window'
export type FloorDoorHingeSide = 'left' | 'right'
export type FloorDoorSwingDirection = 'inward' | 'outward' | 'sliding'
export type CollaborationUserType = 'DESIGNER' | 'CUSTOMER'

/** 공간 추가 모달 폼 데이터 */
export interface AddSpaceFormData {
  name: string
  type: string
  width: string
  height: string
  ratio: string
  color: string
}

/** 조닝 모달 폼 데이터 */
export interface ZoningFormData {
  name: string
  color: string
  bubbleIds: string[]
  colorMode: ZoneColorMode
}

/** 2D 평면도 위의 방(공간) 한 칸 */
export interface FloorRoom {
  id: string
  bubbleId: string
  label: string
  type: string
  x: number      // 캔버스 px — 바운딩 박스 좌상단 X
  y: number      // 캔버스 px — 바운딩 박스 좌상단 Y
  width: number  // 캔버스 px — 바운딩 박스 너비
  height: number // 캔버스 px — 바운딩 박스 높이
  widthMm: number  // 실제 가로(mm)
  heightMm: number // 실제 세로(mm)
  area: number   // m²
  color: string  // 원본 버블 색상
  material?: string // 주요 재질
  connectedIds: string[]  // 연결된 방 id 목록
  /**
   * IFC IfcSpace 임의 폴리곤 형상 (캔버스 px 좌표).
   * 존재하면 직사각형 대신 폴리곤으로 렌더링한다.
   * 기본 직사각형 Room도 선택 시 4점 폴리곤으로 편집 가능하다.
   */
  polygon?: { x: number; y: number }[]
  /** 렌더링용 경계 세그먼트(캔버스 px) */
  contour?: FloorRoomContourSegment[]
  /** 렌더링용 2D transform(캔버스 px) */
  transform?: FloorRoomTransform2D
}

export interface FloorRoomLineSegment {
  type: 'line'
  from: Point2D
  to: Point2D
}

export interface FloorRoomArcSegment {
  type: 'arc'
  center: Point2D
  radius: number
  startAngleDeg: number
  endAngleDeg: number
  clockwise?: boolean
}

export type FloorRoomContourSegment = FloorRoomLineSegment | FloorRoomArcSegment

export interface FloorRoomTransform2D {
  translationX?: number
  translationY?: number
  rotationDeg?: number
  scaleX?: number
  scaleY?: number
  origin?: Point2D
}

/** 평면도 층(레이어) */
export interface FloorLayer {
  id: string
  name: string
  rooms: FloorRoom[]
}

/** 층 겹쳐보기 렌더링용 선택 레이어 정보 */
export interface FloorLayerOverlay {
  layerId: string
  layerName: string
  opacity: number
  rooms: FloorRoom[]
}

/** 2D 평면도 편집용 벽(선분) 데이터 */
export interface FloorWall {
  id: string
  globalId?: string
  storeyGlobalId?: string
  sourceIfcClass?: 'IfcWall' | 'IfcWallStandardCase'
  start: Point2D
  end: Point2D
  startMm?: Point2D
  endMm?: Point2D
  type: FloorWallType
  thickness: number // 실제 두께(mm)
  heightMm: number  // 실제 높이(mm)
  material?: string // 주요 재질
}

/** 2D 평면도 편집용 벽 부착 개구부(문/창문) */
export interface FloorOpening {
  id: string
  globalId?: string
  hostWallGlobalId?: string
  storeyGlobalId?: string
  sourceIfcClass?: 'IfcDoor' | 'IfcWindow'
  type: FloorOpeningType
  wallId: string
  wallPosition: number // 벽 start~end 정규화 위치(0~1)
  centerMm?: Point2D
  widthMm: number
  heightMm: number
  sillHeightMm?: number // 창문 창턱 높이(mm)
  doorHingeSide?: FloorDoorHingeSide
  doorSwingDirection?: FloorDoorSwingDirection
}

/** 2D 협업 핀 내 댓글(스레드 단위의 메시지) */

/** 댓글 작성 시 임시 첨부 입력(백엔드 연동 전 FE 로컬 전용) */

/** 2D 협업 핀 내 댓글(스레드 단위의 메시지) */
export interface FloorCommentMessage {
  id: string
  pinId: string
  authorId: string
  authorName: string
  authorType: CollaborationUserType
  content: string
  status?: string
  isPinMessage?: boolean
  createdAt: string
}

/** 2D 평면도 핀 + 스레드 */
export interface FloorCommentPin {
  id: string
  x: number
  y: number
  createdAt: string
  createdById: string
  createdByName: string
  createdByType: CollaborationUserType
  messages: FloorCommentMessage[]
  hasUnreadCommentByOtherUser?: boolean
}

/** 협업 알림 (백엔드 연동 전 FE 로컬 시뮬레이션용) */
export interface FloorCommentNotification {
  id: string
  pinId: string
  senderName: string
  recipientType: CollaborationUserType
  type: 'pin_new' | 'comment_new'
  message: string
  createdAt: string
  isRead: boolean
}

export type PhaseStatus = 'BUBBLE_DRAFT' | 'CONVERTING' | 'IFC_EDIT'

export type SaveStatus =
  | 'idle'
  | 'dirty'
  | 'syncing'
  | 'synced'
  | 'offline-queued'
  | 'error'

export interface WorkspaceSnapshot {
  phaseStatus: PhaseStatus
  bubbles: BubbleData[]
  connections: ConnectionData[]
  zones: ZoneData[]
  floorLayers: FloorLayer[]
  activeFloorLayerId: string | null
  isFloorPlanGenerated: boolean
  floorPlanLayoutSource: 'bubble' | 'project' | null
  floorWalls: FloorWall[]
  floorOpenings: FloorOpening[]
  hiddenAutoWallIds: string[]
  hiddenAutoOpeningIds: string[]
  isProjectStructurePreferred: boolean
  ifcElementChanges: IfcElementChange[]
}

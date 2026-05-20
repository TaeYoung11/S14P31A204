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
  startMm?: Point2D
  endMm?: Point2D
  rotationX?: number
  rotationY?: number
  rotationZ?: number
  color?: string
  material?: string
  properties: Record<string, string | number | boolean>
}

export type ElementSourceType = 'IFC_MOCK' | 'FROM_2D' | 'LIBRARY'

export interface ElementRegistryItem {
  elementId: string
  sourceType: ElementSourceType
  floorId: string | null
  parentId: string | null
  category: string
  name: string
  geometryId: string
  properties: Record<string, string | number | boolean | null>
  source2dId?: string
  ifcLocalId?: number
  libraryId?: string
  isLocked?: boolean
}

export interface ElementRegistryFloor {
  floorId: string
  name: string
  sourceType: ElementSourceType | 'MIXED'
  elevationMm?: number | null
  elementCount: number
}

export interface ElementRegistryState {
  elements: ElementRegistryItem[]
  floors: ElementRegistryFloor[]
  selectedElementId: string | null
  selectedFloorId: string | null
  visibleFloorIds: string[]
  hiddenElementIds: string[]
}

export interface ElementHierarchyNode {
  id: string
  label: string
  kind: 'project' | 'building' | 'floor' | 'category' | 'element' | 'unassigned'
  elementId?: string
  floorId?: string | null
  category?: string
  sourceType?: ElementSourceType | 'MIXED'
  isSelected?: boolean
  isVisible?: boolean
  isLocked?: boolean
  children: ElementHierarchyNode[]
}

export type SceneUpdateEventType =
  | 'ELEMENT_ADDED'
  | 'ELEMENT_UPDATED'
  | 'ELEMENT_REMOVED'
  | 'ELEMENT_SELECTED'
  | 'FLOOR_SELECTED'
  | 'FLOOR_VISIBILITY_CHANGED'
  | 'TREE_NODE_SELECTED'
  | 'SOURCE_2D_UPDATED'

export interface SceneUpdateEvent {
  type: SceneUpdateEventType
  elementId?: string
  floorId?: string | null
  source2dId?: string
  payload?: Record<string, unknown>
}

export interface IfcElementChange {
  expressId: number
  localId?: number
  localIds?: number[]
  globalId?: string
  ifcClass?: string
  lengthMm?: number
  heightMm?: number
  thicknessMm?: number
  roofShape?: 'flat' | 'gable'
  positionX?: number
  positionY?: number
  positionZ?: number
  translationMm?: {
    x: number
    y: number
    z: number
  }
  startMm?: Point2D
  endMm?: Point2D
  rotationX?: number
  rotationY?: number
  rotationZ?: number
  color?: string
  material?: string
  deleted?: boolean
}

/** 연결선 스타일 */
export type ConnectionStyle = 'bold' | 'thin' | 'dashed'
export type ConnectionIntent = 'circulation' | 'open_passage' | 'weak_relation' | 'merge'

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
  floor?: number    // 층 번호(기본 정책: 1 이상 정수, 지하층 정책 활성 시 0 제외 정수). 누락 시 기본층으로 처리
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

/** 버블 모드 층 메타데이터 */
export interface BubbleData {
  originalType?: string
  wallType?: FloorWallType
}

export interface BubbleFloor {
  floor: number
  name: string
}

/** 버블 모드 층별 요약 정보 */
export interface BubbleFloorSummary {
  floor: number
  bubbleCount: number
  totalAreaM2: number
}

/** 공간 간 연결선 */
export interface ConnectionData {
  from: string
  to: string
  type: ConnectionStyle
}

/** 연결선 생성용 공간 쌍 */
export interface ConnectionData {
  id?: string
  intent?: ConnectionIntent
}

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

/** 캔버스 렌더 계층 전용 회전 변환(데이터는 불변) */
export interface CanvasViewTransform {
  centerX: number
  centerY: number
  rotationRadians: number
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
  globalId?: string
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
  storeyGlobalId?: string
  storeyName?: string
  elevationMm?: number
  ceilingHeightMm?: number
  rooms: FloorRoom[]
}

/** 층 겹쳐보기 렌더링용 선택 레이어 정보 */
export interface FloorLayerOverlay {
  layerId: string
  layerName: string
  storeyGlobalId?: string
  storeyName?: string
  opacity: number
  rooms: FloorRoom[]
}

/** 2D 평면도 편집용 벽(선분) 데이터 */
export interface FloorWall {
  id: string
  globalId?: string
  floorLayerId?: string
  storeyGlobalId?: string
  storeyName?: string
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
  storeyName?: string
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
  worldX: number
  worldY: number
  worldZ: number
  createdAt: string
  createdById: string
  createdByName: string
  createdByType: CollaborationUserType
  messages: FloorCommentMessage[]
  hasUnreadCommentByOtherUser?: boolean
}

export interface CommentPin3DCreatePosition {
  worldX: number
  worldY: number
  worldZ: number
  cameraX: number
  cameraY: number
  cameraZ: number
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
  bubbleFloorNamesByNumber: Record<number, string>
  extraBubbleFloors: number[]
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
  activeIfcStoreyExpressId?: number | null
  overlayIfcStoreyExpressIds?: number[]
  overlayFloorLayerIds?: string[]
  hiddenElementIds?: string[]
}

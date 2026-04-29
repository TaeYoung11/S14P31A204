/** 에디터 화면 전체에서 공유하는 타입 정의 */

/** 편집 모드: 버블 다이어그램 / 2D 평면도 / 3D 뷰어 */
export type EditorMode = 'bubble' | '2d' | '3d' | 'view'

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
  x: number      // 캔버스 px
  y: number
  width: number  // 캔버스 px
  height: number
  area: number   // m²
  color: string  // 원본 버블 색상
  connectedIds: string[]  // 연결된 방 id 목록
}

/** 평면도 층(레이어) */
export interface FloorLayer {
  id: string
  name: string
  rooms: FloorRoom[]
}

/** 에디터 자동저장에서 UI가 참조하는 저장 상태 */
export type SaveStatus =
  | 'idle'
  | 'dirty'
  | 'saving-local'
  | 'saved-local'
  | 'syncing-remote'
  | 'saved-remote'
  | 'error'

/** 프로젝트별로 로컬 초안에 저장하는 에디터 상태 스냅샷 */
export interface EditorDraftSnapshot {
  bubbles: BubbleData[]
  connections: ConnectionData[]
  zones: ZoneData[]
  floorLayers: FloorLayer[]
  activeFloorLayerId: string | null
  isFloorPlanGenerated: boolean
}

/** IndexedDB에 저장되는 자동저장 레코드 */
export interface EditorDraftRecord {
  projectId: string
  versionNo: number
  data: EditorDraftSnapshot
  savedAt: string
}
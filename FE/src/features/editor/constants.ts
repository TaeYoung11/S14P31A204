import type {
  AddSpaceFormData,
  BubbleData,
  FloorDoorHingeSide,
  FloorDoorSwingDirection,
  FloorOpeningType,
  FloorWallType,
  LineStyleOption,
} from './types'

export type FloorPlanEditAuthority = 'room-first' | 'wall-first'

/** 조닝 자동 색상 기본값 (연보라) */
export const DEFAULT_AUTO_ZONE_COLOR = '#D9D1FF'

/** 패널 크기 제한 (px) */
export const PANEL_MIN_WIDTH = 260
export const PANEL_MAX_WIDTH = 520
export const PANEL_MIN_HEIGHT = 160
export const PANEL_MAX_HEIGHT = 720

/** 방 종류 선택지 */
export const ROOM_TYPES = ['미선택', '거실', '침실', '주방', '화장실', '방', '복도', '현관'] as const

/** 공간 추가 모달 초기값 */
export const INITIAL_ADD_SPACE_FORM: AddSpaceFormData = {
  name: '',
  type: '미선택',
  width: '',
  height: '',
  ratio: '',
  color: '#ffffff',
}

/** 대지 다각형 원본 좌표 (스테이지 중앙 정렬 전 기준값) */
export const SITE_RAW_POINTS = [420, 310, 560, 310, 560, 550, 330, 720, 300, 480]
/** 대지 가이드는 편집 대상이 아니므로 포인터 이벤트를 받지 않는다. */
export const SITE_BOUNDARY_LISTENING = false

/** 선 스타일 옵션 목록 */
export const LINE_STYLE_OPTIONS: LineStyleOption[] = [
  {
    value: 'thin',
    title: '일반 연결 (Normal Connection)',
    description: '통로 또는 문으로 연결된 표준 관계',
  },
  {
    value: 'bold',
    title: '직접 인접 (Direct Adjacency)',
    description: '두 영역이 벽을 공유하거나 직접 연결됨',
  },
  {
    value: 'dashed',
    title: '간접 연결 (Indirect Connection)',
    description: '기능적 유대감은 있으나 물리적 연결 없음',
  },
]

/** 2D 벽 타입 옵션 */
export const FLOOR_WALL_TYPE_OPTIONS: Array<{ value: FloorWallType; label: string }> = [
  { value: 'general', label: '일반 벽' },
  { value: 'exterior', label: '외벽' },
  { value: 'loadBearing', label: '내력벽' },
  { value: 'partition', label: '경량 칸막이' },
]

/** 2D 벽 유형 시각화 스타일 */
export const FLOOR_WALL_TYPE_VISUALS: Record<
  FloorWallType,
  { marker: 'none' | 'dashed' | 'double'; dash?: number[]; accent: string }
> = {
  general: { marker: 'none', accent: '#2F3448' },
  exterior: { marker: 'dashed', dash: [14, 6], accent: '#0F172A' },
  loadBearing: { marker: 'double', accent: '#111827' },
  partition: { marker: 'dashed', dash: [6, 6], accent: '#475569' },
}

/** 벽 기본 재질 */
export const DEFAULT_WALL_MATERIAL = '콘크리트'
export const FLOOR_WALL_MATERIAL_OPTIONS = [
  DEFAULT_WALL_MATERIAL,
  '목재',
  '유리',
  '벽돌',
  '금속',
  '석재',
] as const
export type FloorWallMaterialOption = typeof FLOOR_WALL_MATERIAL_OPTIONS[number]

/** IFC 파일에서 영문으로 정의된 재질명 → 한글 변환 맵 */
export const IFC_MATERIAL_NAME_KO: Record<string, string> = {
  Concrete: '콘크리트',
  Brick: '벽돌',
  Steel: '금속',
  Wood: '목재',
  Glass: '유리',
  Stone: '석재',
  Tile: '타일',
}

/** 2D 벽 재질 식별용 색상(의미 단정이 아닌 시각 구분 전용) */
export const FLOOR_WALL_MATERIAL_VISUALS: Record<string, { color: string }> = {
  콘크리트: { color: '#6B7280' },
  목재: { color: '#B45309' },
  유리: { color: '#0284C7' },
  벽돌: { color: '#C2410C' },
  금속: { color: '#0F766E' },
  석재: { color: '#52525B' },
  타일: { color: '#C56F45' },
}

/** 벽 타입별 기본 사양(mm) */
export const FLOOR_WALL_PRESETS: Record<FloorWallType, { thickness: number; heightMm: number; stroke: string }> = {
  general: { thickness: 135, heightMm: 2800, stroke: '#2F3448' },
  exterior: { thickness: 190, heightMm: 3000, stroke: '#1D2438' },
  loadBearing: { thickness: 210, heightMm: 3000, stroke: '#2A3145' },
  partition: { thickness: 90, heightMm: 2600, stroke: '#4B5569' },
}

/** 벽 편집 입력 공통 하드 제한(mm) — 벽 유형과 무관하게 동일 적용 */
export const FLOOR_WALL_THICKNESS_MIN_MM = 50
export const FLOOR_WALL_THICKNESS_MAX_MM = 1000
export const FLOOR_WALL_HEIGHT_MIN_MM = 1800
export const FLOOR_WALL_HEIGHT_MAX_MM = 10000

/** 2D 픽셀 ↔ mm 환산 계수 (현 편집기 기준) */
export const FLOOR_MM_PER_PX = 25

/** 2D 모델 편집 권한 기준: wall-first면 룸 형상은 벽 편집 결과로 취급한다. */
export const FLOOR_PLAN_EDIT_AUTHORITY: FloorPlanEditAuthority = 'room-first'

/** 에디터 줌 범위(%) */
export const MIN_EDITOR_ZOOM_PERCENT = 50
export const MAX_EDITOR_ZOOM_PERCENT = 300

/** 전역 그리드 스냅 간격 옵션(mm) */
export const GRID_SNAP_INTERVAL_OPTIONS_MM = [100, 250, 500] as const
export const DEFAULT_GRID_SNAP_INTERVAL_MM = 250

/** 개구부 타입 기본값 */
export const FLOOR_OPENING_PRESETS: Record<FloorOpeningType, { widthMm: number; heightMm: number; sillHeightMm?: number }> = {
  door: { widthMm: 900, heightMm: 2100 },
  window: { widthMm: 1500, heightMm: 1200, sillHeightMm: 900 },
}

/** 문 개폐 방향 옵션 */
export const FLOOR_DOOR_SWING_OPTIONS: Array<{ value: FloorDoorSwingDirection; label: string }> = [
  { value: 'inward', label: '여닫이 (안쪽)' },
  { value: 'outward', label: '여닫이 (바깥쪽)' },
  { value: 'sliding', label: '미닫이' },
]

/** 문 경첩 위치 옵션 */
export const FLOOR_DOOR_HINGE_OPTIONS: Array<{ value: FloorDoorHingeSide; label: string }> = [
  { value: 'left', label: '좌측 경첩' },
  { value: 'right', label: '우측 경첩' },
]

/** 초기 버블 데이터 (API 연동 전 목업) */
export const INITIAL_BUBBLES: BubbleData[] = [
  {
    id: '1',
    floor: 1,
    x: 230, y: 250,
    width: 141.4, height: 141.4,
    widthMm: 3535, heightMm: 3535,
    label: '현관/로비', type: '현관',
    ratio: 12.5, area: '12.5 m²',
    color: '#ffffff', index: '01',
  },
  {
    id: '2',
    floor: 1,
    x: 340, y: 310,
    width: 268.3, height: 268.3,
    widthMm: 6708, heightMm: 6708,
    label: '거실', type: '거실',
    ratio: 45.0, area: '45.0 m²',
    color: '#ffffff', index: '02',
  },
  {
    id: '3',
    floor: 1,
    x: 310, y: 500,
    width: 178.9, height: 178.9,
    widthMm: 4472, heightMm: 4472,
    label: '주방/식당', type: '주방',
    ratio: 20.0, area: '20.0 m²',
    color: '#ffffff', index: '03',
  },
]

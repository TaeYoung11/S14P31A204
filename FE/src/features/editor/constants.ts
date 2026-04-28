import type { AddSpaceFormData, BubbleData, LineStyleOption } from './types'

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

/** 초기 버블 데이터 (API 연동 전 목업) */
export const INITIAL_BUBBLES: BubbleData[] = [
  {
    id: '1',
    x: 230, y: 250,
    width: 100, height: 100,
    widthMm: 3535, heightMm: 3535,
    label: '현관/로비', type: '현관',
    ratio: 12.5, area: '12.5 m²',
    color: '#ffffff', index: '01',
  },
  {
    id: '2',
    x: 340, y: 310,
    width: 130, height: 130,
    widthMm: 6708, heightMm: 6708,
    label: '거실', type: '거실',
    ratio: 45.0, area: '45.0 m²',
    color: '#ffffff', index: '02',
  },
  {
    id: '3',
    x: 310, y: 500,
    width: 110, height: 110,
    widthMm: 4472, heightMm: 4472,
    label: '주방/식당', type: '주방',
    ratio: 20.0, area: '20.0 m²',
    color: '#ffffff', index: '03',
  },
]

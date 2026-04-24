// 버블 다이어그램 편집기 공통 타입

/** 편집기 뷰 모드 */
export type EditorMode = 'bubble' | '2d' | '3d'

/** 캔버스에 그려지는 공간 버블 */
export interface BubbleData {
  id: string
  x: number
  y: number
  width: number
  height: number
  label: string  // 공간 이름
  area: string   // 면적 표시 (예: "45.0 m²")
  index: string  // 순번 (예: "01")
}

/** 두 버블을 잇는 연결선 */
export interface ConnectionData {
  from: string   // 시작 버블 id
  to: string     // 끝 버블 id
  type: string   // 'bold' | 'thin' | 'dashed'
}

/** 사이드바 "선 스타일" 버튼으로 진입하는 클릭 연결 모드 상태 */
export interface DrawingConnection {
  from: string | null  // 시작 버블 id
  type: string
}

/** 버블 외곽 핸들에서 시작한 드래그 연결의 시작점 */
export interface ConnectingFrom {
  bubbleId: string
  x: number  // 캔버스 절대 좌표
  y: number
}

/** 드래그 연결 완료 후 선 스타일 선택을 기다리는 연결 정보 */
export interface PendingConnection {
  from: string  // 시작 버블 id
  to: string    // 끝 버블 id
}

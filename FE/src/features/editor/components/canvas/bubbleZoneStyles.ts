export interface ZoneStyle {
  /** 영역 바깥쪽 여백 (px) */
  padding: number
  /** 채우기 투명도 */
  fillOpacity: number
  /** 외곽선 두께 */
  strokeWidth: number
  /** 점선 패턴 [선 길이, 간격] */
  dash: [number, number]
  /** 경계선 텐션 (0=직선, 1=최대 곡률) */
  tension: number
  /** 이름 레이블 폰트 크기 */
  fontSize: number
}

/** 자동 조닝: 넓은 여백, 얇은 선, 작은 레이블 */
export const AUTO_ZONE_STYLE: ZoneStyle = {
  padding: 22,
  fillOpacity: 0.08,
  strokeWidth: 1.5,
  dash: [6, 6],
  tension: 0.45,
  fontSize: 10,
}

/** 수동 조닝: 좁은 여백, 굵은 선, 큰 레이블 */
export const MANUAL_ZONE_STYLE: ZoneStyle = {
  padding: 28,
  fillOpacity: 0.12,
  strokeWidth: 2,
  dash: [10, 6],
  tension: 0.5,
  fontSize: 11,
}

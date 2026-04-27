import type { BubbleData } from '../types'

/** 초기 버블 데이터 (API 연동 전 목업) */
export const MOCK_BUBBLES: BubbleData[] = [
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

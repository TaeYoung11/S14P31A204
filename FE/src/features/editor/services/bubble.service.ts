import type { BubbleData } from '../types'
import { MOCK_BUBBLES } from '../mocks/bubble.mock'
// import { api } from '@/shared/lib/axios'  // API 완성 후 주석 해제

export const bubbleService = {
  getList: async (): Promise<BubbleData[]> => {
    return MOCK_BUBBLES
    // return api.get<BubbleData[]>('/bubbles')
  },
}

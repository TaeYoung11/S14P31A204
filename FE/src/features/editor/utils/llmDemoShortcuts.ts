export interface LlmDemoShortcut {
  command: string
  label: string
  description: string
  prompt: string
}

export const LLM_DEMO_SHORTCUTS: readonly LlmDemoShortcut[] = [
  {
    command: '/방생성',
    label: '방 생성',
    description: '1층 거실 기준 새 공간 생성',
    prompt: '1층 거실 옆에 가로 4000mm, 세로 3500mm 크기의 회의실을 새로 만들어줘.',
  },
  {
    command: '/창문수정',
    label: '창문 수정',
    description: '북쪽 창문 크기 조정',
    prompt: '2층 북쪽 창문 전체의 높이를 1500mm로 맞추고 유리 재질로 변경해줘.',
  },
  {
    command: '/문추가',
    label: '문 추가',
    description: '지정 벽에 새 문 설치',
    prompt: '1층 거실 북쪽 벽 중앙에 폭 900mm, 높이 2100mm의 나무 문을 설치해줘.',
  },
  {
    command: '/벽수정',
    label: '벽 수정',
    description: '외벽 두께와 색상 변경',
    prompt: '1층 외벽 전체 두께를 50mm 더 두껍게 하고 색상을 #E5E7EB로 바꿔줘.',
  },
  {
    command: '/지붕생성',
    label: '지붕 생성',
    description: '옥상 박공지붕 생성',
    prompt: '옥상에 빨간색 박공지붕을 만들고 방향은 북쪽으로 맞춰줘.',
  },
  {
    command: '/계단생성',
    label: '계단 생성',
    description: '거실 계단 생성',
    prompt: '1층 거실에 2층으로 올라가는 직선형 계단을 만들어줘.',
  },
]

export function filterLlmDemoShortcuts(input: string): LlmDemoShortcut[] {
  const query = input.trim()
  if (!query.startsWith('/')) return []
  return LLM_DEMO_SHORTCUTS.filter((shortcut) => shortcut.command.startsWith(query))
}

export function resolveLlmDemoShortcut(input: string): LlmDemoShortcut | null {
  const query = input.trim()
  return LLM_DEMO_SHORTCUTS.find((shortcut) => shortcut.command === query) ?? null
}

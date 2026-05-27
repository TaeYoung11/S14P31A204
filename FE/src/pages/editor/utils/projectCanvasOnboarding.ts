import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeftRight,
  Box,
  Camera,
  DoorOpen,
  Image,
  Layers3,
  Leaf,
  Link2,
  MousePointer2,
  Move,
  PencilRuler,
  Rotate3D,
  Sparkles,
  Square,
  Sun,
  Wand2,
} from 'lucide-react'

export const PROJECT_CANVAS_ONBOARDING_QUERY_VALUE = 'project-canvas'

const STORAGE_KEY_PREFIX = 'batang:project-canvas-onboarding:v1'
const onboardingSeenFallbackKeys = new Set<string>()

export interface ProjectCanvasOnboardingFeature {
  icon: LucideIcon
  label: string
  description: string
}

export interface ProjectCanvasOnboardingSlide {
  eyebrow: string
  title: string
  description: string
  icon: LucideIcon
  accent: string
  features: ProjectCanvasOnboardingFeature[]
}

export const projectCanvasOnboardingSlides: ProjectCanvasOnboardingSlide[] = [
  {
    eyebrow: '1 / 4',
    title: '버블로 공간을 먼저 잡아보세요',
    description: '대지 안에 필요한 공간을 추가하고, 버블을 이어 배치 관계와 동선을 빠르게 정리합니다.',
    icon: Sparkles,
    accent: '#4F5BFF',
    features: [
      { icon: MousePointer2, label: '선택', description: '버블을 클릭해 이름, 면적, 색상을 수정합니다.' },
      { icon: Move, label: '버블 이동', description: '대지 안에서 버블을 드래그해 배치합니다.' },
      { icon: Link2, label: '연결', description: '공간 사이 관계를 선으로 이어 흐름을 만듭니다.' },
    ],
  },
  {
    eyebrow: '2 / 4',
    title: '2D 평면으로 구체화하세요',
    description: '버블 배치를 바탕으로 평면도를 만들고 벽, 문, 창, 치수 정보를 실제 도면처럼 조정합니다.',
    icon: Layers3,
    accent: '#0EA5FF',
    features: [
      { icon: Square, label: '벽 편집', description: '벽을 선택하고 길이, 두께, 위치를 조정합니다.' },
      { icon: DoorOpen, label: '문과 창', description: '개구부를 배치하고 크기와 방향을 수정합니다.' },
      { icon: PencilRuler, label: '층과 치수', description: '층별 평면을 관리하고 치수 기준을 확인합니다.' },
    ],
  },
  {
    eyebrow: '3 / 4',
    title: '3D로 공간감을 확인하세요',
    description: '2D 모델을 3D로 확인하고 IFC 요소를 선택해 위치와 속성을 이어서 편집합니다.',
    icon: Box,
    accent: '#12B981',
    features: [
      { icon: Rotate3D, label: '3D 확인', description: '모델을 회전하고 확대하며 공간감을 검토합니다.' },
      { icon: Wand2, label: 'IFC 편집', description: '선택한 요소를 이동하거나 속성을 조정합니다.' },
      { icon: Image, label: '결과 저장', description: '작업 내용을 저장하고 다음 검토 단계로 넘깁니다.' },
    ],
  },
  {
    eyebrow: '4 / 4',
    title: '실사 뷰로 분위기를 비교하세요',
    description: '낮과 밤, 계절과 좌우 시점까지 바꿔 보며 완성된 공간의 인상을 확인합니다.',
    icon: Camera,
    accent: '#F59E0B',
    features: [
      { icon: Sun, label: '낮과 밤', description: '시간대에 따른 빛과 그림자의 분위기를 비교합니다.' },
      { icon: Leaf, label: '계절 효과', description: '봄, 여름, 가을, 겨울 장면을 렌더에 반영합니다.' },
      { icon: ArrowLeftRight, label: '좌우 각도', description: '보는 방향을 바꿔 입면과 동선을 살펴봅니다.' },
    ],
  },
]

export const buildProjectCanvasOnboardingStorageKey = (userId?: string | null) =>
  `${STORAGE_KEY_PREFIX}:${userId ?? 'anonymous'}`

/** 온보딩 URL 파라미터는 null일 수 있으므로 명시적으로 값이 있을 때만 요청으로 판단한다. */
export function isProjectCanvasOnboardingRequested(searchParams: URLSearchParams): boolean {
  const onboardingParam = searchParams.get('onboarding')
  return onboardingParam !== null && onboardingParam === PROJECT_CANVAS_ONBOARDING_QUERY_VALUE
}

/** localStorage를 사용할 수 없을 때는 세션 메모리 fallback으로 닫힘 상태를 유지한다. */
export function readProjectCanvasOnboardingSeen(userId?: string | null): boolean {
  if (typeof window === 'undefined') return true
  const storageKey = buildProjectCanvasOnboardingStorageKey(userId)
  try {
    return window.localStorage.getItem(storageKey) === 'seen'
  } catch {
    return onboardingSeenFallbackKeys.has(storageKey)
  }
}

/** 사용자가 온보딩을 닫으면 영구 저장을 우선 시도하고, 실패 시 메모리에 기록한다. */
export function writeProjectCanvasOnboardingSeen(userId?: string | null): void {
  if (typeof window === 'undefined') return
  const storageKey = buildProjectCanvasOnboardingStorageKey(userId)
  try {
    window.localStorage.setItem(storageKey, 'seen')
  } catch {
    onboardingSeenFallbackKeys.add(storageKey)
  }
}

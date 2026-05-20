import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeftRight,
  Box,
  Camera,
  CheckCircle2,
  DoorOpen,
  Image,
  Layers3,
  Leaf,
  Link2,
  Moon,
  MousePointer2,
  Move,
  PencilRuler,
  Rotate3D,
  Sparkles,
  Square,
  Sun,
  Wand2,
  X,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

interface ProjectCanvasOnboardingProps {
  userId?: string | null
}

type OnboardingFeatureItem = {
  icon: LucideIcon
  label: string
  text: string
}

type OnboardingSlide = {
  eyebrow: string
  title: string
  description: string
  icon: LucideIcon
  accent: string
  features: OnboardingFeatureItem[]
}

const ONBOARDING_QUERY_VALUE = 'project-canvas'
const STORAGE_KEY_PREFIX = 'batang:project-canvas-onboarding:v1'

const slides: OnboardingSlide[] = [
  {
    eyebrow: '1 / 4',
    title: '버블로 공간을 먼저 잡아요',
    description: '대지 안에서 필요한 공간을 추가하고, 버블을 끌어 배치한 뒤 연결선으로 관계를 정리합니다.',
    icon: Sparkles,
    accent: '#4F5BFF',
    features: [
      { icon: MousePointer2, label: '선택', text: '버블을 클릭해 이름, 면적, 색상을 수정합니다.' },
      { icon: Move, label: '버블 이동', text: '대지는 고정하고 버블만 드래그해 배치합니다.' },
      { icon: Link2, label: '연결', text: '공간 사이 관계를 선으로 이어 흐름을 잡습니다.' },
    ],
  },
  {
    eyebrow: '2 / 4',
    title: '2D 평면으로 변환해 다듬어요',
    description: '버블 배치를 기반으로 평면도를 생성하고 벽, 문, 창, 층 정보를 실제 도면처럼 수정합니다.',
    icon: Layers3,
    accent: '#0EA5FF',
    features: [
      { icon: Square, label: '벽 편집', text: '벽을 선택하고 길이, 두께, 위치를 조정합니다.' },
      { icon: DoorOpen, label: '문과 창', text: '개구부를 배치하고 크기와 방향을 수정합니다.' },
      { icon: PencilRuler, label: '층과 치수', text: '층별 도면을 관리하고 치수 기준을 확인합니다.' },
    ],
  },
  {
    eyebrow: '3 / 4',
    title: '3D로 공간감을 확인해요',
    description: '2D 모델을 3D로 확인하고 IFC 요소를 선택해 위치와 속성을 이어서 편집합니다.',
    icon: Box,
    accent: '#12B981',
    features: [
      { icon: Rotate3D, label: '3D 확인', text: '모델을 회전, 확대하며 공간감을 검토합니다.' },
      { icon: Wand2, label: 'IFC 편집', text: '선택한 요소를 이동하거나 속성을 조정합니다.' },
      { icon: Image, label: '결과 저장', text: '작업 내용을 저장하고 다음 검토 단계로 넘깁니다.' },
    ],
  },
  {
    eyebrow: '4 / 4',
    title: '실사 뷰로 분위기를 비교해요',
    description: '낮과 밤, 계절감, 좌우 시점까지 바꿔 보며 완성될 공간의 인상을 확인합니다.',
    icon: Camera,
    accent: '#F59E0B',
    features: [
      { icon: Sun, label: '낮과 밤', text: '시간대에 따른 빛과 그림자 분위기를 비교합니다.' },
      { icon: Leaf, label: '계절 효과', text: '봄, 여름, 가을, 겨울 느낌을 렌더에 반영합니다.' },
      { icon: ArrowLeftRight, label: '좌우 각도', text: '보는 방향을 바꿔 외관과 동선을 살펴봅니다.' },
    ],
  },
]

const buildStorageKey = (userId?: string | null) => `${STORAGE_KEY_PREFIX}:${userId ?? 'anonymous'}`

function readOnboardingSeen(userId?: string | null): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(buildStorageKey(userId)) === 'seen'
  } catch {
    return false
  }
}

function writeOnboardingSeen(userId?: string | null): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(buildStorageKey(userId), 'seen')
  } catch {
    // localStorage 접근 실패는 온보딩 사용을 막을 이유가 아니므로 무시한다.
  }
}

export default function ProjectCanvasOnboarding({ userId }: ProjectCanvasOnboardingProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const shouldRequestOnboarding = searchParams.get('onboarding') === ONBOARDING_QUERY_VALUE
  const [isOpen, setIsOpen] = useState(() => shouldRequestOnboarding && !readOnboardingSeen(userId))
  const [slideIndex, setSlideIndex] = useState(0)
  const slide = slides[slideIndex]
  const Icon = slide.icon

  const close = () => {
    writeOnboardingSeen(userId)
    setIsOpen(false)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('onboarding')
      return next
    }, { replace: true })
  }

  if (!isOpen || !slide) return null

  const isLastSlide = slideIndex === slides.length - 1

  return (
    <div className="fixed inset-0 z-[240] flex items-center justify-center bg-[#15213D]/70 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6">
      <section className="relative flex max-h-[calc(100dvh-24px)] w-full max-w-[360px] flex-col overflow-y-auto rounded-[22px] bg-white shadow-[0_24px_70px_rgba(12,20,44,0.32)] sm:max-h-[calc(100vh-48px)] sm:max-w-[420px] sm:rounded-[28px]">
        <button
          type="button"
          aria-label="온보딩 닫기"
          onClick={close}
          className="absolute right-3 top-3 z-10 rounded-full p-2 text-[#7A8294] transition hover:bg-[#EEF1F8] hover:text-[#1D1E20] sm:right-4 sm:top-4"
        >
          <X size={18} />
        </button>

        <div className="mx-4 mt-4 rounded-[18px] bg-[#F1F6FB] px-4 py-4 sm:mx-5 sm:mt-5 sm:rounded-[22px] sm:px-5 sm:pb-5 sm:pt-6">
          <div className="relative mx-auto h-[150px] max-w-[290px] overflow-hidden rounded-[16px] bg-[#F8FBFF] sm:h-[190px] sm:max-w-[330px] sm:rounded-[20px]">
            <div className="absolute left-5 top-5 flex gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#FF6B6B] sm:h-2.5 sm:w-2.5" />
              <span className="h-2 w-2 rounded-full bg-[#FFC857] sm:h-2.5 sm:w-2.5" />
              <span className="h-2 w-2 rounded-full bg-[#12B981] sm:h-2.5 sm:w-2.5" />
            </div>
            <div className="absolute left-6 top-12 h-24 w-9 rounded-xl bg-white shadow-sm sm:left-7 sm:top-14 sm:h-28 sm:w-10">
              <div className="mx-auto mt-4 h-4 w-4 rounded bg-[#3B45B3]" />
              <div className="mx-auto mt-3 h-4 w-4 rounded bg-[#D7DDF5]" />
              <div className="mx-auto mt-3 h-4 w-4 rounded bg-[#D7DDF5]" />
            </div>
            <div className="absolute left-[76px] top-[44px] h-[92px] w-[154px] rounded-[16px] border border-[#DDE5F4] bg-white shadow-[0_18px_36px_rgba(59,69,179,0.12)] sm:left-[86px] sm:top-[52px] sm:h-[112px] sm:w-[182px] sm:rounded-[18px]">
              <div className="absolute left-4 top-5 h-11 w-16 rounded-full bg-[#C7D2FE] opacity-90 sm:h-14 sm:w-20" />
              <div className="absolute right-5 top-6 h-12 w-20 rounded-full bg-[#BFE7FF] sm:h-16 sm:w-24" />
              <div className="absolute bottom-5 left-[48px] h-10 w-20 rounded-full bg-[#D6F5E8] sm:left-[58px] sm:h-12 sm:w-24" />
              <div className="absolute left-[68px] top-[48px] h-[2px] w-16 rotate-[25deg] bg-[#8E95A3] sm:left-[82px] sm:top-[58px] sm:w-20" />
              <div className="absolute left-[56px] top-[66px] h-[2px] w-14 -rotate-[16deg] bg-[#8E95A3] sm:left-[67px] sm:top-[82px] sm:w-16" />
            </div>
            <div
              className="absolute bottom-6 right-6 flex h-[52px] w-[52px] items-center justify-center rounded-2xl text-white shadow-[0_16px_30px_rgba(59,69,179,0.22)] sm:bottom-7 sm:right-7 sm:h-16 sm:w-16"
              style={{ backgroundColor: slide.accent }}
            >
              <Icon size={26} />
            </div>
            {slide.icon === Camera && (
              <div className="absolute right-20 top-5 flex items-center gap-1 rounded-full bg-white/85 px-2 py-1 text-[#697386] shadow-sm">
                <Moon size={12} />
                <Sun size={12} />
              </div>
            )}
            <div className="absolute bottom-4 left-8 h-px w-[210px] bg-[#C8CFDD] sm:bottom-5 sm:w-[250px]" />
          </div>
        </div>

        <div className="flex flex-1 flex-col px-5 pb-5 pt-4 text-center sm:px-7 sm:pb-6 sm:pt-6">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7B86A8] sm:text-xs">{slide.eyebrow}</p>
          <h2 className="mt-2 text-[22px] font-black leading-tight text-[#1C1C1E] sm:mt-3 sm:text-[26px]">{slide.title}</h2>
          <p className="mx-auto mt-2 max-w-[310px] text-[13px] font-semibold leading-5 text-[#697386] sm:mt-3 sm:text-sm sm:leading-6">{slide.description}</p>

          <div className="mt-4 grid gap-2 text-left sm:mt-5">
            {slide.features.map((item) => {
              const ItemIcon = item.icon
              return (
                <div key={item.label} className="flex items-center gap-3 rounded-xl border border-[#E7EBF4] bg-[#FAFBFE] px-3 py-2 sm:py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[#3B45B3] shadow-sm sm:h-9 sm:w-9">
                    <ItemIcon size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-black text-[#1D1E20] sm:text-sm">{item.label}</p>
                    <p className="text-[11px] font-semibold leading-4 text-[#7B8497] sm:text-xs">{item.text}</p>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-4 flex justify-center gap-2 sm:mt-5">
            {slides.map((item, index) => (
              <button
                key={item.title}
                type="button"
                aria-label={`${index + 1}번째 안내 보기`}
                onClick={() => setSlideIndex(index)}
                className={`h-2.5 rounded-full transition-all ${index === slideIndex ? 'w-7 bg-[#4F5BFF]' : 'w-2.5 bg-[#D6DAE5]'}`}
              />
            ))}
          </div>

          <div className="mt-5 flex gap-2 sm:mt-6">
            <button
              type="button"
              onClick={close}
              className="h-12 w-24 rounded-2xl border border-[#E2E6EF] text-sm font-black text-[#697386] transition hover:bg-[#F4F6FB] sm:h-[52px]"
            >
              건너뛰기
            </button>
            <button
              type="button"
              onClick={() => {
                if (isLastSlide) {
                  close()
                  return
                }
                setSlideIndex((current) => Math.min(current + 1, slides.length - 1))
              }}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#4F5BFF] text-sm font-black text-white shadow-[0_14px_28px_rgba(79,91,255,0.28)] transition hover:bg-[#3F49E8] sm:h-[52px]"
            >
              {isLastSlide && <CheckCircle2 size={18} />}
              {isLastSlide ? '시작하기' : '다음'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

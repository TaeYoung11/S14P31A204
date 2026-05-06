import {
  Boxes,
  Columns3,
  DoorOpen,
  Home,
  LayoutGrid,
  PanelTop,
  Square,
  X,
} from 'lucide-react'

export type ThreeDLibraryPresetType =
  | 'roof'
  | 'exterior-wall'
  | 'interior-wall'
  | 'window'
  | 'room-door'
  | 'front-door'
  | 'stairs'
  | 'column'
  | 'floor'

export interface ThreeDLibraryPreset {
  id: string
  type: ThreeDLibraryPresetType
  name: string
  description: string
  dimensions: string
  color: string
  material?: string
  lengthMm?: number
  heightMm?: number
  thicknessMm?: number
  position?: { x: number; y: number; z: number }
}

const LIBRARY_CATEGORIES = [
  { id: 'all', label: '전체', icon: Boxes },
  { id: 'roof', label: '지붕', icon: Home },
  { id: 'exterior-wall', label: '외벽', icon: Square },
  { id: 'interior-wall', label: '내벽', icon: PanelTop },
  { id: 'window', label: '창문', icon: LayoutGrid },
  { id: 'room-door', label: '방문', icon: DoorOpen },
  { id: 'front-door', label: '현관문', icon: DoorOpen },
  { id: 'stairs', label: '계단', icon: PanelTop },
  { id: 'column', label: '기둥', icon: Columns3 },
  { id: 'floor', label: '바닥', icon: Square },
] as const

const PRESETS: ThreeDLibraryPreset[] = [
  {
    id: 'roof-gable',
    type: 'roof',
    name: '박공지붕',
    description: '단독주택에 사용하는 기본 경사지붕',
    dimensions: '7000 x 1200 x 6000',
    lengthMm: 7000,
    heightMm: 1200,
    thicknessMm: 6000,
    color: '#5B6475',
  },
  {
    id: 'roof-flat',
    type: 'roof',
    name: '평지붕',
    description: '옥상 활용이 가능한 평지붕',
    dimensions: '4800 x 3400',
    color: '#6B7280',
  },
  {
    id: 'exterior-wall-200',
    type: 'exterior-wall',
    name: '외벽 200T',
    description: '단열층을 포함한 기본 외벽',
    dimensions: '3200 x 2600 x 200',
    color: '#B9A58F',
  },
  {
    id: 'exterior-wall-brick',
    type: 'exterior-wall',
    name: '벽돌 외벽',
    description: '적벽돌 마감 외벽',
    dimensions: '3200 x 2600 x 220',
    color: '#9E5A45',
  },
  {
    id: 'interior-wall-100',
    type: 'interior-wall',
    name: '내벽 100T',
    description: '실내 공간 구획용 경량 벽체',
    dimensions: '2800 x 2400 x 100',
    color: '#D8DDE8',
  },
  {
    id: 'interior-wall-150',
    type: 'interior-wall',
    name: '차음 내벽 150T',
    description: '침실과 욕실 주변 차음 벽체',
    dimensions: '2800 x 2400 x 150',
    color: '#C7CEDA',
  },
  {
    id: 'window-fixed',
    type: 'window',
    name: '고정창',
    description: '채광용 고정 창호',
    dimensions: '1200 x 1200',
    color: '#8FD3FF',
  },
  {
    id: 'window-wide',
    type: 'window',
    name: '거실 와이드창',
    description: '거실 입면용 대형 창호',
    dimensions: '2400 x 1500',
    color: '#9BD5FF',
  },
  {
    id: 'room-door-basic',
    type: 'room-door',
    name: '기본 방문',
    description: '침실과 방에 사용하는 900mm 문',
    dimensions: '900 x 2100',
    color: '#8B5E3C',
  },
  {
    id: 'room-door-sliding',
    type: 'room-door',
    name: '슬라이딩 방문',
    description: '공간 절약형 미닫이 방문',
    dimensions: '900 x 2100',
    color: '#A06A42',
  },
  {
    id: 'front-door-steel',
    type: 'front-door',
    name: '현관 방화문',
    description: '주택 출입구용 방화 현관문',
    dimensions: '1100 x 2200',
    color: '#2F3A4A',
  },
  {
    id: 'front-door-glass',
    type: 'front-door',
    name: '유리 현관문',
    description: '채광이 있는 포치형 현관문',
    dimensions: '1200 x 2200',
    color: '#3F5268',
  },
  {
    id: 'stairs-straight',
    type: 'stairs',
    name: '직선 계단',
    description: '층간 이동용 기본 직선 계단',
    dimensions: '900 x 3200',
    color: '#A87952',
  },
  {
    id: 'stairs-l',
    type: 'stairs',
    name: 'ㄱ자 계단',
    description: '중간참이 있는 ㄱ자 계단',
    dimensions: '1800 x 2600',
    color: '#B78A60',
  },
  {
    id: 'column-square',
    type: 'column',
    name: '사각 기둥',
    description: '구조 보강용 사각 기둥',
    dimensions: '300 x 300 x 2600',
    color: '#9CA3AF',
  },
  {
    id: 'column-round',
    type: 'column',
    name: '원형 기둥',
    description: '포치와 실내 장식용 원형 기둥',
    dimensions: 'D300 x 2600',
    color: '#AEB7C4',
  },
  {
    id: 'floor-wood',
    type: 'floor',
    name: '우드 바닥',
    description: '거실과 침실에 사용하는 목재 바닥',
    dimensions: '3200 x 2400 x 120',
    color: '#B8875B',
  },
  {
    id: 'floor-tile',
    type: 'floor',
    name: '타일 바닥',
    description: '현관과 욕실에 사용하는 타일 바닥',
    dimensions: '2400 x 1800 x 100',
    color: '#C8CDD6',
  },
]

interface ThreeDLibraryPanelProps {
  selectedCategory: string
  onSelectCategory: (id: string) => void
  onClose: () => void
  onAddPreset: (preset: ThreeDLibraryPreset) => void
}

export default function ThreeDLibraryPanel({
  selectedCategory,
  onSelectCategory,
  onClose,
  onAddPreset,
}: ThreeDLibraryPanelProps) {
  const activeCategory =
    LIBRARY_CATEGORIES.find((category) => category.id === selectedCategory) ??
    LIBRARY_CATEGORIES[0]
  const presets =
    activeCategory.id === 'all'
      ? PRESETS
      : PRESETS.filter((preset) => preset.type === activeCategory.id)

  return (
    <div className="absolute left-8 top-[7%] z-50 flex h-[82%] w-[620px] overflow-hidden rounded-[24px] border border-white/40 bg-white/90 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-left-4 duration-300">
      <button
        onClick={onClose}
        className="absolute right-5 top-5 z-10 flex items-center gap-1.5 rounded-xl bg-[#F0F2F9] px-3 py-1.5 text-[#6B7A99] transition-all hover:bg-[#E2E6EF] hover:text-[#1C1C1E]"
      >
        <X size={14} />
        <span className="text-[11px] font-bold">닫기</span>
      </button>

      <div className="flex w-[128px] flex-col items-center gap-3 overflow-y-auto border-r border-[#F0F2F9] bg-white/40 px-3 py-6">
        <div className="mb-1 flex h-[64px] w-[64px] items-center justify-center rounded-2xl bg-[#3B45B3]/20 text-center text-sm font-black text-[#3B45B3] shadow-inner">
          {activeCategory.label}
        </div>
        <div className="flex w-full flex-col gap-1">
          {LIBRARY_CATEGORIES.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelectCategory(item.id)}
              className={`flex w-full flex-col items-center rounded-2xl py-2.5 transition-all ${
                activeCategory.id === item.id
                  ? 'bg-white text-[#3B45B3] shadow-md'
                  : 'text-[#ADB5BD] hover:bg-white/50'
              }`}
            >
              <item.icon size={18} />
              <span className="mt-1.5 text-[10px] font-bold">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-8">
        <div className="mb-5 pr-16">
          <p className="text-[11px] font-black uppercase tracking-widest text-[#ADB5BD]">
            3D Presets
          </p>
          <h3 className="mt-1 text-2xl font-black text-[#1C1C1E]">
            {activeCategory.label} 라이브러리
          </h3>
        </div>

        <div className="grid grid-cols-2 gap-3 overflow-y-auto pr-1">
          {presets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => onAddPreset(preset)}
              className="group rounded-2xl border border-[#E2E6EF] bg-white p-4 text-left transition-all hover:border-[#3B45B3]/40 hover:shadow-lg hover:shadow-[#3B45B3]/10"
            >
              <div
                className="mb-3 h-16 rounded-xl border border-black/5"
                style={{ backgroundColor: preset.color }}
              />
              <div className="flex items-start justify-between gap-2">
                <h4 className="min-w-0 flex-1 truncate text-[13px] font-black text-[#1C1C1E]">
                  {preset.name}
                </h4>
                <span className="shrink-0 rounded-md bg-[#EEF0FF] px-1.5 py-0.5 text-[9px] font-black text-[#3B45B3]">
                  {LIBRARY_CATEGORIES.find((category) => category.id === preset.type)?.label}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 min-h-8 text-[11px] leading-4 text-[#6B7A99]">
                {preset.description}
              </p>
              <p className="mt-2 text-[10px] font-bold text-[#ADB5BD]">
                {preset.dimensions}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

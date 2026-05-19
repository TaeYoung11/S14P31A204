/**
 * ThreeDLibraryPanel — 3D 라이브러리 패널
 *
 * 3D 캔버스 위에 오버레이로 표시되는 건축 요소 라이브러리 패널이다.
 * 사용자가 카테고리를 선택하고 프리셋을 씬에 추가할 수 있다.
 */
import {
  Armchair,
  Boxes,
  Columns3,
  DoorOpen,
  Home,
  LayoutGrid,
  PanelBottom,
  PanelTop,
  Square,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  PRESETS,
  applyIfcLibraryManifestToPresets,
  buildPresetPreviewDataUri,
  loadIfcLibraryManifest,
  type IfcLibraryManifest,
} from './threeDLibraryPresets'
import { writeLibraryPresetToDataTransfer } from './threeDLibraryDnd'
import type { ThreeDLibraryPreset } from './threeDLibrary.types'

// ─────────────────────────────────────────────
// 카테고리 목록 (아이콘 포함)
// ─────────────────────────────────────────────

/** 라이브러리 카테고리 정의. id는 ThreeDLibraryPresetType 또는 'all' */
const LIBRARY_CATEGORIES = [
  { id: 'all', label: '전체', icon: Boxes },
  { id: 'roof', label: '지붕', icon: Home },
  { id: 'exterior-wall', label: '외벽', icon: Square },
  { id: 'interior-wall', label: '내벽', icon: PanelTop },
  { id: 'window', label: '창문', icon: LayoutGrid },
  { id: 'room-door', label: '방문', icon: DoorOpen },
  { id: 'front-door', label: '현관문', icon: DoorOpen },
  { id: 'stairs', label: '계단', icon: PanelTop },
  { id: 'terrace', label: '테라스', icon: Square },
  { id: 'column', label: '기둥', icon: Columns3 },
  { id: 'floor', label: '바닥', icon: Square },
  { id: 'ceiling', label: '천장', icon: PanelBottom },
  { id: 'furniture', label: '가구', icon: Armchair },
] as const

type LibraryCategory = (typeof LIBRARY_CATEGORIES)[number]

// ─────────────────────────────────────────────
// 서브컴포넌트
// ─────────────────────────────────────────────

interface LibraryCategoryNavProps {
  /** 현재 선택된 카테고리 */
  activeCategory: LibraryCategory
  /** 카테고리 선택 콜백 */
  onSelectCategory: (id: string) => void
}

/**
 * 좌측 카테고리 탐색 메뉴
 * - 활성 카테고리를 상단에 아이콘+레이블로 크게 표시한다.
 * - 전체 카테고리 목록을 스크롤 가능한 버튼 리스트로 렌더링한다.
 */
function LibraryCategoryNav({ activeCategory, onSelectCategory }: LibraryCategoryNavProps) {
  return (
    <div className="flex w-[116px] shrink-0 flex-col items-center gap-3 overflow-y-auto border-r border-[#F0F2F9] bg-white/40 px-3 py-6">
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
  )
}

interface LibraryPresetCardProps {
  /** 렌더링할 프리셋 데이터 */
  preset: ThreeDLibraryPreset
  /** 씬에 프리셋을 추가하는 콜백 */
  onAdd: (preset: ThreeDLibraryPreset) => void
  isEditingLocked: boolean
}

/**
 * 개별 프리셋 카드
 * - 미리보기 이미지(SVG fallback 포함), 이름, 카테고리 뱃지, 치수를 표시한다.
 * - 클릭 시 씬에 추가된다.
 */
function LibraryPresetCard({ preset, onAdd, isEditingLocked }: LibraryPresetCardProps) {
  const fallbackPreviewSrc = buildPresetPreviewDataUri(preset)
  const previewSrc = preset.previewImageUrl ?? fallbackPreviewSrc
  const categoryLabel = LIBRARY_CATEGORIES.find((c) => c.id === preset.type)?.label
  const suppressNextClickRef = useRef(false)

  return (
    <button
      draggable={!isEditingLocked}
      onClick={() => {
        if (isEditingLocked) return
        // 드래그 후 소스 버튼에 전달되는 합성 click 1회를 무시한다.
        if (suppressNextClickRef.current) {
          suppressNextClickRef.current = false
          return
        }
        onAdd(preset)
      }}
      onDragStart={(event) => {
        if (isEditingLocked) return
        writeLibraryPresetToDataTransfer(event.dataTransfer, preset)
        event.dataTransfer.effectAllowed = 'copy'
      }}
      onDragEnd={() => {
        suppressNextClickRef.current = true
        window.setTimeout(() => {
          suppressNextClickRef.current = false
        }, 200)
      }}
      className={`group rounded-2xl border border-[#E2E6EF] bg-white p-4 text-left transition-all ${
        isEditingLocked
          ? 'cursor-not-allowed opacity-60'
          : 'hover:border-[#3B45B3]/40 hover:shadow-lg hover:shadow-[#3B45B3]/10'
      }`}
    >
      <div className="mb-3 h-16 overflow-hidden rounded-xl border border-black/5 bg-[#EEF1F8]">
        <img
          src={previewSrc}
          alt={`${preset.name} 미리보기`}
          loading="lazy"
          decoding="async"
          data-fallback-applied="0"
          data-fallback-src={fallbackPreviewSrc}
          onError={(event) => {
            const image = event.currentTarget
            if (image.dataset.fallbackApplied === '1') return
            image.dataset.fallbackApplied = '1'
            image.src = image.dataset.fallbackSrc ?? fallbackPreviewSrc
          }}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="flex items-start justify-between gap-2">
        <h4 className="min-w-0 flex-1 truncate text-[13px] font-black text-[#1C1C1E]">
          {preset.name}
        </h4>
        {categoryLabel && (
          <span className="shrink-0 rounded-md bg-[#EEF0FF] px-1.5 py-0.5 text-[9px] font-black text-[#3B45B3]">
            {categoryLabel}
          </span>
        )}
      </div>
      <p className="mt-1 line-clamp-2 min-h-8 text-[11px] leading-4 text-[#6B7A99]">
        {preset.description}
      </p>
      <p className="mt-2 text-[10px] font-bold text-[#ADB5BD]">
        {preset.dimensions}
      </p>
    </button>
  )
}

// ─────────────────────────────────────────────
// 메인 패널 컴포넌트
// ─────────────────────────────────────────────

interface ThreeDLibraryPanelProps {
  /** 현재 선택된 카테고리 id */
  selectedCategory: string
  /** 카테고리 선택 콜백 */
  onSelectCategory: (id: string) => void
  /** 패널 닫기 콜백 */
  onClose: () => void
  /** 프리셋을 씬에 추가하는 콜백 */
  onAddPreset: (preset: ThreeDLibraryPreset) => void
  isEditingLocked?: boolean
}

/**
 * 3D 라이브러리 패널 루트 컴포넌트
 * - 좌측 카테고리 탐색 + 우측 프리셋 그리드를 조합해 렌더링한다.
 * - 패널은 3D 캔버스 위에 절대 위치로 표시된다.
 */
export default function ThreeDLibraryPanel({
  selectedCategory,
  onSelectCategory,
  onClose,
  onAddPreset,
  isEditingLocked = false,
}: ThreeDLibraryPanelProps) {
  const [ifcManifest, setIfcManifest] = useState<IfcLibraryManifest | null>(null)
  const activeCategory =
    LIBRARY_CATEGORIES.find((category) => category.id === selectedCategory) ??
    LIBRARY_CATEGORIES[0]

  useEffect(() => {
    let active = true
    void loadIfcLibraryManifest().then((manifest) => {
      if (active) setIfcManifest(manifest)
    })
    return () => {
      active = false
    }
  }, [])

  const presets = useMemo(
    () => applyIfcLibraryManifestToPresets(PRESETS, ifcManifest),
    [ifcManifest],
  )

  // 선택된 카테고리에 해당하는 프리셋 목록을 필터링한다.
  const filteredPresets =
    activeCategory.id === 'all'
      ? presets
      : presets.filter((preset) => preset.type === activeCategory.id)

  return (
    <div
      data-3d-library-panel="true"
      className="absolute bottom-24 left-[132px] top-6 z-[110] flex w-[min(720px,calc(100%-164px))] overflow-hidden rounded-[24px] border border-white/40 bg-white/90 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-left-4 duration-300"
    >
      {/* 닫기 버튼 */}
      <button
        onClick={onClose}
        className="absolute right-5 top-5 z-10 flex items-center gap-1.5 rounded-xl bg-[#F0F2F9] px-3 py-1.5 text-[#6B7A99] transition-all hover:bg-[#E2E6EF] hover:text-[#1C1C1E]"
      >
        <X size={14} />
        <span className="text-[11px] font-bold">닫기</span>
      </button>

      {/* 좌측 카테고리 탐색 */}
      <LibraryCategoryNav
        activeCategory={activeCategory}
        onSelectCategory={onSelectCategory}
      />

      {/* 우측 프리셋 그리드 */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col p-8">
        <div className="mb-5 pr-16">
          <p className="text-[11px] font-black uppercase tracking-widest text-[#ADB5BD]">
            3D Presets
          </p>
          <h3 className="mt-1 text-2xl font-black text-[#1C1C1E]">
            {activeCategory.label} 라이브러리
          </h3>
        </div>

        <div className="grid min-h-0 grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-3 overflow-y-auto pr-1">
          {filteredPresets.map((preset) => (
            <LibraryPresetCard
              key={preset.id}
              preset={preset}
              onAdd={onAddPreset}
              isEditingLocked={isEditingLocked}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Box, ChevronDown, ChevronRight, Eye, EyeOff, SlidersHorizontal } from 'lucide-react'
import type { PanelKey, PanelOffset, PanelResizeAxis } from '../../types'
import type { IfcStoreyInfo } from '../canvas/thatopen/ifcPropertyParser'
import type { ThreeDLibraryPreset } from '../canvas/threeDLibrary.types'
import { PanelFrame } from '../shared/PanelFrame'

// ── 정적 계층 데이터 (IFC 미로드 시 fallback 목업) ───────────────────────────

interface HierarchyGroup {
  id: string
  name: string
  children: string[]
}

const HIERARCHY_ITEMS: HierarchyGroup[] = [
  { id: 'ext', name: '외벽 구조', children: ['벽체-01', '벽체-02', '창호-01'] },
  { id: 'int', name: '내부 공간', children: ['거실', '주방', '침실'] },
  { id: 'roof', name: '지붕 상세', children: ['박공지붕-A'] },
]

const DEFAULT_EXPANDED_GROUP_IDS = HIERARCHY_ITEMS.map((group) => group.id)
const STOREY_ELEMENT_PREVIEW_LIMIT = 10

const IFC_CATEGORY_KO: Record<string, string> = {
  Roof: '지붕',
  Slab: '슬래브',
  Wall: '벽체',
  Window: '창문',
  Door: '문',
  Stair: '계단',
  Column: '기둥',
  Beam: '보',
  Space: '공간',
  Element: '요소',
}

const ELEMENT_TOKEN_KO: Record<string, string> = {
  Yard: '마당',
  Grass: '잔디',
  Fence: '울타리',
  South: '남측',
  North: '북측',
  West: '서측',
  East: '동측',
}

const toKoreanIfcCategory = (category: string) => IFC_CATEGORY_KO[category] ?? category

const toKoreanElementName = (name: string) => {
  const parts = name.split(/[_\s-]+/).filter((part) => part.length > 0)
  if (parts.length === 0) return name
  return parts.map((part) => ELEMENT_TOKEN_KO[part] ?? part).join(' ')
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface HierarchyPanelProps {
  isOpen: boolean
  offset: PanelOffset
  width: number
  height: number
  zIndex?: number
  ifcStoreys?: IfcStoreyInfo[]
  activeIfcStoreyId?: string | null
  overlayIfcStoreyExpressIds?: number[]
  overlayOpacityByLayerId?: Record<string, number>
  libraryElementsByStoreyId?: Record<string, ThreeDLibraryPreset[]>
  onSelectIfcStorey?: (id: string) => void
  onSelectIfcElementByLocalId?: (localId: number) => void
  onSelectLibraryElementById?: (id: string) => void
  onToggleIfcStoreyOverlay?: (id: string) => void
  onChangeOverlayLayerOpacity?: (layerId: string, opacity: number) => void
  onDragStart: (key: PanelKey, e: ReactMouseEvent<HTMLElement>) => void
  onResizeStart: (key: PanelKey, axis: PanelResizeAxis, e: ReactMouseEvent<HTMLButtonElement>) => void
  onToggle: (key: PanelKey) => void
}

/**
 * 3D 뷰어 계층 구조 패널
 * - IFC 층 정보가 있으면 실제 트리(층 선택/상세)를 렌더링한다.
 * - IFC 정보가 없으면 기존 정적 목업을 fallback으로 유지한다.
 * - 2D 계층구조와 동일한 옵션 메뉴(전체 펼치기/접기/선택 항목만 보기)를 제공한다.
 */
export function HierarchyPanel(props: HierarchyPanelProps) {
  const {
    isOpen,
    offset,
    width,
    height,
    zIndex,
    ifcStoreys = [],
    activeIfcStoreyId = null,
    overlayIfcStoreyExpressIds = [],
    libraryElementsByStoreyId = {},
    onSelectIfcStorey,
    onToggleIfcStoreyOverlay,
    onSelectIfcElementByLocalId,
    onSelectLibraryElementById,
    onDragStart,
    onResizeStart,
    onToggle,
  } = props

  // 활성 층이 하나라도 있으면 true — Eye/EyeOff 아이콘 표시 기준으로 사용
  const hasAnyActiveStorey = activeIfcStoreyId !== null
  const [isIfcRootExpanded, setIsIfcRootExpanded] = useState(true)
  const [expandedStoreyIds, setExpandedStoreyIds] = useState<Record<string, boolean>>({})
  const [expandedElementListByStoreyId, setExpandedElementListByStoreyId] = useState<Record<string, boolean>>({})
  const [expandedMockGroupIds, setExpandedMockGroupIds] = useState<string[]>(DEFAULT_EXPANDED_GROUP_IDS)
  const [isHierarchyMenuOpen, setIsHierarchyMenuOpen] = useState(false)
  const [showSelectedRoomOnly, setShowSelectedRoomOnly] = useState(false)
  const hierarchyMenuRef = useRef<HTMLDivElement | null>(null)

  const hasIfcStoreys = ifcStoreys.length > 0
  const visibleIfcStoreys = useMemo(
    () => {
      if (!showSelectedRoomOnly) return ifcStoreys
      if (!activeIfcStoreyId) return ifcStoreys
      return ifcStoreys.filter((storey) => String(storey.expressId) === activeIfcStoreyId)
    },
    [ifcStoreys, activeIfcStoreyId, showSelectedRoomOnly],
  )

  const toggleStoreyExpanded = (storeyId: string) => {
    setExpandedStoreyIds((prev) => ({ ...prev, [storeyId]: !prev[storeyId] }))
  }
  const toggleStoreyElementListExpanded = (storeyId: string) => {
    setExpandedElementListByStoreyId((prev) => ({ ...prev, [storeyId]: !prev[storeyId] }))
  }
  const toggleMockGroupExpanded = (groupId: string) => {
    setExpandedMockGroupIds((prev) => (
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId]
    ))
  }

  const handleExpandAll = () => {
    setShowSelectedRoomOnly(false)
    if (hasIfcStoreys) {
      setIsIfcRootExpanded(true)
      setExpandedStoreyIds(
        Object.fromEntries(
          ifcStoreys.map((storey) => [String(storey.expressId), true] as const),
        ),
      )
      setIsHierarchyMenuOpen(false)
      return
    }
    setExpandedMockGroupIds(DEFAULT_EXPANDED_GROUP_IDS)
    setIsHierarchyMenuOpen(false)
  }

  const handleCollapseAll = () => {
    setShowSelectedRoomOnly(false)
    if (hasIfcStoreys) {
      setExpandedStoreyIds({})
      setIsHierarchyMenuOpen(false)
      return
    }
    setExpandedMockGroupIds([])
    setIsHierarchyMenuOpen(false)
  }

  const handleToggleSelectedOnly = () => {
    if (hasIfcStoreys) {
      setShowSelectedRoomOnly((prev) => {
        const next = !prev
        if (next && activeIfcStoreyId) {
          setExpandedStoreyIds((current) => ({ ...current, [activeIfcStoreyId]: true }))
          setIsIfcRootExpanded(true)
        }
        return next
      })
    }
    setIsHierarchyMenuOpen(false)
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!isHierarchyMenuOpen) return
      const target = event.target as Node
      if (hierarchyMenuRef.current && !hierarchyMenuRef.current.contains(target)) {
        setIsHierarchyMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isHierarchyMenuOpen])

  return (
    <PanelFrame
      panelKey="hierarchy"
      title="계층구조"
      titleIcon={<Box size={14} className="text-[#3B45B3]" />}
      headerExtra={(
        <div ref={hierarchyMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setIsHierarchyMenuOpen((prev) => !prev)}
            className={`rounded-md p-1 ${
              isHierarchyMenuOpen
                ? 'bg-[#E9EEFA] text-[#3B45B3]'
                : 'text-[#8FA0BA] hover:bg-[#EEF1F8] hover:text-[#60708A]'
            }`}
            title="계층 구조 옵션"
            aria-label="계층 구조 옵션"
          >
            <SlidersHorizontal size={14} />
          </button>
          {isHierarchyMenuOpen && (
            <div className="absolute right-0 top-8 z-20 w-[220px] rounded-xl border border-[#E1E7F3] bg-white p-2 shadow-lg">
              <button
                type="button"
                onClick={handleExpandAll}
                className="flex h-9 w-full items-center rounded-md px-3 text-left text-[12px] font-semibold tracking-tight text-[#2F3D55] hover:bg-[#F3F6FD]"
                style={{ whiteSpace: 'nowrap', wordBreak: 'keep-all' }}
              >
                전체 펼치기
              </button>
              <button
                type="button"
                onClick={handleCollapseAll}
                className="mt-1 flex h-9 w-full items-center rounded-md px-3 text-left text-[12px] font-semibold tracking-tight text-[#2F3D55] hover:bg-[#F3F6FD]"
                style={{ whiteSpace: 'nowrap', wordBreak: 'keep-all' }}
              >
                전체 접기
              </button>
              <button
                type="button"
                onClick={handleToggleSelectedOnly}
                className={`mt-1 flex h-9 w-full items-center rounded-md px-3 text-left text-[12px] font-semibold tracking-tight ${
                  showSelectedRoomOnly
                    ? 'bg-[#EEF2FF] text-[#3B45B3]'
                    : 'text-[#2F3D55] hover:bg-[#F3F6FD]'
                }`}
                style={{ whiteSpace: 'nowrap', wordBreak: 'keep-all' }}
              >
                선택 Room만 보기
              </button>
            </div>
          )}
        </div>
      )}
      isOpen={isOpen}
      offset={offset}
      width={width}
      height={height}
      zIndex={zIndex}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onToggle={onToggle}
    >
      <div className="p-4 flex flex-col gap-3">
        {hasIfcStoreys ? (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setIsIfcRootExpanded((prev) => !prev)}
              className="flex w-full items-center justify-between rounded-md p-1 transition-colors hover:bg-[#F8F9FD]"
            >
              <div className="flex min-w-0 items-center gap-1.5">
                {isIfcRootExpanded
                  ? <ChevronDown size={12} className="text-[#ADB5BD]" />
                  : <ChevronRight size={12} className="text-[#ADB5BD]" />}
                <span className="truncate text-[11px] font-black text-[#1C1C1E]">건물 계층</span>
              </div>
              <span className="rounded bg-[#EEF2FF] px-1.5 py-0.5 text-[9px] font-bold text-[#5B68B0]">
                {ifcStoreys.length}층
              </span>
            </button>

            {isIfcRootExpanded && (
              <div className="ml-4 mt-1 flex flex-col gap-2 border-l border-[#F0F2F9] pl-3">
                {visibleIfcStoreys.map((storey) => {
                  const storeyId = String(storey.expressId)
                  const isActive = activeIfcStoreyId === storeyId
                  const isExpanded = expandedStoreyIds[storeyId] ?? isActive
                  const storeyElements = storey.elements ?? []
                  const storeyLibraryElements = libraryElementsByStoreyId[storeyId] ?? []
                  const isElementListExpanded = expandedElementListByStoreyId[storeyId] ?? false
                  const previewElements = isElementListExpanded
                    ? storeyElements
                    : storeyElements.slice(0, STOREY_ELEMENT_PREVIEW_LIMIT)
                  const hiddenElementCount = Math.max(storeyElements.length - STOREY_ELEMENT_PREVIEW_LIMIT, 0)

                  // 겹쳐보기 목록에 포함되어 있으면 오버레이 표시 중
                  const isOverlay = overlayIfcStoreyExpressIds.includes(storey.expressId)
                  // 눈 아이콘: 활성 층이 없으면 모두 보임(Eye), 있으면 해당 층만 Eye
                  const isEyeOn = !hasAnyActiveStorey || isActive

                  return (
                    <div key={storey.expressId} className="rounded-lg border border-[#EEF1F8] bg-[#FCFDFF] px-2 py-1.5">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggleStoreyExpanded(storeyId)}
                          className="rounded p-0.5 text-[#9AA4BA] hover:bg-[#EEF1F8] hover:text-[#3B45B3]"
                          aria-label={`${storey.name} 상세 토글`}
                        >
                          {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectIfcStorey?.(storeyId)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className={`truncate text-[10px] font-bold ${isActive ? 'text-[#3B45B3]' : 'text-[#1C1C1E]'}`}>
                            {storey.name}
                          </p>
                          <p className="text-[9px] text-[#9AA4BA]">{isActive ? '활성 층' : '비활성 층'}</p>
                        </button>
                        {/* 층 가시성 토글: 클릭 시 해당 층을 활성/비활성 전환 */}
                        <button
                          type="button"
                          onClick={() => onSelectIfcStorey?.(storeyId)}
                          className={`shrink-0 rounded p-0.5 transition-colors ${
                            isEyeOn
                              ? 'text-[#3B45B3] hover:bg-[#EEF1F8]'
                              : 'text-[#C0C8D8] hover:bg-[#EEF1F8] hover:text-[#3B45B3]'
                          }`}
                          aria-label={isEyeOn ? `${storey.name} 숨기기` : `${storey.name} 표시`}
                          title={isEyeOn ? '층 숨기기' : '층 표시'}
                        >
                          {isEyeOn ? <Eye size={11} /> : <EyeOff size={11} />}
                        </button>
                        {/* 겹쳐보기 토글: 활성 층이 있을 때만 표시 */}
                        {hasAnyActiveStorey && !isActive && onToggleIfcStoreyOverlay && (
                          <button
                            type="button"
                            onClick={() => onToggleIfcStoreyOverlay(storeyId)}
                            className={`shrink-0 rounded px-1 py-0.5 text-[8px] font-bold transition-colors ${
                              isOverlay
                                ? 'bg-[#EEF2FF] text-[#3B45B3] hover:bg-[#E0E7FF]'
                                : 'text-[#C0C8D8] hover:bg-[#F3F6FD] hover:text-[#6B7A99]'
                            }`}
                            aria-label={isOverlay ? `${storey.name} 겹쳐보기 해제` : `${storey.name} 겹쳐보기`}
                            title={isOverlay ? '겹쳐보기 해제' : '겹쳐보기'}
                          >
                            겹침
                          </button>
                        )}
                      </div>

                      {isExpanded && (
                        <div className="mt-1.5 border-t border-[#EEF1F8] pt-1.5">
                          <p className="text-[9px] text-[#7C89A1]">
                            요소 수: <span className="font-bold">{storey.elementLocalIds.size}</span>
                            {storeyLibraryElements.length > 0
                              ? <span className="font-bold"> + 라이브러리 {storeyLibraryElements.length}</span>
                              : null}
                          </p>
                          <p className="text-[9px] text-[#7C89A1]">
                            고도: <span className="font-bold">{storey.elevation ?? '-'}</span>
                          </p>
                          {previewElements.length > 0 && (
                            <div className="mt-1.5 border-t border-[#F1F4FA] pt-1.5">
                              <p className="mb-1 text-[9px] font-bold text-[#6B7A99]">요소</p>
                              <div className="flex flex-col gap-1">
                                {previewElements.map((element) => (
                                  <button
                                    type="button"
                                    key={`${storey.expressId}-${element.localId}`}
                                    className="w-full rounded bg-[#F7F9FE] px-1.5 py-1 text-left text-[9px] text-[#4E5C73] hover:bg-[#EEF3FF]"
                                    onClick={() => {
                                      if (!isActive) onSelectIfcStorey?.(storeyId)
                                      onSelectIfcElementByLocalId?.(element.localId)
                                    }}
                                  >
                                    <p className="truncate font-semibold">{toKoreanElementName(element.name)}</p>
                                    <p className="truncate text-[#7C89A1]">
                                      {toKoreanIfcCategory(element.category)} · #{element.localId}
                                    </p>
                                  </button>
                                ))}
                              </div>
                              {hiddenElementCount > 0 && (
                                <button
                                  type="button"
                                  onClick={() => toggleStoreyElementListExpanded(storeyId)}
                                  className="mt-1 text-[9px] font-semibold text-[#6A76A0] hover:text-[#3B45B3]"
                                >
                                  {isElementListExpanded ? '접기' : `${hiddenElementCount}개 더`}
                                </button>
                              )}
                            </div>
                          )}
                          {storeyLibraryElements.length > 0 && (
                            <div className="mt-1.5 border-t border-[#F1F4FA] pt-1.5">
                              <p className="mb-1 text-[9px] font-bold text-[#6B7A99]">
                                라이브러리 ({storeyLibraryElements.length})
                              </p>
                              <div className="flex flex-col gap-1">
                                {storeyLibraryElements.map((preset) => (
                                  <button
                                    type="button"
                                    key={preset.id}
                                    className="w-full rounded bg-[#F7F9FE] px-1.5 py-1 text-left text-[9px] text-[#4E5C73] hover:bg-[#EEF3FF]"
                                    onClick={() => {
                                      if (!isActive) onSelectIfcStorey?.(storeyId)
                                      onSelectLibraryElementById?.(preset.id)
                                    }}
                                  >
                                    <p className="truncate font-semibold">{preset.name}</p>
                                    <p className="truncate text-[#7C89A1]">
                                      {toKoreanIfcCategory(preset.type)} · #{preset.id}
                                    </p>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
                {visibleIfcStoreys.length === 0 && (
                  <p className="px-2 py-3 text-center text-[10px] text-[#ADB5BD]">표시할 층이 없습니다.</p>
                )}
              </div>
            )}
          </div>
        ) : (
          HIERARCHY_ITEMS.map((group) => (
            <div key={group.id} className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => toggleMockGroupExpanded(group.id)}
                className="flex w-full items-center justify-between rounded-md p-1 transition-colors hover:bg-[#F8F9FD]"
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  {expandedMockGroupIds.includes(group.id)
                    ? <ChevronDown size={12} className="text-[#ADB5BD]" />
                    : <ChevronRight size={12} className="text-[#ADB5BD]" />}
                  <span className="text-[11px] font-black text-[#1C1C1E] truncate">{group.name}</span>
                </div>
              </button>

              {expandedMockGroupIds.includes(group.id) && (
                <div className="ml-4 pl-3 border-l border-[#F0F2F9] flex flex-col gap-1.5 mt-1">
                  {group.children.map((child) => (
                    <div
                      key={child}
                      className="flex items-center justify-between hover:bg-[#F8F9FD] px-2 py-0.5 rounded-sm transition-colors"
                    >
                      <span className="text-[10px] font-bold text-[#6B7A99]">{child}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </PanelFrame>
  )
}

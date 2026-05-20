import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Box, ChevronDown, ChevronRight, Eye, EyeOff, Search, SlidersHorizontal } from 'lucide-react'
import type {
  ElementHierarchyNode,
  ElementRegistryState,
  FloorLayer,
  FloorOpening,
  FloorRoom,
  FloorWall,
  PanelKey,
  PanelOffset,
  PanelResizeAxis,
} from '../../types'
import type { IfcStoreyInfo } from '../canvas/thatopen/ifcPropertyParser'
import type { ThreeDLibraryPreset } from '../canvas/threeDLibrary.types'
import { PanelFrame } from '../shared/PanelFrame'
import { buildHierarchyGroups, type HierarchyGroup } from './hierarchyPanelData'

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
  roof: '지붕',
  'exterior-wall': '외벽',
  'interior-wall': '내벽',
  window: '창문',
  'room-door': '방문',
  'front-door': '현관문',
  stairs: '계단',
  column: '기둥',
  floor: '바닥',
  ceiling: '천장',
  furniture: '가구',
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

  floorRooms?: FloorRoom[]
  floorWalls?: FloorWall[]
  floorOpenings?: FloorOpening[]
  floorLayers?: FloorLayer[]
  activeFloorLayerId?: string | null
  ifcElementHierarchy?: unknown
  elementRegistry?: ElementRegistryState
  elementHierarchyTree?: ElementHierarchyNode[]
  selectedElementId?: string | null
  hiddenElementIds?: string[]
  groups?: HierarchyGroup[]
  onSelectRegistryElement?: (elementId: string) => void
  onToggleElementVisibility?: (elementId: string) => void
  onSelectFloor?: (id: string) => void
}

const filterHierarchyTree = (
  nodes: ElementHierarchyNode[],
  query: string,
): ElementHierarchyNode[] => {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return nodes

  const visit = (node: ElementHierarchyNode): ElementHierarchyNode | null => {
    const selfMatches = [
      node.label,
      node.category,
      node.elementId,
      node.floorId,
      node.sourceType,
    ].some((value) => String(value ?? '').toLowerCase().includes(normalizedQuery))
    const children = node.children.map(visit).filter((child): child is ElementHierarchyNode => child != null)
    if (!selfMatches && children.length === 0) return null
    return { ...node, children }
  }

  return nodes.map(visit).filter((node): node is ElementHierarchyNode => node != null)
}

const getNodeCount = (node: ElementHierarchyNode): number => {
  if (node.kind === 'element') return 1
  return node.children.reduce((sum, child) => sum + getNodeCount(child), 0)
}

/**
 * 3D 뷰어 계층 구조 패널
 * - IFC 층 정보가 있으면 실제 IFC 층/요소 트리를 렌더링한다.
 * - IFC 정보가 없으면 실제 에디터 상태(rooms/walls/openings/ifc hierarchy) 기반 계층을 렌더링한다.
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

    floorRooms,
    floorWalls,
    floorOpenings,
    floorLayers,
    activeFloorLayerId,
    ifcElementHierarchy,
    elementRegistry,
    elementHierarchyTree,
    selectedElementId,
    hiddenElementIds = [],
    groups,
    onSelectRegistryElement,
    onToggleElementVisibility,
    onSelectFloor,
  } = props

  const hierarchyGroups = useMemo(
    () =>
      groups ?? buildHierarchyGroups({
        floorRooms,
        floorWalls,
        floorOpenings,
        floorLayers,
        activeFloorLayerId,
        ifcElementHierarchy,
      }),
    [
      groups,
      floorRooms,
      floorWalls,
      floorOpenings,
      floorLayers,
      activeFloorLayerId,
      ifcElementHierarchy,
    ],
  )

  const hasIfcStoreys = ifcStoreys.length > 0
  const hasAnyActiveStorey = activeIfcStoreyId !== null

  const [isIfcRootExpanded, setIsIfcRootExpanded] = useState(true)
  const [expandedStoreyIds, setExpandedStoreyIds] = useState<Record<string, boolean>>({})
  const [expandedElementListByStoreyId, setExpandedElementListByStoreyId] = useState<Record<string, boolean>>({})
  const [expandedGroupIds, setExpandedGroupIds] = useState<Record<string, boolean>>({})
  const [isHierarchyMenuOpen, setIsHierarchyMenuOpen] = useState(false)
  const [showSelectedRoomOnly, setShowSelectedRoomOnly] = useState(false)
  const [hierarchySearchQuery, setHierarchySearchQuery] = useState('')
  const hierarchyMenuRef = useRef<HTMLDivElement | null>(null)
  const hasElementHierarchyTree = (elementHierarchyTree?.length ?? 0) > 0
  const filteredElementHierarchyTree = useMemo(
    () => filterHierarchyTree(elementHierarchyTree ?? [], hierarchySearchQuery),
    [elementHierarchyTree, hierarchySearchQuery],
  )
  const hiddenElementIdSet = useMemo(() => new Set(hiddenElementIds), [hiddenElementIds])

  const visibleIfcStoreys = useMemo(() => {
    if (!showSelectedRoomOnly) return ifcStoreys
    if (!activeIfcStoreyId) return ifcStoreys
    return ifcStoreys.filter((storey) => String(storey.expressId) === activeIfcStoreyId)
  }, [ifcStoreys, activeIfcStoreyId, showSelectedRoomOnly])

  const toggleStoreyExpanded = (storeyId: string) => {
    setExpandedStoreyIds((prev) => ({ ...prev, [storeyId]: !prev[storeyId] }))
  }

  const toggleStoreyElementListExpanded = (storeyId: string) => {
    setExpandedElementListByStoreyId((prev) => ({ ...prev, [storeyId]: !prev[storeyId] }))
  }

  const toggleGroupExpanded = (groupId: string) => {
    setExpandedGroupIds((prev) => ({
      ...prev,
      [groupId]: !(prev[groupId] ?? true),
    }))
  }

  const handleExpandAll = () => {
    setShowSelectedRoomOnly(false)

    if (hasElementHierarchyTree) {
      const expandedEntries: Array<[string, boolean]> = []
      const collectNode = (node: ElementHierarchyNode) => {
        expandedEntries.push([node.id, true])
        node.children.forEach(collectNode)
      }
      ;(elementHierarchyTree ?? []).forEach(collectNode)
      setExpandedGroupIds(Object.fromEntries(expandedEntries))
      setIsHierarchyMenuOpen(false)
      return
    }

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

    setExpandedGroupIds(
      Object.fromEntries(hierarchyGroups.map((group) => [group.id, true] as const)),
    )
    setIsHierarchyMenuOpen(false)
  }

  const handleCollapseAll = () => {
    setShowSelectedRoomOnly(false)

    if (hasElementHierarchyTree) {
      const expandedEntries: Array<[string, boolean]> = []
      const collectNode = (node: ElementHierarchyNode) => {
        expandedEntries.push([node.id, false])
        node.children.forEach(collectNode)
      }
      ;(elementHierarchyTree ?? []).forEach(collectNode)
      setExpandedGroupIds(Object.fromEntries(expandedEntries))
      setIsHierarchyMenuOpen(false)
      return
    }

    if (hasIfcStoreys) {
      setExpandedStoreyIds({})
      setIsHierarchyMenuOpen(false)
      return
    }

    setExpandedGroupIds(
      Object.fromEntries(hierarchyGroups.map((group) => [group.id, false] as const)),
    )
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

  const handleSelectTreeNode = (node: ElementHierarchyNode) => {
    if (node.kind === 'element' && node.elementId) {
      onSelectRegistryElement?.(node.elementId)
      return
    }
    if (!node.floorId) return
    if (node.sourceType === 'IFC_MOCK') {
      onSelectIfcStorey?.(node.floorId)
      return
    }
    onSelectFloor?.(node.floorId)
  }

  const renderTreeNode = (node: ElementHierarchyNode, depth = 0): JSX.Element => {
    const isExpanded = hierarchySearchQuery.trim()
      ? true
      : (expandedGroupIds[node.id] ?? depth < 2)
    const hasChildren = node.children.length > 0
    const isSelected = Boolean(node.isSelected || (node.elementId && selectedElementId === node.elementId))
    const isElementHidden = Boolean(node.elementId && hiddenElementIdSet.has(node.elementId))
    const isVisible = node.isVisible !== false && !isElementHidden
    const count = getNodeCount(node)
    const leftPadding = Math.min(depth * 12, 36)

    return (
      <div key={node.id} className="flex flex-col gap-1">
        <div
          className={`flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors ${
            isSelected
              ? 'bg-[#EEF2FF] text-[#3B45B3]'
              : 'text-[#4E5C73] hover:bg-[#F8F9FD]'
          }`}
          style={{ paddingLeft: `${leftPadding + 6}px` }}
        >
          <button
            type="button"
            onClick={() => hasChildren && toggleGroupExpanded(node.id)}
            className={`shrink-0 rounded p-0.5 ${
              hasChildren ? 'text-[#9AA4BA] hover:bg-[#EEF1F8] hover:text-[#3B45B3]' : 'text-transparent'
            }`}
            aria-label={`${node.label} 상세 토글`}
          >
            {hasChildren
              ? (isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />)
              : <ChevronRight size={11} />}
          </button>

          <button
            type="button"
            onClick={() => handleSelectTreeNode(node)}
            className="min-w-0 flex-1 text-left"
          >
            <p className={`truncate text-[10px] ${isSelected ? 'font-black' : 'font-bold'}`}>
              {node.label}
            </p>
            {node.kind !== 'element' && (
              <p className="text-[9px] text-[#9AA4BA]">
                {count}개 요소
              </p>
            )}
          </button>

          {node.kind === 'element' && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                if (node.elementId) onToggleElementVisibility?.(node.elementId)
              }}
              className={`shrink-0 rounded p-0.5 ${
                isVisible ? 'text-[#3B45B3] hover:bg-[#EEF1F8]' : 'text-[#C0C8D8] hover:bg-[#EEF1F8] hover:text-[#3B45B3]'
              }`}
              title={isVisible ? '요소 숨기기' : '요소 표시'}
              aria-label={isVisible ? `${node.label} 숨기기` : `${node.label} 표시`}
            >
              {isVisible ? <Eye size={11} /> : <EyeOff size={11} />}
            </button>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div className="flex flex-col gap-1">
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

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
              >
                전체 펼치기
              </button>
              <button
                type="button"
                onClick={handleCollapseAll}
                className="mt-1 flex h-9 w-full items-center rounded-md px-3 text-left text-[12px] font-semibold tracking-tight text-[#2F3D55] hover:bg-[#F3F6FD]"
              >
                전체 접기
              </button>

              {hasIfcStoreys && (
                <button
                  type="button"
                  onClick={handleToggleSelectedOnly}
                  className={`mt-1 flex h-9 w-full items-center rounded-md px-3 text-left text-[12px] font-semibold tracking-tight ${
                    showSelectedRoomOnly
                      ? 'bg-[#EEF2FF] text-[#3B45B3]'
                      : 'text-[#2F3D55] hover:bg-[#F3F6FD]'
                  }`}
                >
                  선택 층만 보기
                </button>
              )}
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
      <div className="flex flex-col gap-3 p-4">
        {hasElementHierarchyTree ? (
          <div className="flex flex-col gap-2">
            <div className="flex h-8 items-center gap-1.5 rounded-md border border-[#E1E7F3] bg-white px-2">
              <Search size={12} className="shrink-0 text-[#9AA4BA]" />
              <input
                value={hierarchySearchQuery}
                onChange={(event) => setHierarchySearchQuery(event.target.value)}
                placeholder="요소 검색"
                className="min-w-0 flex-1 bg-transparent text-[10px] font-semibold text-[#2F3D55] outline-none placeholder:text-[#ADB5BD]"
              />
              {elementRegistry && (
                <span className="shrink-0 text-[9px] font-bold text-[#8FA0BA]">
                  {elementRegistry.elements.length}
                </span>
              )}
            </div>

            <div className="flex max-h-[420px] flex-col gap-1 overflow-y-auto pr-1">
              {filteredElementHierarchyTree.length > 0 ? (
                filteredElementHierarchyTree.map((node) => renderTreeNode(node))
              ) : (
                <p className="px-2 py-3 text-center text-[10px] text-[#ADB5BD]">검색 결과가 없습니다.</p>
              )}
            </div>
          </div>
        ) : hasIfcStoreys ? (
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
                  const isOverlay = overlayIfcStoreyExpressIds.includes(storey.expressId)
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
                                  {isElementListExpanded ? '접기' : `${hiddenElementCount}개 더 보기`}
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
        ) : hierarchyGroups.length === 0 ? (
          <p className="px-2 py-3 text-center text-[10px] text-[#ADB5BD]">표시할 계층 구조가 없습니다.</p>
        ) : (
          hierarchyGroups.map((group) => {
            const isExpanded = expandedGroupIds[group.id] ?? true

            return (
              <div key={group.id} className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => toggleGroupExpanded(group.id)}
                  className="flex w-full items-center justify-between rounded-md p-1 transition-colors hover:bg-[#F8F9FD]"
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    {isExpanded
                      ? <ChevronDown size={12} className="text-[#ADB5BD]" />
                      : <ChevronRight size={12} className="text-[#ADB5BD]" />}
                    <span className="truncate text-[11px] font-black text-[#1C1C1E]">{group.name}</span>
                  </div>
                  <Eye size={12} className="text-[#ADB5BD]" />
                </button>

                {isExpanded && (
                  <div className="ml-4 mt-1 flex flex-col gap-1.5 border-l border-[#F0F2F9] pl-3">
                    {group.children.map((child) => (
                      <div
                        key={`${group.id}-${child.id}`}
                        onClick={() => {
                          if (group.id === 'floors') onSelectFloor?.(child.id)
                        }}
                        className="flex cursor-pointer items-center justify-between rounded-sm px-2 py-0.5 transition-colors hover:bg-[#F8F9FD]"
                      >
                        <span className="text-[10px] font-bold text-[#6B7A99]">{child.label}</span>
                        <Eye size={10} className="text-[#E2E6EF]" />
                      </div>
                    ))}

                    {group.children.length === 0 && (
                      <p className="px-2 py-0.5 text-[9px] text-[#A3ACBA]">하위 요소 없음</p>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </PanelFrame>
  )
}

import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { AddSpaceFormData, EditorMode } from '../types'
import { INITIAL_ADD_SPACE_FORM, SITE_RAW_POINTS } from '../constants'
import { useBubbles } from './useBubbles'
import { useConnections } from './useConnections'
import { usePanels } from './usePanels'
import { useStageSize } from './useStageSize'
import { useZones } from './useZones'
import { useFloorPlan } from './useFloorPlan'
import { centerSitePoints } from '../utils/bubbleCalc'

/** EditorPage URL 파라미터에서 모드 파싱 — 허용 목록 외 값은 기본값('bubble')으로 처리 */
const EDITOR_MODES: EditorMode[] = ['bubble', '2d', '3d', 'view']
function resolveMode(value: string | null): EditorMode {
  return EDITOR_MODES.includes(value as EditorMode) ? (value as EditorMode) : 'bubble'
}

/**
 * EditorPage 전체 비즈니스 로직 훅
 * 버블·연결선·조닝·패널·평면도·UI 상태를 하위 훅에서 합성해 관리
 */
export function useEditorPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const mode = resolveMode(searchParams.get('mode'))

  const { containerRef, stageSize } = useStageSize()

  // 버블(공간) 상태
  const {
    bubbles,
    selectedId,
    previousSelectedId,
    handleBubbleSelect,
    handleBubbleDrag,
    handleLabelChange,
    handleTypeChange,
    handleWidthChange,
    handleHeightChange,
    handleRatioChange,
    handleColorChange,
    addBubble,
    deleteBubble,
  } = useBubbles()

  // 연결선 상태
  const {
    connections,
    isModalOpen: isLineStyleModalOpen,
    selectedStyle: selectedLineStyle,
    connectionPair: lineConnectionPair,
    openModal,
    confirmModal: confirmLineStyleModal,
    closeModal: closeLineStyleModal,
    setSelectedStyle,
    removeConnectionsForBubble,
  } = useConnections()

  // 조닝 상태
  const {
    zones,
    isModalOpen: isZoningModalOpen,
    editingZoneId,
    formData: zoningFormData,
    setFormData: setZoningFormData,
    autoColorPreview: zoningAutoColorPreview,
    openAddModal: openZoningModal,
    openEditModal,
    closeModal: closeZoningModal,
    toggleBubble: toggleZoningBubble,
    confirmModal: confirmZoningModal,
    deleteZone,
  } = useZones(bubbles)

  // 우측 패널 드래그·리사이즈 상태
  const { panelOffsets, panelOpenState, panelHeights, panelWidths, startDrag, startResize, togglePanel } = usePanels(mode)

  // 2D 평면도 층 상태
  const {
    isGenerated: isFloorPlanGenerated,
    isGenerating: isFloorPlanGenerating,
    layers: floorLayers,
    activeLayerId: activeFloorLayerId,
    activeRooms: floorRooms,
    generateFloorPlan,
    refreshFloorPlan,
    addFloorLayer,
    setActiveLayerId: setActiveFloorLayerId,
  } = useFloorPlan()

  // 버블·연결선 변경 시 이미 생성된 평면도를 조용히 갱신 (로딩 없음)
  useEffect(() => {
    if (isFloorPlanGenerated && bubbles.length > 0 && stageSize.width > 0) {
      refreshFloorPlan(bubbles, connections, stageSize.width, stageSize.height)
    }
  }, [bubbles, connections, stageSize.width, stageSize.height, isFloorPlanGenerated, refreshFloorPlan])

  // 버블이 1개 이상 생기면 평면도가 없을 때 즉시 자동 생성 (모드 무관)
  useEffect(() => {
    if (!isFloorPlanGenerated && bubbles.length > 0 && stageSize.width > 0) {
      generateFloorPlan(bubbles, connections, stageSize.width, stageSize.height)
    }
  }, [isFloorPlanGenerated, bubbles.length, stageSize.width])

  // UI 전용 상태
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [addSpaceFormData, setAddSpaceFormData] = useState<AddSpaceFormData>(INITIAL_ADD_SPACE_FORM)
  const [isCollaborationMode, setIsCollaborationMode] = useState(false)
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null)
  const [collaborationTab, setCollaborationTab] = useState<'history' | 'thread'>('history')
  const [isLibraryOpen, setIsLibraryOpen] = useState(false)
  const [isGridVisible, setIsGridVisible] = useState(false)
  const [selectedTool, setSelectedTool] = useState<string>('selection')
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [isExportSelectionModalOpen, setIsExportSelectionModalOpen] = useState(false)
  const [isIFCExportModalOpen, setIsIFCExportModalOpen] = useState(false)
  const [zoom, setZoom] = useState(100)

  // 파생 상태: 선택된 버블 객체
  const selectedBubble = useMemo(
    () => bubbles.find((b) => b.id === selectedId) ?? null,
    [bubbles, selectedId],
  )

  // 파생 상태: 선택된 버블의 연결선 목록 (라벨 포함)
  const selectedBubbleConnections = useMemo(() => {
    if (!selectedId) return []
    return connections
      .filter((c) => c.from === selectedId || c.to === selectedId)
      .map((c) => {
        const targetId = c.from === selectedId ? c.to : c.from
        const targetBubble = bubbles.find((b) => b.id === targetId)
        return { targetId, targetLabel: targetBubble?.label ?? targetId, style: c.type }
      })
  }, [bubbles, connections, selectedId])

  const autoZones = useMemo(() => zones.filter((z) => z.source === 'auto'), [zones])
  const manualZones = useMemo(() => zones.filter((z) => z.source === 'manual'), [zones])

  // 파생 상태: 선택된 버블이 속한 조닝 목록
  const selectedBubbleZones = useMemo(() => {
    if (!selectedId) return []
    return zones
      .filter((z) => z.bubbleIds.includes(selectedId))
      .map((z) => ({ id: z.id, name: z.name, color: z.color, source: z.source }))
  }, [selectedId, zones])

  const zoningListItems = useMemo(() => [...autoZones, ...manualZones], [autoZones, manualZones])

  // 파생 상태: 대지 외곽선 포인트 (캔버스 중앙 정렬)
  const sitePoints = useMemo(
    () => centerSitePoints(SITE_RAW_POINTS, stageSize.width, stageSize.height),
    [stageSize.width, stageSize.height],
  )

  // ── 핸들러 ────────────────────────────────────────────────────────────────

  /** 편집 모드 전환 — 협업 모드·라이브러리는 모드 이탈 시 닫힘 */
  const setMode = (nextMode: EditorMode) => {
    setSearchParams({ mode: nextMode })
    if (nextMode !== '2d') setIsCollaborationMode(false)
    setIsLibraryOpen(false)
  }

  const handleOpenAddModal = () => {
    setAddSpaceFormData(INITIAL_ADD_SPACE_FORM)
    setIsAddModalOpen(true)
  }

  const handleConfirmAddSpace = () => {
    addBubble(addSpaceFormData)
    setIsAddModalOpen(false)
  }

  /** 선 스타일 모달 열기 — 현재·이전 선택 버블 쌍으로 연결 대상 자동 설정 */
  const handleOpenLineStyleModal = () => {
    openModal(selectedId, previousSelectedId)
  }

  /** 협업 모드 토글 — 진입 시 탭·핀 상태 초기화 */
  const handleToggleCollaboration = () => {
    setIsCollaborationMode((prev) => {
      if (!prev) {
        setCollaborationTab('history')
        setSelectedPinId(null)
      }
      return !prev
    })
  }

  /** 협업 핀 클릭 — 해당 핀의 스레드 탭으로 이동 */
  const handlePinClick = (pinId: string) => {
    setSelectedPinId(pinId)
    setCollaborationTab('thread')
  }

  const getBubbleLabel = (bubbleId: string) =>
    bubbles.find((b) => b.id === bubbleId)?.label ?? bubbleId

  /** 버블 삭제 — 연결선도 함께 제거 */
  const handleDeleteBubble = (id: string) => {
    deleteBubble(id)
    removeConnectionsForBubble(id)
  }

  /** 2D 평면도 생성 버튼 핸들러 — 로딩 애니메이션 포함 */
  const handleGenerateFloorPlan = () => {
    generateFloorPlan(bubbles, connections, stageSize.width, stageSize.height)
  }

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 10, 300))
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 10, 10))
  const handleZoomChange = (value: string) => {
    const cleaned = value.replace(/[^0-9]/g, '')
    if (cleaned === '') return
    const num = parseInt(cleaned, 10)
    if (!isNaN(num)) setZoom(Math.min(Math.max(num, 10), 300))
  }

  const toggleGrid = () => setIsGridVisible((prev) => !prev)

  return {
    // 모드
    mode,
    setMode,
    // 캔버스 크기·대지
    containerRef,
    stageSize,
    sitePoints,
    // 버블
    bubbles,
    selectedId,
    selectedBubble,
    handleBubbleSelect,
    handleBubbleDrag,
    handleLabelChange,
    handleTypeChange,
    handleWidthChange,
    handleHeightChange,
    handleRatioChange,
    handleColorChange,
    handleDeleteBubble,
    // 연결선
    connections,
    selectedBubbleConnections,
    isLineStyleModalOpen,
    selectedLineStyle,
    lineConnectionPair,
    confirmLineStyleModal,
    closeLineStyleModal,
    setSelectedStyle,
    handleOpenLineStyleModal,
    getBubbleLabel,
    // 조닝
    zones,
    autoZones,
    manualZones,
    selectedBubbleZones,
    zoningListItems,
    isZoningModalOpen,
    editingZoneId,
    zoningFormData,
    setZoningFormData,
    zoningAutoColorPreview,
    openZoningModal,
    openEditModal,
    closeZoningModal,
    toggleZoningBubble,
    confirmZoningModal,
    deleteZone,
    // 우측 패널
    panelOffsets,
    panelOpenState,
    panelHeights,
    panelWidths,
    startDrag,
    startResize,
    togglePanel,
    // 공간 추가 모달
    isAddModalOpen,
    addSpaceFormData,
    setAddSpaceFormData,
    handleOpenAddModal,
    handleConfirmAddSpace,
    onCloseAddModal: () => setIsAddModalOpen(false),
    // 협업
    isCollaborationMode,
    selectedPinId,
    setSelectedPinId,
    collaborationTab,
    setCollaborationTab,
    handleToggleCollaboration,
    handlePinClick,
    // 줌
    zoom,
    handleZoomIn,
    handleZoomOut,
    handleZoomChange,
    setZoom,
    // 라이브러리
    isLibraryOpen,
    setIsLibraryOpen,
    // 2D 평면도
    isFloorPlanGenerated,
    isFloorPlanGenerating,
    floorLayers,
    activeFloorLayerId,
    floorRooms,
    handleGenerateFloorPlan,
    addFloorLayer,
    setActiveFloorLayerId,
    // 그리드
    isGridVisible,
    toggleGrid,
    // 도구 선택
    selectedTool,
    setSelectedTool,
    // 초대 모달
    isInviteModalOpen,
    handleOpenInviteModal: () => setIsInviteModalOpen(true),
    onCloseInviteModal: () => setIsInviteModalOpen(false),
    // 내보내기 모달
    isExportModalOpen,
    handleOpenExportModal: () => setIsExportModalOpen(true),
    onCloseExportModal: () => setIsExportModalOpen(false),
    // 내보내기 선택 모달
    isExportSelectionModalOpen,
    handleOpenExportSelectionModal: () => setIsExportSelectionModalOpen(true),
    onCloseExportSelectionModal: () => setIsExportSelectionModalOpen(false),
    // IFC 내보내기 모달
    isIFCExportModalOpen,
    handleOpenIFCExportModal: () => setIsIFCExportModalOpen(true),
    onCloseIFCExportModal: () => setIsIFCExportModalOpen(false),
  }
}

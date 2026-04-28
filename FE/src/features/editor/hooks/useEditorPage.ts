import { useState, useMemo, useEffect, useCallback } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import type { AddSpaceFormData, BubbleData, ConnectionData, EditorMode } from '../types'
import { INITIAL_ADD_SPACE_FORM, SITE_RAW_POINTS } from '../constants'
import { useBubbles } from './useBubbles'
import { useConnections } from './useConnections'
import { usePanels } from './usePanels'
import { useStageSize } from './useStageSize'
import { useZones } from './useZones'
import { useFloorPlan } from './useFloorPlan'
import { useLlmEdit } from './useLlmEdit'
import { useFloorProjectImport } from './useFloorProjectImport'
import { centerSitePoints } from '../utils/bubbleCalc'
import type { EmptyCanvasDblClickInfo } from '../components/canvas/BubbleCanvas'
import { mapAdjacencyToConnections, mapFloorProjectToBubbles } from '../utils/floorProjectMapper'
import type { FloorProject } from '../types/floorProject.types'

/** 에디터 모드 허용 목록 — URL 파라미터 검증용 */
const EDITOR_MODES: EditorMode[] = ['bubble', '2d', '3d', 'view']

/** URL 파라미터에서 모드 파싱 — 허용 목록 외 값은 'bubble'(기본값)으로 처리 */
function resolveMode(value: string | null): EditorMode {
  return EDITOR_MODES.includes(value as EditorMode) ? (value as EditorMode) : 'bubble'
}

/** 두 연결선 쌍이 동일한지 비교 (방향 무관) */
function isSameConnection(
  a: { from: string; to: string },
  b: { from: string; to: string },
): boolean {
  return (a.from === b.from && a.to === b.to) || (a.from === b.to && a.to === b.from)
}

/**
 * EditorPage 전체 비즈니스 로직 훅
 * 버블·연결선·조닝·패널·평면도·UI 상태를 하위 훅에서 합성해 관리
 */
export function useEditorPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const mode = resolveMode(searchParams.get('mode'))

  const { containerRef, stageSize } = useStageSize()

  // 버블(공간) 상태
  const {
    bubbles,
    selectedId,
    selectedIds,
    previousSelectedId,
    handleBubbleSelect,
    handleBubbleDrag,
    handleMarqueeSelect,
    clearSelection,
    handleBubbleResize,
    handleLabelChange,
    handleTypeChange,
    handleWidthChange,
    handleHeightChange,
    handleRatioChange,
    handleColorChange,
    addBubble,
    addBubbleAt,
    replaceBubbles,
    deleteBubble,
  } = useBubbles()

  // 연결선 상태
  const {
    connections,
    isModalOpen: isLineStyleModalOpen,
    selectedStyle: selectedLineStyle,
    connectionPair: lineConnectionPair,
    openModal,
    openModalWithPair,
    confirmModal: confirmLineStyleModal,
    closeModal: closeLineStyleModal,
    setSelectedStyle,
    removeConnectionsForBubble,
    removeConnection,
    replaceConnections,
  } = useConnections()

  /** 선택된 연결선 (Delete 키/삭제 도구 대상) */
  const [selectedConnectionPair, setSelectedConnectionPair] = useState<{ from: string; to: string } | null>(null)

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
    layoutSource: floorPlanLayoutSource,
    layers: floorLayers,
    activeLayerId: activeFloorLayerId,
    activeRooms: floorRooms,
    generateFloorPlan,
    refreshFloorPlan,
    addFloorLayer,
    setActiveLayerId: setActiveFloorLayerId,
    syncFloorPlanFromBubbles,
  } = useFloorPlan()

  // 버블·연결선 변경 시 이미 생성된 평면도를 조용히 갱신 (로딩 없음)
  useEffect(() => {
    if (floorPlanLayoutSource === 'bubble' && isFloorPlanGenerated && bubbles.length > 0 && stageSize.width > 0) {
      refreshFloorPlan(bubbles, connections, stageSize.width, stageSize.height)
    }
  }, [bubbles, connections, stageSize.width, stageSize.height, isFloorPlanGenerated, floorPlanLayoutSource, refreshFloorPlan])

  // 버블이 1개 이상 생기면 평면도가 없을 때 즉시 자동 생성 (모드 무관)
  useEffect(() => {
    if (!isFloorPlanGenerated && bubbles.length > 0 && stageSize.width > 0) {
      generateFloorPlan(bubbles, connections, stageSize.width, stageSize.height)
    }
  }, [isFloorPlanGenerated, bubbles, connections, stageSize.width, stageSize.height, generateFloorPlan])

  // Delete/Backspace 키로 선택된 버블 또는 연결선 삭제 (input 포커스 중엔 무시)
  const handleDeleteSelected = useCallback(() => {
    if (selectedConnectionPair) {
      removeConnection(selectedConnectionPair.from, selectedConnectionPair.to)
      setSelectedConnectionPair(null)
      return
    }
    selectedIds.forEach((id) => {
      deleteBubble(id)
      removeConnectionsForBubble(id)
    })
  }, [selectedConnectionPair, selectedIds, deleteBubble, removeConnectionsForBubble, removeConnection])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Delete' || e.key === 'Backspace') handleDeleteSelected()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleDeleteSelected])

  // UI 전용 상태
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [addSpaceFormData, setAddSpaceFormData] = useState<AddSpaceFormData>(INITIAL_ADD_SPACE_FORM)
  const [isCollaborationMode, setIsCollaborationMode] = useState(false)
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null)
  const [collaborationTab, setCollaborationTab] = useState<'history' | 'thread'>('history')
  const [isLibraryOpen, setIsLibraryOpen] = useState(false)
  const [isGridVisible, setIsGridVisible] = useState(false)
  const [selectedTool, setSelectedTool] = useState<string>('selection')
  /** 연결 도구에서 첫 번째로 선택된 버블 id */
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null)
  /** 인라인 라벨 편집 상태 */
  const [labelEditState, setLabelEditState] = useState<{
    id: string; label: string; x: number; y: number; width: number; height: number
  } | null>(null)
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
    if (selectedConnectionPair && (selectedConnectionPair.from === id || selectedConnectionPair.to === id)) {
      setSelectedConnectionPair(null)
    }
  }

  /**
   * 캔버스 버블 클릭 통합 핸들러
   * - connect 도구: 두 버블을 순서대로 선택하면 스타일 모달 표시
   * - 그 외: 기존 선택 로직 유지 (Shift 키 다중 선택 지원)
   */
  const handleBubbleSelectWithTool = (id: string, isShift = false) => {
    setSelectedConnectionPair(null)
    if (selectedTool === 'connect') {
      if (!connectingFromId) {
        setConnectingFromId(id)
        handleBubbleSelect(id)
      } else if (connectingFromId !== id) {
        openModalWithPair(connectingFromId, id)
        setConnectingFromId(null)
      } else {
        // 같은 버블 재클릭 → 연결 취소
        setConnectingFromId(null)
      }
    } else {
      handleBubbleSelect(id, isShift)
    }
  }

  /** 연결선 클릭 — 해당 연결선의 스타일 변경 모달 열기 */
  const handleConnectionClick = (conn: import('../types').ConnectionData) => {
    if (selectedTool === 'delete') {
      removeConnection(conn.from, conn.to)
      setSelectedConnectionPair(null)
      return
    }
    if (selectedTool === 'selection') {
      const nextPair = { from: conn.from, to: conn.to }
      if (selectedConnectionPair && isSameConnection(selectedConnectionPair, nextPair)) {
        openModalWithPair(conn.from, conn.to, conn.type)
        return
      }
      setSelectedConnectionPair(nextPair)
      return
    }
    setSelectedConnectionPair(null)
    openModalWithPair(conn.from, conn.to, conn.type)
  }

  /** 연결 포인트 드래그 완료 — 선스타일 모달로 연결 생성/수정 */
  const handleConnectionCreate = (fromId: string, toId: string) => {
    openModalWithPair(fromId, toId)
    setConnectingFromId(null)
    setSelectedConnectionPair(null)
  }

  /** 도구 선택 — connect 도구에서 벗어날 때 연결 대기 상태 초기화 */
  const handleSetSelectedTool = (tool: string) => {
    setSelectedTool(tool)
    if (tool !== 'connect') setConnectingFromId(null)
  }

  const handleClearCanvasSelection = () => {
    clearSelection()
    setSelectedConnectionPair(null)
  }

  /** 버블 더블클릭 → 인라인 라벨 편집 시작 */
  const handleBubbleLabelEdit = (info: { id: string; label: string; x: number; y: number; width: number; height: number }) => {
    setLabelEditState(info)
  }

  /** 빈 캔버스 더블클릭 → 버블 생성 후 즉시 라벨 편집 */
  const handleEmptyCanvasDblClick = (info: EmptyCanvasDblClickInfo) => {
    const newBubble = addBubbleAt(info.x, info.y)
    const scale = zoom / 100
    setLabelEditState({
      id: newBubble.id,
      label: newBubble.label,
      x: info.screenX - (newBubble.width * scale) / 2,
      y: info.screenY - (newBubble.height * scale) / 2,
      width: newBubble.width * scale,
      height: newBubble.height * scale,
    })
  }

  /** 인라인 라벨 편집 확정 */
  const confirmLabelEdit = (id: string, label: string) => {
    handleLabelChange(id, label)
    setLabelEditState(null)
  }

  /** 스크롤 휠 줌 — 배율을 기존 줌 값에 곱해 적용 */
  const handleWheelZoom = (factor: number) => {
    setZoom((prev) => Math.min(Math.max(Math.round(prev * factor), 10), 300))
  }

  /** 2D 평면도 생성 버튼 핸들러 — 로딩 애니메이션 포함 */
  const handleGenerateFloorPlan = () => {
    generateFloorPlan(bubbles, connections, stageSize.width, stageSize.height)
  }

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 10, 300))
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 10, 10))
  const handleZoomChange = (value: number) => setZoom(Math.min(Math.max(Math.round(value), 10), 300))

  const toggleGrid = () => setIsGridVisible((prev) => !prev)

  /**
   * 공통 선택 상태 초기화
   * - 버블 선택
   * - 연결 생성 대기 상태
   * - 연결선 선택 상태
   */
  const resetInteractionSelection = useCallback(() => {
    setSelectedConnectionPair(null)
    setConnectingFromId(null)
    clearSelection()
  }, [clearSelection])

  /** 표준 FloorProject를 버블/2D/3D 공통 상태로 반영 */
  const applyFloorProject = useCallback((project: FloorProject) => {
    const nextBubbles = mapFloorProjectToBubbles(project, {
      width: stageSize.width,
      height: stageSize.height,
    })
    const bubbleIdSet = new Set(nextBubbles.map((bubble) => bubble.id))
    const nextConnections = mapAdjacencyToConnections(project.adjacency).filter((connection) => {
      return bubbleIdSet.has(connection.from) && bubbleIdSet.has(connection.to)
    })
    replaceBubbles(nextBubbles)
    replaceConnections(nextConnections)
    syncFloorPlanFromBubbles(nextBubbles, nextConnections, stageSize.width, stageSize.height)
    resetInteractionSelection()
  }, [stageSize.width, stageSize.height, replaceBubbles, replaceConnections, syncFloorPlanFromBubbles, resetInteractionSelection])

  /** BATANG 2D JSON import 상태/핸들러 */
  const {
    floorProjectImportMessage,
    importFloorProjectFromJson,
    importSampleFloorProject,
    clearImportMessage,
  } = useFloorProjectImport({
    stageSize,
    onApplyProject: applyFloorProject,
  })

  /** AI 미리보기 적용 — 버블/연결선 일괄 반영 후 선택 상태 정리 */
  const applyLlmPreview = useCallback(
    (nextBubbles: BubbleData[], nextConnections: ConnectionData[]) => {
      replaceBubbles(nextBubbles)
      replaceConnections(nextConnections)
      clearImportMessage()
      syncFloorPlanFromBubbles(nextBubbles, nextConnections, stageSize.width, stageSize.height)
      resetInteractionSelection()
    },
    [replaceBubbles, replaceConnections, clearImportMessage, syncFloorPlanFromBubbles, stageSize.width, stageSize.height, resetInteractionSelection],
  )

  /** AI 어시스턴트 편집 상태 */
  const llmEdit = useLlmEdit({
    projectId: projectId ?? null,
    bubbles,
    connections,
    onApply: applyLlmPreview,
  })

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
    selectedIds,
    selectedBubble,
    handleBubbleSelect,
    handleBubbleDrag,
    handleMarqueeSelect,
    clearSelection: handleClearCanvasSelection,
    handleBubbleResize,
    handleLabelChange,
    handleTypeChange,
    handleWidthChange,
    handleHeightChange,
    handleRatioChange,
    handleColorChange,
    handleDeleteBubble,
    // 연결선
    connections,
    selectedConnectionPair,
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
    floorPlanConnections: connections,
    floorProjectImportMessage,
    importFloorProjectFromJson,
    importSampleFloorProject,
    // 그리드
    isGridVisible,
    toggleGrid,
    // 도구 선택
    selectedTool,
    setSelectedTool,
    handleSetSelectedTool,
    // 연결 도구
    connectingFromId,
    handleBubbleSelectWithTool,
    handleConnectionClick,
    handleConnectionCreate,
    // 인라인 라벨 편집
    labelEditState,
    handleBubbleLabelEdit,
    handleEmptyCanvasDblClick,
    confirmLabelEdit,
    closeLabelEdit: () => setLabelEditState(null),
    // 스크롤 휠 줌
    handleWheelZoom,
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
    // AI 어시스턴트
    llmProvider: llmEdit.provider,
    llmPrompt: llmEdit.prompt,
    setLlmPrompt: llmEdit.setPrompt,
    llmStatus: llmEdit.status,
    llmIsLoading: llmEdit.isLoading,
    llmMessage: llmEdit.message,
    llmSuggestions: llmEdit.suggestions,
    llmPreview: llmEdit.preview,
    llmCanRun: llmEdit.canRun,
    runLlmEdit: llmEdit.run,
    applyLlmEdit: llmEdit.apply,
    discardLlmEdit: llmEdit.discard,
  }
}

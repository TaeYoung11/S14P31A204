import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import type {
  AddSpaceFormData,
  EditorDraftRecord,
  EditorDraftSnapshot,
  EditorMode,
  SaveStatus,
} from '../types'
import { INITIAL_ADD_SPACE_FORM, SITE_RAW_POINTS } from '../constants'
import { useBubbles } from './useBubbles'
import { useConnections } from './useConnections'
import { usePanels } from './usePanels'
import { useStageSize } from './useStageSize'
import { useZones } from './useZones'
import { useFloorPlan } from './useFloorPlan'
import { centerSitePoints } from '../utils/bubbleCalc'
import { getDraft, setDraft } from '../lib/draftDb'

const EDITOR_MODES: EditorMode[] = ['bubble', '2d', '3d', 'view']

function resolveMode(value: string | null): EditorMode {
  return EDITOR_MODES.includes(value as EditorMode) ? (value as EditorMode) : 'bubble'
}

export function useEditorPage(initialDraft?: EditorDraftSnapshot) {
  const { projectId } = useParams<{ projectId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const mode = resolveMode(searchParams.get('mode'))

  const { containerRef, stageSize } = useStageSize()

  const {
    bubbles,
    selectedId,
    previousSelectedId,
    handleBubbleSelect: selectBubble,
    handleBubbleDrag: dragBubble,
    handleLabelChange: changeBubbleLabel,
    handleTypeChange: changeBubbleType,
    handleWidthChange: changeBubbleWidth,
    handleHeightChange: changeBubbleHeight,
    handleRatioChange: changeBubbleRatio,
    handleColorChange: changeBubbleColor,
    addBubble,
    deleteBubble: removeBubble,
  } = useBubbles(initialDraft?.bubbles)

  const {
    connections,
    isModalOpen: isLineStyleModalOpen,
    selectedStyle: selectedLineStyle,
    connectionPair: lineConnectionPair,
    openModal,
    confirmModal: applyLineStyleModal,
    closeModal: closeLineStyleModal,
    setSelectedStyle,
    removeConnectionsForBubble,
  } = useConnections(initialDraft?.connections)

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
    confirmModal: applyZoningModal,
    deleteZone: removeZone,
  } = useZones(bubbles, initialDraft?.zones)

  const { panelOffsets, panelOpenState, panelHeights, panelWidths, startDrag, startResize, togglePanel } = usePanels(mode)

  const {
    isGenerated: isFloorPlanGenerated,
    isGenerating: isFloorPlanGenerating,
    layers: floorLayers,
    activeLayerId: activeFloorLayerId,
    activeRooms: floorRooms,
    generateFloorPlan,
    refreshFloorPlan,
    addFloorLayer: appendFloorLayer,
    setActiveLayerId: selectActiveFloorLayerId,
  } = useFloorPlan({
    initialIsGenerated: initialDraft?.isFloorPlanGenerated,
    initialLayers: initialDraft?.floorLayers,
    initialActiveLayerId: initialDraft?.activeFloorLayerId,
  })

  useEffect(() => {
    if (isFloorPlanGenerated && bubbles.length > 0 && stageSize.width > 0) {
      refreshFloorPlan(bubbles, connections, stageSize.width, stageSize.height)
    }
  }, [bubbles, connections, stageSize.width, stageSize.height, isFloorPlanGenerated, refreshFloorPlan])

  useEffect(() => {
    if (!isFloorPlanGenerated && bubbles.length > 0 && stageSize.width > 0) {
      generateFloorPlan(bubbles, connections, stageSize.width, stageSize.height)
    }
  }, [isFloorPlanGenerated, bubbles, connections, stageSize.width, stageSize.height, generateFloorPlan])

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
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [autosaveReady, setAutosaveReady] = useState(false)

  const localVersionRef = useRef(initialDraft ? 1 : 0)
  const previousSnapshotRef = useRef<string | null>(null)
  const hasUserEditedRef = useRef(false)
  const localSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectedBubble = useMemo(
    () => bubbles.find((bubble) => bubble.id === selectedId) ?? null,
    [bubbles, selectedId],
  )

  const selectedBubbleConnections = useMemo(() => {
    if (!selectedId) return []

    return connections
      .filter((connection) => connection.from === selectedId || connection.to === selectedId)
      .map((connection) => {
        const targetId = connection.from === selectedId ? connection.to : connection.from
        const targetBubble = bubbles.find((bubble) => bubble.id === targetId)
        return { targetId, targetLabel: targetBubble?.label ?? targetId, style: connection.type }
      })
  }, [bubbles, connections, selectedId])

  const autoZones = useMemo(() => zones.filter((zone) => zone.source === 'auto'), [zones])
  const manualZones = useMemo(() => zones.filter((zone) => zone.source === 'manual'), [zones])

  const selectedBubbleZones = useMemo(() => {
    if (!selectedId) return []

    return zones
      .filter((zone) => zone.bubbleIds.includes(selectedId))
      .map((zone) => ({ id: zone.id, name: zone.name, color: zone.color, source: zone.source }))
  }, [selectedId, zones])

  const zoningListItems = useMemo(() => [...autoZones, ...manualZones], [autoZones, manualZones])

  const sitePoints = useMemo(
    () => centerSitePoints(SITE_RAW_POINTS, stageSize.width, stageSize.height),
    [stageSize.width, stageSize.height],
  )

  const draftSnapshot = useMemo<EditorDraftSnapshot>(
    () => ({
      bubbles,
      connections,
      zones,
      floorLayers,
      activeFloorLayerId,
      isFloorPlanGenerated,
    }),
    [bubbles, connections, zones, floorLayers, activeFloorLayerId, isFloorPlanGenerated],
  )

  useEffect(() => {
    return () => {
      if (localSaveTimerRef.current !== null) {
        clearTimeout(localSaveTimerRef.current)
      }
    }
  }, [])

  // projectId가 바뀔 때만 실행: 저장 버전 로드 및 autosave 준비 완료 신호
  useEffect(() => {
    let isCancelled = false

    setAutosaveReady(false)
    previousSnapshotRef.current = null

    if (!projectId) {
      setAutosaveReady(true)
      return () => {
        isCancelled = true
      }
    }

    void getDraft(projectId)
      .then((draft) => {
        if (isCancelled) return
        localVersionRef.current = draft?.versionNo ?? 0
        setAutosaveReady(true)
      })
      .catch(() => {
        if (isCancelled) return
        setAutosaveReady(true)
      })

    return () => {
      isCancelled = true
    }
  }, [projectId])

  useEffect(() => {
    if (!projectId || !autosaveReady) return

    const serializedSnapshot = JSON.stringify(draftSnapshot)

    // 최초 준비 시: 현재 스냅샷을 기준선으로만 설정하고 저장은 건너뜀
    if (previousSnapshotRef.current === null) {
      previousSnapshotRef.current = serializedSnapshot
      return
    }

    if (previousSnapshotRef.current === serializedSnapshot) return

    previousSnapshotRef.current = serializedSnapshot
    if (!hasUserEditedRef.current) return

    const nextVersionNo = localVersionRef.current + 1
    const draftRecord: EditorDraftRecord = {
      projectId,
      versionNo: nextVersionNo,
      data: draftSnapshot,
      savedAt: new Date().toISOString(),
    }

    localVersionRef.current = nextVersionNo

    if (localSaveTimerRef.current !== null) {
      clearTimeout(localSaveTimerRef.current)
    }

    localSaveTimerRef.current = setTimeout(() => {
      setSaveStatus('saving-local')

      void setDraft(projectId, draftRecord)
        .then(() => {
          setSaveStatus('saved-local')
        })
        .catch(() => {
          setSaveStatus('error')
        })
    }, 1000)
  }, [draftSnapshot, projectId, autosaveReady])

  const markLocalDraftDirty = () => {
    hasUserEditedRef.current = true
    setSaveStatus('dirty')
  }

  const setMode = (nextMode: EditorMode) => {
    setSearchParams({ mode: nextMode })
    if (nextMode !== '2d') setIsCollaborationMode(false)
    setIsLibraryOpen(false)
  }

  const handleBubbleDrag = (id: string, x: number, y: number) => {
    markLocalDraftDirty()
    dragBubble(id, x, y)
  }

  const handleLabelChange = (id: string, label: string) => {
    markLocalDraftDirty()
    changeBubbleLabel(id, label)
  }

  const handleTypeChange = (id: string, type: string) => {
    markLocalDraftDirty()
    changeBubbleType(id, type)
  }

  const handleWidthChange = (id: string, width: number) => {
    markLocalDraftDirty()
    changeBubbleWidth(id, width)
  }

  const handleHeightChange = (id: string, height: number) => {
    markLocalDraftDirty()
    changeBubbleHeight(id, height)
  }

  const handleRatioChange = (id: string, ratio: number) => {
    markLocalDraftDirty()
    changeBubbleRatio(id, ratio)
  }

  const handleColorChange = (id: string, color: string) => {
    markLocalDraftDirty()
    changeBubbleColor(id, color)
  }

  const handleOpenAddModal = () => {
    setAddSpaceFormData(INITIAL_ADD_SPACE_FORM)
    setIsAddModalOpen(true)
  }

  const handleConfirmAddSpace = () => {
    markLocalDraftDirty()
    addBubble(addSpaceFormData)
    setIsAddModalOpen(false)
  }

  const handleOpenLineStyleModal = () => {
    openModal(selectedId, previousSelectedId)
  }

  const confirmLineStyleModal = () => {
    if (applyLineStyleModal()) markLocalDraftDirty()
  }

  const handleToggleCollaboration = () => {
    setIsCollaborationMode((prev) => {
      if (!prev) {
        setCollaborationTab('history')
        setSelectedPinId(null)
      }
      return !prev
    })
  }

  const handlePinClick = (pinId: string) => {
    setSelectedPinId(pinId)
    setCollaborationTab('thread')
  }

  const getBubbleLabel = (bubbleId: string) =>
    bubbles.find((bubble) => bubble.id === bubbleId)?.label ?? bubbleId

  const handleDeleteBubble = (id: string) => {
    markLocalDraftDirty()
    removeBubble(id)
    removeConnectionsForBubble(id)
  }

  const confirmZoningModal = () => {
    if (applyZoningModal()) markLocalDraftDirty()
  }

  const deleteZone = (zoneId: string) => {
    markLocalDraftDirty()
    removeZone(zoneId)
  }

  const handleGenerateFloorPlan = () => {
    markLocalDraftDirty()
    generateFloorPlan(bubbles, connections, stageSize.width, stageSize.height)
  }

  const addFloorLayer = () => {
    markLocalDraftDirty()
    appendFloorLayer()
  }

  const setActiveFloorLayerId = (layerId: string | null) => {
    markLocalDraftDirty()
    selectActiveFloorLayerId(layerId)
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
    mode,
    setMode,
    containerRef,
    stageSize,
    sitePoints,
    bubbles,
    selectedId,
    selectedBubble,
    handleBubbleSelect: selectBubble,
    handleBubbleDrag,
    handleLabelChange,
    handleTypeChange,
    handleWidthChange,
    handleHeightChange,
    handleRatioChange,
    handleColorChange,
    handleDeleteBubble,
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
    panelOffsets,
    panelOpenState,
    panelHeights,
    panelWidths,
    startDrag,
    startResize,
    togglePanel,
    isAddModalOpen,
    addSpaceFormData,
    setAddSpaceFormData,
    handleOpenAddModal,
    handleConfirmAddSpace,
    onCloseAddModal: () => setIsAddModalOpen(false),
    isCollaborationMode,
    selectedPinId,
    setSelectedPinId,
    collaborationTab,
    setCollaborationTab,
    handleToggleCollaboration,
    handlePinClick,
    zoom,
    handleZoomIn,
    handleZoomOut,
    handleZoomChange,
    setZoom,
    isLibraryOpen,
    setIsLibraryOpen,
    isFloorPlanGenerated,
    isFloorPlanGenerating,
    floorLayers,
    activeFloorLayerId,
    floorRooms,
    handleGenerateFloorPlan,
    addFloorLayer,
    setActiveFloorLayerId,
    isGridVisible,
    toggleGrid,
    saveStatus,
    selectedTool,
    setSelectedTool,
    isInviteModalOpen,
    handleOpenInviteModal: () => setIsInviteModalOpen(true),
    onCloseInviteModal: () => setIsInviteModalOpen(false),
    isExportModalOpen,
    handleOpenExportModal: () => setIsExportModalOpen(true),
    onCloseExportModal: () => setIsExportModalOpen(false),
    isExportSelectionModalOpen,
    handleOpenExportSelectionModal: () => setIsExportSelectionModalOpen(true),
    onCloseExportSelectionModal: () => setIsExportSelectionModalOpen(false),
    isIFCExportModalOpen,
    handleOpenIFCExportModal: () => setIsIFCExportModalOpen(true),
    onCloseIFCExportModal: () => setIsIFCExportModalOpen(false),
    draftSnapshot,
  }
}

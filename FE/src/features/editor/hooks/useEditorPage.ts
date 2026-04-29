import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import type {
  AddSpaceFormData,
  BubbleHistoryEntry,
  BubbleHistorySnapshot,
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
import { createBubbleFromFormData, updateBubbleDimensions, updateBubbleRatio } from '../utils/bubbleState'
import { getDraft, setDraft } from '../lib/draftDb'

const EDITOR_MODES: EditorMode[] = ['bubble', '2d', '3d', 'view']
const MAX_BUBBLE_HISTORY = 10

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
    replaceBubbleState,
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
    replaceConnectionsState,
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
    replaceZonesState,
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
    replaceFloorPlanState,
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
    // Only auto-generate on initial availability; later geometry updates use refreshFloorPlan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFloorPlanGenerated, bubbles.length, stageSize.width])

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
  const [autosaveReadyProjectId, setAutosaveReadyProjectId] = useState<string | null>(null)
  const [undoHistory, setUndoHistory] = useState<BubbleHistoryEntry[]>([])
  const [redoHistory, setRedoHistory] = useState<BubbleHistoryEntry[]>([])

  const localVersionRef = useRef(initialDraft ? 1 : 0)
  const previousSnapshotRef = useRef<string | null>(null)
  const hasUserEditedRef = useRef(false)
  const localSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bubbleDragStartSnapshotRef = useRef<BubbleHistorySnapshot | null>(null)

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

  const canUndo = undoHistory.length > 0
  const canRedo = redoHistory.length > 0

  const createBubbleHistorySnapshot = (
    overrides?: Partial<Pick<BubbleHistorySnapshot, 'bubbles' | 'connections' | 'selectedId' | 'previousSelectedId'>>,
  ): BubbleHistorySnapshot => ({
    bubbles: overrides?.bubbles ?? bubbles,
    connections: overrides?.connections ?? connections,
    selectedId: overrides?.selectedId ?? selectedId,
    previousSelectedId: overrides?.previousSelectedId ?? previousSelectedId,
  })

  const applyBubbleHistorySnapshot = (snapshot: BubbleHistorySnapshot) => {
    replaceBubbleState(snapshot.bubbles, {
      selectedId: snapshot.selectedId,
      previousSelectedId: snapshot.previousSelectedId,
    })
    replaceConnectionsState(snapshot.connections)
  }

  const pushBubbleHistory = (entry: BubbleHistoryEntry) => {
    setUndoHistory((prev) => [...prev.slice(-(MAX_BUBBLE_HISTORY - 1)), entry])
    setRedoHistory([])
  }

  useEffect(() => {
    return () => {
      if (localSaveTimerRef.current !== null) {
        clearTimeout(localSaveTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    let isCancelled = false

    setAutosaveReadyProjectId(null)
    setSaveStatus('idle')
    previousSnapshotRef.current = null

    if (!projectId) {
      return () => {
        isCancelled = true
      }
    }

    if (initialDraft) {
      previousSnapshotRef.current = JSON.stringify(initialDraft)
      setUndoHistory([])
      setRedoHistory([])
      setAutosaveReadyProjectId(projectId)
      return () => {
        isCancelled = true
      }
    }

    void getDraft(projectId)
      .then((draft) => {
        if (isCancelled) return

        if (draft?.data) {
          const { data } = draft
          previousSnapshotRef.current = JSON.stringify(data)

          replaceBubbleState(data.bubbles, {
            selectedId: data.bubbles[0]?.id ?? null,
            previousSelectedId: null,
          })
          replaceConnectionsState(data.connections)
          replaceZonesState(data.zones)
          replaceFloorPlanState({
            isGenerated: data.isFloorPlanGenerated,
            layers: data.floorLayers,
            activeLayerId: data.activeFloorLayerId,
          })
        }

        localVersionRef.current = draft?.versionNo ?? 0
        setUndoHistory(draft?.history?.bubbleUndoHistory ?? [])
        setRedoHistory(draft?.history?.bubbleRedoHistory ?? [])
        setAutosaveReadyProjectId(projectId)
      })
      .catch(() => {
        if (isCancelled) return
        setUndoHistory([])
        setRedoHistory([])
        setAutosaveReadyProjectId(projectId)
      })

    return () => {
      isCancelled = true
    }
  }, [
    initialDraft,
    projectId,
    replaceBubbleState,
    replaceConnectionsState,
    replaceFloorPlanState,
    replaceZonesState,
  ])

  useEffect(() => {
    if (!projectId || autosaveReadyProjectId !== projectId) return

    const serializedSnapshot = JSON.stringify(draftSnapshot)

    if (previousSnapshotRef.current === null) {
      previousSnapshotRef.current = serializedSnapshot
      if (!hasUserEditedRef.current) return
    }

    if (previousSnapshotRef.current === serializedSnapshot) return

    previousSnapshotRef.current = serializedSnapshot
    if (!hasUserEditedRef.current) return

    const nextVersionNo = localVersionRef.current + 1
    const draftRecord: EditorDraftRecord = {
      projectId,
      versionNo: nextVersionNo,
      data: draftSnapshot,
      history: {
        bubbleUndoHistory: undoHistory,
        bubbleRedoHistory: redoHistory,
      },
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
  }, [draftSnapshot, projectId, autosaveReadyProjectId, undoHistory, redoHistory])

  const markLocalDraftDirty = () => {
    hasUserEditedRef.current = true
    setSaveStatus('dirty')
  }

  const setMode = (nextMode: EditorMode) => {
    setSearchParams({ mode: nextMode })
    if (nextMode !== '2d') setIsCollaborationMode(false)
    setIsLibraryOpen(false)
  }

  const handleUndo = () => {
    const entry = undoHistory[undoHistory.length - 1]
    if (!entry) return

    markLocalDraftDirty()
    applyBubbleHistorySnapshot(entry.undo)
    setUndoHistory((prev) => prev.slice(0, -1))
    setRedoHistory((prev) => [...prev.slice(-(MAX_BUBBLE_HISTORY - 1)), entry])
  }

  const handleRedo = () => {
    const entry = redoHistory[redoHistory.length - 1]
    if (!entry) return

    markLocalDraftDirty()
    applyBubbleHistorySnapshot(entry.redo)
    setRedoHistory((prev) => prev.slice(0, -1))
    setUndoHistory((prev) => [...prev.slice(-(MAX_BUBBLE_HISTORY - 1)), entry])
  }

  const handleBubbleDragStart = () => {
    bubbleDragStartSnapshotRef.current = createBubbleHistorySnapshot()
  }

  const handleBubbleDrag = (id: string, x: number, y: number) => {
    dragBubble(id, x, y)
  }

  const handleBubbleDragEnd = (id: string, x: number, y: number) => {
    const dragStartSnapshot = bubbleDragStartSnapshotRef.current
    bubbleDragStartSnapshotRef.current = null

    const nextBubbles = bubbles.map((bubble) => (bubble.id === id ? { ...bubble, x, y } : bubble))
    const previousBubble = dragStartSnapshot?.bubbles.find((bubble) => bubble.id === id)
    const nextBubble = nextBubbles.find((bubble) => bubble.id === id)

    if (!dragStartSnapshot || !previousBubble || !nextBubble) return
    if (previousBubble.x === nextBubble.x && previousBubble.y === nextBubble.y) return

    markLocalDraftDirty()
    replaceBubbleState(nextBubbles, {
      selectedId,
      previousSelectedId,
    })
    pushBubbleHistory({
      undo: dragStartSnapshot,
      redo: createBubbleHistorySnapshot({ bubbles: nextBubbles }),
    })
  }

  const handleLabelChange = (id: string, label: string) => {
    const nextBubbles = bubbles.map((bubble) => (bubble.id === id ? { ...bubble, label } : bubble))
    const currentBubble = bubbles.find((bubble) => bubble.id === id)
    if (!currentBubble || currentBubble.label === label) return

    markLocalDraftDirty()
    changeBubbleLabel(id, label)
    pushBubbleHistory({
      undo: createBubbleHistorySnapshot(),
      redo: createBubbleHistorySnapshot({ bubbles: nextBubbles }),
    })
  }

  const handleTypeChange = (id: string, type: string) => {
    const nextBubbles = bubbles.map((bubble) => (bubble.id === id ? { ...bubble, type } : bubble))
    const currentBubble = bubbles.find((bubble) => bubble.id === id)
    if (!currentBubble || currentBubble.type === type) return

    markLocalDraftDirty()
    changeBubbleType(id, type)
    pushBubbleHistory({
      undo: createBubbleHistorySnapshot(),
      redo: createBubbleHistorySnapshot({ bubbles: nextBubbles }),
    })
  }

  const handleWidthChange = (id: string, width: number) => {
    const currentBubble = bubbles.find((bubble) => bubble.id === id)
    if (!currentBubble) return

    const nextBubbles = bubbles.map((bubble) =>
      bubble.id === id ? updateBubbleDimensions(bubble, 'width', width) : bubble,
    )
    const nextBubble = nextBubbles.find((bubble) => bubble.id === id)
    if (!nextBubble || nextBubble.widthMm === currentBubble.widthMm) return

    markLocalDraftDirty()
    changeBubbleWidth(id, width)
    pushBubbleHistory({
      undo: createBubbleHistorySnapshot(),
      redo: createBubbleHistorySnapshot({ bubbles: nextBubbles }),
    })
  }

  const handleHeightChange = (id: string, height: number) => {
    const currentBubble = bubbles.find((bubble) => bubble.id === id)
    if (!currentBubble) return

    const nextBubbles = bubbles.map((bubble) =>
      bubble.id === id ? updateBubbleDimensions(bubble, 'height', height) : bubble,
    )
    const nextBubble = nextBubbles.find((bubble) => bubble.id === id)
    if (!nextBubble || nextBubble.heightMm === currentBubble.heightMm) return

    markLocalDraftDirty()
    changeBubbleHeight(id, height)
    pushBubbleHistory({
      undo: createBubbleHistorySnapshot(),
      redo: createBubbleHistorySnapshot({ bubbles: nextBubbles }),
    })
  }

  const handleRatioChange = (id: string, ratio: number) => {
    const currentBubble = bubbles.find((bubble) => bubble.id === id)
    if (!currentBubble) return

    const nextBubbles = bubbles.map((bubble) =>
      bubble.id === id ? updateBubbleRatio(bubble, ratio) : bubble,
    )
    const nextBubble = nextBubbles.find((bubble) => bubble.id === id)
    if (!nextBubble || nextBubble.ratio === currentBubble.ratio) return

    markLocalDraftDirty()
    changeBubbleRatio(id, ratio)
    pushBubbleHistory({
      undo: createBubbleHistorySnapshot(),
      redo: createBubbleHistorySnapshot({ bubbles: nextBubbles }),
    })
  }

  const handleColorChange = (id: string, color: string) => {
    const currentBubble = bubbles.find((bubble) => bubble.id === id)
    if (!currentBubble || currentBubble.color === color) return

    const nextBubbles = bubbles.map((bubble) => (bubble.id === id ? { ...bubble, color } : bubble))
    markLocalDraftDirty()
    changeBubbleColor(id, color)
    pushBubbleHistory({
      undo: createBubbleHistorySnapshot(),
      redo: createBubbleHistorySnapshot({ bubbles: nextBubbles }),
    })
  }

  const handleOpenAddModal = () => {
    setAddSpaceFormData(INITIAL_ADD_SPACE_FORM)
    setIsAddModalOpen(true)
  }

  const handleConfirmAddSpace = () => {
    const newBubble = createBubbleFromFormData(addSpaceFormData, bubbles.length)
    markLocalDraftDirty()
    addBubble(addSpaceFormData, newBubble)
    pushBubbleHistory({
      undo: createBubbleHistorySnapshot(),
      redo: createBubbleHistorySnapshot({ bubbles: [...bubbles, newBubble] }),
    })
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
    const nextBubbles = bubbles.filter((bubble) => bubble.id !== id)
    const nextConnections = connections.filter((connection) => connection.from !== id && connection.to !== id)

    if (nextBubbles.length === bubbles.length) return

    markLocalDraftDirty()
    removeBubble(id)
    removeConnectionsForBubble(id)
    pushBubbleHistory({
      undo: createBubbleHistorySnapshot(),
      redo: createBubbleHistorySnapshot({
        bubbles: nextBubbles,
        connections: nextConnections,
        selectedId: selectedId === id ? null : selectedId,
      }),
    })
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
    handleBubbleDragStart,
    handleBubbleDrag,
    handleBubbleDragEnd,
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
    canUndo,
    canRedo,
    handleUndo,
    handleRedo,
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
  }
}

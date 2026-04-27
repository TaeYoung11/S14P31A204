import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { AddSpaceFormData, EditorMode, ZoneData } from '../types'
import { INITIAL_ADD_SPACE_FORM, SITE_RAW_POINTS } from '../constants'
import { useBubbles } from './useBubbles'
import { useConnections } from './useConnections'
import { usePanels } from './usePanels'
import { useStageSize } from './useStageSize'
import { useZones } from './useZones'
import { centerSitePoints } from '../utils/bubbleCalc'

const EDITOR_MODES: EditorMode[] = ['bubble', '2d', '3d']

function resolveMode(value: string | null): EditorMode {
  return EDITOR_MODES.includes(value as EditorMode) ? (value as EditorMode) : 'bubble'
}

/** EditorPage의 모든 비즈니스 로직과 상태를 관리하는 훅 */
export function useEditorPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const mode = resolveMode(searchParams.get('mode'))

  const { containerRef, stageSize } = useStageSize()

  const bubblesHook = useBubbles()
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
  } = bubblesHook

  const connectionsHook = useConnections()
  const {
    connections,
    isModalOpen: isLineStyleModalOpen,
    selectedStyle: selectedLineStyle,
    connectionPair: lineConnectionPair,
    openModal,
    confirmModal: confirmLineStyleModal,
    closeModal: closeLineStyleModal,
    setSelectedStyle,
  } = connectionsHook

  const zonesHook = useZones(bubbles)
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
  } = zonesHook

  const panelsHook = usePanels(mode)
  const { panelOffsets, panelOpenState, panelHeights, panelWidths, startDrag, startResize, togglePanel } = panelsHook

  // UI 전용 상태
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [addSpaceFormData, setAddSpaceFormData] = useState<AddSpaceFormData>(INITIAL_ADD_SPACE_FORM)
  const [isCollaborationMode, setIsCollaborationMode] = useState(false)
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null)
  const [collaborationTab, setCollaborationTab] = useState<'history' | 'thread'>('history')

  // 파생 상태
  const selectedBubble = useMemo(
    () => bubbles.find((bubble) => bubble.id === selectedId) ?? null,
    [bubbles, selectedId]
  )

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

  const selectedBubbleZones = useMemo(() => {
    if (!selectedId) return []
    return zones
      .filter((z) => z.bubbleIds.includes(selectedId))
      .map((z) => ({ id: z.id, name: z.name, color: z.color, source: z.source }))
  }, [selectedId, zones])

  const zoningListItems = useMemo(() => [...autoZones, ...manualZones], [autoZones, manualZones])

  const sitePoints = useMemo(
    () => centerSitePoints(SITE_RAW_POINTS, stageSize.width, stageSize.height),
    [stageSize.height, stageSize.width]
  )

  // 핸들러
  const setMode = (nextMode: EditorMode) => {
    setSearchParams({ mode: nextMode })
    if (nextMode !== '2d') setIsCollaborationMode(false)
  }

  const handleOpenAddModal = () => {
    setAddSpaceFormData(INITIAL_ADD_SPACE_FORM)
    setIsAddModalOpen(true)
  }

  const handleConfirmAddSpace = () => {
    addBubble(addSpaceFormData)
    setIsAddModalOpen(false)
  }

  const handleOpenLineStyleModal = () => {
    openModal(selectedId, previousSelectedId)
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
    bubbles.find((b) => b.id === bubbleId)?.label ?? bubbleId

  return {
    // 모드
    mode,
    setMode,
    // 캔버스
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
    // 패널
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
  }
}

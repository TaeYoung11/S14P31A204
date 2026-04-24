import { useMemo, useState } from 'react'
import { Hand, ZoomIn, ZoomOut } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { AddSpaceModal } from './components/AddSpaceModal'
import { BubbleCanvas } from './components/BubbleCanvas'
import EditorHeader from './components/EditorHeader'
import EditorLeftSidebar from './components/EditorLeftSidebar'
import { EditorRightPanels } from './components/EditorRightPanels'
import EditorToolbar from './components/EditorToolbar'
import { LineStyleModal } from './components/LineStyleModal'
import { ZoningModal } from './components/ZoningModal'
import { INITIAL_ADD_SPACE_FORM, SITE_RAW_POINTS } from './constants'
import { useBubbles } from './hooks/useBubbles'
import { useConnections } from './hooks/useConnections'
import { usePanels } from './hooks/usePanels'
import { useStageSize } from './hooks/useStageSize'
import { useZones } from './hooks/useZones'
import type { AddSpaceFormData, EditorMode } from './types'
import { centerSitePoints } from './utils/bubbleCalc'

const EDITOR_MODES: EditorMode[] = ['bubble', '2d', '3d']

function resolveMode(value: string | null): EditorMode {
  return EDITOR_MODES.includes(value as EditorMode) ? (value as EditorMode) : 'bubble'
}

export default function EditorPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const mode = resolveMode(searchParams.get('mode'))

  const { containerRef, stageSize } = useStageSize()
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
  } = useBubbles()
  const {
    connections,
    isModalOpen: isLineStyleModalOpen,
    selectedStyle: selectedLineStyle,
    connectionPair: lineConnectionPair,
    openModal,
    confirmModal,
    closeModal,
    setSelectedStyle,
  } = useConnections()
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
  const {
    panelOffsets,
    panelOpenState,
    panelHeights,
    panelWidths,
    startDrag,
    startResize,
    togglePanel,
  } = usePanels(mode)

  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [addSpaceFormData, setAddSpaceFormData] = useState<AddSpaceFormData>(INITIAL_ADD_SPACE_FORM)

  const selectedBubble = useMemo(
    () => bubbles.find((bubble) => bubble.id === selectedId) ?? null,
    [bubbles, selectedId]
  )

  const selectedBubbleConnections = useMemo(() => {
    if (!selectedId) return []

    return connections
      .filter((connection) => connection.from === selectedId || connection.to === selectedId)
      .map((connection) => {
        const targetId = connection.from === selectedId ? connection.to : connection.from
        const targetBubble = bubbles.find((bubble) => bubble.id === targetId)
        return {
          targetId,
          targetLabel: targetBubble?.label ?? targetId,
          style: connection.type,
        }
      })
  }, [bubbles, connections, selectedId])

  const autoZones = useMemo(() => zones.filter((zone) => zone.source === 'auto'), [zones])
  const manualZones = useMemo(() => zones.filter((zone) => zone.source === 'manual'), [zones])

  const selectedBubbleZones = useMemo(() => {
    if (!selectedId) return []
    return zones
      .filter((zone) => zone.bubbleIds.includes(selectedId))
      .map((zone) => ({
        id: zone.id,
        name: zone.name,
        color: zone.color,
        source: zone.source,
      }))
  }, [selectedId, zones])

  const zoningListItems = useMemo(() => [...autoZones, ...manualZones], [autoZones, manualZones])

  const sitePoints = useMemo(
    () => centerSitePoints(SITE_RAW_POINTS, stageSize.width, stageSize.height),
    [stageSize.height, stageSize.width]
  )

  const setMode = (nextMode: EditorMode) => {
    setSearchParams({ mode: nextMode })
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

  const getBubbleLabel = (bubbleId: string) => bubbles.find((bubble) => bubble.id === bubbleId)?.label ?? bubbleId

  return (
    <div className="flex flex-col h-screen w-screen bg-[#F0F2F9] text-[#1D1E20] overflow-hidden font-sans">
      <AddSpaceModal
        isOpen={isAddModalOpen}
        formData={addSpaceFormData}
        onClose={() => setIsAddModalOpen(false)}
        onConfirm={handleConfirmAddSpace}
        onChange={setAddSpaceFormData}
      />

      <ZoningModal
        isOpen={isZoningModalOpen}
        isEditing={Boolean(editingZoneId)}
        formData={zoningFormData}
        bubbles={bubbles}
        autoColorPreview={zoningAutoColorPreview}
        onClose={closeZoningModal}
        onConfirm={confirmZoningModal}
        onChange={setZoningFormData}
        onToggleBubble={toggleZoningBubble}
      />

      <LineStyleModal
        isOpen={isLineStyleModalOpen}
        lineConnectionPair={lineConnectionPair}
        selectedStyle={selectedLineStyle}
        onClose={closeModal}
        onConfirm={confirmModal}
        onChangeStyle={setSelectedStyle}
        getBubbleLabel={getBubbleLabel}
      />

      <EditorHeader />
      <EditorToolbar mode={mode} onModeChange={setMode} />

      <div className="flex flex-1 relative overflow-hidden px-6 pb-6 gap-6">
        <EditorLeftSidebar
          isLineStyleModalOpen={isLineStyleModalOpen}
          onAddSpace={handleOpenAddModal}
          onLineStyle={handleOpenLineStyleModal}
        />

        <main
          ref={containerRef}
          className="flex-1 bg-white border border-[#E2E6EF] rounded-3xl shadow-sm relative overflow-hidden"
        >
          {mode === 'bubble' ? (
            <BubbleCanvas
              stageSize={stageSize}
              sitePoints={sitePoints}
              bubbles={bubbles}
              connections={connections}
              autoZones={autoZones}
              manualZones={manualZones}
              selectedId={selectedId}
              onEditZone={openEditModal}
              onBubbleDrag={handleBubbleDrag}
              onBubbleSelect={handleBubbleSelect}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[#ADB5BD] font-medium opacity-50 text-center px-10 whitespace-pre-line">
              {mode === '2d' && '2D 평면도 캔버스\n(준비 중...)'}
              {mode === '3d' && '3D 뷰어 캔버스\n(준비 중...)'}
            </div>
          )}

          <div className="absolute bottom-6 left-6 flex items-center bg-white border border-[#E2E6EF] rounded-2xl px-2 py-2 shadow-md z-10">
            <button className="p-2.5 text-[#6B7A99] hover:text-[#1C1C1E] transition-colors rounded-xl hover:bg-[#F0F2F9]">
              <ZoomOut size={20} />
            </button>
            <span className="text-[13px] font-semibold text-[#1C1C1E] min-w-[52px] text-center select-none">100%</span>
            <button className="p-2.5 text-[#6B7A99] hover:text-[#1C1C1E] transition-colors rounded-xl hover:bg-[#F0F2F9]">
              <ZoomIn size={20} />
            </button>
            <div className="w-px h-5 bg-[#E2E6EF] mx-2" />
            <button className="p-2.5 text-[#6B7A99] hover:text-[#1C1C1E] transition-colors rounded-xl hover:bg-[#F0F2F9]">
              <Hand size={20} />
            </button>
          </div>
        </main>

        <EditorRightPanels
          mode={mode}
          selectedBubble={selectedBubble}
          selectedBubbleConnections={selectedBubbleConnections}
          selectedBubbleZones={selectedBubbleZones}
          zoningListItems={zoningListItems}
          panelOffsets={panelOffsets}
          panelOpenState={panelOpenState}
          panelHeights={panelHeights}
          panelWidths={panelWidths}
          onLabelChange={handleLabelChange}
          onTypeChange={handleTypeChange}
          onWidthChange={handleWidthChange}
          onHeightChange={handleHeightChange}
          onRatioChange={handleRatioChange}
          onColorChange={handleColorChange}
          onOpenZoningModal={openZoningModal}
          onOpenEditZoningModal={openEditModal}
          onDeleteZoning={deleteZone}
          onPanelDragStart={startDrag}
          onPanelResizeStart={startResize}
          onTogglePanel={togglePanel}
        />
      </div>
    </div>
  )
}

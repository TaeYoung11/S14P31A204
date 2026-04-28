import { AddSpaceModal } from '../../features/editor/components/modals/AddSpaceModal'
import { BubbleCanvas } from '../../features/editor/components/canvas/BubbleCanvas'
import { TwoDCanvas } from '../../features/editor/components/canvas/TwoDCanvas'
import { ThreeDCanvas } from '../../features/editor/components/canvas/ThreeDCanvas'
import { RealisticViewer } from '../../features/editor/components/canvas/RealisticViewer'
import { TwoDLeftPanels } from '../../features/editor/components/layout/TwoDLeftPanels'
import EditorHeader from '../../features/editor/components/layout/EditorHeader'
import EditorLeftSidebar from '../../features/editor/components/layout/EditorLeftSidebar'
import { EditorRightPanels } from '../../features/editor/components/layout/EditorRightPanels'
import EditorToolbar from '../../features/editor/components/layout/EditorToolbar'
import { ZoomControlBar } from '../../features/editor/components/layout/ZoomControlBar'
import { CollaborationModeBar } from '../../features/editor/components/layout/CollaborationModeBar'
import { LabelEditOverlay } from '../../features/editor/components/overlays/LabelEditOverlay'
import { LineStyleModal } from '../../features/editor/components/modals/LineStyleModal'
import { ZoningModal } from '../../features/editor/components/modals/ZoningModal'
import { InviteModal } from '../../features/editor/components/modals/InviteModal'
import { ExportModal } from '../../features/editor/components/modals/ExportModal'
import { ExportSelectionModal } from '../../features/editor/components/modals/ExportSelectionModal'
import { IFCExportModal } from '../../features/editor/components/modals/IFCExportModal'
import { useEditorPage } from '../../features/editor/hooks/useEditorPage'

export default function EditorPage() {
  const {
    mode, setMode,
    containerRef, stageSize, sitePoints,
    bubbles, selectedId, selectedIds, selectedBubble,
    handleBubbleSelect, handleBubbleDrag,
    handleMarqueeSelect, clearSelection, handleBubbleResize,
    handleLabelChange, handleTypeChange,
    handleWidthChange, handleHeightChange, handleRatioChange, handleColorChange,
    connections, selectedBubbleConnections,
    selectedConnectionPair,
    isLineStyleModalOpen, selectedLineStyle, lineConnectionPair,
    confirmLineStyleModal, closeLineStyleModal, setSelectedStyle,
    getBubbleLabel,
    autoZones, manualZones, selectedBubbleZones, zoningListItems,
    isZoningModalOpen, editingZoneId, zoningFormData, setZoningFormData,
    zoningAutoColorPreview, openZoningModal, openEditModal,
    closeZoningModal, toggleZoningBubble, confirmZoningModal, deleteZone,
    panelOffsets, panelOpenState, panelHeights, panelWidths,
    startDrag, startResize, togglePanel,
    isAddModalOpen, addSpaceFormData, setAddSpaceFormData,
    handleOpenAddModal, handleConfirmAddSpace, onCloseAddModal,
    handleDeleteBubble,
    isFloorPlanGenerated, isFloorPlanGenerating, floorRooms, handleGenerateFloorPlan,
    floorLayers, activeFloorLayerId, addFloorLayer, setActiveFloorLayerId,
    isCollaborationMode, selectedPinId, setSelectedPinId,
    collaborationTab, setCollaborationTab,
    handleToggleCollaboration, handlePinClick,
    zoom, handleZoomIn, handleZoomOut, handleZoomChange,
    selectedTool, handleSetSelectedTool,
    connectingFromId, handleBubbleSelectWithTool, handleConnectionClick, handleConnectionCreate,
    labelEditState, handleBubbleLabelEdit, handleEmptyCanvasDblClick, confirmLabelEdit, closeLabelEdit,
    handleWheelZoom,
    isLibraryOpen, setIsLibraryOpen,
    isGridVisible, toggleGrid,
    isInviteModalOpen, handleOpenInviteModal, onCloseInviteModal,
    isExportModalOpen, handleOpenExportModal, onCloseExportModal,
    isExportSelectionModalOpen, handleOpenExportSelectionModal, onCloseExportSelectionModal,
    isIFCExportModalOpen, handleOpenIFCExportModal, onCloseIFCExportModal,
  } = useEditorPage()

  return (
    <div className="flex flex-col h-screen w-screen bg-[#F0F2F9] text-[#1D1E20] overflow-hidden font-sans">
      <AddSpaceModal
        isOpen={isAddModalOpen}
        formData={addSpaceFormData}
        onClose={onCloseAddModal}
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
        onClose={closeLineStyleModal}
        onConfirm={confirmLineStyleModal}
        onChangeStyle={setSelectedStyle}
        getBubbleLabel={getBubbleLabel}
      />

      <InviteModal
        isOpen={isInviteModalOpen}
        onClose={onCloseInviteModal}
        onInvite={onCloseInviteModal}
      />

      {/* progress 시뮬레이션 모달 — 열릴 때마다 초기화되도록 조건부 마운트 */}
      {isExportModalOpen && (
        <ExportModal isOpen onClose={onCloseExportModal} />
      )}

      {isExportSelectionModalOpen && (
        <ExportSelectionModal
          isOpen
          onClose={onCloseExportSelectionModal}
          onStartExport={() => {
            onCloseExportSelectionModal()
            handleOpenExportModal()
          }}
        />
      )}

      {isIFCExportModalOpen && (
        <IFCExportModal isOpen onClose={onCloseIFCExportModal} />
      )}

      <EditorHeader 
        mode={mode} 
        onModeChange={setMode} 
        onOpenInvite={handleOpenInviteModal}
        onSave={mode === '3d' ? handleOpenIFCExportModal : handleOpenExportSelectionModal}
      />
      <EditorToolbar mode={mode} onModeChange={setMode} />

      <div className={`flex flex-1 relative overflow-hidden ${mode === 'view' ? '' : 'px-6 pb-6 gap-6'}`}>
        {mode !== 'view' && (
          <EditorLeftSidebar
            mode={mode}
            isLineStyleModalOpen={isLineStyleModalOpen}
            isLibraryOpen={isLibraryOpen}
            isGridVisible={isGridVisible}
            selectedTool={selectedTool}
            onToolSelect={handleSetSelectedTool}
            onAddSpace={handleOpenAddModal}
            onToggleCollaboration={handleToggleCollaboration}
            onToggleLibrary={() => setIsLibraryOpen(!isLibraryOpen)}
            onToggleGrid={toggleGrid}
            onExportIFC={handleOpenExportSelectionModal}
          />
        )}

        <main
          ref={containerRef}
          className={`flex-1 relative overflow-hidden ${
            mode === 'view' ? 'bg-[#0A0A0B]' : 'bg-white border border-[#E2E6EF] rounded-3xl shadow-sm'
          }`}
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
              selectedIds={selectedIds}
              selectedTool={selectedTool}
              connectingFromId={connectingFromId}
              onEditZone={openEditModal}
              onBubbleDrag={handleBubbleDrag}
              onBubbleSelect={handleBubbleSelectWithTool}
              onDeleteBubble={handleDeleteBubble}
              onConnectionClick={handleConnectionClick}
              selectedConnectionPair={selectedConnectionPair}
              onConnectionCreate={handleConnectionCreate}
              onBubbleLabelEdit={handleBubbleLabelEdit}
              onEmptyCanvasDblClick={handleEmptyCanvasDblClick}
              onWheelZoom={handleWheelZoom}
              onMarqueeSelect={handleMarqueeSelect}
              onClearSelection={clearSelection}
              onBubbleResize={handleBubbleResize}
              scale={zoom / 100}
            />
          ) : mode === '2d' ? (
            <TwoDCanvas
              stageSize={stageSize}
              isCollaborationMode={isCollaborationMode}
              selectedPinId={selectedPinId}
              onPinClick={handlePinClick}
              rooms={floorRooms}
              connections={connections}
              isGenerated={isFloorPlanGenerated}
              isGenerating={isFloorPlanGenerating}
              onGenerate={handleGenerateFloorPlan}
              isGridVisible={isGridVisible}
              selectedId={selectedId}
              onSelect={(id) => (id ? handleBubbleSelect(id) : clearSelection())}
              selectedTool={selectedTool}
              scale={zoom / 100}
              onWheelZoom={handleWheelZoom}
            />
          ) : mode === '3d' ? (
            <ThreeDCanvas
              isCollaborationMode={isCollaborationMode}
              isLibraryOpen={isLibraryOpen}
              onToggleLibrary={() => setIsLibraryOpen(!isLibraryOpen)}
              isGridVisible={isGridVisible}
              rooms={floorRooms}
              selectedId={selectedId}
              onSelect={(id) => (id ? handleBubbleSelect(id) : clearSelection())}
              selectedTool={selectedTool}
              scale={zoom / 100}
              onWheelZoom={handleWheelZoom}
            />
          ) : mode === 'view' ? (
            <RealisticViewer onExport={handleOpenExportSelectionModal} />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[#ADB5BD] font-medium opacity-50 text-center px-10 whitespace-pre-line">
              캔버스 준비 중...
            </div>
          )}

          {/* 인라인 라벨 편집 오버레이 — 버블 더블클릭 시 표시 */}
          {mode === 'bubble' && labelEditState && (
            <LabelEditOverlay
              info={labelEditState}
              onConfirm={confirmLabelEdit}
              onCancel={closeLabelEdit}
            />
          )}

          {mode === '2d' && !isCollaborationMode && (
            <TwoDLeftPanels
              layers={floorLayers}
              activeLayerId={activeFloorLayerId}
              isGenerated={isFloorPlanGenerated}
              onAddLayer={addFloorLayer}
              onSelectLayer={setActiveFloorLayerId}
            />
          )}

          {mode !== 'view' && (
            <ZoomControlBar
              zoom={zoom}
              mode={mode}
              selectedTool={selectedTool}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onSetZoom={handleZoomChange}
              onSetTool={handleSetSelectedTool}
            />
          )}

          {(mode === '2d' || mode === '3d') && isCollaborationMode && (
            <CollaborationModeBar onToggle={handleToggleCollaboration} />
          )}
        </main>

        {mode !== 'view' && (
          <EditorRightPanels
            mode={mode}
            isCollaborationMode={isCollaborationMode}
            collaborationTab={collaborationTab}
            onCollaborationTabChange={setCollaborationTab}
            selectedPinId={selectedPinId}
            onSelectPin={setSelectedPinId}
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
            floorLayers={floorLayers}
            activeFloorLayerId={activeFloorLayerId}
            isFloorPlanGenerated={isFloorPlanGenerated}
            onAddFloorLayer={addFloorLayer}
            onSelectFloorLayer={setActiveFloorLayerId}
            onOpenZoningModal={openZoningModal}
            onOpenEditZoningModal={openEditModal}
            onDeleteZoning={deleteZone}
            onPanelDragStart={startDrag}
            onPanelResizeStart={startResize}
            onTogglePanel={togglePanel}
          />
        )}
      </div>
    </div>
  )
}

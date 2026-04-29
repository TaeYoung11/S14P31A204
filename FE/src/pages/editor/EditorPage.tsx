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
    bubbles, selectedId, selectedIds, selectedBubble, selectedFloorWall, selectedFloorOpening,
    handleBubbleSelect, handleBubbleDrag,
    handleMarqueeSelect, handleTwoDMarqueeSelect, clearSelection, hasDeletableSelection, handleDeleteSelected, handleBubbleResize,
    handleLabelChange, handleTypeChange,
    handleWidthChange, handleHeightChange, handleWidthCommit, handleHeightCommit, handleRatioChange, handleColorChange, handleMaterialChange,
    connections, floorPlanConnections, selectedBubbleConnections,
    selectedConnectionPair,
    isLineStyleModalOpen, selectedLineStyle, lineConnectionPair,
    confirmLineStyleModal, closeLineStyleModal, setSelectedStyle,
    getBubbleLabel,
    autoZones, manualZones, selectedBubbleZones, zoningListItems,
    isZoningModalOpen, editingZoneId, zoningFormData, setZoningFormData,
    zoningAutoColorPreview, openZoningModal, openEditModal,
    closeZoningModal, toggleZoningBubble, confirmZoningModal, deleteZone,
    panelOffsets, panelOpenState, panelHeights, panelWidths, panelZIndexes,
    startDrag, startResize, togglePanel, resetPanelPositions,
    isAddModalOpen, addSpaceFormData, setAddSpaceFormData,
    handleOpenAddModal, handleConfirmAddSpace, onCloseAddModal,
    handleDeleteBubble,
    isFloorPlanGenerated, isFloorPlanGenerating, floorRooms, handleGenerateFloorPlan,
    isBubbleReadOnly,
    floorWallsForHierarchy, floorOpenings, selectedFloorWallId, selectedFloorWallIds, selectedFloorOpeningId, selectedFloorOpeningIds,
    handleCreateFloorWall, handleSelectFloorWall, handleMoveFloorWall, handleUpdateFloorWallEndpoint, handleDeleteFloorWall,
    handleUpdateFloorWallType, handleUpdateFloorWallThickness, handleUpdateFloorWallHeight,
    handleCreateFloorOpening, handleSelectFloorOpening, handleMoveFloorOpening, handleUpdateFloorOpeningSize, handleUpdateFloorWindowSillHeight, handleDeleteFloorOpening,
    handleUpdateFloorDoorSwingDirection, handleUpdateFloorDoorHingeSide,
    handleResizeFloorRoom, handleMoveFloorRoom,
    handleGenerateFloorPlanFromBubble, canGenerateFloorPlanFromBubble,
    floorLayers, activeFloorLayerId, floorLayerOverlayItems, isLayerOverlayMode, overlayLayerIds, overlayOpacityByLayerId, addFloorLayer, renameFloorLayer, deleteFloorLayer, setActiveFloorLayerId, toggleLayerOverlayMode, handleToggleOverlayLayer, handleSetOverlayLayerOpacity,
    floorProjectImportMessage, importFloorProjectFromJson, importSampleFloorProject,
    isCollaborationMode, selectedPinId, selectedCommentPin, commentPins, commentNotifications, unreadCommentNotifications, currentCollaborationUserType, currentCollaborationUserName,
    collaborationTab, setCollaborationTab,
    handleToggleCollaboration, handlePinClick, handleCreateCommentPin, handleAddCommentReply,
    zoom, handleZoomIn, handleZoomOut, handleZoomChange,
    selectedTool, handleSetSelectedTool,
    connectingFromId, handleBubbleSelectWithTool, handleConnectionClick, handleConnectionCreate,
    labelEditState, handleBubbleLabelEdit, handleEmptyCanvasDblClick, confirmLabelEdit, closeLabelEdit,
    handleWheelZoom,
    isLibraryOpen, setIsLibraryOpen,
    isGridVisible, isGridSnapEnabled, gridSnapIntervalMm, toggleGrid, toggleGridSnap, handleSetGridSnapIntervalMm,
    isInviteModalOpen, handleOpenInviteModal, onCloseInviteModal,
    isExportModalOpen, handleOpenExportModal, onCloseExportModal,
    isExportSelectionModalOpen, handleOpenExportSelectionModal, onCloseExportSelectionModal,
    isIFCExportModalOpen, handleOpenIFCExportModal, onCloseIFCExportModal,
    llmProvider, llmPrompt, setLlmPrompt, llmStatus, llmIsLoading, llmMessage, llmSuggestions, llmPreview, llmCanRun,
    runLlmEdit, applyLlmEdit, discardLlmEdit,
    wallCreatePreset,
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
            onGenerateFloorPlan={handleGenerateFloorPlanFromBubble}
            canGenerateFloorPlan={canGenerateFloorPlanFromBubble}
            isBubbleReadOnly={isBubbleReadOnly}
            hasDeletableSelection={hasDeletableSelection}
            onDeleteSelected={handleDeleteSelected}
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
              isReadOnly={isBubbleReadOnly}
              scale={zoom / 100}
            />
          ) : mode === '2d' ? (
            <TwoDCanvas
              stageSize={stageSize}
              isCollaborationMode={isCollaborationMode}
              selectedPinId={selectedPinId}
              commentPins={commentPins}
              onPinClick={handlePinClick}
              onPinCreate={handleCreateCommentPin}
              rooms={floorRooms}
              overlayLayers={floorLayerOverlayItems}
              connections={floorPlanConnections}
              isGenerated={isFloorPlanGenerated}
              isGenerating={isFloorPlanGenerating}
              onGenerate={handleGenerateFloorPlan}
              canGenerate={canGenerateFloorPlanFromBubble}
              isGridVisible={isGridVisible}
              selectedId={selectedId}
              selectedIds={selectedIds}
              onSelect={(id, isShift) => (id ? handleBubbleSelect(id, isShift) : clearSelection())}
              onMarqueeSelect={handleMarqueeSelect}
              walls={floorWallsForHierarchy}
              openings={floorOpenings}
              selectedWallId={selectedFloorWallId}
              selectedWallIds={selectedFloorWallIds}
              selectedOpeningId={selectedFloorOpeningId}
              selectedOpeningIds={selectedFloorOpeningIds}
              onWallSelect={handleSelectFloorWall}
              onWallCreate={handleCreateFloorWall}
              wallCreatePreset={wallCreatePreset}
              onWallMove={handleMoveFloorWall}
              onWallEndpointChange={handleUpdateFloorWallEndpoint}
              onWallDelete={handleDeleteFloorWall}
              onOpeningCreate={handleCreateFloorOpening}
              onOpeningSelect={handleSelectFloorOpening}
              onOpeningMove={handleMoveFloorOpening}
              onOpeningDelete={handleDeleteFloorOpening}
              onRoomMove={handleMoveFloorRoom}
              onRoomResize={handleResizeFloorRoom}
              onTwoDMarqueeSelect={handleTwoDMarqueeSelect}
              selectedTool={selectedTool}
              isGridSnapEnabled={isGridSnapEnabled}
              gridSnapIntervalMm={gridSnapIntervalMm}
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
              overlayLayers={floorLayerOverlayItems}
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
              isLayerOverlayMode={isLayerOverlayMode}
              selectedOverlayLayerIds={overlayLayerIds}
              overlayOpacityByLayerId={overlayOpacityByLayerId}
              onAddLayer={addFloorLayer}
              onRenameLayer={renameFloorLayer}
              onDeleteLayer={deleteFloorLayer}
              onSelectLayer={setActiveFloorLayerId}
              onToggleLayerOverlayMode={toggleLayerOverlayMode}
              onToggleOverlayLayer={handleToggleOverlayLayer}
              onChangeOverlayLayerOpacity={handleSetOverlayLayerOpacity}
              rooms={floorRooms}
              walls={floorWallsForHierarchy}
              openings={floorOpenings}
              selectedRoomId={selectedId}
              onSelectRoom={handleBubbleSelect}
            />
          )}

          {mode !== 'view' && (
            <ZoomControlBar
              zoom={zoom}
              mode={mode}
              selectedTool={selectedTool}
              isGridVisible={isGridVisible}
              isGridSnapEnabled={isGridSnapEnabled}
              gridSnapIntervalMm={gridSnapIntervalMm}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onSetZoom={handleZoomChange}
              onSetTool={handleSetSelectedTool}
              onToggleGrid={toggleGrid}
              onToggleGridSnap={toggleGridSnap}
              onGridSnapIntervalChange={handleSetGridSnapIntervalMm}
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
            selectedPin={selectedCommentPin}
            commentPins={commentPins}
            commentNotifications={commentNotifications}
            unreadCommentNotifications={unreadCommentNotifications}
            currentCollaborationUserType={currentCollaborationUserType}
            currentCollaborationUserName={currentCollaborationUserName}
            onSelectPin={handlePinClick}
            onCreateCommentReply={handleAddCommentReply}
            selectedBubble={selectedBubble}
            selectedWall={selectedFloorWall}
            selectedOpening={selectedFloorOpening}
            selectedBubbleConnections={selectedBubbleConnections}
            selectedBubbleZones={selectedBubbleZones}
            zoningListItems={zoningListItems}
            panelOffsets={panelOffsets}
            panelOpenState={panelOpenState}
            panelHeights={panelHeights}
            panelWidths={panelWidths}
            panelZIndexes={panelZIndexes}
            onLabelChange={handleLabelChange}
            onTypeChange={handleTypeChange}
            onWidthChange={handleWidthChange}
            onHeightChange={handleHeightChange}
            onWidthCommit={handleWidthCommit}
            onHeightCommit={handleHeightCommit}
            onRatioChange={handleRatioChange}
            onColorChange={handleColorChange}
            onMaterialChange={handleMaterialChange}
            onWallTypeChange={handleUpdateFloorWallType}
            onWallThicknessChange={handleUpdateFloorWallThickness}
            onWallHeightChange={handleUpdateFloorWallHeight}
            onOpeningSizeChange={handleUpdateFloorOpeningSize}
            onWindowSillHeightChange={handleUpdateFloorWindowSillHeight}
            onDoorSwingDirectionChange={handleUpdateFloorDoorSwingDirection}
            onDoorHingeSideChange={handleUpdateFloorDoorHingeSide}
            floorLayers={floorLayers}
            activeFloorLayerId={activeFloorLayerId}
            isFloorPlanGenerated={isFloorPlanGenerated}
            isLayerOverlayMode={isLayerOverlayMode}
            selectedOverlayLayerIds={overlayLayerIds}
            overlayOpacityByLayerId={overlayOpacityByLayerId}
            onAddFloorLayer={addFloorLayer}
            onRenameFloorLayer={renameFloorLayer}
            onDeleteFloorLayer={deleteFloorLayer}
            onSelectFloorLayer={setActiveFloorLayerId}
            onToggleLayerOverlayMode={toggleLayerOverlayMode}
            onToggleOverlayLayer={handleToggleOverlayLayer}
            onChangeOverlayLayerOpacity={handleSetOverlayLayerOpacity}
            onOpenZoningModal={openZoningModal}
            onOpenEditZoningModal={openEditModal}
            onDeleteZoning={deleteZone}
            llmProvider={llmProvider}
            llmPrompt={llmPrompt}
            llmStatus={llmStatus}
            llmIsLoading={llmIsLoading}
            llmMessage={llmMessage}
            llmSuggestions={llmSuggestions}
            llmPreview={llmPreview}
            llmCanRun={llmCanRun}
            onLlmPromptChange={setLlmPrompt}
            onRunLlmEdit={runLlmEdit}
            onApplyLlmEdit={applyLlmEdit}
            onDiscardLlmEdit={discardLlmEdit}
            floorProjectImportMessage={floorProjectImportMessage}
            onImportFloorProjectJson={importFloorProjectFromJson}
            onImportSampleFloorProject={importSampleFloorProject}
            onPanelDragStart={startDrag}
            onPanelResizeStart={startResize}
            onTogglePanel={togglePanel}
            onResetPanelPositions={resetPanelPositions}
          />
        )}
      </div>
    </div>
  )
}

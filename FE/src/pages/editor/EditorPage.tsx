import { Hand, ZoomIn, ZoomOut, Users, RotateCw } from 'lucide-react'
import { AddSpaceModal } from '../../features/editor/components/AddSpaceModal'
import { BubbleCanvas } from '../../features/editor/components/BubbleCanvas'
import { TwoDCanvas } from '../../features/editor/components/TwoDCanvas'
import { ThreeDCanvas } from '../../features/editor/components/ThreeDCanvas'
import { TwoDLeftPanels } from '../../features/editor/components/TwoDLeftPanels'
import EditorHeader from '../../features/editor/components/EditorHeader'
import EditorLeftSidebar from '../../features/editor/components/EditorLeftSidebar'
import { EditorRightPanels } from '../../features/editor/components/EditorRightPanels'
import EditorToolbar from '../../features/editor/components/EditorToolbar'
import { LineStyleModal } from '../../features/editor/components/LineStyleModal'
import { ZoningModal } from '../../features/editor/components/ZoningModal'
import { InviteModal } from '../../features/editor/components/InviteModal'
import { ExportModal } from '../../features/editor/components/ExportModal'
import { ExportSelectionModal } from '../../features/editor/components/ExportSelectionModal'
import { useEditorPage } from '../../features/editor/hooks/useEditorPage'

export default function EditorPage() {
  const {
    mode, setMode,
    containerRef, stageSize, sitePoints,
    bubbles, selectedId, selectedBubble,
    handleBubbleSelect, handleBubbleDrag,
    handleLabelChange, handleTypeChange,
    handleWidthChange, handleHeightChange, handleRatioChange, handleColorChange,
    connections, selectedBubbleConnections,
    isLineStyleModalOpen, selectedLineStyle, lineConnectionPair,
    confirmLineStyleModal, closeLineStyleModal, setSelectedStyle,
    handleOpenLineStyleModal, getBubbleLabel,
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
    isCollaborationMode, selectedPinId, setSelectedPinId,
    collaborationTab, setCollaborationTab,
    handleToggleCollaboration, handlePinClick,
    zoom, handleZoomIn, handleZoomOut,
    selectedTool, setSelectedTool,
    isLibraryOpen, setIsLibraryOpen,
    isGridVisible, toggleGrid,
    isInviteModalOpen, handleOpenInviteModal, onCloseInviteModal,
    isExportModalOpen, handleOpenExportModal, onCloseExportModal,
    isExportSelectionModalOpen, handleOpenExportSelectionModal, onCloseExportSelectionModal,
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
        onInvite={(userIds) => {
          console.log('Inviting users:', userIds)
          onCloseInviteModal()
        }}
      />

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={onCloseExportModal}
      />

      <ExportSelectionModal
        isOpen={isExportSelectionModalOpen}
        onClose={onCloseExportSelectionModal}
        onStartExport={(type) => {
          console.log('Starting export:', type)
          onCloseExportSelectionModal()
          handleOpenExportModal()
        }}
      />

      <EditorHeader 
        mode={mode} 
        onModeChange={setMode} 
        onOpenInvite={handleOpenInviteModal}
        onSave={handleOpenExportSelectionModal}
      />
      <EditorToolbar mode={mode} onModeChange={setMode} />

      <div className="flex flex-1 relative overflow-hidden px-6 pb-6 gap-6">
        <EditorLeftSidebar
          mode={mode}
          isLineStyleModalOpen={isLineStyleModalOpen}
          isLibraryOpen={isLibraryOpen}
          isGridVisible={isGridVisible}
          selectedTool={selectedTool}
          onToolSelect={setSelectedTool}
          onAddSpace={handleOpenAddModal}
          onLineStyle={handleOpenLineStyleModal}
          onToggleCollaboration={handleToggleCollaboration}
          onToggleLibrary={() => setIsLibraryOpen(!isLibraryOpen)}
          onToggleGrid={toggleGrid}
          onExportIFC={handleOpenExportSelectionModal}
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
              selectedTool={selectedTool}
              onEditZone={openEditModal}
              onBubbleDrag={handleBubbleDrag}
              onBubbleSelect={handleBubbleSelect}
              onDeleteBubble={handleDeleteBubble}
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
              selectedTool={selectedTool}
              scale={zoom / 100}
            />
          ) : mode === '3d' ? (
            <ThreeDCanvas
              isCollaborationMode={isCollaborationMode}
              isLibraryOpen={isLibraryOpen}
              onToggleLibrary={() => setIsLibraryOpen(!isLibraryOpen)}
              selectedPinId={selectedPinId}
              onPinClick={handlePinClick}
              isGridVisible={isGridVisible}
              rooms={floorRooms}
              selectedTool={selectedTool}
              scale={zoom / 100}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[#ADB5BD] font-medium opacity-50 text-center px-10 whitespace-pre-line">
              캔버스 준비 중...
            </div>
          )}

          {mode === '2d' && !isCollaborationMode && <TwoDLeftPanels />}

          <div className="absolute bottom-6 left-6 flex items-center bg-white border border-[#E2E6EF] rounded-2xl px-2 py-2 shadow-md z-10 transition-all">
            <button 
              onClick={handleZoomOut}
              className="p-2.5 text-[#6B7A99] hover:text-[#1C1C1E] transition-colors rounded-xl hover:bg-[#F0F2F9]"
            >
              <ZoomOut size={20} />
            </button>
            <span className="text-[13px] font-semibold text-[#1C1C1E] min-w-[52px] text-center select-none">{zoom}%</span>
            <button 
              onClick={handleZoomIn}
              className="p-2.5 text-[#6B7A99] hover:text-[#1C1C1E] transition-colors rounded-xl hover:bg-[#F0F2F9]"
            >
              <ZoomIn size={20} />
            </button>
            <div className="w-px h-5 bg-[#E2E6EF] mx-2" />
            <button 
              onClick={() => setSelectedTool(selectedTool === 'hand' ? 'selection' : 'hand')}
              className={`p-2.5 transition-colors rounded-xl ${
                selectedTool === 'hand' ? 'text-[#3B45B3] bg-[#F0F2FF]' : 'text-[#6B7A99] hover:text-[#1C1C1E] hover:bg-[#F0F2F9]'
              }`}
            >
              <Hand size={20} />
            </button>

            {mode === '3d' && (
              <>
                <div className="w-px h-5 bg-[#E2E6EF] mx-2" />
                <button className="p-2.5 text-[#3B45B3] bg-[#F0F2FF] rounded-xl shadow-sm">
                  <RotateCw size={20} />
                </button>
                <div className="w-px h-5 bg-[#E2E6EF] mx-2" />
                <span className="text-[11px] font-bold text-[#6B7A99] px-2 tabular-nums">
                  X Y Z: 142.4, 33.1, 0.0
                </span>
              </>
            )}
          </div>

          {(mode === '2d' || mode === '3d') && isCollaborationMode && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
              <button
                onClick={handleToggleCollaboration}
                className="bg-white border border-[#E2E6EF] rounded-2xl px-6 py-2.5 shadow-lg flex items-center gap-3 hover:bg-[#F8F9FD] transition-all"
              >
                <Users size={18} className="text-[#3B45B3]" />
                <span className="text-[13px] font-extrabold text-[#3B45B3]">협업 모드 활성</span>
                <div className="w-px h-3 bg-[#E2E6EF] mx-1" />
              </button>
            </div>
          )}
        </main>

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

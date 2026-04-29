import { Hand, ZoomIn, ZoomOut, Users } from 'lucide-react'
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
    floorLayers, activeFloorLayerId, addFloorLayer, setActiveFloorLayerId,
    isCollaborationMode, selectedPinId, setSelectedPinId,
    collaborationTab, setCollaborationTab,
    handleToggleCollaboration, handlePinClick,
    saveStatus,
    zoom, handleZoomIn, handleZoomOut, setZoom,
    selectedTool, setSelectedTool,
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

      <IFCExportModal
        isOpen={isIFCExportModalOpen}
        onClose={onCloseIFCExportModal}
      />

      <EditorHeader 
        mode={mode} 
        onModeChange={setMode} 
        onOpenInvite={handleOpenInviteModal}
        saveStatus={saveStatus}
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
            onToolSelect={setSelectedTool}
            onAddSpace={handleOpenAddModal}
            onLineStyle={handleOpenLineStyleModal}
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
              selectedId={selectedId}
              onSelect={handleBubbleSelect}
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
              selectedId={selectedId}
              onSelect={handleBubbleSelect}
              selectedTool={selectedTool}
              scale={zoom / 100}
            />
          ) : mode === 'view' ? (
            <RealisticViewer onExport={handleOpenExportSelectionModal} />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[#ADB5BD] font-medium opacity-50 text-center px-10 whitespace-pre-line">
              캔버스 준비 중...
            </div>
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
            <div className="absolute bottom-6 left-6 flex items-center bg-white border border-[#E2E6EF] rounded-2xl px-1.5 py-1.5 shadow-md z-10 transition-all">
              <button
                onClick={handleZoomOut}
                className="p-1.5 text-[#6B7A99] hover:text-[#1C1C1E] transition-colors rounded-xl hover:bg-[#F0F2F9]"
              >
                <ZoomOut size={20} />
              </button>
              <input
                key={zoom}
                type="text"
                defaultValue={`${zoom}%`}
                onFocus={(e) => {
                  e.currentTarget.value = String(zoom)
                  e.currentTarget.select()
                }}
                onBlur={(e) => {
                  const num = parseInt(e.currentTarget.value, 10)
                  const clamped = isNaN(num) ? zoom : Math.min(Math.max(num, 10), 300)
                  setZoom(clamped)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (!/[0-9]|Backspace|Delete|ArrowLeft|ArrowRight|Tab/.test(e.key)) e.preventDefault()
                }}
                className="text-[13px] font-semibold text-[#1C1C1E] w-[52px] text-center bg-transparent outline-none cursor-text"
              />
              <button
                onClick={handleZoomIn}
                className="p-1.5 text-[#6B7A99] hover:text-[#1C1C1E] transition-colors rounded-xl hover:bg-[#F0F2F9]"
              >
                <ZoomIn size={20} />
              </button>
              <div className="w-px h-5 bg-[#E2E6EF] mx-1.5" />
              <button
                onClick={() => setSelectedTool(selectedTool === 'hand' ? 'selection' : 'hand')}
                className={`p-1.5 transition-colors rounded-xl ${
                  selectedTool === 'hand' ? 'text-[#3B45B3] bg-[#F0F2FF]' : 'text-[#6B7A99] hover:text-[#1C1C1E] hover:bg-[#F0F2F9]'
                }`}
              >
                <Hand size={20} />
              </button>

              {mode === '3d' && (
                <>
                  <div className="w-px h-5 bg-[#E2E6EF] mx-2" />
                  {/* 3D 뷰 회전 아이콘 — 두 개의 호 + "3D" 텍스트 */}
                  <button aria-label="3D 뷰 회전" className="p-1.5 text-[#3B45B3] bg-[#F0F2FF] rounded-xl shadow-sm">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                      <path d="M20.5 5.5C18.6 3.6 16 2.5 13 2.5V0.5L9.5 3.5L13 6.5V4.5C15.4 4.5 17.6 5.4 19.1 6.9L20.5 5.5Z" />
                      <path d="M3.5 18.5C5.4 20.4 8 21.5 11 21.5V23.5L14.5 20.5L11 17.5V19.5C8.6 19.5 6.4 18.6 4.9 17.1L3.5 18.5Z" />
                      <path d="M21.5 7.5C22.4 9 23 10.5 23 12H21C21 10.9 20.6 9.8 19.9 8.8L21.5 7.5Z" />
                      <path d="M2.5 16.5C1.6 15 1 13.5 1 12H3C3 13.1 3.4 14.2 4.1 15.2L2.5 16.5Z" />
                      <text x="12" y="15.5" textAnchor="middle" fontSize="8" fontWeight="900" fontFamily="Arial, sans-serif" fill="currentColor">3D</text>
                    </svg>
                  </button>
                  <div className="w-px h-5 bg-[#E2E6EF] mx-2" />
                  <span className="text-[11px] font-bold text-[#6B7A99] px-2 tabular-nums">
                    X Y Z: 142.4, 33.1, 0.0
                  </span>
                </>
              )}
            </div>
          )}

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

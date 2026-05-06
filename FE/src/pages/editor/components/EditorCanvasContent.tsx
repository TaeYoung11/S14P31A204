import { Suspense, lazy, useState } from 'react'
import { CollaborationModeBar } from '@/features/editor/components/layout/CollaborationModeBar'
import { ZoomControlBar } from '@/features/editor/components/layout/ZoomControlBar'
import { LabelEditOverlay } from '@/features/editor/components/overlays/LabelEditOverlay'
import { ModeCanvasLoadingFallback, PanelLoadingFallback } from '@/features/editor/components/shared/EditorLoadingFallbacks'
import type { EditorCanvasContentProps } from '../types/editorCanvasContentProps'
import BubbleModeCanvas from './modes/BubbleModeCanvas'
import ThreeDModeCanvas from './modes/ThreeDModeCanvas'
import TwoDModeCanvas from './modes/TwoDModeCanvas'
import ViewModeCanvas from './modes/ViewModeCanvas'
const TwoDLeftPanels = lazy(() =>
  import('@/features/editor/components/layout/TwoDLeftPanels').then((module) => ({ default: module.TwoDLeftPanels })),
)

/** 에디터 중앙 캔버스 영역(모드별 렌더링 + 오버레이 + 줌 컨트롤) */
export default function EditorCanvasContent(props: EditorCanvasContentProps) {
  const { mode, containerRef, zoom } = props
  const scale = zoom / 100
  const [isRotationLocked, setIsRotationLocked] = useState(false)

  const renderCanvasByMode = () => {
    if (mode === 'bubble') {
      return <BubbleModeCanvas editorProps={props} scale={scale} />
    }

    if (mode === '2d') {
      return <TwoDModeCanvas editorProps={props} scale={scale} />
    }

    if (mode === '3d') {
      return (
        <ThreeDModeCanvas
          editorProps={props}
          scale={scale}
          isRotationLocked={isRotationLocked}
        />
      )
    }

    if (mode === 'view') {
      return <ViewModeCanvas onExport={props.handleOpenExportSelectionModal} />
    }

    return (
      <div className="absolute inset-0 flex items-center justify-center text-[#ADB5BD] font-medium opacity-50 text-center px-10 whitespace-pre-line">
        캔버스 준비 중...
      </div>
    )
  }

  const renderLabelOverlay = () => {
    if (mode !== 'bubble' || !props.labelEditState) return null

    return (
      <LabelEditOverlay
        info={props.labelEditState}
        onConfirm={props.confirmLabelEdit}
        onCancel={props.closeLabelEdit}
      />
    )
  }

  const renderTwoDLeftPanels = () => {
    if (mode !== '2d' || props.isCollaborationMode) return null

    return (
      <Suspense fallback={<PanelLoadingFallback mode="2d" side="left" />}>
        <TwoDLeftPanels
          layers={props.floorLayers}
          activeLayerId={props.activeFloorLayerId}
          isGenerated={props.isFloorPlanGenerated}
          isLayerOverlayMode={props.isLayerOverlayMode}
          selectedOverlayLayerIds={props.overlayLayerIds}
          overlayOpacityByLayerId={props.overlayOpacityByLayerId}
          onAddLayer={props.addFloorLayer}
          onRenameLayer={props.renameFloorLayer}
          onDeleteLayer={props.deleteFloorLayer}
          onSelectLayer={props.setActiveFloorLayerId}
          onToggleLayerOverlayMode={props.toggleLayerOverlayMode}
          onToggleOverlayLayer={props.handleToggleOverlayLayer}
          onChangeOverlayLayerOpacity={props.handleSetOverlayLayerOpacity}
          rooms={props.floorRooms}
          walls={props.floorWallsForHierarchy}
          openings={props.floorOpenings}
          selectedRoomId={props.selectedId}
          onSelectRoom={props.handleBubbleSelect}
        />
      </Suspense>
    )
  }

  const renderZoomControls = () => {
    if (mode === 'view') return null

    return (
      <ZoomControlBar
        zoom={zoom}
        mode={mode}
        selectedTool={props.selectedTool}
        isGridVisible={props.isGridVisible}
        isGridSnapEnabled={props.isGridSnapEnabled}
        gridSnapIntervalMm={props.gridSnapIntervalMm}
        onZoomIn={props.handleZoomIn}
        onZoomOut={props.handleZoomOut}
        onSetZoom={props.handleZoomChange}
        onSetTool={props.handleSetSelectedTool}
        onToggleGrid={props.toggleGrid}
        onToggleGridSnap={props.toggleGridSnap}
        onGridSnapIntervalChange={props.handleSetGridSnapIntervalMm}
        isRotationLocked={isRotationLocked}
        onToggleRotationLock={() => setIsRotationLocked((prev) => !prev)}
      />
    )
  }

  const renderCollaborationModeBar = () => {
    if (!(mode === '2d' || mode === '3d') || !props.isCollaborationMode) return null
    return <CollaborationModeBar onToggle={props.handleToggleCollaboration} />
  }

  return (
    <main
      ref={containerRef}
      className={`flex-1 relative overflow-hidden ${
        mode === 'view' ? 'bg-[#0A0A0B]' : 'bg-white border border-[#E2E6EF] rounded-3xl shadow-sm'
      }`}
    >
      <Suspense fallback={<ModeCanvasLoadingFallback mode={mode} />}>{renderCanvasByMode()}</Suspense>
      {renderLabelOverlay()}
      {renderTwoDLeftPanels()}
      {renderZoomControls()}
      {renderCollaborationModeBar()}
    </main>
  )
}

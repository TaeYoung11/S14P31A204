import { lazy } from 'react'
import { Box } from 'lucide-react'
import type { EditorCanvasRenderProps } from '../../types/editorCanvasContentProps'

/**
 * 2D 평면도 생성 완료 후 우상단에 표시되는 "3D 생성" 버튼 오버레이.
 * pointer-events-none 래퍼 안에 버튼만 pointer-events-auto로 처리해 캔버스 클릭을 방해하지 않는다.
 */
function Generate3DOverlayButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <button
        onClick={onClick}
        className="pointer-events-auto absolute right-4 top-4 inline-flex items-center gap-2 rounded-2xl bg-[#3B45B3] px-4 py-2.5 text-[12px] font-extrabold text-white shadow-md transition-all hover:bg-[#2D3599] hover:shadow-lg active:scale-95"
      >
        <Box size={14} />
        3D 생성
      </button>
    </div>
  )
}

const TwoDCanvas = lazy(() =>
  import('@/features/editor/components/canvas/TwoDCanvas').then((module) => ({ default: module.TwoDCanvas })),
)

interface TwoDModeCanvasProps {
  editorProps: EditorCanvasRenderProps
  scale: number
}

/**
 * 2D 평면도 모드 캔버스 렌더링 전용 컴포넌트.
 * - TwoDCanvas에 에디터 상태를 전달해 방·벽·개구부·핀·그리드를 렌더링한다.
 * - 평면도 생성 완료 시 우상단에 "3D 생성" 버튼 오버레이를 표시한다.
 */
export default function TwoDModeCanvas({ editorProps, scale }: TwoDModeCanvasProps) {
  return (
    <>
      <TwoDCanvas
        stageSize={editorProps.stageSize}
        sitePoints={editorProps.sitePlanPoints}
        isCollaborationMode={editorProps.isCollaborationMode}
        selectedPinId={editorProps.selectedPinId}
        commentPins={editorProps.commentPins}
        onPinClick={editorProps.handlePinClick}
        onPinCreate={editorProps.handleCreateCommentPin}
        rooms={editorProps.floorRooms}
        overlayLayers={editorProps.floorLayerOverlayItems}
        connections={editorProps.floorPlanConnections}
        isGenerated={editorProps.isFloorPlanGenerated}
        isGenerating={editorProps.isFloorPlanGenerating}
        onGenerate={editorProps.handleGenerateFloorPlan}
        canGenerate={editorProps.canGenerateFloorPlanFromBubble}
        isGridVisible={editorProps.isGridVisible}
        selectedId={editorProps.selectedId}
        selectedIds={editorProps.selectedIds}
        onSelect={(id, isShift) => (id ? editorProps.handleBubbleSelect(id, isShift) : editorProps.clearSelection())}
        onMarqueeSelect={editorProps.handleMarqueeSelect}
        walls={editorProps.floorWallsForHierarchy}
        openings={editorProps.floorOpenings}
        selectedWallId={editorProps.selectedFloorWallId}
        selectedWallIds={editorProps.selectedFloorWallIds}
        selectedOpeningId={editorProps.selectedFloorOpeningId}
        selectedOpeningIds={editorProps.selectedFloorOpeningIds}
        onWallSelect={editorProps.handleSelectFloorWall}
        onWallCreate={editorProps.handleCreateFloorWall}
        wallCreatePreset={editorProps.wallCreatePreset}
        onWallMove={editorProps.handleMoveFloorWall}
        onWallEndpointChange={editorProps.handleUpdateFloorWallEndpoint}
        onWallDelete={editorProps.handleDeleteFloorWall}
        onOpeningCreate={editorProps.handleCreateFloorOpening}
        onOpeningSelect={editorProps.handleSelectFloorOpening}
        onOpeningMove={editorProps.handleMoveFloorOpening}
        onOpeningDelete={editorProps.handleDeleteFloorOpening}
        onRoomMove={editorProps.handleMoveFloorRoom}
        onRoomResize={editorProps.handleResizeFloorRoom}
        onRoomPolygonChange={editorProps.handleUpdateFloorRoomPolygon}
        onWorkspaceEditStart={editorProps.beginWorkspaceSnapshotTransaction}
        onWorkspaceEditCommit={editorProps.commitWorkspaceSnapshotTransaction}
        onTwoDMarqueeSelect={editorProps.handleTwoDMarqueeSelect}
        selectedTool={editorProps.selectedTool}
        isGridSnapEnabled={editorProps.isGridSnapEnabled}
        gridSnapIntervalMm={editorProps.gridSnapIntervalMm}
        scale={scale}
        onWheelZoom={editorProps.handleWheelZoom}
      />

      {/* 평면도 생성 완료 후 3D 변환 버튼 표시 */}
      {editorProps.isFloorPlanGenerated && !editorProps.isFloorPlanGenerating && (
        <Generate3DOverlayButton onClick={editorProps.handleOpenGenerate3DModal} />
      )}
    </>
  )
}

// 프로젝트 편집기 페이지 — 버블 다이어그램 / 2D 평면도 / 3D 뷰어 전환 화면
// 모든 상태·로직은 useBubbleEditor 훅에 위임하고, 이 파일은 컴포넌트 조합만 담당한다.

import { useBubbleEditor }  from './hooks/useBubbleEditor'
import AddSpaceModal        from './components/AddSpaceModal'
import LineStyleModal       from './components/LineStyleModal'
import EditorHeader         from './components/EditorHeader'
import EditorToolbar        from './components/EditorToolbar'
import EditorSidebar        from './components/EditorSidebar'
import BubbleCanvas         from './components/BubbleCanvas'
import CanvasZoomControl    from './components/CanvasZoomControl'
import AttributePanel       from './components/AttributePanel'
import AIAssistantPanel     from './components/AIAssistantPanel'

export type { EditorMode } from './types'

export default function EditorPage() {
  const {
    mode, handleModeChange,
    containerRef, stageSize,
    bubbles, setBubbles, connections, selectedId,
    isAddModalOpen, setIsAddModalOpen,
    isLineModalOpen, setIsLineModalOpen, setPendingConnection, hasPendingConnection,
    handleConfirmAddSpace, handleSelectLineType,
    handleBubbleClick, handleStageClick,
    drawingConnection, connectingFrom,
    handleConnectStart, handleConnectEnd, handleConnectCancel,
  } = useBubbleEditor()

  return (
    <div className="flex flex-col h-screen w-screen bg-[#F0F2F9] text-[#1D1E20] overflow-hidden font-sans">
      {/* 전역 모달 — 렌더 트리 최상단에 위치해 다른 요소 위에 표시 */}
      <AddSpaceModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onConfirm={handleConfirmAddSpace}
      />
      <LineStyleModal
        isOpen={isLineModalOpen}
        onClose={() => { setIsLineModalOpen(false); setPendingConnection(null) }}
        onSelectType={handleSelectLineType}
        selectedBubbleId={selectedId}
        hasPendingConnection={hasPendingConnection}
      />

      <EditorHeader />
      <EditorToolbar mode={mode} onModeChange={handleModeChange} />

      <div className="flex flex-1 relative overflow-hidden px-6 pb-6 gap-6">
        <EditorSidebar
          onOpenAddModal={() => setIsAddModalOpen(true)}
          onOpenLineModal={() => setIsLineModalOpen(true)}
          isLineModalOpen={isLineModalOpen}
          drawingConnection={drawingConnection}
        />

        <main
          ref={containerRef}
          className="flex-1 bg-white border border-[#E2E6EF] rounded-3xl shadow-sm relative overflow-hidden"
        >
          {mode === 'bubble' ? (
            <BubbleCanvas
              stageSize={stageSize}
              bubbles={bubbles}
              onBubblesChange={setBubbles}
              connections={connections}
              selectedId={selectedId}
              drawingConnection={drawingConnection}
              onBubbleClick={handleBubbleClick}
              onStageClick={handleStageClick}
              connectingFrom={connectingFrom}
              onConnectStart={handleConnectStart}
              onConnectEnd={handleConnectEnd}
              onConnectCancel={handleConnectCancel}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[#ADB5BD] font-medium opacity-50 text-center px-10">
              {mode === '2d' ? '2D 평면도 캔버스 (준비 중...)' : '3D 뷰어 캔버스 (준비 중...)'}
            </div>
          )}
          <CanvasZoomControl />
        </main>

        <div className="w-[300px] flex flex-col gap-6 shrink-0">
          <AttributePanel />
          <AIAssistantPanel />
        </div>
      </div>
    </div>
  )
}

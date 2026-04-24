// 프로젝트 편집기 페이지
// 버블 다이어그램(Bubble), 2D 평면도, 3D 뷰어 세 가지 모드를 URL 쿼리 파라미터로 전환한다.
// 상태와 이벤트 핸들러를 관리하고 하위 컴포넌트에 전달하는 역할만 담당한다.

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  EditorMode, BubbleData, ConnectionData,
  DrawingConnection, ConnectingFrom, PendingConnection,
} from './types'
import AddSpaceModal    from './components/AddSpaceModal'
import LineStyleModal   from './components/LineStyleModal'
import EditorHeader     from './components/EditorHeader'
import EditorToolbar    from './components/EditorToolbar'
import EditorSidebar    from './components/EditorSidebar'
import BubbleCanvas     from './components/BubbleCanvas'
import CanvasZoomControl from './components/CanvasZoomControl'
import AttributePanel   from './components/AttributePanel'
import AIAssistantPanel from './components/AIAssistantPanel'

export type { EditorMode }

/** 초기 샘플 버블 데이터 (API 연동 전 목업) */
const INITIAL_BUBBLES: BubbleData[] = [
  { id: '1', x: 230, y: 250, width: 100, height: 100, label: '현관/로비', area: '12.5 m²', index: '01' },
  { id: '2', x: 340, y: 310, width: 130, height: 130, label: '거실',      area: '45.0 m²', index: '02' },
  { id: '3', x: 310, y: 500, width: 110, height: 110, label: '주방/식당', area: '20.0 m²', index: '03' },
]

/** 초기 샘플 연결선 데이터 (API 연동 전 목업) */
const INITIAL_CONNECTIONS: ConnectionData[] = [
  { from: '1', to: '2', type: 'bold'   },
  { from: '1', to: '3', type: 'dashed' },
  { from: '2', to: '3', type: 'thin'   },
]

export default function EditorPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const mode = (searchParams.get('mode') ?? 'bubble') as EditorMode

  // 캔버스 데이터 상태
  const [bubbles,     setBubbles]     = useState<BubbleData[]>(INITIAL_BUBBLES)
  const [connections, setConnections] = useState<ConnectionData[]>(INITIAL_CONNECTIONS)
  const [selectedId,  setSelectedId]  = useState<string | null>('1')

  // 모달 표시 상태
  const [isAddModalOpen,  setIsAddModalOpen]  = useState(false)
  const [isLineModalOpen, setIsLineModalOpen] = useState(false)

  // 연결선 작성 모드 상태
  const [drawingConnection,  setDrawingConnection]  = useState<DrawingConnection | null>(null)
  const [connectingFrom,     setConnectingFrom]     = useState<ConnectingFrom | null>(null)
  const [pendingConnection,  setPendingConnection]  = useState<PendingConnection | null>(null)

  // 캔버스 크기 (Konva Stage 동기화용)
  const containerRef = useRef<HTMLDivElement>(null)
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 })

  /** 캔버스 컨테이너 크기를 Konva Stage에 동기화 */
  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setStageSize({
          width:  containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        })
      }
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  /** URL 쿼리 파라미터로 뷰 모드 전환 */
  const handleModeChange = (newMode: EditorMode) => setSearchParams({ mode: newMode })

  /** 공간 추가 모달 확인 — 새 버블을 캔버스에 추가 */
  const handleConfirmAddSpace = (data: { name: string; type: string; area: string }) => {
    const nextIndex = (bubbles.length + 1).toString().padStart(2, '0')
    setBubbles(prev => [...prev, {
      id:     Date.now().toString(),
      x:      150 + Math.random() * 200,
      y:      150 + Math.random() * 200,
      width:  100 + data.name.length * 5,
      height: 100,
      label:  data.name || '새 공간',
      area:   data.area ? `${data.area} m²` : '0.0 m²',
      index:  nextIndex,
    }])
    setIsAddModalOpen(false)
  }

  /**
   * 선 스타일 선택 처리
   * - pendingConnection 존재: 드래그 연결 흐름 → 두 버블 간 연결선 생성
   * - 버블 선택 상태: 해당 버블 시작점으로 클릭 연결 모드 진입
   * - 버블 미선택: 모달만 닫음 (허공에 떠있는 선 생성 없음)
   */
  const handleSelectLineType = (type: string) => {
    if (pendingConnection) {
      setConnections(prev => [...prev, { from: pendingConnection.from, to: pendingConnection.to, type }])
      setPendingConnection(null)
      setIsLineModalOpen(false)
      return
    }
    if (selectedId) {
      setDrawingConnection({ from: selectedId, type })
    }
    setIsLineModalOpen(false)
  }

  /** 버블 외곽 핸들 마우스다운 — 드래그 연결 시작 */
  const handleConnectStart = (bubbleId: string, x: number, y: number) =>
    setConnectingFrom({ bubbleId, x, y })

  /** 대상 버블 위 마우스업 — 선 스타일 선택 모달 열기 */
  const handleConnectEnd = (toBubbleId: string) => {
    if (!connectingFrom) return
    setPendingConnection({ from: connectingFrom.bubbleId, to: toBubbleId })
    setConnectingFrom(null)
    setIsLineModalOpen(true)
  }

  /** 빈 영역 마우스업 — 드래그 연결 취소 */
  const handleConnectCancel = () => setConnectingFrom(null)

  /**
   * 버블 클릭 처리
   * - 클릭 연결 모드: 클릭한 버블을 끝점으로 연결선 생성 후 모드 종료
   * - 일반 모드: 해당 버블 선택
   */
  const handleBubbleClick = (id: string) => {
    if (drawingConnection) {
      if (drawingConnection.from !== id) {
        setConnections(prev => [
          ...prev,
          { from: drawingConnection.from!, to: id, type: drawingConnection.type },
        ])
      }
      setDrawingConnection(null)
    } else {
      setSelectedId(id)
    }
  }

  /** 캔버스 빈 영역 클릭 — 클릭 연결 모드 취소 */
  const handleStageClick = () => {
    if (drawingConnection) setDrawingConnection(null)
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-[#F0F2F9] text-[#1D1E20] overflow-hidden font-sans">
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
        hasPendingConnection={!!pendingConnection}
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

        {/* 메인 캔버스 영역 */}
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

        {/* 우측 패널 */}
        <div className="w-[300px] flex flex-col gap-6 shrink-0">
          <AttributePanel />
          <AIAssistantPanel />
        </div>
      </div>
    </div>
  )
}

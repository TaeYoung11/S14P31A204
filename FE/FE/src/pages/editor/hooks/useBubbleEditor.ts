// 버블 다이어그램 편집기의 모든 상태와 이벤트 핸들러를 관리하는 훅
// EditorPage는 이 훅을 호출해 받은 값을 컴포넌트에 전달하는 조합 역할만 담당한다.

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  EditorMode, BubbleData, ConnectionData,
  DrawingConnection, ConnectingFrom, PendingConnection,
} from '../types'

// API 연동 전 목업 데이터
const INITIAL_BUBBLES: BubbleData[] = [
  { id: '1', x: 230, y: 250, width: 100, height: 100, label: '현관/로비', area: '12.5 m²', index: '01' },
  { id: '2', x: 340, y: 310, width: 130, height: 130, label: '거실',      area: '45.0 m²', index: '02' },
  { id: '3', x: 310, y: 500, width: 110, height: 110, label: '주방/식당', area: '20.0 m²', index: '03' },
]

const INITIAL_CONNECTIONS: ConnectionData[] = [
  { from: '1', to: '2', type: 'bold'   },
  { from: '1', to: '3', type: 'dashed' },
  { from: '2', to: '3', type: 'thin'   },
]

export function useBubbleEditor() {
  const [searchParams, setSearchParams] = useSearchParams()
  const mode = (searchParams.get('mode') ?? 'bubble') as EditorMode

  const [bubbles,     setBubbles]     = useState<BubbleData[]>(INITIAL_BUBBLES)
  const [connections, setConnections] = useState<ConnectionData[]>(INITIAL_CONNECTIONS)
  const [selectedId,  setSelectedId]  = useState<string | null>('1')

  const [isAddModalOpen,  setIsAddModalOpen]  = useState(false)
  const [isLineModalOpen, setIsLineModalOpen] = useState(false)

  // 연결선 작성 모드: drawingConnection(클릭 방식), connectingFrom(드래그 방식)
  const [drawingConnection, setDrawingConnection] = useState<DrawingConnection | null>(null)
  const [connectingFrom,    setConnectingFrom]    = useState<ConnectingFrom | null>(null)
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 })

  /** 브라우저 창 크기 변경 시 Konva Stage 크기를 컨테이너에 맞게 동기화 */
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

  /** URL ?mode= 파라미터를 변경해 뷰 모드(bubble / 2d / 3d) 전환 */
  const handleModeChange = (newMode: EditorMode) => setSearchParams({ mode: newMode })

  /** 공간 추가 모달 확인 — 폼 데이터를 기반으로 새 버블을 캔버스에 추가 */
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
   * 선 스타일 모달에서 선 종류 선택 시 처리
   * - pendingConnection 존재(드래그 연결 완료): 두 버블 간 연결선 즉시 생성
   * - selectedId 존재(버블 선택 후 사이드바 진입): 클릭 연결 모드 진입 → 다음 버블 클릭 대기
   * - 그 외: 모달만 닫음
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

  /** 버블 외곽 핸들 마우스다운 — 드래그 연결 시작점 기록 */
  const handleConnectStart = (bubbleId: string, x: number, y: number) =>
    setConnectingFrom({ bubbleId, x, y })

  /** 드래그 중 대상 버블 위에서 마우스업 — pendingConnection 저장 후 선 스타일 모달 오픈 */
  const handleConnectEnd = (toBubbleId: string) => {
    if (!connectingFrom) return
    setPendingConnection({ from: connectingFrom.bubbleId, to: toBubbleId })
    setConnectingFrom(null)
    setIsLineModalOpen(true)
  }

  /** 드래그 중 빈 영역에서 마우스업 — 연결 취소 */
  const handleConnectCancel = () => setConnectingFrom(null)

  /**
   * 버블 클릭 처리
   * - 클릭 연결 모드(drawingConnection 활성): 클릭한 버블을 끝점으로 연결선 생성
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

  return {
    mode,
    handleModeChange,
    containerRef,
    stageSize,
    bubbles,
    setBubbles,
    connections,
    selectedId,
    isAddModalOpen,
    setIsAddModalOpen,
    isLineModalOpen,
    setIsLineModalOpen,
    setPendingConnection,
    hasPendingConnection: !!pendingConnection,
    handleConfirmAddSpace,
    handleSelectLineType,
    handleBubbleClick,
    handleStageClick,
    drawingConnection,
    connectingFrom,
    handleConnectStart,
    handleConnectEnd,
    handleConnectCancel,
  }
}

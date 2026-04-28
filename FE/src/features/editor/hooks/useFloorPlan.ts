import { useState, useCallback, useRef, useEffect } from 'react'
import type { BubbleData, ConnectionData, FloorLayer, FloorRoom } from '../types'
import { generateFloorPlanLayout } from '../utils/floorPlanLayout'

/** 2D 평면도 층·생성 상태를 관리하는 훅 */
export function useFloorPlan() {
  const [isGenerated, setIsGenerated] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [layers, setLayers] = useState<FloorLayer[]>([])
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  /** 현재 활성 층의 방 목록 */
  const activeRooms: FloorRoom[] = layers.find((l) => l.id === activeLayerId)?.rooms ?? []

  /**
   * 버블 다이어그램 → 2D 평면도 변환 (로딩 애니메이션 포함)
   * 버튼 클릭 시 호출. 1.8초 로딩 후 레이아웃 결과를 1층으로 저장
   */
  const generateFloorPlan = useCallback(
    (
      bubbles: BubbleData[],
      connections: ConnectionData[],
      canvasWidth: number,
      canvasHeight: number,
    ) => {
      if (bubbles.length === 0) return

      setIsGenerating(true)

      // React가 로딩 상태를 렌더링할 수 있도록 setTimeout으로 레이아웃 계산 지연
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        const rooms = generateFloorPlanLayout(bubbles, connections, canvasWidth, canvasHeight)
        const firstLayer: FloorLayer = { id: 'floor-1', name: '1층 평면도', rooms }
        setLayers([firstLayer])
        setActiveLayerId('floor-1')
        setIsGenerated(true)
        setIsGenerating(false)
      }, 1800)
    },
    [],
  )

  /**
   * 버블 변경 시 조용히 레이아웃 갱신 (로딩 없음)
   * useEffect에서 자동 호출용 — 이미 생성된 평면도를 업데이트할 때 사용
   */
  const refreshFloorPlan = useCallback(
    (
      bubbles: BubbleData[],
      connections: ConnectionData[],
      canvasWidth: number,
      canvasHeight: number,
    ) => {
      if (bubbles.length === 0 || canvasWidth === 0) return
      const rooms = generateFloorPlanLayout(bubbles, connections, canvasWidth, canvasHeight)
      setLayers((prev) => {
        if (prev.length === 0) return prev
        return prev.map((l, i) => (i === 0 ? { ...l, rooms } : l))
      })
    },
    [],
  )

  /**
   * 층 추가
   * 현재 활성 층 레이아웃을 복사해 새 층 생성 후 전환
   */
  const addFloorLayer = useCallback(() => {
    const newId = `floor-${Date.now()}`
    const floorNum = layers.length + 1
    const baseRooms = layers.find((l) => l.id === activeLayerId)?.rooms ?? []

    const newLayer: FloorLayer = {
      id: newId,
      name: `${floorNum}층 평면도`,
      // 방 id만 새로 부여하고 레이아웃은 복사
      rooms: baseRooms.map((r) => ({ ...r, id: `${r.id}-${newId}` })),
    }
    setLayers((prev) => [...prev, newLayer])
    setActiveLayerId(newId)
  }, [layers, activeLayerId])

  return {
    isGenerated,
    isGenerating,
    layers,
    activeLayerId,
    activeRooms,
    generateFloorPlan,
    refreshFloorPlan,
    addFloorLayer,
    setActiveLayerId,
  }
}

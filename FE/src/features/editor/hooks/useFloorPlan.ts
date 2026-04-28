import { useState, useCallback, useRef, useEffect } from 'react'
import type { BubbleData, ConnectionData, FloorLayer, FloorRoom } from '../types'
import { generateFloorPlanLayout } from '../utils/floorPlanLayout'
import { mapFloorProjectToLayers } from '../utils/floorProjectMapper'
import type { FloorProject } from '../types/floorProject.types'

/** 2D 평면도 층·생성 상태를 관리하는 훅 */
export function useFloorPlan() {
  const [isGenerated, setIsGenerated] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [layoutSource, setLayoutSource] = useState<'bubble' | 'project' | null>(null)
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
   * 첫 번째 층 레이어를 생성하거나 갱신한다.
   * - 기존 레이어가 없으면 `floor-1`을 생성한다.
   * - 기존 레이어가 있으면 첫 번째 레이어의 rooms만 교체한다.
   */
  const upsertPrimaryLayer = useCallback((rooms: FloorRoom[]) => {
    const firstLayer: FloorLayer = { id: 'floor-1', name: '1층 평면도', rooms }
    setLayers((prev) => {
      if (prev.length === 0) return [firstLayer]
      return prev.map((layer, index) => (index === 0 ? { ...layer, rooms } : layer))
    })
    setActiveLayerId((prev) => prev ?? 'floor-1')
  }, [])

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
        upsertPrimaryLayer(rooms)
        setIsGenerated(true)
        setIsGenerating(false)
        setLayoutSource('bubble')
      }, 1800)
    },
    [upsertPrimaryLayer],
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
      if (layoutSource !== 'bubble') return
      if (bubbles.length === 0 || canvasWidth === 0) return
      const rooms = generateFloorPlanLayout(bubbles, connections, canvasWidth, canvasHeight)
      upsertPrimaryLayer(rooms)
    },
    [layoutSource, upsertPrimaryLayer],
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

  /**
   * 외부 BATANG 2D(FloorProject) 데이터로 2D/3D 레이어를 직접 설정한다.
   * 백엔드 API 연동 시 이 경로를 사용하면 버블 기반 자동 생성 로직과 분리할 수 있다.
   */
  const setFloorPlanFromProject = useCallback(
    (project: FloorProject, canvasWidth: number, canvasHeight: number) => {
      const mappedLayers = mapFloorProjectToLayers(project, {
        width: canvasWidth,
        height: canvasHeight,
      })
      if (mappedLayers.length === 0) return
      setLayers(mappedLayers)
      setActiveLayerId(mappedLayers[0].id)
      setIsGenerated(true)
      setIsGenerating(false)
      setLayoutSource('project')
    },
    [],
  )

  /**
   * AI 수정 등으로 버블 데이터가 즉시 바뀔 때 2D/3D 레이어를 동기화한다.
   * 로딩 애니메이션 없이 즉시 반영하며, 소스를 bubble로 전환한다.
   */
  const syncFloorPlanFromBubbles = useCallback(
    (
      bubbles: BubbleData[],
      connections: ConnectionData[],
      canvasWidth: number,
      canvasHeight: number,
    ) => {
      if (bubbles.length === 0 || canvasWidth === 0) return
      const rooms = generateFloorPlanLayout(bubbles, connections, canvasWidth, canvasHeight)
      upsertPrimaryLayer(rooms)
      setIsGenerated(true)
      setIsGenerating(false)
      setLayoutSource('bubble')
    },
    [upsertPrimaryLayer],
  )

  return {
    isGenerated,
    isGenerating,
    layoutSource,
    layers,
    activeLayerId,
    activeRooms,
    generateFloorPlan,
    refreshFloorPlan,
    addFloorLayer,
    setActiveLayerId,
    setFloorPlanFromProject,
    syncFloorPlanFromBubbles,
  }
}

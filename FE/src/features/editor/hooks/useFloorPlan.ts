import { useState, useCallback, useRef, useEffect } from 'react'
import type { BubbleData, ConnectionData, FloorLayer, FloorRoom } from '../types'
import { generateFloorPlanLayout } from '../utils/floorPlanLayout'
import { mapFloorProjectToLayers } from '../utils/floorProjectMapper'
import { translateFloorRoom } from '../utils/floorRoomTransform'
import { normalizeIfcDisplayText } from '../utils/ifcStepString'
import { upsertFloorRoomByBubbleId } from '../utils/editorPageHelpers'
import { resolveBubbleFloorFromUnknown } from '../utils/bubbleSnapshotSyncUtils'
import type { FloorProject } from '../types/floorProject.types'

const normalizeFloorLayerLabels = (layers: FloorLayer[]): FloorLayer[] =>
  layers.map((layer) => ({
    ...layer,
    name: normalizeIfcDisplayText(layer.name),
    rooms: layer.rooms.map((room) => ({
      ...room,
      label: normalizeIfcDisplayText(room.label),
    })),
  }))

const createActiveFloorLayerStorageKey = (projectId: string | undefined): string | null =>
  projectId ? `editor:active-floor-layer:${projectId}` : null

const DEFAULT_FLOOR_CEILING_HEIGHT_MM = 3000

const getFloorLayerDefaults = (floorNumber: number): Pick<FloorLayer, 'storeyName' | 'elevationMm' | 'ceilingHeightMm'> => ({
  storeyName: `${floorNumber}F`,
  elevationMm: (floorNumber - 1) * DEFAULT_FLOOR_CEILING_HEIGHT_MM,
  ceilingHeightMm: DEFAULT_FLOOR_CEILING_HEIGHT_MM,
})

export const buildBubbleFloorLayers = (
  bubbles: BubbleData[],
  rooms: FloorRoom[],
): FloorLayer[] => {
  const floorByBubbleId = new Map(
    bubbles.map((bubble) => [bubble.id, resolveBubbleFloorFromUnknown(bubble as BubbleData & Record<string, unknown>)] as const),
  )
  const grouped = new Map<number, FloorRoom[]>()

  rooms.forEach((room) => {
    const floorNumber = floorByBubbleId.get(room.bubbleId) ?? 1
    const list = grouped.get(floorNumber)
    if (list) list.push(room)
    else grouped.set(floorNumber, [room])
  })

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left - right)
    .map(([floorNumber, floorRooms]) => ({
      id: `floor-${floorNumber}`,
      name: `${floorNumber}F`,
      ...getFloorLayerDefaults(floorNumber),
      rooms: floorRooms,
    }))
}

const readActiveFloorLayerIdFromStorage = (projectId: string | undefined): string | null => {
  if (typeof window === 'undefined') return null
  const storageKey = createActiveFloorLayerStorageKey(projectId)
  if (!storageKey) return null
  try {
    const raw = window.localStorage.getItem(storageKey)?.trim()
    return raw ? raw : null
  } catch {
    return null
  }
}

/** 2D 평면도 층·생성 상태를 관리하는 훅 */
export function useFloorPlan(projectId?: string) {
  const [isGenerated, setIsGenerated] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [layoutSource, setLayoutSource] = useState<'bubble' | 'project' | null>(null)
  const [layers, setLayers] = useState<FloorLayer[]>([])
  const [activeLayerId, setActiveLayerId] = useState<string | null>(() => readActiveFloorLayerIdFromStorage(projectId))
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const storageKey = createActiveFloorLayerStorageKey(projectId)
    if (!storageKey) return
    try {
      if (!activeLayerId) return
      window.localStorage.setItem(storageKey, activeLayerId)
    } catch {
      // localStorage 접근 실패는 치명적이지 않아 무시한다.
    }
  }, [projectId, activeLayerId])

  /** 현재 활성 층의 방 목록 */
  const activeRooms: FloorRoom[] = layers.find((l) => l.id === activeLayerId)?.rooms ?? []

  /**
   * 첫 번째 층 레이어를 생성하거나 갱신한다.
   * - 기존 레이어가 없으면 `floor-1`을 생성한다.
   * - `floor-1`이 이미 있으면 해당 레이어 rooms를 교체한다.
   * - `floor-1`이 없으면 레이어 목록 맨 앞에 `floor-1`을 추가한다.
   * - 기존 단일층 경로는 1층을 기준으로 갱신하므로 활성층도 `floor-1`로 맞춘다.
   */
  const upsertPrimaryLayer = useCallback((rooms: FloorRoom[]) => {
    const firstLayer: FloorLayer = { id: 'floor-1', name: '1F', ...getFloorLayerDefaults(1), rooms }
    setLayers((prev) => {
      if (prev.length === 0) return [firstLayer]
      const hasPrimary = prev.some((layer) => layer.id === 'floor-1')
      if (hasPrimary) {
        return prev.map((layer) =>
          layer.id === 'floor-1'
            ? { ...layer, ...getFloorLayerDefaults(1), rooms }
            : layer,
        )
      }
      return [firstLayer, ...prev]
    })
    setActiveLayerId('floor-1')
  }, [])

  const replaceLayersFromBubbles = useCallback((bubbles: BubbleData[], rooms: FloorRoom[]) => {
    const nextLayers = buildBubbleFloorLayers(bubbles, rooms)
    if (nextLayers.length === 0) {
      upsertPrimaryLayer(rooms)
      return
    }

    setLayers((prev) => {
      const nextLayerIds = new Set(nextLayers.map((layer) => layer.id))
      const nextById = new Map(nextLayers.map((layer) => [layer.id, layer] as const))
      const retainedEmptyLayers = prev.filter((layer) => !nextLayerIds.has(layer.id) && layer.rooms.length === 0)
      const mergedLayers = [
        ...nextLayers.map((layer) => {
          const previous = prev.find((item) => item.id === layer.id)
          return previous
            ? {
                ...previous,
                ...getFloorLayerDefaults(Number(layer.id.replace(/^floor-/, '')) || 1),
                name: previous.name || layer.name,
                storeyName: previous.storeyName || layer.storeyName,
                rooms: layer.rooms,
              }
            : layer
        }),
        ...retainedEmptyLayers.filter((layer) => !nextById.has(layer.id)),
      ]
      return normalizeFloorLayerLabels(mergedLayers)
    })
    setActiveLayerId((current) => {
      if (current && nextLayers.some((layer) => layer.id === current)) return current
      return nextLayers[0]?.id ?? 'floor-1'
    })
  }, [upsertPrimaryLayer])

  /**
   * 버블 다이어그램 → 2D 평면도 변환 (로딩 애니메이션 포함)
   * 버튼 클릭 시 호출. 1.8초 로딩 후 레이아웃 결과를 버블 층별 레이어로 저장
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
        replaceLayersFromBubbles(bubbles, rooms)
        setIsGenerated(true)
        setIsGenerating(false)
        setLayoutSource('bubble')
      }, 1800)
    },
    [replaceLayersFromBubbles],
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
      replaceLayersFromBubbles(bubbles, rooms)
    },
    [layoutSource, replaceLayersFromBubbles],
  )

  /**
   * 층 추가
   * 빈 새 층 생성 후 전환
   */
  const addFloorLayer = useCallback((): FloorLayer => {
    const newId = `floor-${Date.now()}`
    const floorNum = layers.length + 1

    const newLayer: FloorLayer = {
      id: newId,
      ...getFloorLayerDefaults(floorNum),
      name: `${floorNum}F`,
      rooms: [],
    }
    setLayers((prev) => [...prev, newLayer])
    setActiveLayerId(newId)
    return newLayer
  }, [layers.length])

  /** 층 이름 수정 */
  const renameFloorLayer = useCallback((layerId: string, name: string) => {
    const normalized = name.trim()
    if (!normalized) return
    setLayers((prev) =>
      prev.map((layer) => (layer.id === layerId ? { ...layer, name: normalized } : layer)),
    )
  }, [])

  /**
   * 층 삭제
   * - 최소 1개 층은 유지한다.
   * - 활성층 삭제 시 남아있는 첫 층으로 활성층을 전환한다.
   */
  const deleteFloorLayer = useCallback((layerId: string) => {
    setLayers((prev) => {
      if (prev.length <= 1) return prev
      const next = prev.filter((layer) => layer.id !== layerId)
      if (next.length === prev.length) return prev
      setActiveLayerId((current) => {
        if (current && current !== layerId) return current
        return next[0]?.id ?? null
      })
      return next
    })
  }, [])

  /**
   * 외부 BATANG 2D(FloorProject) 데이터로 2D/3D 레이어를 직접 설정한다.
   * 백엔드 API 연동 시 이 경로를 사용하면 버블 기반 자동 생성 로직과 분리할 수 있다.
   */
  const setFloorPlanFromProject = useCallback(
    (
      project: FloorProject,
      canvasWidth: number,
      canvasHeight: number,
      options: {
        scaleMode?: 'fit' | 'real' | 'canvas'
        referenceBubbles?: Pick<BubbleData, 'id' | 'x' | 'y' | 'width' | 'height' | 'widthMm' | 'heightMm' | 'ratio' | 'label' | 'type'>[]
      } = {},
    ) => {
      const mappedLayers = mapFloorProjectToLayers(project, {
        width: canvasWidth,
        height: canvasHeight,
        scaleMode: options.scaleMode ?? 'fit',
        referenceBubbles: options.referenceBubbles,
      })
      if (mappedLayers.length === 0) return
      setLayers(normalizeFloorLayerLabels(mappedLayers))
      setActiveLayerId((current) => {
        if (current && mappedLayers.some((layer) => layer.id === current)) return current
        return mappedLayers[0].id
      })
      setIsGenerated(true)
      setIsGenerating(false)
      setLayoutSource('project')
    },
    [],
  )

  /**
   * 평면도 상태를 초기화한다.
   * 버블이 모두 삭제된 경우 2D/3D에 남아 있는 이전 레이아웃을 제거할 때 사용한다.
   */
  const clearFloorPlan = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setLayers([])
    setActiveLayerId(null)
    setIsGenerated(false)
    setIsGenerating(false)
    setLayoutSource(null)
  }, [])

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
      replaceLayersFromBubbles(bubbles, rooms)
      setIsGenerated(true)
      setIsGenerating(false)
      setLayoutSource('bubble')
    },
    [replaceLayersFromBubbles],
  )

  /**
   * 활성 층의 Room 위치를 직접 이동한다.
   * 2D 배치 편집 전용 경로로, 버블 원본 데이터는 건드리지 않는다.
   */
  const moveActiveRoom = useCallback(
    (bubbleId: string, x: number, y: number) => {
      if (!activeLayerId) return
      setLayers((prev) =>
        prev.map((layer) =>
          layer.id !== activeLayerId
            ? layer
            : {
                ...layer,
                rooms: layer.rooms.map((room) =>
                  room.bubbleId === bubbleId
                    ? translateFloorRoom(room, x - room.x, y - room.y, { x, y })
                    : room,
                ),
              },
        ),
      )
    },
    [activeLayerId],
  )

  /**
   * 활성 층의 Room 속성을 직접 갱신한다.
   * 2D 속성 패널 입력값(이름/타입/재질/크기 등) 반영 경로로 사용한다.
   */
  const updateActiveRoom = useCallback(
    (bubbleId: string, updater: (room: FloorRoom) => FloorRoom) => {
      if (!activeLayerId) return
      setLayers((prev) =>
        prev.map((layer) =>
          layer.id !== activeLayerId
            ? layer
            : {
                ...layer,
                rooms: layer.rooms.map((room) =>
                  room.bubbleId === bubbleId
                    ? updater(room)
                    : room,
                ),
              },
        ),
      )
    },
    [activeLayerId],
  )

  /**
   * 활성 층에 Room을 추가한다.
   * 동일 bubbleId가 이미 있으면 해당 Room을 교체한다.
   */
  const addActiveRoom = useCallback((room: FloorRoom) => {
    if (!activeLayerId) return
    setLayers((prev) =>
      prev.map((layer) => {
        if (layer.id !== activeLayerId) return layer
        return {
          ...layer,
          rooms: upsertFloorRoomByBubbleId(layer.rooms, room),
        }
      }),
    )
  }, [activeLayerId])

  /**
   * 활성 층에서 지정한 Room(들)을 제거한다.
   * 2D 편집 모드 삭제 키 동작에서 버블 상태와 층 상태를 함께 맞출 때 사용한다.
   */
  const removeActiveRooms = useCallback(
    (bubbleIds: string[]) => {
      if (!activeLayerId || bubbleIds.length === 0) return
      const idSet = new Set(bubbleIds)
      setLayers((prev) =>
        prev.map((layer) =>
          layer.id !== activeLayerId
            ? layer
            : {
                ...layer,
                rooms: layer.rooms.filter((room) => !idSet.has(room.bubbleId)),
              },
        ),
      )
    },
    [activeLayerId],
  )

  const replaceFloorPlanState = useCallback((
    next: {
      isGenerated: boolean
      layoutSource?: 'bubble' | 'project' | null
      layers: FloorLayer[]
      activeLayerId: string | null
    },
  ) => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setIsGenerated(next.isGenerated)
    setIsGenerating(false)
    setLayoutSource(next.layoutSource ?? (next.isGenerated ? 'project' : null))
    const normalizedLayers = normalizeFloorLayerLabels(next.layers)
    const layerIdSet = new Set(normalizedLayers.map((layer) => layer.id))
    setLayers(normalizedLayers)
    setActiveLayerId((current) => {
      if (next.activeLayerId && layerIdSet.has(next.activeLayerId)) return next.activeLayerId
      if (current && layerIdSet.has(current)) return current
      return normalizedLayers[0]?.id ?? null
    })
  }, [])

  const updateFloorLayers = useCallback((updater: (layers: FloorLayer[]) => FloorLayer[]) => {
    setLayers((currentLayers) => {
      const nextLayers = updater(currentLayers)
      if (nextLayers === currentLayers) return currentLayers
      return normalizeFloorLayerLabels(nextLayers)
    })
  }, [])

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
    renameFloorLayer,
    deleteFloorLayer,
    setActiveLayerId,
    setFloorPlanFromProject,
    syncFloorPlanFromBubbles,
    moveActiveRoom,
    updateActiveRoom,
    addActiveRoom,
    removeActiveRooms,
    clearFloorPlan,
    replaceFloorPlanState,
    updateFloorLayers,
  }
}

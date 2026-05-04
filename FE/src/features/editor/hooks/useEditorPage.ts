import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import type {
  AddSpaceFormData,
  BubbleData,
  CollaborationUserType,
  ConnectionData,
  EditorDraftRecord,
  EditorDraftSnapshot,
  EditorMode,
  FloorCommentAttachmentInput,
  FloorCommentNotification,
  FloorCommentPin,
  FloorLayerOverlay,
  FloorOpening,
  FloorWall,
  Point2D,
  SaveStatus,
  ZoneData,
} from '../types'
import {
  DEFAULT_GRID_SNAP_INTERVAL_MM,
  FLOOR_MM_PER_PX,
  FLOOR_OPENING_PRESETS,
  FLOOR_WALL_HEIGHT_MAX_MM,
  FLOOR_WALL_HEIGHT_MIN_MM,
  FLOOR_WALL_PRESETS,
  FLOOR_WALL_THICKNESS_MAX_MM,
  FLOOR_WALL_THICKNESS_MIN_MM,
  GRID_SNAP_INTERVAL_OPTIONS_MM,
  INITIAL_ADD_SPACE_FORM,
} from '../constants'
import { useBubbles } from './useBubbles'
import { useConnections } from './useConnections'
import { usePanels } from './usePanels'
import { useStageSize } from './useStageSize'
import { useZones } from './useZones'
import { useFloorPlan } from './useFloorPlan'
import { useLlmEdit } from './useLlmEdit'
import { useFloorProjectImport } from './useFloorProjectImport'
import { useWorkspaceCommandPublisher } from './useWorkspaceCommandPublisher'
import { useEditorExportGuard } from './useEditorExportGuard'
import { useEditorFloorSync } from './useEditorFloorSync'
import { EDITOR_SITE_FIT_PADDING_PX, useEditorSiteBoundary } from './useEditorSiteBoundary'
import { useEditorZoom } from './useEditorZoom'
import { calcAreaM2FromMm } from '../utils/bubbleCalc'
import type { EmptyCanvasDblClickInfo } from '../components/canvas/BubbleCanvas'
import {
  mapAdjacencyToConnections,
  mapFloorProjectToBubbles,
  mapFloorProjectToWalls,
  mapFloorProjectToOpenings,
} from '../utils/floorProjectMapper'
import { deriveAutoWallsFromRooms } from '../utils/autoWalls'
import type { AxisAlignedRect } from '../utils/geometry2d'
import { toRectFloorRoom } from '../utils/floorRoomTransform'
import { deriveAutoOpeningsFromConnections, normalizeOpeningWithinWall } from '../utils/floorOpeningSync'
import {
  clampWallHeightMm,
  clampWallThicknessMm,
} from '../utils/wallSync'
import {
  buildWallOutsideOverlapSegments,
  getWallGeometryKey,
  getWallOverlapInterval,
  projectAxisAlignedWall,
} from '../utils/wallGeometry'
import {
  buildMovedFloorRoomsState,
  buildResizedFloorRoomsState,
} from '../utils/floorRoomDerivedState'
import { createsNewWallRoomCollision } from '../utils/wallRoomCollision'
import type { FloorProject } from '../types/floorProject.types'
import { getDraft, setDraft } from '../lib/draftDb'
import { useAuthStore } from '@/shared/stores/authStore'
import { useEditorProjectName } from './useEditorProjectName'
import { useInitialIfcImport } from './useInitialIfcImport'
import { runForceDirectedBubbleLayout } from '../utils/forceBubbleLayout'

/** 에디터 모드 허용 목록 — URL 파라미터 검증용 */
const EDITOR_MODES: EditorMode[] = ['bubble', '2d', '3d', 'view']

interface DrawingSnapshot {
  bubbles: BubbleData[]
  connections: ConnectionData[]
  floorWalls: FloorWall[]
  floorOpenings: FloorOpening[]
}

const WALL_ROOM_COLLISION_INSET_PX = 2
const OPENING_MIN_WIDTH_MM = 1
const OPENING_MAX_WIDTH_MM = 4000
const OPENING_NORMALIZE_OPTIONS = {
  minWidthMm: OPENING_MIN_WIDTH_MM,
  maxWidthMm: OPENING_MAX_WIDTH_MM,
} as const

const DEFAULT_DESIGNER_NAME = '설계자'
const DEFAULT_CLIENT_NAME = '고객사 담당자'
const DEFAULT_WALL_MATERIAL = '콘크리트'

function createLocalId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** 2D 벽 고유 ID 생성 */
function createFloorWallId(): string {
  return `wall-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

/** 2D 개구부 고유 ID 생성 */
function createFloorOpeningId(): string {
  return `opening-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

function normalizeCommentAttachments(attachments: FloorCommentAttachmentInput[] = []) {
  return attachments.map((attachment) => ({
    id: createLocalId('attachment'),
    kind: attachment.kind,
    name: attachment.name,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    url: attachment.url,
  }))
}

/** URL 파라미터에서 모드 파싱 — 허용 목록 외 값은 'bubble'(기본값)으로 처리 */
function resolveMode(value: string | null): EditorMode {
  return EDITOR_MODES.includes(value as EditorMode) ? (value as EditorMode) : 'bubble'
}

/** 두 연결선 쌍이 동일한지 비교 (방향 무관) */
function isSameConnection(
  a: { from: string; to: string },
  b: { from: string; to: string },
): boolean {
  return (a.from === b.from && a.to === b.to) || (a.from === b.to && a.to === b.from)
}

/**
 * EditorPage 전체 비즈니스 로직 훅
 * 버블·연결선·조닝·패널·평면도·UI 상태를 하위 훅에서 합성해 관리
 */
export function useEditorPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const { currentProjectName } = useEditorProjectName(projectId)
  const mode = resolveMode(searchParams.get('mode'))
  const workspaceCommandPublisher = useWorkspaceCommandPublisher({
    projectId,
    source: mode,
  })

  const { containerRef, stageSize } = useStageSize()

  // 버블(공간) 상태
  const {
    bubbles,
    selectedId,
    selectedIds,
    previousSelectedId,
    handleBubbleSelect,
    handleBubbleDrag,
    handleBubbleMove,
    handleMarqueeSelect,
    clearSelection,
    handleBubbleResize,
    handleLabelChange,
    handleTypeChange,
    handleWidthChange,
    handleHeightChange,
    handleRatioChange,
    handleColorChange,
    handleMaterialChange,
    addBubble,
    addBubbleAt,
    replaceBubbles,
    deleteBubble,
  } = useBubbles()

  // 연결선 상태
  const {
    connections,
    isModalOpen: isLineStyleModalOpen,
    selectedStyle: selectedLineStyle,
    connectionPair: lineConnectionPair,
    openModal,
    openModalWithPair,
    confirmModal: confirmLineStyleModal,
    closeModal: closeLineStyleModal,
    setSelectedStyle,
    removeConnectionsForBubble,
    removeConnection,
    replaceConnections,
  } = useConnections()

  /** 선택된 연결선 (Delete 키/삭제 도구 대상) */
  const [selectedConnectionPair, setSelectedConnectionPair] = useState<{ from: string; to: string } | null>(null)
  /** 2D 평면도 편집 벽 목록 */
  const [floorWalls, setFloorWalls] = useState<FloorWall[]>([])
  /** 사용자가 숨긴 자동 파생 벽 ID 목록 */
  const [hiddenAutoWallIds, setHiddenAutoWallIds] = useState<string[]>([])
  /** 2D에서 선택된 벽 */
  const [selectedFloorWallId, setSelectedFloorWallId] = useState<string | null>(null)
  /** 2D에서 멀티 선택된 벽 */
  const [selectedFloorWallIds, setSelectedFloorWallIds] = useState<string[]>([])
  /** 2D 개구부(문/창문) 목록 */
  const [floorOpenings, setFloorOpenings] = useState<FloorOpening[]>([])
  /**
   * IFC FloorProject에 walls/openings가 포함된 경우 true.
   * true일 때는 자동 추론(autoWalls/autoOpenings)보다 IFC 직접 매핑 데이터를 우선한다.
   */
  const [isProjectStructurePreferred, setIsProjectStructurePreferred] = useState(false)
  /** 사용자가 숨긴 자동 파생 개구부 ID 목록 */
  const [hiddenAutoOpeningIds, setHiddenAutoOpeningIds] = useState<string[]>([])
  /** 2D에서 선택된 개구부 */
  const [selectedFloorOpeningId, setSelectedFloorOpeningId] = useState<string | null>(null)
  /** 2D에서 멀티 선택된 개구부 */
  const [selectedFloorOpeningIds, setSelectedFloorOpeningIds] = useState<string[]>([])

  const isAutoDerivedWallId = useCallback((wallId: string) =>
    wallId.startsWith('auto-room-') || wallId.startsWith('auto-shared-')
  , [])

  // 조닝 상태
  const {
    zones,
    isModalOpen: isZoningModalOpen,
    editingZoneId,
    formData: zoningFormData,
    setFormData: setZoningFormData,
    autoColorPreview: zoningAutoColorPreview,
    openAddModal: openZoningModal,
    openEditModal,
    closeModal: closeZoningModal,
    toggleBubble: toggleZoningBubble,
    confirmModal: confirmZoningModal,
    deleteZone,
    replaceZonesState,
  } = useZones(bubbles)

  // 우측 패널 드래그·리사이즈 상태
  const { panelOffsets, panelOpenState, panelHeights, panelWidths, panelZIndexes, startDrag, startResize, togglePanel, resetPanelPositions } = usePanels(mode)

  // 2D 평면도 층 상태
  const {
    isGenerated: isFloorPlanGenerated,
    isGenerating: isFloorPlanGenerating,
    layoutSource: floorPlanLayoutSource,
    layers: floorLayers,
    activeLayerId: activeFloorLayerId,
    activeRooms: floorRooms,
    generateFloorPlan,
    refreshFloorPlan,
    addFloorLayer,
    renameFloorLayer,
    deleteFloorLayer,
    setActiveLayerId: setActiveFloorLayerId,
    setFloorPlanFromProject,
    syncFloorPlanFromBubbles,
    moveActiveRoom,
    updateActiveRoom,
    removeActiveRooms,
    clearFloorPlan,
    replaceFloorPlanState,
  } = useFloorPlan()
  /** 버블 편집 잠금은 현재 비활성 상태(false 고정) */
  const isBubbleEditLocked = false
  const isBubbleReadOnly = isBubbleEditLocked
  const canSyncBubbleStateFrom2D = floorPlanLayoutSource === 'bubble' && activeFloorLayerId === 'floor-1'

  // 버블·연결선 변경 시 이미 생성된 평면도를 조용히 갱신 (로딩 없음)
  useEffect(() => {
    if (mode !== 'bubble') return
    if (floorPlanLayoutSource === 'bubble' && isFloorPlanGenerated && bubbles.length > 0 && stageSize.width > 0) {
      refreshFloorPlan(bubbles, connections, stageSize.width, stageSize.height)
    }
  }, [mode, bubbles, connections, stageSize.width, stageSize.height, isFloorPlanGenerated, floorPlanLayoutSource, refreshFloorPlan])

  // 버블이 1개 이상 생기면 평면도가 없을 때 즉시 자동 생성 (모드 무관)
  useEffect(() => {
    if (!isFloorPlanGenerated && !isFloorPlanGenerating && bubbles.length > 0 && stageSize.width > 0) {
      generateFloorPlan(bubbles, connections, stageSize.width, stageSize.height)
    }
  }, [isFloorPlanGenerated, isFloorPlanGenerating, bubbles, connections, stageSize.width, stageSize.height, generateFloorPlan])

  // 버블이 모두 삭제되면 2D/3D 레이어도 함께 초기화
  useEffect(() => {
    if (bubbles.length > 0) return
    if (!isFloorPlanGenerated && !isFloorPlanGenerating) return
    clearFloorPlan()
    const timer = window.setTimeout(() => {
      setIsProjectStructurePreferred(false)
      setFloorWalls([])
      setHiddenAutoWallIds([])
      setSelectedFloorWallId(null)
      setSelectedFloorWallIds([])
      setFloorOpenings([])
      setHiddenAutoOpeningIds([])
      setSelectedFloorOpeningId(null)
      setSelectedFloorOpeningIds([])
    }, 0)
    return () => window.clearTimeout(timer)
  }, [bubbles.length, isFloorPlanGenerated, isFloorPlanGenerating, clearFloorPlan])

  // Delete/Backspace 키로 선택된 버블 또는 연결선 삭제 (input 포커스 중엔 무시)
  const handleDeleteSelected = useCallback(() => {
    if (mode === 'bubble' && isBubbleReadOnly) return
    if (mode === '2d') {
      const selectedRoomIds = Array.from(new Set([
        ...selectedIds,
        ...(selectedId ? [selectedId] : []),
      ]))

      if (selectedFloorOpeningIds.length === 0 && selectedFloorWallIds.length === 0 && !selectedFloorOpeningId && !selectedFloorWallId && selectedRoomIds.length > 0) {
        removeActiveRooms(selectedRoomIds)
        if (canSyncBubbleStateFrom2D) {
          selectedRoomIds.forEach((id) => {
            deleteBubble(id)
            removeConnectionsForBubble(id)
          })
        } else {
          clearSelection()
        }
        setSelectedConnectionPair(null)
        return
      }

      if (!(selectedFloorOpeningIds.length > 0 || selectedFloorWallIds.length > 0 || selectedFloorOpeningId || selectedFloorWallId)) {
        return
      }

      const openingIdSet = new Set<string>([
        ...(selectedFloorOpeningIds.length > 0 ? selectedFloorOpeningIds : []),
        ...(selectedFloorOpeningId ? [selectedFloorOpeningId] : []),
      ])
      const wallIdSet = new Set<string>([
        ...(selectedFloorWallIds.length > 0 ? selectedFloorWallIds : []),
        ...(selectedFloorWallId ? [selectedFloorWallId] : []),
      ])

      // 선택된 벽은 연결된 개구부도 함께 삭제한다.
      setFloorOpenings((prev) =>
        prev.filter((opening) => !openingIdSet.has(opening.id) && !wallIdSet.has(opening.wallId)),
      )
      const autoOpeningIdsToHide = Array.from(openingIdSet).filter((openingId) => openingId.startsWith('auto-door-'))
      const autoOpeningIdsFromDeletedWalls = Array.from(wallIdSet)
        .map((wallId) => {
          if (!wallId.startsWith('auto-shared-')) return null
          const pair = wallId.replace(/^auto-shared-/, '').replace(/-seg-\d+$/, '')
          return pair ? `auto-door-${pair}` : null
        })
        .filter((id): id is string => Boolean(id))
      const newHiddenOpeningIds = Array.from(new Set([...autoOpeningIdsToHide, ...autoOpeningIdsFromDeletedWalls]))
      if (newHiddenOpeningIds.length > 0) {
        setHiddenAutoOpeningIds((prev) => {
          const merged = new Set(prev)
          newHiddenOpeningIds.forEach((id) => merged.add(id))
          return Array.from(merged)
        })
      }

      if (wallIdSet.size > 0) {
        const autoWallIds = Array.from(wallIdSet).filter((wallId) => isAutoDerivedWallId(wallId))
        if (autoWallIds.length > 0) {
          setHiddenAutoWallIds((prev) => {
            const merged = new Set(prev)
            autoWallIds.forEach((id) => merged.add(id))
            return Array.from(merged)
          })
        }
        setFloorWalls((prev) => prev.filter((wall) => !wallIdSet.has(wall.id)))
      }

      setSelectedFloorOpeningId(null)
      setSelectedFloorWallId(null)
      setSelectedFloorOpeningIds([])
      setSelectedFloorWallIds([])
      return
    }
    if (selectedConnectionPair) {
      removeConnection(selectedConnectionPair.from, selectedConnectionPair.to)
      setSelectedConnectionPair(null)
      return
    }
    selectedIds.forEach((id) => {
      deleteBubble(id)
      removeConnectionsForBubble(id)
    })
  }, [
    canSyncBubbleStateFrom2D,
    mode,
    isBubbleReadOnly,
    selectedFloorOpeningId,
    selectedFloorWallId,
    selectedFloorOpeningIds,
    selectedFloorWallIds,
    selectedConnectionPair,
    selectedId,
    selectedIds,
    clearSelection,
    removeActiveRooms,
    deleteBubble,
    removeConnectionsForBubble,
    removeConnection,
    isAutoDerivedWallId,
  ])

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!target || !(target instanceof HTMLElement)) return false
      if (target.isContentEditable) return true
      return (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      )
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return
      const isDeleteKey =
        e.key === 'Delete' ||
        e.key === 'Backspace' ||
        e.code === 'Delete' ||
        e.code === 'Backspace'
      if (!isDeleteKey) return
      e.preventDefault()
      handleDeleteSelected()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleDeleteSelected])

  // UI 전용 상태
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [addSpaceFormData, setAddSpaceFormData] = useState<AddSpaceFormData>(INITIAL_ADD_SPACE_FORM)
  const [isCollaborationMode, setIsCollaborationMode] = useState(false)
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null)
  const [collaborationTab, setCollaborationTab] = useState<'history' | 'thread'>('history')
  const [commentPins, setCommentPins] = useState<FloorCommentPin[]>([])
  const [commentNotifications, setCommentNotifications] = useState<FloorCommentNotification[]>([])
  const [isLibraryOpen, setIsLibraryOpen] = useState(false)
  const [isGridVisible, setIsGridVisible] = useState(false)
  const [selectedTool, setSelectedTool] = useState<string>('selection')
  /** 연결 도구에서 첫 번째로 선택된 버블 id */
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null)
  /** 인라인 라벨 편집 상태 */
  const [labelEditState, setLabelEditState] = useState<{
    id: string; label: string; x: number; y: number; width: number; height: number
  } | null>(null)
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [isGridSnapEnabled, setIsGridSnapEnabled] = useState(true)
  const [gridSnapIntervalMm, setGridSnapIntervalMm] = useState<number>(DEFAULT_GRID_SNAP_INTERVAL_MM)
  const [wallCreatePreset, setWallCreatePreset] = useState<{
    type: FloorWall['type']
    thickness: number
    heightMm: number
  }>({
    type: 'general',
    thickness: FLOOR_WALL_PRESETS.general.thickness,
    heightMm: FLOOR_WALL_PRESETS.general.heightMm,
  })
  const [isLayerOverlayMode, setIsLayerOverlayMode] = useState(false)
  const [overlayLayerIds, setOverlayLayerIds] = useState<string[]>([])
  const [overlayOpacityByLayerId, setOverlayOpacityByLayerId] = useState<Record<string, number>>({})
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [autosaveReadyProjectId, setAutosaveReadyProjectId] = useState<string | null>(null)
  const attemptedInitialIfcImportProjectIdRef = useRef<string | null>(null)
  const localVersionRef = useRef(0)
  const previousSnapshotRef = useRef<string | null>(null)
  const hasUserEditedRef = useRef(false)
  const localSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingDraftRecordRef = useRef<EditorDraftRecord | null>(null)
  const draftLoadTokenRef = useRef(0)
  const draftLoadBaselineRef = useRef<string | null>(null)
  const draftLoadingProjectIdRef = useRef<string | null>(null)
  const latestDraftSnapshotRef = useRef<EditorDraftSnapshot | null>(null)
  const flushPendingDraftSave = useCallback(() => {
    if (localSaveTimerRef.current !== null) {
      clearTimeout(localSaveTimerRef.current)
      localSaveTimerRef.current = null
    }

    const pendingDraftRecord = pendingDraftRecordRef.current
    if (!pendingDraftRecord) return

    pendingDraftRecordRef.current = null
    void setDraft(pendingDraftRecord.projectId, pendingDraftRecord).catch(() => {
      setSaveStatus('error')
    })
  }, [])
  const authUser = useAuthStore((state) => state.user)
  const currentUserType: CollaborationUserType = authUser?.user_type === 'CUSTOMER' ? 'CUSTOMER' : 'DESIGNER'
  const counterpartType: CollaborationUserType = currentUserType === 'DESIGNER' ? 'CUSTOMER' : 'DESIGNER'
  const currentUserName = authUser?.name?.trim()
    ? authUser.name.trim()
    : (currentUserType === 'DESIGNER' ? DEFAULT_DESIGNER_NAME : DEFAULT_CLIENT_NAME)

  // Shift+L: 층 겹쳐보기 모드 토글 (2D/3D 전용)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.repeat) return
      if (!e.shiftKey || e.code !== 'KeyL') return
      if (mode !== '2d' && mode !== '3d') return
      e.preventDefault()
      setIsLayerOverlayMode((prev) => !prev)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode])

  useEffect(() => {
    const layerIdSet = new Set(floorLayers.map((layer) => layer.id))
    const syncTimer = window.setTimeout(() => {
      setOverlayLayerIds((prev) =>
        prev.filter((layerId) => layerIdSet.has(layerId) && layerId !== activeFloorLayerId),
      )
      setOverlayOpacityByLayerId((prev) => {
        const next: Record<string, number> = {}
        floorLayers.forEach((layer) => {
          next[layer.id] = prev[layer.id] ?? 0.35
        })
        return next
      })
      if (floorLayers.length === 0) {
        setIsLayerOverlayMode(false)
      }
    }, 0)
    return () => window.clearTimeout(syncTimer)
  }, [floorLayers, activeFloorLayerId])

  /** 자동 생성된 2D 방 경계선을 벽 데이터로 파생 (속성 편집 승격용) */
  // 자동 벽 파생은 단일 유틸 구현을 사용해 2D 캔버스와 동일 규칙을 유지한다.
  const autoFloorWalls = deriveAutoWallsFromRooms(floorRooms)
  const shouldUseAutoWalls = !isProjectStructurePreferred || floorWalls.length === 0
  const autoFloorWallsForMerge = useMemo(
    () => (shouldUseAutoWalls ? autoFloorWalls : []),
    [shouldUseAutoWalls, autoFloorWalls],
  )
  const visibleAutoFloorWalls = useMemo(() => {
    if (hiddenAutoWallIds.length === 0) return autoFloorWallsForMerge
    const hiddenSet = new Set(hiddenAutoWallIds)
    return autoFloorWallsForMerge.filter((wall) => !hiddenSet.has(wall.id))
  }, [autoFloorWallsForMerge, hiddenAutoWallIds])
  /** 연결선 기반 자동 문(개구부) 파생 */
  const shouldUseAutoOpenings = !isProjectStructurePreferred || floorOpenings.length === 0
  const autoFloorOpeningsRaw = useMemo(
    () =>
      (shouldUseAutoOpenings
        ? deriveAutoOpeningsFromConnections(connections, visibleAutoFloorWalls, OPENING_NORMALIZE_OPTIONS)
        : []),
    [connections, visibleAutoFloorWalls, shouldUseAutoOpenings],
  )
  const autoFloorOpenings = useMemo(() => {
    if (hiddenAutoOpeningIds.length === 0) return autoFloorOpeningsRaw
    const hiddenSet = new Set(hiddenAutoOpeningIds)
    return autoFloorOpeningsRaw.filter((opening) => !hiddenSet.has(opening.id))
  }, [autoFloorOpeningsRaw, hiddenAutoOpeningIds])
  /** 수동 벽 + 자동 파생 벽 병합(수동 우선) */
  const mergedFloorWalls = useMemo(() => {
    const merged = new Map<string, FloorWall>()
    visibleAutoFloorWalls.forEach((wall) => merged.set(wall.id, wall))
    floorWalls.forEach((wall) => merged.set(wall.id, wall))
    return Array.from(merged.values())
  }, [visibleAutoFloorWalls, floorWalls])

  // 자동 벽 재계산으로 사라진 ID는 숨김 목록에서 정리한다.
  useEffect(() => {
    const pruneTimer = window.setTimeout(() => {
      setHiddenAutoWallIds((prev) => {
        if (prev.length === 0) return prev
        const autoIdSet = new Set(autoFloorWallsForMerge.map((wall) => wall.id))
        const next = prev.filter((wallId) => autoIdSet.has(wallId))
        return next.length === prev.length ? prev : next
      })
    }, 0)
    return () => window.clearTimeout(pruneTimer)
  }, [autoFloorWallsForMerge])

  // 자동 개구부 재계산으로 사라진 ID는 숨김 목록에서 정리한다.
  useEffect(() => {
    const pruneTimer = window.setTimeout(() => {
      setHiddenAutoOpeningIds((prev) => {
        if (prev.length === 0) return prev
        const autoIdSet = new Set(autoFloorOpeningsRaw.map((opening) => opening.id))
        const next = prev.filter((openingId) => autoIdSet.has(openingId))
        return next.length === prev.length ? prev : next
      })
    }, 0)
    return () => window.clearTimeout(pruneTimer)
  }, [autoFloorOpeningsRaw])

  /** 수동 개구부 + 자동 개구부 병합(수동이 우선) */
  const mergedFloorOpenings = useMemo(() => {
    const merged = new Map<string, FloorOpening>()
    autoFloorOpenings.forEach((opening) => merged.set(opening.id, opening))
    floorOpenings.forEach((opening) => merged.set(opening.id, opening))
    return Array.from(merged.values())
  }, [autoFloorOpenings, floorOpenings])

  const draftSnapshot = useMemo<EditorDraftSnapshot>(() => ({
    bubbles,
    connections,
    zones,
    floorLayers,
    activeFloorLayerId,
    isFloorPlanGenerated,
    floorPlanLayoutSource,
    floorWalls,
    floorOpenings,
    hiddenAutoWallIds,
    hiddenAutoOpeningIds,
    isProjectStructurePreferred,
  }), [
    bubbles,
    connections,
    zones,
    floorLayers,
    activeFloorLayerId,
    isFloorPlanGenerated,
    floorPlanLayoutSource,
    floorWalls,
    floorOpenings,
    hiddenAutoWallIds,
    hiddenAutoOpeningIds,
    isProjectStructurePreferred,
  ])

  useEffect(() => {
    latestDraftSnapshotRef.current = draftSnapshot
  }, [draftSnapshot])

  useEffect(() => {
    return () => {
      flushPendingDraftSave()
    }
  }, [flushPendingDraftSave])

  useEffect(() => {
    if (!projectId) return
    if (draftLoadingProjectIdRef.current !== projectId) return
    const baselineSnapshot = draftLoadBaselineRef.current
    if (baselineSnapshot === null) return
    if (JSON.stringify(draftSnapshot) !== baselineSnapshot) {
      hasUserEditedRef.current = true
      draftLoadingProjectIdRef.current = null
    }
  }, [draftSnapshot, projectId])

  useEffect(() => {
    let isCancelled = false
    const loadToken = draftLoadTokenRef.current + 1
    draftLoadTokenRef.current = loadToken

    flushPendingDraftSave()

    draftLoadingProjectIdRef.current = projectId ?? null
    previousSnapshotRef.current = null
    pendingDraftRecordRef.current = null
    hasUserEditedRef.current = false
    draftLoadBaselineRef.current = JSON.stringify(latestDraftSnapshotRef.current)

    if (!projectId) {
      draftLoadingProjectIdRef.current = null
      return () => {
        isCancelled = true
      }
    }

    void getDraft(projectId)
      .then((draft) => {
        if (isCancelled || draftLoadTokenRef.current !== loadToken) return

        localVersionRef.current = draft?.versionNo ?? 0

        if (hasUserEditedRef.current) {
          setAutosaveReadyProjectId(projectId)
          return
        }

        if (draft?.data) {
          const data = draft.data
          previousSnapshotRef.current = JSON.stringify(data)
          replaceBubbles(data.bubbles)
          replaceConnections(data.connections)
          replaceZonesState(data.zones)
          replaceFloorPlanState({
            isGenerated: data.isFloorPlanGenerated,
            layoutSource: data.floorPlanLayoutSource,
            layers: data.floorLayers,
            activeLayerId: data.activeFloorLayerId,
          })
          setFloorWalls(data.floorWalls ?? [])
          setFloorOpenings(data.floorOpenings ?? [])
          setHiddenAutoWallIds(data.hiddenAutoWallIds ?? [])
          setHiddenAutoOpeningIds(data.hiddenAutoOpeningIds ?? [])
          setIsProjectStructurePreferred(data.isProjectStructurePreferred ?? false)
        } else {
          previousSnapshotRef.current = JSON.stringify(latestDraftSnapshotRef.current)
        }

        draftLoadingProjectIdRef.current = null
        setAutosaveReadyProjectId(projectId)
      })
      .catch(() => {
        if (isCancelled || draftLoadTokenRef.current !== loadToken) return
        previousSnapshotRef.current = JSON.stringify(latestDraftSnapshotRef.current)
        draftLoadingProjectIdRef.current = null
        setAutosaveReadyProjectId(projectId)
      })

    return () => {
      isCancelled = true
      draftLoadingProjectIdRef.current = null
    }
  }, [
    flushPendingDraftSave,
    projectId,
    replaceBubbles,
    replaceConnections,
    replaceFloorPlanState,
    replaceZonesState,
  ])

  useEffect(() => {
    if (!projectId || autosaveReadyProjectId !== projectId) return
    if (draftLoadingProjectIdRef.current === projectId) return

    const serializedSnapshot = JSON.stringify(draftSnapshot)

    if (previousSnapshotRef.current !== null && previousSnapshotRef.current === serializedSnapshot) {
      return
    }

    if (previousSnapshotRef.current === null && !hasUserEditedRef.current) {
      previousSnapshotRef.current = serializedSnapshot
      return
    }

    const nextVersionNo = localVersionRef.current + 1
    const draftRecord: EditorDraftRecord = {
      projectId,
      versionNo: nextVersionNo,
      data: draftSnapshot,
      savedAt: new Date().toISOString(),
    }

    localVersionRef.current = nextVersionNo
    pendingDraftRecordRef.current = draftRecord
    setSaveStatus('dirty')

    if (localSaveTimerRef.current !== null) {
      clearTimeout(localSaveTimerRef.current)
    }

    localSaveTimerRef.current = setTimeout(() => {
      localSaveTimerRef.current = null
      setSaveStatus('saving-local')

      void setDraft(projectId, draftRecord)
        .then(() => {
          pendingDraftRecordRef.current = null
          previousSnapshotRef.current = serializedSnapshot
          setSaveStatus('saved-local')
        })
        .catch(() => {
          setSaveStatus('error')
        })
    }, 1000)
  }, [autosaveReadyProjectId, draftSnapshot, projectId])

  const updateFloorWallFromEditable = useCallback((wallId: string, updater: (wall: FloorWall) => FloorWall) => {
    setFloorWalls((prev) => {
      const ensured = prev.some((wall) => wall.id === wallId)
        ? prev
        : (() => {
            const autoWall = visibleAutoFloorWalls.find((wall) => wall.id === wallId)
            return autoWall ? [...prev, autoWall] : prev
          })()
      return ensured.map((wall) => (wall.id === wallId ? updater(wall) : wall))
    })
  }, [visibleAutoFloorWalls])

  const ensureFloorWallInManual = useCallback((wallId: string) => {
    setFloorWalls((prev) => {
      if (prev.some((wall) => wall.id === wallId)) return prev
      const autoWall = visibleAutoFloorWalls.find((wall) => wall.id === wallId)
      return autoWall ? [...prev, autoWall] : prev
    })
  }, [visibleAutoFloorWalls])

  const ensureFloorOpeningInManual = useCallback((openingId: string) => {
    setFloorOpenings((prev) => {
      if (prev.some((opening) => opening.id === openingId)) return prev
      const autoOpening = autoFloorOpenings.find((opening) => opening.id === openingId)
      return autoOpening ? [...prev, autoOpening] : prev
    })
  }, [autoFloorOpenings])

  const updateFloorOpeningFromEditable = useCallback((openingId: string, updater: (opening: FloorOpening) => FloorOpening) => {
    setFloorOpenings((prev) => {
      const ensured = prev.some((opening) => opening.id === openingId)
        ? prev
        : (() => {
            const autoOpening = autoFloorOpenings.find((opening) => opening.id === openingId)
            return autoOpening ? [...prev, autoOpening] : prev
          })()
      return ensured.map((opening) => (opening.id === openingId ? updater(opening) : opening))
    })
  }, [autoFloorOpenings])

  /**
   * 현재 자동 파생된 개구부를 수동 편집 상태로 승격한다.
   * 자동 개구부가 재계산으로 사라지는 문제를 막고, 화면에 보이던 상태를 유지한다.
   */
  const promoteCurrentAutoFloorOpenings = useCallback(() => {
    setFloorOpenings((prev) => {
      if (autoFloorOpenings.length === 0) return prev
      const merged = new Map(prev.map((opening) => [opening.id, opening] as const))
      autoFloorOpenings.forEach((opening) => {
        if (!merged.has(opening.id)) merged.set(opening.id, opening)
      })
      return Array.from(merged.values())
    })
  }, [autoFloorOpenings])

  // 버블→2D 전환 직후 자동 문/창문도 즉시 편집 가능한 개구부 목록으로 승격한다.
  useEffect(() => {
    if (!isFloorPlanGenerated) return
    const promoteTimer = window.setTimeout(() => {
      promoteCurrentAutoFloorOpenings()
    }, 0)
    return () => window.clearTimeout(promoteTimer)
  }, [isFloorPlanGenerated, autoFloorOpenings, promoteCurrentAutoFloorOpenings])

  // 파생 상태: 선택된 버블 객체
  const selectedBubble = useMemo(
    () => {
      const matchedBubble = bubbles.find((bubble) => bubble.id === selectedId)
      if (matchedBubble) {
        return mode === '2d' ? { ...matchedBubble, material: undefined } : matchedBubble
      }
      if (!selectedId) return null
      const matchedRoom = floorRooms.find((room) => room.bubbleId === selectedId)
      if (!matchedRoom) return null
      return {
        id: matchedRoom.bubbleId,
        label: matchedRoom.label,
        type: matchedRoom.type,
        widthMm: matchedRoom.widthMm,
        heightMm: matchedRoom.heightMm,
        ratio: matchedRoom.area,
        color: matchedRoom.color,
        material: mode === '2d' ? undefined : matchedRoom.material,
      }
    },
    [bubbles, floorRooms, mode, selectedId],
  )
  const selectedFloorWall = useMemo(
    () =>
      floorWalls.find((wall) => wall.id === selectedFloorWallId) ??
      visibleAutoFloorWalls.find((wall) => wall.id === selectedFloorWallId) ??
      null,
    [floorWalls, visibleAutoFloorWalls, selectedFloorWallId],
  )
  const selectedFloorOpening = useMemo(
    () => mergedFloorOpenings.find((opening) => opening.id === selectedFloorOpeningId) ?? null,
    [mergedFloorOpenings, selectedFloorOpeningId],
  )
  const openingTargetWallById = useMemo(() => {
    const map = new Map<string, FloorWall>()
    mergedFloorWalls.forEach((wall) => map.set(wall.id, wall))
    return map
  }, [mergedFloorWalls])
  const normalizeOpeningByCurrentWall = useCallback((opening: FloorOpening): FloorOpening => {
    const wall = openingTargetWallById.get(opening.wallId)
    return wall ? normalizeOpeningWithinWall(opening, wall, OPENING_NORMALIZE_OPTIONS) : opening
  }, [openingTargetWallById])

  // 과거 좌표-hash 기반 auto-room wallId를 안정 ID 체계로 마이그레이션한다.
  useEffect(() => {
    const migrateTimer = window.setTimeout(() => {
      setFloorOpenings((prev) => {
        let changed = false
        let orphanedOpeningCount = 0
        const next = prev.map((opening): FloorOpening | null => {
          if (!opening.wallId.startsWith('auto-room-')) return opening
          if (openingTargetWallById.has(opening.wallId)) return opening
          const match = opening.wallId.match(/^auto-room-(.+?)-(top|right|bottom|left)-/)
          if (!match) return opening
          const roomId = match[1]
          const side = match[2]
          const baseId = `auto-room-${roomId}-${side}`
          if (openingTargetWallById.has(baseId)) {
            changed = true
            return { ...opening, wallId: baseId }
          }
          const fallback = mergedFloorWalls.find(
            (wall) => wall.id === baseId || wall.id.startsWith(`${baseId}-seg-`),
          )
          if (!fallback) {
            changed = true
            orphanedOpeningCount += 1
            return null
          }
          changed = true
          return { ...opening, wallId: fallback.id }
        })
        const filtered = next.filter((opening): opening is FloorOpening => opening !== null)
        if (orphanedOpeningCount > 0) {
          console.warn('[editor] dropped orphaned floor openings after wallId migration', {
            orphanedOpeningCount,
          })
        }
        return changed ? filtered : prev
      })
    }, 0)
    return () => window.clearTimeout(migrateTimer)
  }, [openingTargetWallById, mergedFloorWalls])

  const floorLayerOverlayItems = useMemo<FloorLayerOverlay[]>(() => {
    if (!isLayerOverlayMode) return []
    if (!activeFloorLayerId) return []
    const selectedSet = new Set(overlayLayerIds)
    return floorLayers
      .filter((layer) => layer.id !== activeFloorLayerId && selectedSet.has(layer.id))
      .map((layer) => ({
        layerId: layer.id,
        layerName: layer.name,
        opacity: overlayOpacityByLayerId[layer.id] ?? 0.35,
        rooms: layer.rooms,
      }))
  }, [isLayerOverlayMode, activeFloorLayerId, overlayLayerIds, floorLayers, overlayOpacityByLayerId])

  useEffect(() => {
    const normalizeTimer = window.setTimeout(() => {
      setFloorOpenings((prev) => {
        let hasChanges = false
        const next = prev.map((opening) => {
          const wall = openingTargetWallById.get(opening.wallId)
          if (!wall) return opening
          const normalized = normalizeOpeningWithinWall(opening, wall, OPENING_NORMALIZE_OPTIONS)
          if (normalized.widthMm !== opening.widthMm || normalized.wallPosition !== opening.wallPosition) {
            hasChanges = true
          }
          return normalized
        })
        return hasChanges ? next : prev
      })
    }, 0)
    return () => window.clearTimeout(normalizeTimer)
  }, [openingTargetWallById])
  const selectedCommentPin = useMemo(
    () => commentPins.find((pin) => pin.id === selectedPinId) ?? null,
    [commentPins, selectedPinId],
  )
  const hasDeletableSelection = useMemo(() => {
    if (mode === 'bubble') {
      if (isBubbleReadOnly) return false
      return Boolean(selectedConnectionPair) || selectedIds.length > 0
    }
    if (mode === '2d') {
      return Boolean(
        selectedFloorOpeningId ||
        selectedFloorWallId ||
        selectedFloorOpeningIds.length > 0 ||
        selectedFloorWallIds.length > 0,
      ) || selectedIds.length > 0
    }
    if (mode === '3d') {
      return selectedIds.length > 0
    }
    return false
  }, [
    mode,
    isBubbleReadOnly,
    selectedConnectionPair,
    selectedFloorOpeningId,
    selectedFloorWallId,
    selectedFloorOpeningIds,
    selectedFloorWallIds,
    selectedIds,
  ])
  const unreadCommentNotifications = useMemo(
    () =>
      commentNotifications.filter(
        (notification) => notification.recipientType === currentUserType && !notification.isRead,
      ),
    [commentNotifications, currentUserType],
  )

  // 파생 상태: 선택된 버블의 연결선 목록 (라벨 포함)
  const selectedBubbleConnections = useMemo(() => {
    if (!selectedId) return []
    return connections
      .filter((c) => c.from === selectedId || c.to === selectedId)
      .map((c) => {
        const targetId = c.from === selectedId ? c.to : c.from
        const targetBubble = bubbles.find((b) => b.id === targetId)
        return { targetId, targetLabel: targetBubble?.label ?? targetId, style: c.type }
      })
  }, [bubbles, connections, selectedId])

  const autoZones = useMemo(() => zones.filter((z) => z.source === 'auto'), [zones])
  const manualZones = useMemo(() => zones.filter((z) => z.source === 'manual'), [zones])

  // 파생 상태: 선택된 버블이 속한 조닝 목록
  const selectedBubbleZones = useMemo(() => {
    if (!selectedId) return []
    return zones
      .filter((z) => z.bubbleIds.includes(selectedId))
      .map((z) => ({ id: z.id, name: z.name, color: z.color, source: z.source }))
  }, [selectedId, zones])

  const zoningListItems = useMemo(() => [...autoZones, ...manualZones], [autoZones, manualZones])

  const {
    sitePoints,
    sitePlanPoints,
    siteAreaM2,
    siteAreaPyeong,
    canStartSaveFlow,
  } = useEditorSiteBoundary({
    projectId,
    stageWidth: stageSize.width,
    stageHeight: stageSize.height,
    bubbles,
    floorRooms,
    floorWalls: mergedFloorWalls,
    floorOpenings: mergedFloorOpenings,
    setSaveStatus,
  })

  const {
    zoom: currentZoom,
    handleWheelZoom,
    handleZoomIn,
    handleZoomOut,
    handleZoomChange,
  } = useEditorZoom({
    sitePlanPoints,
    stageWidth: stageSize.width,
    stageHeight: stageSize.height,
    fitPaddingPx: EDITOR_SITE_FIT_PADDING_PX,
  })

  const {
    syncPerimeterManualWallsForRoomResize,
    syncFloorDerivedStateFromRooms,
  } = useEditorFloorSync({
    canSyncBubbleStateFrom2D,
    connections,
    replaceConnections,
    setFloorWalls,
  })

  const {
    isExportModalOpen,
    isExportSelectionModalOpen,
    isIFCExportModalOpen,
    handleOpenExportSelectionModal,
    handleOpenExportModal,
    handleOpenIFCExportModal,
    closeExportModal,
    closeExportSelectionModal,
    closeIFCExportModal,
  } = useEditorExportGuard({ canStartSaveFlow })
  // ── 핸들러 ────────────────────────────────────────────────────────────────

  /** 편집 모드 전환 — 협업 모드·라이브러리는 모드 이탈 시 닫힘 */
  const setMode = (nextMode: EditorMode) => {
    setSearchParams({ mode: nextMode })
    if (nextMode !== '2d') setIsCollaborationMode(false)
    setIsLibraryOpen(false)
  }

  const handleOpenAddModal = () => {
    if (isBubbleReadOnly) return
    setAddSpaceFormData(INITIAL_ADD_SPACE_FORM)
    setIsAddModalOpen(true)
  }

  const handleConfirmAddSpace = () => {
    if (isBubbleReadOnly) return
    addBubble(addSpaceFormData)
    setIsAddModalOpen(false)
  }

  /** 선 스타일 모달 열기 — 현재·이전 선택 버블 쌍으로 연결 대상 자동 설정 */
  const handleOpenLineStyleModal = () => {
    if (isBubbleReadOnly) return
    openModal(selectedId, previousSelectedId)
  }

  /** 협업 모드 토글 — 진입 시 탭·핀 상태 초기화 */
  const handleToggleCollaboration = () => {
    setIsCollaborationMode((prev) => {
      if (!prev) {
        setCollaborationTab('history')
        setSelectedPinId(null)
      }
      return !prev
    })
  }

  const markPinNotificationsRead = useCallback((pinId: string) => {
    setCommentNotifications((prev) =>
      prev.map((notification) =>
        notification.pinId === pinId ? { ...notification, isRead: true } : notification,
      ),
    )
  }, [])

  /** 협업 핀 클릭 — 해당 핀의 스레드 탭으로 이동 */
  const handlePinClick = useCallback((pinId: string) => {
    setSelectedPinId(pinId)
    setCollaborationTab('thread')
    markPinNotificationsRead(pinId)
  }, [markPinNotificationsRead])

  /** 2D 평면도 핀 생성 + 첫 댓글 작성 */
  const handleCreateCommentPin = useCallback((
    x: number,
    y: number,
    content: string,
    attachments: FloorCommentAttachmentInput[] = [],
  ) => {
    const normalized = content.trim()
    const normalizedAttachments = normalizeCommentAttachments(attachments)
    if (!normalized && normalizedAttachments.length === 0) return

    const createdAt = new Date().toISOString()
    const pinId = createLocalId('pin')
    const messageId = createLocalId('comment')

    setCommentPins((prev) => {
      const nextPinNumber = prev.length + 1
      const nextPin: FloorCommentPin = {
        id: pinId,
        x,
        y,
        createdAt,
        createdById: authUser?.id ?? 'local-user',
        createdByName: currentUserName,
        createdByType: currentUserType,
        messages: [
          {
            id: messageId,
            pinId,
            authorId: authUser?.id ?? 'local-user',
            authorName: currentUserName,
            authorType: currentUserType,
            content: normalized,
            attachments: normalizedAttachments,
            createdAt,
          },
        ],
      }

      setCommentNotifications((prevNotifications) => ([
        ...prevNotifications,
        {
          id: createLocalId('noti'),
          pinId,
          senderName: currentUserName,
          recipientType: counterpartType,
          type: 'pin_new',
          message: `${currentUserName}님이 #${nextPinNumber} 핀에 댓글을 남겼습니다.`,
          createdAt,
          isRead: false,
        },
      ]))

      return [...prev, nextPin]
    })

    setSelectedPinId(pinId)
    setCollaborationTab('thread')
  }, [authUser?.id, currentUserName, currentUserType, counterpartType])

  /** 기존 핀 스레드에 답글 추가 */
  const handleAddCommentReply = useCallback((
    pinId: string,
    content: string,
    attachments: FloorCommentAttachmentInput[] = [],
  ) => {
    const normalized = content.trim()
    const normalizedAttachments = normalizeCommentAttachments(attachments)
    if (!normalized && normalizedAttachments.length === 0) return
    const createdAt = new Date().toISOString()
    const newMessageId = createLocalId('comment')
    let pinOrder = 0

    setCommentPins((prev) =>
      prev.map((pin, index) => {
        if (pin.id !== pinId) return pin
        pinOrder = index + 1
        return {
          ...pin,
          messages: [
            ...pin.messages,
            {
              id: newMessageId,
              pinId,
              authorId: authUser?.id ?? 'local-user',
              authorName: currentUserName,
              authorType: currentUserType,
              content: normalized,
              attachments: normalizedAttachments,
              createdAt,
            },
          ],
        }
      }),
    )

    setCommentNotifications((prev) => ([
      ...prev,
      {
        id: createLocalId('noti'),
        pinId,
        senderName: currentUserName,
        recipientType: counterpartType,
        type: 'comment_new',
        message: `${currentUserName}님이 #${Math.max(pinOrder, 1)} 핀에 답글을 남겼습니다.`,
        createdAt,
        isRead: false,
      },
    ]))

    setSelectedPinId(pinId)
    setCollaborationTab('thread')
  }, [authUser?.id, currentUserName, currentUserType, counterpartType])

  const getBubbleLabel = useCallback(
    (bubbleId: string) => bubbles.find((b) => b.id === bubbleId)?.label ?? bubbleId,
    [bubbles],
  )

  const handleOpenZoningModal = () => {
    if (isBubbleReadOnly) return
    openZoningModal()
  }

  const handleOpenEditZoningModal = (zone: ZoneData) => {
    if (isBubbleReadOnly) return
    openEditModal(zone)
  }

  const handleToggleZoningBubble = (bubbleId: string) => {
    if (isBubbleReadOnly) return
    toggleZoningBubble(bubbleId)
  }

  const handleConfirmZoningModal = () => {
    if (isBubbleReadOnly) return
    confirmZoningModal()
  }

  const handleDeleteZone = (zoneId: string) => {
    if (isBubbleReadOnly) return
    deleteZone(zoneId)
  }

  /** 버블 삭제 — 연결선도 함께 제거 */
  const handleDeleteBubble = (id: string) => {
    if (isBubbleReadOnly) return
    deleteBubble(id)
    removeConnectionsForBubble(id)
    if (selectedConnectionPair && (selectedConnectionPair.from === id || selectedConnectionPair.to === id)) {
      setSelectedConnectionPair(null)
    }
  }

  /**
   * 캔버스 버블 클릭 통합 핸들러
   * - connect 도구: 두 버블을 순서대로 선택하면 스타일 모달 표시
   * - 그 외: 기존 선택 로직 유지 (Shift 키 다중 선택 지원)
   */
  const handleBubbleSelectWithTool = (id: string, isShift = false) => {
    setSelectedConnectionPair(null)
    if (isBubbleReadOnly) {
      handleBubbleSelect(id, isShift)
      return
    }
    if (selectedTool === 'connect') {
      if (!connectingFromId) {
        setConnectingFromId(id)
        handleBubbleSelect(id)
      } else if (connectingFromId !== id) {
        openModalWithPair(connectingFromId, id)
        setConnectingFromId(null)
      } else {
        // 같은 버블 재클릭 → 연결 취소
        setConnectingFromId(null)
      }
    } else {
      handleBubbleSelect(id, isShift)
    }
  }

  /** 연결선 클릭 — 해당 연결선의 스타일 변경 모달 열기 */
  const handleConnectionClick = (conn: ConnectionData) => {
    if (isBubbleReadOnly) return
    if (selectedTool === 'delete') {
      removeConnection(conn.from, conn.to)
      setSelectedConnectionPair(null)
      return
    }
    if (selectedTool === 'selection') {
      const nextPair = { from: conn.from, to: conn.to }
      if (selectedConnectionPair && isSameConnection(selectedConnectionPair, nextPair)) {
        openModalWithPair(conn.from, conn.to, conn.type)
        return
      }
      setSelectedConnectionPair(nextPair)
      return
    }
    setSelectedConnectionPair(null)
    openModalWithPair(conn.from, conn.to, conn.type)
  }

  /** 연결 포인트 드래그 완료 — 선스타일 모달로 연결 생성/수정 */
  const handleConnectionCreate = (fromId: string, toId: string) => {
    if (isBubbleReadOnly) return
    openModalWithPair(fromId, toId)
    setConnectingFromId(null)
    setSelectedConnectionPair(null)
  }

  /** 도구 선택 — connect 도구에서 벗어날 때 연결 대기 상태 초기화 */
  const handleSetSelectedTool = (tool: string) => {
    if (isBubbleReadOnly && (tool === 'connect' || tool === 'delete')) {
      setSelectedTool('selection')
      setConnectingFromId(null)
      return
    }
    setSelectedTool(tool)
    if (tool !== 'connect') setConnectingFromId(null)
  }

  const handleClearCanvasSelection = () => {
    clearSelection()
    setSelectedConnectionPair(null)
    setSelectedFloorWallId(null)
    setSelectedFloorOpeningId(null)
    setSelectedFloorWallIds([])
    setSelectedFloorOpeningIds([])
  }

  const handleTwoDMarqueeSelect = useCallback(
    (
      payload: { roomIds: string[]; wallIds: string[]; openingIds: string[] },
      append = false,
    ) => {
      const { roomIds, wallIds, openingIds } = payload
      handleMarqueeSelect(roomIds, append)

      if (append) {
        setSelectedFloorWallIds((prev) => Array.from(new Set([...prev, ...wallIds])))
        setSelectedFloorOpeningIds((prev) => Array.from(new Set([...prev, ...openingIds])))
      } else {
        setSelectedFloorWallIds(wallIds)
        setSelectedFloorOpeningIds(openingIds)
      }

      setSelectedFloorWallId(wallIds.length > 0 ? wallIds[wallIds.length - 1] : null)
      setSelectedFloorOpeningId(openingIds.length > 0 ? openingIds[openingIds.length - 1] : null)
    },
    [handleMarqueeSelect],
  )

  /** 버블 더블클릭 → 인라인 라벨 편집 시작 */
  const handleBubbleLabelEdit = (info: { id: string; label: string; x: number; y: number; width: number; height: number }) => {
    if (isBubbleReadOnly) return
    setLabelEditState(info)
  }

  /** 빈 캔버스 더블클릭 → 버블 생성 후 즉시 라벨 편집 */
  const handleEmptyCanvasDblClick = (info: EmptyCanvasDblClickInfo) => {
    if (isBubbleReadOnly) return
    const newBubble = addBubbleAt(info.x, info.y)
    const scale = currentZoom / 100
    setLabelEditState({
      id: newBubble.id,
      label: newBubble.label,
      x: info.screenX - (newBubble.width * scale) / 2,
      y: info.screenY - (newBubble.height * scale) / 2,
      width: newBubble.width * scale,
      height: newBubble.height * scale,
    })
  }

  /** 인라인 라벨 편집 확정 */
  const confirmLabelEdit = (id: string, label: string) => {
    if (isBubbleReadOnly) return
    handleLabelChange(id, label)
    setLabelEditState(null)
  }

  const handleBubbleDragInBubble = useCallback((bubbleId: string, x: number, y: number) => {
    if (isBubbleReadOnly) return
    handleBubbleDrag(bubbleId, x, y)
  }, [isBubbleReadOnly, handleBubbleDrag])

  const handleBubbleResizeInBubble = useCallback((id: string, x: number, y: number, width: number, height: number) => {
    if (isBubbleReadOnly) return
    handleBubbleResize(id, x, y, width, height)
  }, [isBubbleReadOnly, handleBubbleResize])

  /** 2D 평면도 생성 버튼 핸들러 — 로딩 애니메이션 포함 */
  const handleGenerateFloorPlan = () => {
    generateFloorPlan(bubbles, connections, stageSize.width, stageSize.height)
  }

  /**
   * 버블 다이어그램 기준 2D 평면도 생성 진입점
   * - 버블이 있을 때만 생성
   * - 생성 시작 직후 2D 모드로 전환해 로딩/결과를 확인할 수 있게 한다.
   */
  const handleGenerateFloorPlanFromBubble = () => {
    if (bubbles.length === 0) return
    setSelectedTool('selection')
    setConnectingFromId(null)
    handleGenerateFloorPlan()
    setMode('2d')
  }

  const toggleGrid = () => {
    setIsGridVisible((prev) => {
      const next = !prev
      // 2D에서는 "그리드 표시"와 "그리드 스냅"을 동일 상태로 유지해 UI/동작 혼선을 줄인다.
      if (mode === '2d') setIsGridSnapEnabled(next)
      return next
    })
  }
  const toggleGridSnap = () => setIsGridSnapEnabled((prev) => !prev)
  const handleSetGridSnapIntervalMm = (value: number) => {
    if (!Number.isFinite(value)) return
    const requested = Math.max(1, Math.round(value))
    const nearest = GRID_SNAP_INTERVAL_OPTIONS_MM.reduce((best, candidate) =>
      Math.abs(candidate - requested) < Math.abs(best - requested) ? candidate : best,
    GRID_SNAP_INTERVAL_OPTIONS_MM[0])
    setGridSnapIntervalMm(nearest)
    // 간격을 고르면 해당 스냅이 즉시 체감되도록 활성화한다.
    setIsGridSnapEnabled(true)
    if (mode === '2d') setIsGridVisible(true)
  }
  const toggleLayerOverlayMode = () => setIsLayerOverlayMode((prev) => !prev)
  const handleToggleOverlayLayer = (layerId: string) => {
    if (!activeFloorLayerId || layerId === activeFloorLayerId) return
    setOverlayLayerIds((prev) =>
      prev.includes(layerId) ? prev.filter((id) => id !== layerId) : [...prev, layerId],
    )
  }
  const handleSetOverlayLayerOpacity = (layerId: string, opacity: number) => {
    const next = Math.min(Math.max(opacity, 0.1), 1)
    setOverlayOpacityByLayerId((prev) => ({ ...prev, [layerId]: next }))
  }

  /** 편집 가능한 벽 조회: 수동 벽 우선, 없으면 현재 보이는 자동 벽에서 조회 */
  const getEditableWallById = useCallback((wallId: string): FloorWall | null => {
    return (
      floorWalls.find((wall) => wall.id === wallId) ??
      visibleAutoFloorWalls.find((wall) => wall.id === wallId) ??
      null
    )
  }, [floorWalls, visibleAutoFloorWalls])

  /** 벽 편집 결과가 방 내부 충돌을 새로 만들면 true를 반환한다. */
  const isWallEditBlockedByRoomCollision = useCallback((
    wall: FloorWall,
    nextStart: Point2D,
    nextEnd: Point2D,
  ): boolean => {
    return createsNewWallRoomCollision({
      floorRooms,
      prevStart: wall.start,
      prevEnd: wall.end,
      nextStart,
      nextEnd,
      insetPx: WALL_ROOM_COLLISION_INSET_PX,
    })
  }, [floorRooms])

  /** 2D 벽 생성 */
  const handleCreateFloorWall = (
    start: Point2D,
    end: Point2D,
    options?: { type?: FloorWall['type']; thickness?: number; heightMm?: number },
  ) => {
    const nextType = options?.type ?? wallCreatePreset.type
    const fallbackPreset = FLOOR_WALL_PRESETS[nextType]
    const nextThickness = clampWallThicknessMm(
      options?.thickness ?? wallCreatePreset.thickness ?? fallbackPreset.thickness,
      FLOOR_WALL_THICKNESS_MIN_MM,
      FLOOR_WALL_THICKNESS_MAX_MM,
    )
    const nextHeightMm = clampWallHeightMm(
      options?.heightMm ?? wallCreatePreset.heightMm ?? fallbackPreset.heightMm,
      FLOOR_WALL_HEIGHT_MIN_MM,
      FLOOR_WALL_HEIGHT_MAX_MM,
    )
    const newWall: FloorWall = {
      id: createFloorWallId(),
      type: nextType,
      start,
      end,
      thickness: nextThickness,
      heightMm: nextHeightMm,
      material: DEFAULT_WALL_MATERIAL,
    }
    workspaceCommandPublisher.createWall(newWall)
    setFloorWalls((prev) => [...prev, newWall])
    setWallCreatePreset({
      type: nextType,
      thickness: nextThickness,
      heightMm: nextHeightMm,
    })
    setSelectedFloorWallId(newWall.id)
    setSelectedFloorWallIds([newWall.id])
    setSelectedFloorOpeningIds([])
    setSelectedFloorOpeningId(null)
    clearSelection()
    setSelectedTool('wall')
  }

  /** 2D 벽 선택 */
  const handleSelectFloorWall = (wallId: string | null, append = false) => {
    if (wallId === null) {
      setSelectedFloorWallId(null)
      setSelectedFloorWallIds([])
      return
    }
    if (wallId) ensureFloorWallInManual(wallId)
    if (append) {
      setSelectedFloorWallIds((prev) => {
        const exists = prev.includes(wallId)
        const next = exists ? prev.filter((id) => id !== wallId) : [...prev, wallId]
        setSelectedFloorWallId(next.length > 0 ? next[next.length - 1] : null)
        return next
      })
    } else {
      setSelectedFloorWallId(wallId)
      setSelectedFloorWallIds([wallId])
    }
    setSelectedFloorOpeningId(null)
    setSelectedFloorOpeningIds([])
    clearSelection()
  }

  /** 2D 벽 전체 이동 */
  const handleMoveFloorWall = (wallId: string, dx: number, dy: number) => {
    const targetWall = getEditableWallById(wallId)
    if (!targetWall) return
    const nextStart = { x: targetWall.start.x + dx, y: targetWall.start.y + dy }
    const nextEnd = { x: targetWall.end.x + dx, y: targetWall.end.y + dy }
    if (isWallEditBlockedByRoomCollision(targetWall, nextStart, nextEnd)) return

    ensureFloorWallInManual(wallId)
    setFloorWalls((prev) =>
      prev.map((wall) =>
        wall.id === wallId
          ? {
              ...wall,
              start: nextStart,
              end: nextEnd,
            }
          : wall,
      ),
    )
    workspaceCommandPublisher.updateWallGeometry(wallId, nextStart, nextEnd)
  }

  /** 2D 벽 끝점 편집 */
  const handleUpdateFloorWallEndpoint = (
    wallId: string,
    endpoint: 'start' | 'end',
    point: Point2D,
  ) => {
    const targetWall = getEditableWallById(wallId)
    if (!targetWall) return
    const nextStart = endpoint === 'start' ? point : targetWall.start
    const nextEnd = endpoint === 'end' ? point : targetWall.end
    if (isWallEditBlockedByRoomCollision(targetWall, nextStart, nextEnd)) return

    ensureFloorWallInManual(wallId)
    setFloorWalls((prev) => prev.map((wall) => (wall.id === wallId ? { ...wall, [endpoint]: point } : wall)))
    workspaceCommandPublisher.updateWallEndpoint(wallId, endpoint, point)
  }

  /** 2D 벽 삭제 */
  const handleDeleteFloorWall = (wallId: string) => {
    const hiddenIds = new Set<string>([wallId])
    const manualResidualWalls: FloorWall[] = []

    if (isAutoDerivedWallId(wallId)) {
      const targetAutoWall = autoFloorWalls.find((wall) => wall.id === wallId)
      const targetProjection = targetAutoWall ? projectAxisAlignedWall(targetAutoWall) : null

      if (targetAutoWall && targetProjection) {
        autoFloorWalls.forEach((candidate) => {
          if (candidate.id === targetAutoWall.id) return
          if (!isAutoDerivedWallId(candidate.id)) return
          const candidateProjection = projectAxisAlignedWall(candidate)
          if (!candidateProjection) return
          const overlap = getWallOverlapInterval(targetProjection, candidateProjection)
          if (!overlap) return

          hiddenIds.add(candidate.id)

          const outsideSegments = buildWallOutsideOverlapSegments(
            candidate,
            overlap.start,
            overlap.end,
          )

          outsideSegments.forEach((segment) => {
            manualResidualWalls.push({
              id: createFloorWallId(),
              start: segment.start,
              end: segment.end,
              type: candidate.type,
              thickness: candidate.thickness,
              heightMm: candidate.heightMm,
              material: candidate.material,
            })
          })
        })
      }

      setHiddenAutoWallIds((prev) => {
        const merged = new Set(prev)
        hiddenIds.forEach((id) => merged.add(id))
        return Array.from(merged)
      })
    }
    const autoOpeningIdsFromDeletedWalls = Array.from(hiddenIds)
      .map((id) => {
        if (!id.startsWith('auto-shared-')) return null
        const pair = id.replace(/^auto-shared-/, '').replace(/-seg-\d+$/, '')
        return pair ? `auto-door-${pair}` : null
      })
      .filter((id): id is string => Boolean(id))
    if (autoOpeningIdsFromDeletedWalls.length > 0) {
      setHiddenAutoOpeningIds((prev) => {
        const merged = new Set(prev)
        autoOpeningIdsFromDeletedWalls.forEach((id) => merged.add(id))
        return Array.from(merged)
      })
    }
    setFloorOpenings((prev) => prev.filter((opening) => !hiddenIds.has(opening.wallId)))
    setSelectedFloorOpeningIds((prev) =>
      prev.filter((openingId) => {
        const opening = mergedFloorOpenings.find((item) => item.id === openingId)
        if (!opening) return false
        return !hiddenIds.has(opening.wallId)
      }),
    )
    setFloorWalls((prev) => {
      const ensured = [...prev]
      hiddenIds.forEach((id) => {
        if (ensured.some((wall) => wall.id === id)) return
        const autoWall = autoFloorWalls.find((wall) => wall.id === id)
        if (autoWall) ensured.push(autoWall)
      })
      const next = ensured.filter((wall) => !hiddenIds.has(wall.id))
      const geometryKeySet = new Set(next.map(getWallGeometryKey))
      manualResidualWalls.forEach((wall) => {
        const key = getWallGeometryKey(wall)
        if (geometryKeySet.has(key)) return
        geometryKeySet.add(key)
        next.push(wall)
      })
      return next
    })
    workspaceCommandPublisher.deleteWall(wallId)
    if (selectedFloorWallId && hiddenIds.has(selectedFloorWallId)) setSelectedFloorWallId(null)
    setSelectedFloorWallIds((prev) => prev.filter((id) => !hiddenIds.has(id)))
  }

  /** 2D 벽 위 개구부 생성 */
  const handleCreateFloorOpening = (
    wallId: string,
    type: FloorOpening['type'],
    wallPosition: number,
    preferredId?: string,
  ) => {
    promoteCurrentAutoFloorOpenings()
    const clamped = Math.min(Math.max(wallPosition, 0), 1)
    const preset = FLOOR_OPENING_PRESETS[type]
    const rawOpening: FloorOpening = {
      id: preferredId ?? createFloorOpeningId(),
      type,
      wallId,
      wallPosition: clamped,
      widthMm: preset.widthMm,
      heightMm: preset.heightMm,
      sillHeightMm: preset.sillHeightMm,
      doorHingeSide: type === 'door' ? 'left' : undefined,
      doorSwingDirection: type === 'door' ? 'inward' : undefined,
    }
    const newOpening = normalizeOpeningByCurrentWall(rawOpening)
    const existingOpening = mergedFloorOpenings.find((opening) => opening.id === newOpening.id)
    setFloorOpenings((prev) => {
      const exists = prev.some((opening) => opening.id === newOpening.id)
      if (exists) return prev.map((opening) => (opening.id === newOpening.id ? newOpening : opening))
      return [...prev, newOpening]
    })
    workspaceCommandPublisher.upsertOpening(newOpening, Boolean(existingOpening))
    setHiddenAutoOpeningIds((prev) => prev.filter((id) => id !== newOpening.id))
    setSelectedFloorWallId(null)
    setSelectedFloorWallIds([])
    setSelectedFloorOpeningId(newOpening.id)
    setSelectedFloorOpeningIds([newOpening.id])
    clearSelection()
    setSelectedTool(type)
  }

  /** 2D 개구부 선택 */
  const handleSelectFloorOpening = (openingId: string | null, append = false) => {
    if (openingId === null) {
      setSelectedFloorOpeningId(null)
      setSelectedFloorOpeningIds([])
      return
    }
    if (openingId) promoteCurrentAutoFloorOpenings()
    if (openingId) ensureFloorOpeningInManual(openingId)
    if (append) {
      setSelectedFloorOpeningIds((prev) => {
        const exists = prev.includes(openingId)
        const next = exists ? prev.filter((id) => id !== openingId) : [...prev, openingId]
        setSelectedFloorOpeningId(next.length > 0 ? next[next.length - 1] : null)
        return next
      })
    } else {
      setSelectedFloorOpeningId(openingId)
      setSelectedFloorOpeningIds([openingId])
    }
    setSelectedFloorWallId(null)
    setSelectedFloorWallIds([])
    clearSelection()
  }

  /** 2D 개구부 위치(벽 따라) 변경 */
  const handleMoveFloorOpening = (openingId: string, wallPosition: number, wallId?: string) => {
    if (!Number.isFinite(wallPosition)) return
    const targetOpening = mergedFloorOpenings.find((opening) => opening.id === openingId)
    if (!targetOpening) return
    const clamped = Math.min(Math.max(wallPosition, 0), 1)
    const nextOpeningPreNormalized: FloorOpening = {
      ...targetOpening,
      wallPosition: clamped,
      wallId: wallId ?? targetOpening.wallId,
    }
    const nextOpening = normalizeOpeningByCurrentWall(nextOpeningPreNormalized)
    updateFloorOpeningFromEditable(openingId, () => nextOpening)
    workspaceCommandPublisher.updateOpening(nextOpening.type, openingId, {
      wall_id: nextOpening.wallId,
      wall_position: nextOpening.wallPosition,
    })
  }

  /** 2D 개구부 크기 변경 */
  const handleUpdateFloorOpeningSize = (openingId: string, widthMm: number, heightMm: number) => {
    if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm)) return
    const targetOpening = mergedFloorOpenings.find((opening) => opening.id === openingId)
    if (!targetOpening) return
    const nextWidth = Math.min(Math.max(Math.round(widthMm), 300), 4000)
    const nextHeight = Math.min(Math.max(Math.round(heightMm), 300), 4000)
    const nextOpeningPreNormalized: FloorOpening = {
      ...targetOpening,
      widthMm: nextWidth,
      heightMm: nextHeight,
    }
    const nextOpening = normalizeOpeningByCurrentWall(nextOpeningPreNormalized)
    updateFloorOpeningFromEditable(openingId, () => nextOpening)
    workspaceCommandPublisher.updateOpening(nextOpening.type, openingId, {
      width: nextOpening.widthMm,
      height: nextOpening.heightMm,
      wall_position: nextOpening.wallPosition,
    })
  }

  /** 2D 창문 창턱 높이 변경 */
  const handleUpdateFloorWindowSillHeight = (openingId: string, sillHeightMm: number) => {
    if (!Number.isFinite(sillHeightMm)) return
    const targetOpening = mergedFloorOpenings.find((opening) => opening.id === openingId)
    if (!targetOpening || targetOpening.type !== 'window') return
    const next = Math.min(Math.max(Math.round(sillHeightMm), 0), 2500)
    updateFloorOpeningFromEditable(openingId, (opening) => ({ ...opening, sillHeightMm: next }))
    workspaceCommandPublisher.updateOpening('window', openingId, {
      sill_height: next,
    })
  }

  /** 2D 문 개폐 방향 변경 */
  const handleUpdateFloorDoorSwingDirection = (
    openingId: string,
    swingDirection: NonNullable<FloorOpening['doorSwingDirection']>,
  ) => {
    const targetOpening = mergedFloorOpenings.find((opening) => opening.id === openingId)
    if (!targetOpening || targetOpening.type !== 'door') return
    updateFloorOpeningFromEditable(openingId, (opening) => ({ ...opening, doorSwingDirection: swingDirection }))
    workspaceCommandPublisher.updateOpening('door', openingId, {
      door_swing_direction: swingDirection,
    })
  }

  /** 2D 문 경첩 위치 변경 */
  const handleUpdateFloorDoorHingeSide = (
    openingId: string,
    hingeSide: NonNullable<FloorOpening['doorHingeSide']>,
  ) => {
    const targetOpening = mergedFloorOpenings.find((opening) => opening.id === openingId)
    if (!targetOpening || targetOpening.type !== 'door') return
    updateFloorOpeningFromEditable(openingId, (opening) => ({ ...opening, doorHingeSide: hingeSide }))
    workspaceCommandPublisher.updateOpening('door', openingId, {
      door_hinge_side: hingeSide,
    })
  }

  /** 2D 개구부 삭제 */
  const handleDeleteFloorOpening = (openingId: string) => {
    const targetOpening = mergedFloorOpenings.find((opening) => opening.id === openingId)
    setFloorOpenings((prev) => prev.filter((opening) => opening.id !== openingId))
    if (openingId.startsWith('auto-door-')) {
      setHiddenAutoOpeningIds((prev) => {
        if (prev.includes(openingId)) return prev
        return [...prev, openingId]
      })
    }
    if (targetOpening) {
      workspaceCommandPublisher.deleteOpening(targetOpening)
    }
    if (selectedFloorOpeningId === openingId) setSelectedFloorOpeningId(null)
    setSelectedFloorOpeningIds((prev) => prev.filter((id) => id !== openingId))
  }

  /** 2D 방 드래그 리사이즈 */
  const handleResizeFloorRoom = (bubbleId: string, x: number, y: number, width: number, height: number) => {
    promoteCurrentAutoFloorOpenings()
    const resizeState = buildResizedFloorRoomsState({
      floorRooms,
      bubbleId,
      x,
      y,
      widthPx: width,
      heightPx: height,
      mmPerPx: FLOOR_MM_PER_PX,
      minSizePx: 40,
      minSizeMm: 100,
    })
    if (!resizeState) return

    const {
      nextRooms,
      prevRect,
      nextRect,
      nextWidthPx,
      nextHeightPx,
      nextWidthMm,
      nextHeightMm,
      nextAreaM2,
    } = resizeState

    if (canSyncBubbleStateFrom2D) {
      handleWidthChange(bubbleId, nextWidthMm)
      handleHeightChange(bubbleId, nextHeightMm)
      // 2D 기준 배치 좌표를 Bubble에도 즉시 반영해 모드 전환 시 불일치를 방지한다.
      handleBubbleMove(bubbleId, x, y)
    }
    updateActiveRoom(bubbleId, (room) =>
      toRectFloorRoom(room, {
        x,
        y,
        width: nextWidthPx,
        height: nextHeightPx,
        widthMm: nextWidthMm,
        heightMm: nextHeightMm,
        area: nextAreaM2,
      }),
    )
    syncPerimeterManualWallsForRoomResize(bubbleId, prevRect, nextRect)
    syncFloorDerivedStateFromRooms(nextRooms)
  }

  /** 2D 방 위치 이동 (크기/면적 유지) */
  const handleMoveFloorRoom = (bubbleId: string, x: number, y: number) => {
    promoteCurrentAutoFloorOpenings()
    const moveState = buildMovedFloorRoomsState({
      floorRooms,
      bubbleId,
      nextX: x,
      nextY: y,
      selectedBubbleIds: selectedIds,
    })
    if (!moveState) return
    const { nextRooms, shouldMoveMulti } = moveState

    if (shouldMoveMulti) {
      nextRooms.forEach((room) => {
        const current = floorRooms.find((item) => item.bubbleId === room.bubbleId)
        if (!current) return
        if (current.x === room.x && current.y === room.y) return
        moveActiveRoom(room.bubbleId, room.x, room.y)
        if (canSyncBubbleStateFrom2D) {
          handleBubbleMove(room.bubbleId, room.x, room.y)
        }
      })
    } else {
      moveActiveRoom(bubbleId, x, y)
      if (canSyncBubbleStateFrom2D) {
        handleBubbleMove(bubbleId, x, y)
      }
    }
    syncFloorDerivedStateFromRooms(nextRooms)
  }

  /** 2D 벽 타입 변경 (프리셋 두께/높이 자동 반영) */
  const handleUpdateFloorWallType = (wallId: string, type: FloorWall['type']) => {
    const preset = FLOOR_WALL_PRESETS[type]
    updateFloorWallFromEditable(wallId, (wall) => ({
      ...wall,
      type,
      thickness: preset.thickness,
      heightMm: preset.heightMm,
    }))
    workspaceCommandPublisher.updateWallStyle(wallId, {
      wallType: type,
      thickness: preset.thickness,
      height: preset.heightMm,
    })
    setWallCreatePreset({
      type,
      thickness: preset.thickness,
      heightMm: preset.heightMm,
    })
  }

  /** 2D 벽 두께(mm) 변경 */
  const handleUpdateFloorWallThickness = (wallId: string, thickness: number) => {
    if (!Number.isFinite(thickness)) return
    const next = clampWallThicknessMm(
      thickness,
      FLOOR_WALL_THICKNESS_MIN_MM,
      FLOOR_WALL_THICKNESS_MAX_MM,
    )
    updateFloorWallFromEditable(wallId, (wall) => ({ ...wall, thickness: next }))
    workspaceCommandPublisher.updateWallStyle(wallId, { thickness: next })
    setWallCreatePreset((prev) => ({ ...prev, thickness: next }))
  }

  /** 2D 벽 높이(mm) 변경 */
  const handleUpdateFloorWallHeight = (wallId: string, heightMm: number) => {
    if (!Number.isFinite(heightMm)) return
    const next = clampWallHeightMm(
      heightMm,
      FLOOR_WALL_HEIGHT_MIN_MM,
      FLOOR_WALL_HEIGHT_MAX_MM,
    )
    updateFloorWallFromEditable(wallId, (wall) => ({ ...wall, heightMm: next }))
    workspaceCommandPublisher.updateWallStyle(wallId, { height: next })
    setWallCreatePreset((prev) => ({ ...prev, heightMm: next }))
  }

  /** 2D 벽 재질 변경 */
  const handleUpdateFloorWallMaterial = (wallId: string, material: string) => {
    const next = material.trim()
    if (!next) return
    updateFloorWallFromEditable(wallId, (wall) => ({ ...wall, material: next }))
  }

  /**
   * 공통 선택 상태 초기화
   * - 버블 선택
   * - 연결 생성 대기 상태
   * - 연결선 선택 상태
   */
  const resetInteractionSelection = useCallback(() => {
    setSelectedConnectionPair(null)
    setConnectingFromId(null)
    setSelectedFloorWallId(null)
    setSelectedFloorOpeningId(null)
    setSelectedFloorWallIds([])
    setSelectedFloorOpeningIds([])
    clearSelection()
  }, [clearSelection])

  /** 도면 변경 공통 반영 파이프라인 */
  const applyDrawingSnapshot = useCallback(
    ({ bubbles: nextBubbles, connections: nextConnections, floorWalls: nextFloorWalls, floorOpenings: nextFloorOpenings }: DrawingSnapshot) => {
      setIsProjectStructurePreferred(false)
      replaceBubbles(nextBubbles)
      replaceConnections(nextConnections)
      // project-origin 레이아웃은 버블 자동 배치로 덮어쓰지 않는다.
      if (floorPlanLayoutSource !== 'project') {
        syncFloorPlanFromBubbles(nextBubbles, nextConnections, stageSize.width, stageSize.height)
      }
      setFloorWalls(nextFloorWalls)
      setHiddenAutoWallIds([])
      setFloorOpenings(nextFloorOpenings)
      setHiddenAutoOpeningIds([])
      resetInteractionSelection()
    },
    [floorPlanLayoutSource, replaceBubbles, replaceConnections, syncFloorPlanFromBubbles, stageSize.width, stageSize.height, resetInteractionSelection],
  )

  /** 표준 FloorProject를 버블/2D/3D 공통 상태로 반영
   *  walls/openings 필드가 있으면(IFC 경로) 직접 매핑, 없으면 빈 배열 → autoWalls/autoOpenings 폴백
   */
  const applyFloorProject = useCallback((project: FloorProject) => {
    const stageOptions = { width: stageSize.width, height: stageSize.height }
    const mappedWalls = mapFloorProjectToWalls(project, stageOptions)
    const mappedOpenings = mapFloorProjectToOpenings(project)
    setIsProjectStructurePreferred(mappedWalls.length > 0 || mappedOpenings.length > 0)
    const nextBubbles = mapFloorProjectToBubbles(project, stageOptions)
    const bubbleIdSet = new Set(nextBubbles.map((bubble) => bubble.id))
    const nextConnections = mapAdjacencyToConnections(project.adjacency).filter((connection) => {
      return bubbleIdSet.has(connection.from) && bubbleIdSet.has(connection.to)
    })
    replaceBubbles(nextBubbles)
    replaceConnections(nextConnections)
    // IFC 원좌표/회전 정보를 유지하기 위해 버블 재배치 경로(syncFloorPlanFromBubbles)를 타지 않는다.
    setFloorPlanFromProject(project, stageSize.width, stageSize.height)
    setFloorWalls(mappedWalls)
    setHiddenAutoWallIds([])
    setFloorOpenings(mappedOpenings)
    setHiddenAutoOpeningIds([])
    resetInteractionSelection()
  }, [
    stageSize.width,
    stageSize.height,
    replaceBubbles,
    replaceConnections,
    setFloorPlanFromProject,
    resetInteractionSelection,
  ])

  /** IFC import 상태/핸들러 */
  const {
    floorProjectImportMessage,
    importFloorProjectFromIfc,
    clearImportMessage,
  } = useFloorProjectImport({
    stageSize,
    onApplyProject: applyFloorProject,
  })

  // 에디터 첫 진입 시 프로젝트 IFC를 1회 로드한다.
  useInitialIfcImport({
    projectId,
    stageWidth: stageSize.width,
    stageHeight: stageSize.height,
    importFloorProjectFromIfc,
    attemptedInitialIfcImportProjectIdRef,
  })

  /** AI 미리보기 적용 — 버블/연결선/2D 벽·개구부 일괄 반영 후 선택 상태 정리 */
  const applyLlmPreview = useCallback(
    (
      nextBubbles: BubbleData[],
      nextConnections: ConnectionData[],
      nextFloorWalls: FloorWall[],
      nextFloorOpenings: FloorOpening[],
    ) => {
      clearImportMessage()
      applyDrawingSnapshot({
        bubbles: nextBubbles,
        connections: nextConnections,
        floorWalls: nextFloorWalls,
        floorOpenings: nextFloorOpenings,
      })
    },
    [clearImportMessage, applyDrawingSnapshot],
  )

  /** AI 어시스턴트 편집 상태 */
  const llmEdit = useLlmEdit({
    projectId: projectId ?? null,
    bubbles,
    connections,
    floorWalls: floorWalls.length > 0 ? floorWalls : autoFloorWalls,
    floorOpenings: mergedFloorOpenings,
    onApply: applyLlmPreview,
  })

  const handleLabelChangeForPanel = useCallback((id: string, label: string) => {
    if (mode !== '2d') {
      handleLabelChange(id, label)
      return
    }
    if (canSyncBubbleStateFrom2D) handleLabelChange(id, label)
    updateActiveRoom(id, (room) => ({ ...room, label }))
  }, [canSyncBubbleStateFrom2D, handleLabelChange, mode, updateActiveRoom])

  const handleTypeChangeForPanel = useCallback((id: string, type: string) => {
    if (mode !== '2d') {
      handleTypeChange(id, type)
      return
    }
    if (canSyncBubbleStateFrom2D) handleTypeChange(id, type)
    updateActiveRoom(id, (room) => ({ ...room, type }))
  }, [canSyncBubbleStateFrom2D, handleTypeChange, mode, updateActiveRoom])

  const handleMaterialChangeForPanel = useCallback((id: string, material: string) => {
    if (mode === '2d') return
    handleMaterialChange(id, material)
  }, [handleMaterialChange, mode])

  /**
   * 2D 속성 패널의 mm 입력값을 전역 Grid Snap 간격에 맞춰 보정한다.
   * - Grid Snap OFF: 원본값 유지
   * - Grid Snap ON: 간격(mm) 단위로 반올림
   */
  const snapDimensionMm = useCallback((valueMm: number) => {
    if (!isGridSnapEnabled) return valueMm
    const step = Math.max(Math.round(gridSnapIntervalMm), 1)
    return Math.max(step, Math.round(valueMm / step) * step)
  }, [isGridSnapEnabled, gridSnapIntervalMm])

  const applyRoomDimensionIn2D = useCallback(
    (bubbleId: string, axis: 'width' | 'height', nextMm: number) => {
      if (mode !== '2d') return
      if (!Number.isFinite(nextMm) || nextMm <= 0) return
      const room = floorRooms.find((item) => item.bubbleId === bubbleId)
      if (!room) return

      const currentWidthMm = Math.max(room.widthMm, 1)
      const currentHeightMm = Math.max(room.heightMm, 1)
      const snappedMm = snapDimensionMm(nextMm)
      const nextWidthMm = axis === 'width' ? snappedMm : currentWidthMm
      const nextHeightMm = axis === 'height' ? snappedMm : currentHeightMm
      // 패널 입력 치수는 항상 절대 mm 값이므로 px도 절대 변환으로 계산한다.
      const nextWidthPx = Math.max(40, nextWidthMm / FLOOR_MM_PER_PX)
      const nextHeightPx = Math.max(40, nextHeightMm / FLOOR_MM_PER_PX)
      const nextArea = calcAreaM2FromMm(nextWidthMm, nextHeightMm)
      const prevRect: AxisAlignedRect = {
        x: room.x,
        y: room.y,
        width: room.width,
        height: room.height,
      }
      const nextRect: AxisAlignedRect = {
        x: room.x,
        y: room.y,
        width: nextWidthPx,
        height: nextHeightPx,
      }
      if (canSyncBubbleStateFrom2D) {
        if (axis === 'width') {
          handleWidthChange(bubbleId, nextWidthMm)
        } else {
          handleHeightChange(bubbleId, nextHeightMm)
        }
      }

      const nextRooms = floorRooms.map((item) =>
        item.bubbleId === bubbleId
          ? toRectFloorRoom(item, {
              x: item.x,
              y: item.y,
              width: nextWidthPx,
              height: nextHeightPx,
              widthMm: nextWidthMm,
              heightMm: nextHeightMm,
              area: nextArea,
            })
          : item,
      )

      updateActiveRoom(bubbleId, (item) =>
        toRectFloorRoom(item, {
          x: item.x,
          y: item.y,
          width: nextWidthPx,
          height: nextHeightPx,
          widthMm: nextWidthMm,
          heightMm: nextHeightMm,
          area: nextArea,
        }),
      )
      syncPerimeterManualWallsForRoomResize(bubbleId, prevRect, nextRect)
      syncFloorDerivedStateFromRooms(nextRooms)
    },
    [mode, floorRooms, canSyncBubbleStateFrom2D, handleWidthChange, handleHeightChange, updateActiveRoom, syncPerimeterManualWallsForRoomResize, syncFloorDerivedStateFromRooms, snapDimensionMm],
  )

  const applyDimensionByMode = useCallback((
    id: string,
    axis: 'width' | 'height',
    valueMm: number,
  ) => {
    if (mode === '2d') {
      applyRoomDimensionIn2D(id, axis, valueMm)
      return
    }
    if (axis === 'width') {
      handleWidthChange(id, valueMm)
      return
    }
    handleHeightChange(id, valueMm)
  }, [mode, applyRoomDimensionIn2D, handleWidthChange, handleHeightChange])

  const handleWidthChangeForPanel = useCallback(
    (id: string, widthMm: number) => applyDimensionByMode(id, 'width', widthMm),
    [applyDimensionByMode],
  )

  const handleHeightChangeForPanel = useCallback(
    (id: string, heightMm: number) => applyDimensionByMode(id, 'height', heightMm),
    [applyDimensionByMode],
  )

  const handleWidthCommitForPanel = useCallback(
    (id: string, widthMm: number) => applyDimensionByMode(id, 'width', widthMm),
    [applyDimensionByMode],
  )

  const handleHeightCommitForPanel = useCallback(
    (id: string, heightMm: number) => applyDimensionByMode(id, 'height', heightMm),
    [applyDimensionByMode],
  )

  const handleAutoLayoutBubbles = useCallback(() => {
    if (mode !== 'bubble') return
    if (isBubbleReadOnly) return
    if (bubbles.length < 2) return

    const nextBubbles = runForceDirectedBubbleLayout({
      bubbles,
      connections,
      sitePoints: sitePlanPoints,
    })
    replaceBubbles(nextBubbles)
  }, [mode, isBubbleReadOnly, bubbles, connections, sitePlanPoints, replaceBubbles])

  return {
    // 모드
    mode,
    currentProjectName,
    setMode,
    // 캔버스 크기·대지
    containerRef,
    stageSize,
    sitePoints,
    sitePlanPoints,
    siteAreaM2,
    siteAreaPyeong,
    // 버블
    bubbles,
    selectedId,
    selectedIds,
    selectedBubble,
    selectedFloorWall,
    selectedFloorOpening,
    handleBubbleSelect,
    handleBubbleDrag: handleBubbleDragInBubble,
    handleMarqueeSelect,
    handleTwoDMarqueeSelect,
    clearSelection: handleClearCanvasSelection,
    hasDeletableSelection,
    handleDeleteSelected,
    handleBubbleResize: handleBubbleResizeInBubble,
    handleLabelChange: handleLabelChangeForPanel,
    handleTypeChange: handleTypeChangeForPanel,
    handleWidthChange: handleWidthChangeForPanel,
    handleHeightChange: handleHeightChangeForPanel,
    handleWidthCommit: handleWidthCommitForPanel,
    handleHeightCommit: handleHeightCommitForPanel,
    handleRatioChange,
    handleColorChange,
    handleMaterialChange: handleMaterialChangeForPanel,
    handleDeleteBubble,
    // 연결선
    connections,
    selectedConnectionPair,
    selectedBubbleConnections,
    isLineStyleModalOpen,
    selectedLineStyle,
    lineConnectionPair,
    confirmLineStyleModal,
    closeLineStyleModal,
    setSelectedStyle,
    handleOpenLineStyleModal,
    getBubbleLabel,
    // 조닝
    zones,
    autoZones,
    manualZones,
    selectedBubbleZones,
    zoningListItems,
    isZoningModalOpen,
    editingZoneId,
    zoningFormData,
    setZoningFormData,
    zoningAutoColorPreview,
    openZoningModal: handleOpenZoningModal,
    openEditModal: handleOpenEditZoningModal,
    closeZoningModal,
    toggleZoningBubble: handleToggleZoningBubble,
    confirmZoningModal: handleConfirmZoningModal,
    deleteZone: handleDeleteZone,
    // 우측 패널
    panelOffsets,
    panelOpenState,
    panelHeights,
    panelWidths,
    panelZIndexes,
    startDrag,
    startResize,
    togglePanel,
    resetPanelPositions,
    // 공간 추가 모달
    isAddModalOpen,
    addSpaceFormData,
    setAddSpaceFormData,
    handleOpenAddModal,
    handleConfirmAddSpace,
    onCloseAddModal: () => setIsAddModalOpen(false),
    // 협업
    isCollaborationMode,
    selectedPinId,
    setSelectedPinId,
    selectedCommentPin,
    collaborationTab,
    setCollaborationTab,
    commentPins,
    commentNotifications,
    unreadCommentNotifications,
    currentCollaborationUserType: currentUserType,
    currentCollaborationUserName: currentUserName,
    handleToggleCollaboration,
    handlePinClick,
    handleCreateCommentPin,
    handleAddCommentReply,
    // 줌
    zoom: currentZoom,
    handleZoomIn,
    handleZoomOut,
    handleZoomChange,
    // 라이브러리
    isLibraryOpen,
    setIsLibraryOpen,
    // 2D 평면도
    isBubbleReadOnly,
    isFloorPlanGenerated,
    isFloorPlanGenerating,
    floorLayers,
    activeFloorLayerId,
    floorRooms,
    floorLayerOverlayItems,
    isLayerOverlayMode,
    overlayLayerIds,
    overlayOpacityByLayerId,
    floorWalls,
    floorWallsForHierarchy: mergedFloorWalls,
    floorOpenings: mergedFloorOpenings,
    selectedFloorWallId,
    selectedFloorWallIds,
    selectedFloorOpeningId,
    selectedFloorOpeningIds,
    handleGenerateFloorPlan,
    handleGenerateFloorPlanFromBubble,
    handleAutoLayoutBubbles,
    canGenerateFloorPlanFromBubble: bubbles.length > 0,
    canAutoLayoutBubbles: bubbles.length > 1,
    addFloorLayer,
    renameFloorLayer,
    deleteFloorLayer,
    setActiveFloorLayerId,
    toggleLayerOverlayMode,
    handleToggleOverlayLayer,
    handleSetOverlayLayerOpacity,
    floorPlanConnections: connections,
    floorProjectImportMessage,
    importFloorProjectFromIfc,
    // 그리드
    isGridVisible,
    isGridSnapEnabled,
    gridSnapIntervalMm,
    toggleGrid,
    toggleGridSnap,
    handleSetGridSnapIntervalMm,
    // 도구 선택
    saveStatus,
    selectedTool,
    setSelectedTool,
    handleSetSelectedTool,
    wallCreatePreset,
    handleCreateFloorWall,
    handleSelectFloorWall,
    handleMoveFloorWall,
    handleUpdateFloorWallEndpoint,
    handleDeleteFloorWall,
    handleUpdateFloorWallType,
    handleUpdateFloorWallThickness,
    handleUpdateFloorWallHeight,
    handleUpdateFloorWallMaterial,
    handleCreateFloorOpening,
    handleSelectFloorOpening,
    handleMoveFloorOpening,
    handleUpdateFloorOpeningSize,
    handleUpdateFloorWindowSillHeight,
    handleUpdateFloorDoorSwingDirection,
    handleUpdateFloorDoorHingeSide,
    handleDeleteFloorOpening,
    handleResizeFloorRoom,
    handleMoveFloorRoom,
    // 연결 도구
    connectingFromId,
    handleBubbleSelectWithTool,
    handleConnectionClick,
    handleConnectionCreate,
    // 인라인 라벨 편집
    labelEditState,
    handleBubbleLabelEdit,
    handleEmptyCanvasDblClick,
    confirmLabelEdit,
    closeLabelEdit: () => setLabelEditState(null),
    // 스크롤 휠 줌
    handleWheelZoom,
    // 초대 모달
    isInviteModalOpen,
    handleOpenInviteModal: () => setIsInviteModalOpen(true),
    onCloseInviteModal: () => setIsInviteModalOpen(false),
    // 내보내기 모달
    isExportModalOpen,
    handleOpenExportModal,
    onCloseExportModal: closeExportModal,
    // 내보내기 선택 모달
    isExportSelectionModalOpen,
    handleOpenExportSelectionModal,
    onCloseExportSelectionModal: closeExportSelectionModal,
    // IFC 내보내기 모달
    isIFCExportModalOpen,
    handleOpenIFCExportModal,
    onCloseIFCExportModal: closeIFCExportModal,
    // AI 어시스턴트
    llmProvider: llmEdit.provider,
    llmPrompt: llmEdit.prompt,
    setLlmPrompt: llmEdit.setPrompt,
    llmStatus: llmEdit.status,
    llmIsLoading: llmEdit.isLoading,
    llmMessage: llmEdit.message,
    llmSuggestions: llmEdit.suggestions,
    llmPreview: llmEdit.preview,
    llmCanRun: llmEdit.canRun,
    runLlmEdit: llmEdit.run,
    applyLlmEdit: llmEdit.apply,
    discardLlmEdit: llmEdit.discard,
  }
}

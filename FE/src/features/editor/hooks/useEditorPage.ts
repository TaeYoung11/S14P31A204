import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { isAxiosError } from 'axios'
import type {
  AddSpaceFormData,
  BubbleData,
  ConnectionData,
  EditorDraftRecord,
  EditorDraftSnapshot,
  EditorMode,
  PhaseStatus,
  FloorCommentAttachmentInput,
  FloorCommentNotification,
  FloorCommentPin,
  FloorLayerOverlay,
  FloorOpening,
  FloorRoom,
  FloorWall,
  IfcElementChange,
  IfcElementInfo,
  Point2D,
  SaveStatus,
  ZoneData,
} from '../types'
import {
  DEFAULT_GRID_SNAP_INTERVAL_MM,
  FLOOR_MM_PER_PX,
  FLOOR_PLAN_EDIT_AUTHORITY,
  FLOOR_WALL_PRESETS,
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
import { useEditorAttributePanelHandlers } from './useEditorAttributePanelHandlers'
import { useEditorStructureEditHandlers } from './useEditorStructureEditHandlers'
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
  buildMovedFloorRoomsState,
  buildResizedFloorRoomsState,
} from '../utils/floorRoomDerivedState'
import type { FloorProject } from '../types/floorProject.types'
import { workspaceDraftRepository } from '../services/workspaceDraft.repository'
import { requestFloorPlanGenerate } from '../services/floorPlanGenerate.service'
import {
  FloorPlanLayoutValidationError,
} from '../services/floorPlanGenerate.contract'
import { saveBubbleSnapshotToDb } from '../services/workspaceBubble.service'
import type { SaveBubbleSnapshotResponse } from '../services/workspaceBubble.service'
import {
  publishIfcEditRequest,
  publishIfcRedoRequest,
  publishIfcUndoRequest,
} from '../services/workspaceCommand.service'
import { workspaceRealtimeService } from '../services/workspaceRealtime.service'
import { useAuthStore } from '@/shared/stores/authStore'
import { useProjectStore } from '@/features/project/stores/projectStore'
import { useEditorProjectName } from './useEditorProjectName'
import { useInitialIfcImport } from './useInitialIfcImport'
import { useEditorUserContext } from './useEditorUserContext'
import { useFloorPlanGenerateTimeout } from './useFloorPlanGenerateTimeout'
import { useThreeDIfcAttributeHandlers } from './useThreeDIfcAttributeHandlers'
import { runForceDirectedBubbleLayout } from '../utils/forceBubbleLayout'
import { useBubbleSnapshotRealtime } from './useBubbleSnapshotRealtime'
import { useIfcLoadingLayer } from './useIfcLoadingLayer'
import type { FloorPlan3DData } from '../utils/floorPlanTo3D'
import type { IfcStoreyInfo } from '../components/canvas/thatopen/ifcPropertyParser'
import type { ThreeDLibraryPreset } from '../components/canvas/threeDLibrary.types'
import {
  buildFloorPlanLayoutImportPayload,
  collectAutoDoorOpeningIdsFromWallIds,
  createLocalId,
  getPolygonAreaPx,
  getPolygonBounds,
  isFinitePolygonPoints,
  isSameConnection,
  mergeSelectedIds,
  normalizeCommentAttachments,
  resolveEditorMode,
} from '../utils/editorPageHelpers'
import {
  IFC_COMPLETED_ACTION_SET,
} from '../utils/workspaceSyncMessage'
import { resolveIfcPresignedUrl } from '../utils/ifcSource'

interface DrawingSnapshot {
  bubbles: BubbleData[]
  connections: ConnectionData[]
  floorWalls: FloorWall[]
  floorOpenings: FloorOpening[]
}

interface PendingServerPublishRecord {
  projectId: string
  versionNo: number
  snapshot: EditorDraftSnapshot
  serializedSnapshot: string
}

const EDITOR_HISTORY_LIMIT = 50
const OPENING_MIN_WIDTH_MM = 1
const OPENING_MAX_WIDTH_MM = 4000
const OPENING_NORMALIZE_OPTIONS = {
  minWidthMm: OPENING_MIN_WIDTH_MM,
  maxWidthMm: OPENING_MAX_WIDTH_MM,
} as const
const IFC_DERIVED_FLOORPLAN_ONLY = true
const BUBBLE_DB_SAVE_DEBOUNCE_MS = 2000

const FLOOR_PLAN_GENERATE_TIMEOUT_MS = 120_000

/**
 * EditorPage 전체 비즈니스 로직 훅
 * 버블·연결선·조닝·패널·평면도·UI 상태를 하위 훅에서 합성해 관리
 */
export function useEditorPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const { currentProjectName } = useEditorProjectName(projectId)
  const mode = resolveEditorMode(searchParams.get('mode'))
  const [selectedIfcElement, setSelectedIfcElement] = useState<IfcElementInfo | null>(null)
  /** 계층구조 패널에서 특정 IFC 요소 선택을 3D 캔버스로 전달하는 요청 localId */
  const [requestedIfcElementLocalId, setRequestedIfcElementLocalId] = useState<number | null>(null)
  /** 계층구조 요소 선택 요청 트리거 토큰 (같은 localId 재선택 강제 반영용) */
  const [ifcElementSelectionRequestToken, setIfcElementSelectionRequestToken] = useState(0)
  /** 계층구조 패널에서 특정 라이브러리 요소 선택을 3D 캔버스로 전달하는 요청 id */
  const [requestedLibraryElementId, setRequestedLibraryElementId] = useState<string | null>(null)
  /** 계층구조 라이브러리 요소 선택 요청 토큰 */
  const [libraryElementSelectionRequestToken, setLibraryElementSelectionRequestToken] = useState(0)
  /** 3D 사이드바 삭제 버튼으로 선택 요소 삭제를 요청하는 트리거 */
  const [threeDDeleteRequestToken, setThreeDDeleteRequestToken] = useState(0)
  const [ifcElementChangesById, setIfcElementChangesById] = useState<Record<number, IfcElementChange>>({})
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
    confirmModal: confirmLineStyleModalRaw,
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
  /** 2D 수동 편집 후 버블 모드 자동 재생성(refresh) 억제 */
  const [isFloorPlanEditedIn2D, setIsFloorPlanEditedIn2D] = useState(false)
  const markLocalBubbleSnapshotChangedRef = useRef<() => void>(() => {})

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
    isGenerating: isFloorPlanGeneratingLocal,
    layoutSource: floorPlanLayoutSource,
    layers: floorLayers,
    activeLayerId: activeFloorLayerId,
    activeRooms: floorRooms,
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
  const canSyncBubbleStateFrom2D = floorPlanLayoutSource === 'bubble' && activeFloorLayerId === 'floor-1'
  const isWallFirstEditing = FLOOR_PLAN_EDIT_AUTHORITY === 'wall-first'
  const [workspacePhaseStatus, setWorkspacePhaseStatus] = useState<PhaseStatus>('BUBBLE_DRAFT')
  const handleIfcSyncMessageRef = useRef<(url: string, action: string | null, assetId?: string | null) => void>(() => {})
  const isFloorPlanGenerating = isFloorPlanGeneratingLocal || workspacePhaseStatus === 'CONVERTING'

  /**
   * 2D 구조물(벽/개구부) 선택 상태만 초기화한다.
   * 버블 선택은 유지해야 하는 흐름이 있어 별도 함수로 분리한다.
   */
  const clearTwoDStructureSelection = useCallback(() => {
    setSelectedFloorWallId(null)
    setSelectedFloorWallIds([])
    setSelectedFloorOpeningId(null)
    setSelectedFloorOpeningIds([])
  }, [])

  /** 연결선/2D 구조물 선택 상태를 함께 초기화한다. */
  const clearConnectionAndTwoDSelection = useCallback(() => {
    setSelectedConnectionPair(null)
    clearTwoDStructureSelection()
  }, [clearTwoDStructureSelection])

  // 버블·연결선 변경 시 이미 생성된 평면도를 조용히 갱신 (로딩 없음)
  useEffect(() => {
    if (IFC_DERIVED_FLOORPLAN_ONLY) return
    if (mode !== 'bubble') return
    if (isFloorPlanEditedIn2D) return
    if (floorPlanLayoutSource === 'bubble' && isFloorPlanGenerated && bubbles.length > 0 && stageSize.width > 0) {
      refreshFloorPlan(bubbles, connections, stageSize.width, stageSize.height)
    }
  }, [mode, bubbles, connections, stageSize.width, stageSize.height, isFloorPlanGenerated, floorPlanLayoutSource, isFloorPlanEditedIn2D, refreshFloorPlan])

  // 버블이 모두 삭제되면 2D/3D 레이어도 함께 초기화
  useEffect(() => {
    if (bubbles.length > 0) return
    if (!isFloorPlanGenerated && !isFloorPlanGenerating) return
    clearFloorPlan()
    const timer = window.setTimeout(() => {
      setIsProjectStructurePreferred(false)
      setFloorWalls([])
      setHiddenAutoWallIds([])
      setFloorOpenings([])
      setHiddenAutoOpeningIds([])
      clearTwoDStructureSelection()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [bubbles.length, isFloorPlanGenerated, isFloorPlanGenerating, clearFloorPlan, clearTwoDStructureSelection])

  // Delete/Backspace 키로 선택된 버블 또는 연결선 삭제 (input 포커스 중엔 무시)
  const handleDeleteSelected = useCallback(() => {
    if (useAuthStore.getState().user?.user_type !== 'DESIGNER') return
    if (mode === 'bubble' && isBubbleEditLocked) return
    if (mode === '3d') {
      if (!selectedIfcElement) return
      // 키보드 Delete와 동일한 3D 캔버스 삭제 루틴을 트리거한다.
      setThreeDDeleteRequestToken((prev) => prev + 1)
      return
    }
    if (mode === '2d') {
      const selectedRoomIds = mergeSelectedIds(selectedIds, selectedId)

      if (selectedFloorOpeningIds.length === 0 && selectedFloorWallIds.length === 0 && !selectedFloorOpeningId && !selectedFloorWallId && selectedRoomIds.length > 0) {
        removeActiveRooms(selectedRoomIds)
        if (canSyncBubbleStateFrom2D) {
          markLocalBubbleSnapshotChangedRef.current()
          selectedRoomIds.forEach((id) => {
            deleteBubble(id)
            removeConnectionsForBubble(id)
          })
        } else {
          clearSelection()
        }
        clearConnectionAndTwoDSelection()
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
      const autoOpeningIdsFromDeletedWalls = collectAutoDoorOpeningIdsFromWallIds(wallIdSet)
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

      clearTwoDStructureSelection()
      return
    }
    if (selectedConnectionPair) {
      markLocalBubbleSnapshotChangedRef.current()
      removeConnection(selectedConnectionPair.from, selectedConnectionPair.to)
      setSelectedConnectionPair(null)
      return
    }
    if (selectedIds.length > 0) {
      markLocalBubbleSnapshotChangedRef.current()
    }
    selectedIds.forEach((id) => {
      deleteBubble(id)
      removeConnectionsForBubble(id)
    })
  }, [
    canSyncBubbleStateFrom2D,
    mode,
    isBubbleEditLocked,
    selectedIfcElement,
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
    clearConnectionAndTwoDSelection,
    clearTwoDStructureSelection,
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
  const [libraryElements, setLibraryElements] = useState<ThreeDLibraryPreset[]>([])
  const [isGridVisible, setIsGridVisible] = useState(false)
  const [selectedTool, setSelectedTool] = useState<string>('selection')
  /** 연결 도구에서 첫 번째로 선택된 버블 id */
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null)
  /** 인라인 라벨 편집 상태 */
  const [labelEditState, setLabelEditState] = useState<{
    id: string; label: string; x: number; y: number; width: number; height: number
  } | null>(null)
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false)
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
  const [latestFloorPlanJobId, setLatestFloorPlanJobId] = useState<string | null>(null)
  const [floorPlanGenerateStatusText, setFloorPlanGenerateStatusText] = useState<string>('')
  const [autosaveReadyProjectId, setAutosaveReadyProjectId] = useState<string | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const attemptedInitialIfcImportProjectIdRef = useRef<string | null>(null)
  const localVersionRef = useRef(0)
  const previousSnapshotRef = useRef<string | null>(null)
  const latestBubbleSnapshotRef = useRef<{ bubbles: BubbleData[]; connections: ConnectionData[] }>({
    bubbles,
    connections,
  })
  const bubbleDbSaveTimerRef = useRef<number | null>(null)
  const bubbleDbSaveInFlightRef = useRef<Promise<SaveBubbleSnapshotResponse> | null>(null)
  const floorPlanGenerateForbiddenRef = useRef(false)
  const lastLoadedIfcStorageUrlRef = useRef<string | null>(null)
  const ifcLoadInFlightStorageUrlRef = useRef<string | null>(null)
  /**
   * 프로젝트별 IFC 소스 캐시.
   * - projectId 전환 시 effect로 상태를 초기화하지 않고, 렌더 단계에서 현재 프로젝트 값만 노출한다.
   * - react-hooks/set-state-in-effect 규칙을 만족하면서 기존 동작을 보존한다.
   */
  const [ifcSourceByProjectId, setIfcSourceByProjectId] = useState<
    Record<string, { url: string; assetId: string | null }>
  >({})
  const currentIfcUrl = projectId ? (ifcSourceByProjectId[projectId]?.url ?? null) : null
  const currentIfcAssetId = projectId ? (ifcSourceByProjectId[projectId]?.assetId ?? null) : null
  const bubbleDbDirtyRef = useRef(false)
  const historySnapshotRef = useRef<string | null>(null)
  const historyProjectIdRef = useRef<string | null>(null)
  const skipNextHistorySnapshotRef = useRef(false)
  const pendingHistorySnapshotRef = useRef<string | null>(null)
  const historyCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const undoHistoryRef = useRef<EditorDraftSnapshot[]>([])
  const redoHistoryRef = useRef<EditorDraftSnapshot[]>([])
  const isRestoringHistoryRef = useRef(false)
  const hasUserEditedRef = useRef(false)
  const localSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const serverPublishRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingDraftRecordRef = useRef<EditorDraftRecord | null>(null)
  const pendingServerPublishRef = useRef<PendingServerPublishRecord | null>(null)
  const draftLoadTokenRef = useRef(0)
  const draftLoadedProjectIdRef = useRef<string | null>(null)
  const draftLoadBaselineRef = useRef<string | null>(null)
  const draftLoadingProjectIdRef = useRef<string | null>(null)

  useEffect(() => {
    lastLoadedIfcStorageUrlRef.current = null
    ifcLoadInFlightStorageUrlRef.current = null
  }, [projectId])

  const [serverPublishRetryTick, setServerPublishRetryTick] = useState(0)
  const clearServerPublishRetry = useCallback(() => {
    if (serverPublishRetryTimerRef.current !== null) {
      clearTimeout(serverPublishRetryTimerRef.current)
      serverPublishRetryTimerRef.current = null
    }
  }, [])
  const scheduleServerPublishRetry = useCallback(() => {
    if (serverPublishRetryTimerRef.current !== null) return
    serverPublishRetryTimerRef.current = setTimeout(() => {
      serverPublishRetryTimerRef.current = null
      setServerPublishRetryTick((tick) => tick + 1)
    }, 3000)
  }, [])
  const flushPendingDraftSave = useCallback(() => {
    if (localSaveTimerRef.current !== null) {
      clearTimeout(localSaveTimerRef.current)
      localSaveTimerRef.current = null
    }

    const pendingDraftRecord = pendingDraftRecordRef.current
    if (!pendingDraftRecord) return

    pendingDraftRecordRef.current = null
    void workspaceDraftRepository.saveLocalFallbackDraft({
      projectId: pendingDraftRecord.projectId,
      versionNo: pendingDraftRecord.versionNo,
      snapshot: pendingDraftRecord.data,
      savedAt: pendingDraftRecord.savedAt,
    }).catch(() => {
      setSaveStatus('error')
    })
  }, [])
  const authUser = useAuthStore((state) => state.user)
  const currentProject = useProjectStore((state) => state.currentProject)
  const {
    currentUserType,
    collaborationUserType,
    counterpartType,
    currentUserName,
    hasIfcUploadedInCurrentProject,
    isCurrentProjectOwnerKnown,
    isCurrentProjectOwner,
  } = useEditorUserContext({
    authUser,
    currentProject,
    projectId,
  })

  /**
   * CONVERTING 상태가 장시간 유지되면 편집 가능한 상태로 되돌리고 안내 문구를 노출한다.
   */
  const handleFloorPlanGenerateTimeout = useCallback(() => {
    setWorkspacePhaseStatus((prev) => {
      if (prev !== 'CONVERTING') return prev
      setFloorPlanGenerateStatusText('평면도 생성이 지연되고 있습니다. 잠시 후 다시 시도하세요.')
      console.warn('[editor] Floor-plan 생성 타임아웃: CONVERTING 상태가 장시간 유지되었습니다.')
      return 'BUBBLE_DRAFT'
    })
  }, [])

  const { startFloorPlanGenerateTimeout, clearFloorPlanGenerateTimeout } = useFloorPlanGenerateTimeout({
    projectId,
    userId: authUser?.id,
    workspacePhaseStatus,
    timeoutMs: FLOOR_PLAN_GENERATE_TIMEOUT_MS,
    onTimeout: handleFloorPlanGenerateTimeout,
    resetForbiddenFlag: () => {
      floorPlanGenerateForbiddenRef.current = false
    },
  })

  useEffect(() => {
    const layerIdSet = new Set(floorLayers.map((layer) => layer.id))
    const syncTimer = window.setTimeout(() => {
      setOverlayLayerIds((prev) => {
        const next = prev.filter((layerId) => layerIdSet.has(layerId) && layerId !== activeFloorLayerId)
        if (next.length === prev.length && next.every((layerId, index) => layerId === prev[index])) {
          return prev
        }
        return next
      })
      setOverlayOpacityByLayerId((prev) => {
        const next: Record<string, number> = {}
        floorLayers.forEach((layer) => {
          next[layer.id] = prev[layer.id] ?? 0.35
        })
        // 값이 달라지지 않았으면 동일 참조를 반환해 불필요한 리렌더를 방지한다.
        const keys = Object.keys(next)
        if (keys.length === Object.keys(prev).length && keys.every((k) => prev[k] === next[k])) {
          return prev
        }
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
  // floorRooms가 바뀔 때만 재계산해 매 렌더마다 새 참조가 생기는 것을 방지한다.
  const autoFloorWalls = useMemo(() => deriveAutoWallsFromRooms(floorRooms), [floorRooms])
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
    phaseStatus: workspacePhaseStatus,
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
    workspacePhaseStatus,
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

  const latestDraftSnapshotRef = useRef(draftSnapshot)
  useEffect(() => {
    latestDraftSnapshotRef.current = draftSnapshot
  }, [draftSnapshot])

  useEffect(() => {
    latestBubbleSnapshotRef.current = { bubbles, connections }
  }, [bubbles, connections])

  useEffect(() => {
    return () => {
      flushPendingDraftSave()
      clearServerPublishRetry()
    }
  }, [clearServerPublishRetry, flushPendingDraftSave])

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
    const normalizedProjectId = projectId ?? null

    if (draftLoadedProjectIdRef.current === normalizedProjectId) {
      return () => {
        isCancelled = true
      }
    }

    draftLoadTokenRef.current = loadToken

    flushPendingDraftSave()

    draftLoadingProjectIdRef.current = projectId ?? null
    previousSnapshotRef.current = null
    pendingDraftRecordRef.current = null
    hasUserEditedRef.current = false
    draftLoadBaselineRef.current = null
    skipNextHistorySnapshotRef.current = true
    replaceBubbles([])
    replaceConnections([])
    replaceZonesState([])
    clearFloorPlan()
    setFloorWalls([])
    setFloorOpenings([])
    setHiddenAutoWallIds([])
    setHiddenAutoOpeningIds([])
    setIsProjectStructurePreferred(false)
    setWorkspacePhaseStatus('BUBBLE_DRAFT')
    setSelectedConnectionPair(null)
    setConnectingFromId(null)
    setSelectedFloorWallId(null)
    setSelectedFloorOpeningId(null)
    setSelectedFloorWallIds([])
    setSelectedFloorOpeningIds([])
    clearSelection()

    if (!projectId) {
      draftLoadedProjectIdRef.current = null
      draftLoadingProjectIdRef.current = null
      return () => {
        isCancelled = true
      }
    }

    const applyLocalFallbackDraft = async () => {
      const draft = await workspaceDraftRepository.loadLocalFallbackDraft(projectId)
      if (isCancelled || draftLoadTokenRef.current !== loadToken) return
      if (hasUserEditedRef.current) return

      localVersionRef.current = draft?.versionNo ?? 0

      if (!draft?.data) {
        previousSnapshotRef.current = JSON.stringify(latestDraftSnapshotRef.current)
        return
      }

      const data = draft.data
      skipNextHistorySnapshotRef.current = true
      draftLoadBaselineRef.current = JSON.stringify(data)
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
      setWorkspacePhaseStatus(data.phaseStatus ?? 'BUBBLE_DRAFT')
    }

    void applyLocalFallbackDraft()
      .finally(() => {
        if (isCancelled || draftLoadTokenRef.current !== loadToken) return
        draftLoadingProjectIdRef.current = null
        draftLoadBaselineRef.current = null
        draftLoadedProjectIdRef.current = projectId
        setAutosaveReadyProjectId(projectId)
      })

    return () => {
      isCancelled = true
      draftLoadingProjectIdRef.current = null
      draftLoadBaselineRef.current = null
    }
  }, [
    clearFloorPlan,
    clearSelection,
    flushPendingDraftSave,
    projectId,
    replaceBubbles,
    replaceConnections,
    replaceFloorPlanState,
    replaceZonesState,
  ])

  useEffect(() => {
    if (!projectId || autosaveReadyProjectId !== projectId) return
    const pendingServerPublish = pendingServerPublishRef.current
    if (!pendingServerPublish || pendingServerPublish.projectId !== projectId) return

    let isCancelled = false
    setSaveStatus('syncing')

    void workspaceRealtimeService.publishSnapshot({
      projectId,
      snapshot: pendingServerPublish.snapshot,
      baseIndex: pendingServerPublish.versionNo,
    })
      .then(() => {
        if (isCancelled) return
        const currentPending = pendingServerPublishRef.current
        if (
          currentPending?.projectId === pendingServerPublish.projectId &&
          currentPending.serializedSnapshot === pendingServerPublish.serializedSnapshot
        ) {
          pendingServerPublishRef.current = null
          previousSnapshotRef.current = pendingServerPublish.serializedSnapshot
          setSaveStatus(pendingDraftRecordRef.current ? 'dirty' : 'synced')
        }
      })
      .catch(() => {
        if (isCancelled) return
        setSaveStatus('error')
        scheduleServerPublishRetry()
      })

    return () => {
      isCancelled = true
    }
  }, [autosaveReadyProjectId, projectId, scheduleServerPublishRetry, serverPublishRetryTick])

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
    const serverPublishRecord: PendingServerPublishRecord = {
      projectId,
      versionNo: draftRecord.versionNo,
      snapshot: draftRecord.data,
      serializedSnapshot,
    }

    localVersionRef.current = nextVersionNo
    pendingDraftRecordRef.current = draftRecord
    setSaveStatus('dirty')

    if (localSaveTimerRef.current !== null) {
      clearTimeout(localSaveTimerRef.current)
    }

    localSaveTimerRef.current = setTimeout(() => {
      localSaveTimerRef.current = null
      setSaveStatus('syncing')
      clearServerPublishRetry()

      void Promise.allSettled([
        workspaceDraftRepository.saveLocalFallbackDraft({
          projectId,
          versionNo: draftRecord.versionNo,
          snapshot: draftRecord.data,
          savedAt: draftRecord.savedAt,
        }),
        workspaceRealtimeService.publishSnapshot({
          projectId,
          snapshot: draftRecord.data,
          baseIndex: draftRecord.versionNo,
        }),
      ])
        .then(([localSaveResult, serverPublishResult]) => {
          if (localSaveResult.status === 'fulfilled') {
            pendingDraftRecordRef.current = null
            previousSnapshotRef.current = serializedSnapshot
          }

          if (serverPublishResult.status === 'fulfilled') {
            const currentPending = pendingServerPublishRef.current
            if (currentPending?.projectId === serverPublishRecord.projectId) {
              pendingServerPublishRef.current = null
            }
          } else {
            pendingServerPublishRef.current = serverPublishRecord
            scheduleServerPublishRetry()
          }

          if (localSaveResult.status === 'fulfilled' && serverPublishResult.status === 'fulfilled') {
            setSaveStatus('synced')
            return
          }

          setSaveStatus('error')
        })
        .catch(() => {
          pendingDraftRecordRef.current = null
          setSaveStatus('error')
        })
    }, 1000)
  }, [autosaveReadyProjectId, clearServerPublishRetry, draftSnapshot, projectId, scheduleServerPublishRetry])

  const phaseStatus = workspacePhaseStatus
  const isEditorReadOnly = currentUserType !== 'DESIGNER'
  const canEditBubble = !isEditorReadOnly && phaseStatus === 'BUBBLE_DRAFT' && !isBubbleEditLocked
  const canEditIfc = !isEditorReadOnly && phaseStatus === 'IFC_EDIT'
  const isConverting = phaseStatus === 'CONVERTING'
  const isBubbleReadOnly = !canEditBubble

  const applyRemoteBubbleSnapshot = useCallback((snapshot: {
    bubbles: BubbleData[]
    connections: ConnectionData[]
  }) => {
    const previousById = new Map(bubbles.map((bubble) => [bubble.id, bubble] as const))
    const normalizedBubbles = snapshot.bubbles.map((bubble, index) => {
      const previous = previousById.get(bubble.id)
      const areaLabel = Number.isFinite(bubble.ratio) ? `${bubble.ratio.toFixed(1)} m²` : (previous?.area ?? '0.0 m²')
      const defaultIndex = (index + 1).toString().padStart(2, '0')
      return {
        ...bubble,
        area: areaLabel,
        index: previous?.index ?? defaultIndex,
        material: previous?.material,
      }
    })

    replaceBubbles(normalizedBubbles)
    replaceConnections(snapshot.connections)
    setSelectedConnectionPair(null)
    setConnectingFromId(null)
  }, [bubbles, replaceBubbles, replaceConnections])

  const { markLocalBubbleSnapshotChanged: markLocalBubbleSnapshotChangedRealtime } = useBubbleSnapshotRealtime({
    projectId,
    canPublish: canEditBubble,
    bubbles,
    connections,
    onRemoteSnapshot: applyRemoteBubbleSnapshot,
    onPhaseStatusChanged: setWorkspacePhaseStatus,
    onIfcStorageUrlReceived: (ifcStorageUrl, action, assetId) => {
      handleIfcSyncMessageRef.current(ifcStorageUrl, action, assetId)
    },
  })

  const flushBubbleSnapshotSaveToDb = useCallback(async (force = false): Promise<SaveBubbleSnapshotResponse | null> => {
    if (!projectId) return null
    if (workspacePhaseStatus !== 'BUBBLE_DRAFT') return null
    if (!force && !bubbleDbDirtyRef.current) return null

    if (bubbleDbSaveInFlightRef.current) {
      try {
        return await bubbleDbSaveInFlightRef.current
      } catch {
        return null
      }
    }

    const snapshot = latestBubbleSnapshotRef.current
    const saveTask = (async () => {
      const saved = await saveBubbleSnapshotToDb(projectId, snapshot.bubbles, snapshot.connections)
      bubbleDbDirtyRef.current = false
      return saved
    })()
    bubbleDbSaveInFlightRef.current = saveTask
    try {
      return await saveTask
    } catch (error: unknown) {
      console.warn('[editor] Bubble snapshot DB 저장 실패:', { projectId, error })
      return null
    } finally {
      if (bubbleDbSaveInFlightRef.current === saveTask) {
        bubbleDbSaveInFlightRef.current = null
      }
    }
  }, [projectId, workspacePhaseStatus])

  const scheduleBubbleSnapshotSaveToDb = useCallback((delayMs = BUBBLE_DB_SAVE_DEBOUNCE_MS) => {
    if (!projectId) return
    if (workspacePhaseStatus !== 'BUBBLE_DRAFT') return

    bubbleDbDirtyRef.current = true
    if (bubbleDbSaveTimerRef.current !== null) {
      window.clearTimeout(bubbleDbSaveTimerRef.current)
    }
    bubbleDbSaveTimerRef.current = window.setTimeout(() => {
      bubbleDbSaveTimerRef.current = null
      void flushBubbleSnapshotSaveToDb(false)
    }, delayMs)
  }, [flushBubbleSnapshotSaveToDb, projectId, workspacePhaseStatus])

  const markLocalBubbleSnapshotChanged = useCallback(() => {
    hasUserEditedRef.current = true
    markLocalBubbleSnapshotChangedRealtime()
    scheduleBubbleSnapshotSaveToDb()
  }, [markLocalBubbleSnapshotChangedRealtime, scheduleBubbleSnapshotSaveToDb])

  useEffect(() => {
    markLocalBubbleSnapshotChangedRef.current = markLocalBubbleSnapshotChanged
  }, [markLocalBubbleSnapshotChanged])

  useEffect(() => {
    return () => {
      if (bubbleDbSaveTimerRef.current !== null) {
        window.clearTimeout(bubbleDbSaveTimerRef.current)
        bubbleDbSaveTimerRef.current = null
      }
    }
  }, [])

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
          const segIndex = opening.wallId.indexOf('-seg-')
          const baseId = segIndex > 0 ? opening.wallId.slice(0, segIndex) : opening.wallId
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
      return selectedIds.length > 0 || Boolean(selectedIfcElement)
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
    selectedIfcElement,
  ])
  const unreadCommentNotifications = useMemo(
    () =>
      commentNotifications.filter(
        (notification) => notification.recipientType === collaborationUserType && !notification.isRead,
      ),
    [commentNotifications, collaborationUserType],
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

  const ifcElementChanges = useMemo(
    () => Object.values(ifcElementChangesById),
    [ifcElementChangesById],
  )

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

  // 3D 생성 모달
  const [isGenerate3DModalOpen, setIsGenerate3DModalOpen] = useState(false)
  const [localFloorData, setLocalFloorData] = useState<FloorPlan3DData | null>(null)
  // IFC 기반 3D에서 파싱된 건물 층(IfcBuildingStorey) 목록
  const [ifcStoreys, setIfcStoreys] = useState<IfcStoreyInfo[]>([])
  // 현재 표시 중인 IFC 층 expressId (null = 전체 표시)
  const [activeIfcStoreyExpressId, setActiveIfcStoreyExpressId] = useState<number | null>(null)
  // 겹쳐보기로 함께 표시할 IFC 층 expressId 목록
  const [overlayIfcStoreyExpressIds, setOverlayIfcStoreyExpressIds] = useState<number[]>([])
  const validIfcStoreyIdSet = useMemo(
    () => new Set(ifcStoreys.map((storey) => storey.expressId)),
    [ifcStoreys],
  )

  // IFC 층보기 투명도 키를 별도로 동기화한다.
  // 기존 2D floorLayers 기반 동기화는 유지하고, 3D IFC 층 ID 키만 확장한다.
  useEffect(() => {
    if (ifcStoreys.length === 0) return
    const syncTimer = window.setTimeout(() => {
      setOverlayOpacityByLayerId((prev) => {
        let hasChanged = false
        const next = { ...prev }
        ifcStoreys.forEach((storey) => {
          const key = String(storey.expressId)
          if (!Number.isFinite(next[key])) {
            next[key] = 0.35
            hasChanged = true
          }
        })
        return hasChanged ? next : prev
      })
    }, 0)
    return () => window.clearTimeout(syncTimer)
  }, [ifcStoreys])

  // IFC 층 상태 정합성 보정:
  // - 존재하지 않는 층 ID 제거
  // - 활성 층과 겹쳐보기 중복 제거
  // - 겹쳐보기 목록 중복 제거
  useEffect(() => {
    const syncTimer = window.setTimeout(() => {
      if (validIfcStoreyIdSet.size === 0) {
        if (activeIfcStoreyExpressId !== null) setActiveIfcStoreyExpressId(null)
        if (overlayIfcStoreyExpressIds.length > 0) setOverlayIfcStoreyExpressIds([])
        return
      }

      setActiveIfcStoreyExpressId((prev) => {
        if (prev == null) return prev
        return validIfcStoreyIdSet.has(prev) ? prev : null
      })
      setOverlayIfcStoreyExpressIds((prev) => {
        const next: number[] = []
        const seen = new Set<number>()
        prev.forEach((id) => {
          if (!Number.isFinite(id)) return
          if (!validIfcStoreyIdSet.has(id)) return
          if (activeIfcStoreyExpressId != null && id === activeIfcStoreyExpressId) return
          if (seen.has(id)) return
          seen.add(id)
          next.push(id)
        })
        if (next.length === prev.length && next.every((id, index) => id === prev[index])) return prev
        return next
      })
    }, 0)
    return () => window.clearTimeout(syncTimer)
  }, [validIfcStoreyIdSet, activeIfcStoreyExpressId, overlayIfcStoreyExpressIds.length])

  // 3D 이탈 시 3D 선택 요청 트리거를 정리해 재진입 시 stale 요청이 재적용되는 현상을 막는다.
  useEffect(() => {
    if (mode === '3d') return
    const resetTimer = window.setTimeout(() => {
      setRequestedIfcElementLocalId((prev) => (prev === null ? prev : null))
      setIfcElementSelectionRequestToken((prev) => (prev === 0 ? prev : 0))
      setRequestedLibraryElementId((prev) => (prev === null ? prev : null))
      setLibraryElementSelectionRequestToken((prev) => (prev === 0 ? prev : 0))
    }, 0)
    return () => window.clearTimeout(resetTimer)
  }, [mode])

  // 3D 모드(로컬, IFC 없음)에서 활성 층이 바뀌면 해당 층의 방·벽 데이터로 localFloorData를 갱신한다.
  // IFC 기반 3D에서는 localFloorData를 사용하지 않으므로 currentIfcUrl이 있을 때는 실행하지 않는다.
  useEffect(() => {
    if (mode !== '3d' || currentIfcUrl) return
    const syncTimer = window.setTimeout(() => {
      setLocalFloorData((prev) => {
        if (!prev) return null
        if (prev.rooms === floorRooms && prev.walls === mergedFloorWalls) return prev
        return { rooms: floorRooms, walls: mergedFloorWalls, storyHeightMm: prev.storyHeightMm }
      })
    }, 0)
    return () => window.clearTimeout(syncTimer)
  }, [activeFloorLayerId, floorRooms, mergedFloorWalls, mode, currentIfcUrl])

  // ── 핸들러 ────────────────────────────────────────────────────────────────

  /** 편집 모드 전환 — 협업 모드·라이브러리는 모드 이탈 시 닫힘 */
  const setMode = useCallback((nextMode: EditorMode) => {
    setSearchParams({ mode: nextMode })
    if (nextMode !== '2d') setIsCollaborationMode(false)
    if (nextMode !== '3d') {
      setSelectedIfcElement(null)
      setRequestedIfcElementLocalId(null)
      setIfcElementSelectionRequestToken(0)
      setRequestedLibraryElementId(null)
      setLibraryElementSelectionRequestToken(0)
    }
    setIsLibraryOpen(false)
  }, [setSearchParams])

  const handleOpenAddModal = () => {
    if (isBubbleReadOnly) return
    setAddSpaceFormData(INITIAL_ADD_SPACE_FORM)
    setIsAddModalOpen(true)
  }

  const handleConfirmAddSpace = () => {
    if (isBubbleReadOnly) return
    markLocalBubbleSnapshotChanged()
    addBubble(addSpaceFormData)
    setIsAddModalOpen(false)
  }

  /** 선 스타일 모달 열기 — 현재·이전 선택 버블 쌍으로 연결 대상 자동 설정 */
  const handleOpenLineStyleModal = () => {
    if (isBubbleReadOnly) return
    openModal(selectedId, previousSelectedId)
  }

  const confirmLineStyleModal = () => {
    if (isBubbleReadOnly) return
    markLocalBubbleSnapshotChanged()
    confirmLineStyleModalRaw()
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
        createdByType: collaborationUserType,
        messages: [
          {
            id: messageId,
            pinId,
            authorId: authUser?.id ?? 'local-user',
            authorName: currentUserName,
            authorType: collaborationUserType,
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
  }, [authUser?.id, currentUserName, collaborationUserType, counterpartType])

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
              authorType: collaborationUserType,
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
  }, [authUser?.id, currentUserName, collaborationUserType, counterpartType])

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
    markLocalBubbleSnapshotChanged()
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
      markLocalBubbleSnapshotChanged()
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
    clearConnectionAndTwoDSelection()
    setSelectedIfcElement(null)
  }

  const handleSelectIfcElement = useCallback((element: IfcElementInfo | null) => {
    setSelectedIfcElement(element)
    if (!element) return
    clearSelection()
    clearConnectionAndTwoDSelection()
  }, [clearSelection, clearConnectionAndTwoDSelection])

  const handleSelectIfcElementByLocalId = useCallback((localId: number) => {
    if (!Number.isFinite(localId)) return
    const normalizedLocalId = Math.trunc(localId)
    if (normalizedLocalId <= 0) return
    clearSelection()
    clearConnectionAndTwoDSelection()
    setRequestedIfcElementLocalId(normalizedLocalId)
    setIfcElementSelectionRequestToken((prev) => prev + 1)
  }, [clearSelection, clearConnectionAndTwoDSelection])

  const handleAddLibraryPreset = useCallback((preset: ThreeDLibraryPreset) => {
    const storeyExpressId = activeIfcStoreyExpressId ?? null

    // IFC 층이 있는데 현재 활성 층이 없으면 추가를 중단하고 설정 방법을 안내한다.
    if (storeyExpressId == null && ifcStoreys.length > 0) {
      window.alert('활성 층이 없습니다.\n우측 "층보기" 패널에서 층 이름을 클릭해 활성 층을 먼저 설정한 뒤 라이브러리를 추가하세요.')
      return
    }

    setLibraryElements((prev) => [
      ...prev,
      {
        ...preset,
        id: `${preset.id}-${Date.now()}-${prev.length}`,
        storeyExpressId,
      },
    ])
    setIsLibraryOpen(false)
  }, [activeIfcStoreyExpressId, ifcStoreys])

  const handleChangeLibraryElement = useCallback((id: string, patch: Partial<ThreeDLibraryPreset>) => {
    setLibraryElements((prev) =>
      prev.map((element) => {
        if (element.id !== id) return element
        const merged = { ...element, ...patch }
        if (Number.isFinite(merged.storeyExpressId)) return merged
        const fallbackStoreyId = activeIfcStoreyExpressId ?? ifcStoreys[0]?.expressId ?? null
        return { ...merged, storeyExpressId: fallbackStoreyId }
      }),
    )
  }, [activeIfcStoreyExpressId, ifcStoreys])

  const handleDeleteLibraryElement = useCallback((id: string) => {
    setLibraryElements((prev) => prev.filter((element) => element.id !== id))
    setSelectedIfcElement((prev) => (prev?.source === 'library' ? null : prev))
  }, [])

  const handleSelectLibraryElementById = useCallback((id: string) => {
    const normalizedId = id.trim()
    if (!normalizedId) return
    clearSelection()
    clearConnectionAndTwoDSelection()
    setRequestedLibraryElementId(normalizedId)
    setLibraryElementSelectionRequestToken((prev) => prev + 1)
  }, [clearSelection, clearConnectionAndTwoDSelection])

  const recordIfcElementChange = useCallback((element: IfcElementInfo | null, patch: Omit<IfcElementChange, 'expressId' | 'localId' | 'localIds'>) => {
    if (!element || element.source !== 'ifc' || typeof element.expressId !== 'number') return
    const localIdFromProperties = element.properties?.LocalID
    const localIdsFromProperties = (() => {
      const raw = element.properties?.DeletedLocalIds
      if (typeof raw !== 'string') return []
      return raw
        .split(',')
        .map((token) => Number(token.trim()))
        .filter(Number.isFinite)
    })()
    const parsedLocalIdFromId = (() => {
      const tokens = element.id.split(':')
      const token = tokens[tokens.length - 1]
      if (!token) return undefined
      const parsed = Number(token)
      return Number.isFinite(parsed) ? parsed : undefined
    })()
    const localId = typeof localIdFromProperties === 'number'
      ? localIdFromProperties
      : parsedLocalIdFromId

    setIfcElementChangesById((prev) => {
      const previous = prev[element.expressId as number]
      const mergedLocalIds = Array.from(new Set([
        ...(previous?.localIds ?? []),
        ...localIdsFromProperties,
        ...(Number.isFinite(localId) ? [localId as number] : []),
      ]))
      return {
        ...prev,
        [element.expressId as number]: {
          ...previous,
          ...patch,
          expressId: element.expressId as number,
          localId: Number.isFinite(localId) ? localId : previous?.localId,
          localIds: mergedLocalIds.length > 0 ? mergedLocalIds : previous?.localIds,
        },
      }
    })
  }, [])

  const handleDeleteIfcElement = useCallback((element: IfcElementInfo) => {
    recordIfcElementChange(element, { deleted: true })
    setSelectedIfcElement((prev) => (prev?.id === element.id ? null : prev))
  }, [recordIfcElementChange])

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
    markLocalBubbleSnapshotChanged()
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
    markLocalBubbleSnapshotChanged()
    handleLabelChange(id, label)
    setLabelEditState(null)
  }

  const handleBubbleDragInBubble = useCallback((bubbleId: string, x: number, y: number) => {
    if (isBubbleReadOnly) return
    markLocalBubbleSnapshotChanged()
    handleBubbleDrag(bubbleId, x, y)
  }, [isBubbleReadOnly, markLocalBubbleSnapshotChanged, handleBubbleDrag])

  const handleBubbleResizeInBubble = useCallback((id: string, x: number, y: number, width: number, height: number) => {
    if (isBubbleReadOnly) return
    markLocalBubbleSnapshotChanged()
    handleBubbleResize(id, x, y, width, height)
  }, [isBubbleReadOnly, markLocalBubbleSnapshotChanged, handleBubbleResize])

  /** 2D 평면도 생성 버튼 핸들러 — 로딩 애니메이션 포함 */
  const handleGenerateFloorPlan = async () => {
    if (!projectId) return
    if (floorPlanGenerateForbiddenRef.current) {
      setFloorPlanGenerateStatusText('평면도 생성 권한이 없습니다. 프로젝트 소유자 계정으로 시도하세요.')
      return
    }
    if (authUser?.user_type !== 'DESIGNER') {
      setFloorPlanGenerateStatusText('평면도 생성 권한이 없습니다. 설계자 계정으로 시도하세요.')
      return
    }
    if (isCurrentProjectOwnerKnown && !isCurrentProjectOwner) {
      setFloorPlanGenerateStatusText('평면도 생성 권한이 없습니다. 프로젝트 소유자 계정으로 시도하세요.')
      return
    }
    if (bubbles.length === 0) return
    if (workspacePhaseStatus === 'CONVERTING') {
      setFloorPlanGenerateStatusText('이미 평면도 생성 중입니다. 잠시만 기다려주세요.')
      return
    }
    try {
      if (bubbleDbSaveTimerRef.current !== null) {
        window.clearTimeout(bubbleDbSaveTimerRef.current)
        bubbleDbSaveTimerRef.current = null
      }
      const savedSnapshot = await flushBubbleSnapshotSaveToDb(true)
      if (!savedSnapshot) {
        console.error('[editor] 버블 스냅샷 DB 저장 결과가 없어 평면도 생성 요청을 중단합니다.', { projectId })
        return
      }
      const latestSnapshot = latestBubbleSnapshotRef.current
      const layoutImport = buildFloorPlanLayoutImportPayload(
        projectId,
        currentProjectName,
        latestSnapshot.bubbles,
        latestSnapshot.connections,
      )
      const response = await requestFloorPlanGenerate({
        projectId,
        layoutImport,
      })
      floorPlanGenerateForbiddenRef.current = false
      setLatestFloorPlanJobId(response.jobId)
      setFloorPlanGenerateStatusText('AI가 평면도 생성 중...')
      setIsFloorPlanEditedIn2D(false)
      setWorkspacePhaseStatus('CONVERTING')
      startFloorPlanGenerateTimeout()
    } catch (error: unknown) {
      clearFloorPlanGenerateTimeout()
      setWorkspacePhaseStatus('BUBBLE_DRAFT')
      if (error instanceof FloorPlanLayoutValidationError) {
        const firstError = error.errors[0] ?? '입력 형식이 올바르지 않습니다.'
        setFloorPlanGenerateStatusText(`평면도 생성 입력값이 올바르지 않습니다. (${firstError})`)
        console.error('[editor] Floor-plan layoutImport 유효성 검증 실패:', error.errors)
        return
      }
      if (isAxiosError(error)) {
        if (error.response?.status === 403) {
          clearFloorPlanGenerateTimeout()
          floorPlanGenerateForbiddenRef.current = true
          setFloorPlanGenerateStatusText('평면도 생성 권한이 없습니다. 프로젝트 소유자/권한을 확인하세요.')
          console.warn('[editor] Floor-plan 생성 권한 없음(403): 프로젝트 소유자 여부를 확인하세요.')
          return
        }
        console.error('[editor] Floor-plan 생성 API 호출 실패:', {
          status: error.response?.status,
          data: error.response?.data,
        })
        return
      }
      console.error('[editor] Floor-plan 생성 API 호출 실패:', error)
    }
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

  const handleEditIfc = useCallback((elementId: string, action: string, value: unknown) => {
    if (!projectId) return
    if (!canEditIfc) return
    const normalizedElementId = elementId.trim()
    const normalizedAction = action.trim()
    if (!normalizedElementId || !normalizedAction) return
    try {
      publishIfcEditRequest(projectId, {
        action: normalizedAction,
        elementId: normalizedElementId,
        value,
      })
    } catch (error: unknown) {
      console.warn('[editor] IFC edit publish failed.', {
        projectId,
        elementId: normalizedElementId,
        action: normalizedAction,
        error,
      })
    }
  }, [projectId, canEditIfc])

  const handleIfcUndo = useCallback(() => {
    if (!projectId) return
    if (!canEditIfc) return
    try {
      publishIfcUndoRequest(projectId, {})
    } catch (error: unknown) {
      console.warn('[editor] IFC undo publish failed.', { projectId, error })
    }
  }, [projectId, canEditIfc])

  const handleIfcRedo = useCallback(() => {
    if (!projectId) return
    if (!canEditIfc) return
    try {
      publishIfcRedoRequest(projectId, {})
    } catch (error: unknown) {
      console.warn('[editor] IFC redo publish failed.', { projectId, error })
    }
  }, [projectId, canEditIfc])

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
  const toggleLayerOverlayMode = useCallback(() => {
    // 3D IFC 모드: 겹쳐보기 ON/OFF를 overlay 층 목록으로 제어한다.
    if (mode === '3d' && ifcStoreys.length > 0) {
      setOverlayIfcStoreyExpressIds((prev) => {
        if (prev.length > 0) return []
        const activeId = activeIfcStoreyExpressId
        return ifcStoreys
          .map((storey) => storey.expressId)
          .filter((id) => id !== activeId)
      })
      return
    }

    // 2D(및 IFC 층 정보가 없는 3D)에서는 기존 상태 토글을 유지한다.
    setIsLayerOverlayMode((prev) => !prev)
  }, [mode, ifcStoreys, activeIfcStoreyExpressId])

  // Shift+L: 층 겹쳐보기 모드 토글 (2D/3D 전용)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.repeat) return
      if (!e.shiftKey || e.code !== 'KeyL') return
      if (mode !== '2d' && mode !== '3d') return
      e.preventDefault()
      toggleLayerOverlayMode()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode, toggleLayerOverlayMode])
  const handleToggleOverlayLayer = (layerId: string) => {
    if (!activeFloorLayerId || layerId === activeFloorLayerId) return
    setOverlayLayerIds((prev) =>
      prev.includes(layerId) ? prev.filter((id) => id !== layerId) : [...prev, layerId],
    )
  }
  const handleSetOverlayLayerOpacity = (layerId: string, opacity: number) => {
    const normalized = opacity > 1 ? opacity / 100 : opacity
    const next = Math.min(Math.max(normalized, 0.1), 1)
    setOverlayOpacityByLayerId((prev) => {
      if (prev[layerId] === next) return prev
      return { ...prev, [layerId]: next }
    })
  }

  const {
    handleCreateFloorWall,
    handleSelectFloorWall,
    handleMoveFloorWall,
    handleUpdateFloorWallEndpoint,
    handleDeleteFloorWall,
    handleCreateFloorOpening,
    handleSelectFloorOpening,
    handleMoveFloorOpening,
    handleUpdateFloorOpeningSize,
    handleUpdateFloorWindowSillHeight,
    handleUpdateFloorDoorSwingDirection,
    handleUpdateFloorDoorHingeSide,
    handleDeleteFloorOpening,
    handleUpdateFloorWallType,
    handleUpdateFloorWallThickness,
    handleUpdateFloorWallHeight,
    handleUpdateFloorWallMaterial,
  } = useEditorStructureEditHandlers({
    floorRooms,
    floorWalls,
    visibleAutoFloorWalls,
    autoFloorWalls,
    mergedFloorOpenings,
    selectedFloorWallId,
    wallCreatePreset,
    workspaceCommandPublisher,
    clearSelection,
    setFloorWalls,
    setFloorOpenings,
    setWallCreatePreset,
    setSelectedFloorWallId,
    setSelectedFloorWallIds,
    setSelectedFloorOpeningId,
    setSelectedFloorOpeningIds,
    setSelectedTool,
    setHiddenAutoWallIds,
    setHiddenAutoOpeningIds,
    isAutoDerivedWallId,
    ensureFloorWallInManual,
    ensureFloorOpeningInManual,
    updateFloorOpeningFromEditable,
    updateFloorWallFromEditable,
    promoteCurrentAutoFloorOpenings,
    normalizeOpeningByCurrentWall,
  })

  /** 2D 방 드래그 리사이즈 */
  const handleResizeFloorRoom = (bubbleId: string, x: number, y: number, width: number, height: number) => {
    if (isWallFirstEditing) return
    setIsFloorPlanEditedIn2D(true)
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
      markLocalBubbleSnapshotChanged()
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
    if (isWallFirstEditing) return
    setIsFloorPlanEditedIn2D(true)
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
          markLocalBubbleSnapshotChanged()
          handleBubbleMove(room.bubbleId, room.x, room.y)
        }
      })
    } else {
      moveActiveRoom(bubbleId, x, y)
      if (canSyncBubbleStateFrom2D) {
        markLocalBubbleSnapshotChanged()
        handleBubbleMove(bubbleId, x, y)
      }
    }
    syncFloorDerivedStateFromRooms(nextRooms)
  }

  /** 2D 다각형 방 형상(꼭짓점) 갱신 */
  const handleUpdateFloorRoomPolygon = useCallback((bubbleId: string, polygon: Point2D[]) => {
    if (isWallFirstEditing) return
    setIsFloorPlanEditedIn2D(true)
    promoteCurrentAutoFloorOpenings()
    if (!isFinitePolygonPoints(polygon)) return
    const currentRoom = floorRooms.find((room) => room.bubbleId === bubbleId)
    if (!currentRoom) return

    const bounds = getPolygonBounds(polygon)
    const nextWidthPx = Math.max(bounds.maxX - bounds.minX, 1)
    const nextHeightPx = Math.max(bounds.maxY - bounds.minY, 1)
    if (!Number.isFinite(nextWidthPx) || !Number.isFinite(nextHeightPx)) return

    const nextWidthMm = Math.max(Math.round(nextWidthPx * FLOOR_MM_PER_PX), 100)
    const nextHeightMm = Math.max(Math.round(nextHeightPx * FLOOR_MM_PER_PX), 100)
    const polygonAreaPx = getPolygonAreaPx(polygon)
    const nextAreaM2 = Math.max(
      (polygonAreaPx * FLOOR_MM_PER_PX * FLOOR_MM_PER_PX) / 1_000_000,
      0.01,
    )

    const nextRect: AxisAlignedRect = {
      x: bounds.minX,
      y: bounds.minY,
      width: nextWidthPx,
      height: nextHeightPx,
    }
    const prevRect: AxisAlignedRect = {
      x: currentRoom.x,
      y: currentRoom.y,
      width: currentRoom.width,
      height: currentRoom.height,
    }

    const nextRooms: FloorRoom[] = floorRooms.map((room) =>
      room.bubbleId === bubbleId
        ? {
            ...room,
            x: bounds.minX,
            y: bounds.minY,
            width: nextWidthPx,
            height: nextHeightPx,
            widthMm: nextWidthMm,
            heightMm: nextHeightMm,
            area: nextAreaM2,
            polygon: polygon.map((point) => ({ x: point.x, y: point.y })),
            contour: undefined,
            transform: undefined,
          }
        : room,
    )

    updateActiveRoom(bubbleId, (room) => ({
      ...room,
      x: bounds.minX,
      y: bounds.minY,
      width: nextWidthPx,
      height: nextHeightPx,
      widthMm: nextWidthMm,
      heightMm: nextHeightMm,
      area: nextAreaM2,
      polygon: polygon.map((point) => ({ x: point.x, y: point.y })),
      contour: undefined,
      transform: undefined,
    }))

    if (canSyncBubbleStateFrom2D) {
      markLocalBubbleSnapshotChanged()
      handleWidthChange(bubbleId, nextWidthMm)
      handleHeightChange(bubbleId, nextHeightMm)
      handleBubbleMove(bubbleId, bounds.minX, bounds.minY)
    }

    syncPerimeterManualWallsForRoomResize(bubbleId, prevRect, nextRect)
    syncFloorDerivedStateFromRooms(nextRooms)
  }, [
    floorRooms,
    isWallFirstEditing,
    setIsFloorPlanEditedIn2D,
    markLocalBubbleSnapshotChanged,
    canSyncBubbleStateFrom2D,
    handleWidthChange,
    handleHeightChange,
    handleBubbleMove,
    promoteCurrentAutoFloorOpenings,
    syncPerimeterManualWallsForRoomResize,
    syncFloorDerivedStateFromRooms,
    updateActiveRoom,
  ])

  /**
   * 공통 선택 상태 초기화
   * - 버블 선택
   * - 연결 생성 대기 상태
   * - 연결선 선택 상태
   */
  const resetInteractionSelection = useCallback(() => {
    setConnectingFromId(null)
    clearConnectionAndTwoDSelection()
    clearSelection()
  }, [clearSelection, clearConnectionAndTwoDSelection])

  /** 도면 변경 공통 반영 파이프라인 */
  const syncHistoryAvailability = useCallback(() => {
    setCanUndo(undoHistoryRef.current.length > 0)
    setCanRedo(redoHistoryRef.current.length > 0)
  }, [])

  const clearPendingHistoryCommit = useCallback(() => {
    if (historyCommitTimerRef.current !== null) {
      clearTimeout(historyCommitTimerRef.current)
      historyCommitTimerRef.current = null
    }
    pendingHistorySnapshotRef.current = null
  }, [])

  const commitPendingHistorySnapshot = useCallback(() => {
    const previousSnapshot = historySnapshotRef.current
    const nextSnapshot = pendingHistorySnapshotRef.current

    historyCommitTimerRef.current = null
    pendingHistorySnapshotRef.current = null

    if (previousSnapshot === null || nextSnapshot === null || previousSnapshot === nextSnapshot) return

    undoHistoryRef.current = [
      ...undoHistoryRef.current.slice(-(EDITOR_HISTORY_LIMIT - 1)),
      JSON.parse(previousSnapshot) as EditorDraftSnapshot,
    ]
    redoHistoryRef.current = []
    historySnapshotRef.current = nextSnapshot
    hasUserEditedRef.current = true
    syncHistoryAvailability()
  }, [syncHistoryAvailability])

  useEffect(() => {
    return () => {
      clearPendingHistoryCommit()
    }
  }, [clearPendingHistoryCommit])

  const restoreEditorSnapshot = useCallback((snapshot: EditorDraftSnapshot) => {
    isRestoringHistoryRef.current = true
    replaceBubbles(snapshot.bubbles)
    replaceConnections(snapshot.connections)
    replaceZonesState(snapshot.zones)
    replaceFloorPlanState({
      isGenerated: snapshot.isFloorPlanGenerated,
      layoutSource: snapshot.floorPlanLayoutSource,
      layers: snapshot.floorLayers,
      activeLayerId: snapshot.activeFloorLayerId,
    })
    setFloorWalls(snapshot.floorWalls ?? [])
    setFloorOpenings(snapshot.floorOpenings ?? [])
    setHiddenAutoWallIds(snapshot.hiddenAutoWallIds ?? [])
    setHiddenAutoOpeningIds(snapshot.hiddenAutoOpeningIds ?? [])
    setIsProjectStructurePreferred(snapshot.isProjectStructurePreferred ?? false)
    resetInteractionSelection()
  }, [
    replaceBubbles,
    replaceConnections,
    replaceFloorPlanState,
    replaceZonesState,
    resetInteractionSelection,
  ])

  useEffect(() => {
    const serializedSnapshot = JSON.stringify(draftSnapshot)
    const normalizedProjectId = projectId ?? null
    const isProjectChanged = historyProjectIdRef.current !== normalizedProjectId

    if (isRestoringHistoryRef.current) {
      clearPendingHistoryCommit()
      historySnapshotRef.current = serializedSnapshot
      isRestoringHistoryRef.current = false
      return
    }

    if (
      isProjectChanged ||
      draftLoadingProjectIdRef.current === projectId ||
      skipNextHistorySnapshotRef.current
    ) {
      clearPendingHistoryCommit()
      historyProjectIdRef.current = normalizedProjectId
      historySnapshotRef.current = serializedSnapshot
      undoHistoryRef.current = []
      redoHistoryRef.current = []
      skipNextHistorySnapshotRef.current = false
      syncHistoryAvailability()
      return
    }

    if (historySnapshotRef.current === null) {
      historySnapshotRef.current = serializedSnapshot
      return
    }

    if (historySnapshotRef.current === serializedSnapshot) return

    pendingHistorySnapshotRef.current = serializedSnapshot
    if (historyCommitTimerRef.current !== null) {
      clearTimeout(historyCommitTimerRef.current)
    }
    historyCommitTimerRef.current = setTimeout(commitPendingHistorySnapshot, 300)
  }, [clearPendingHistoryCommit, commitPendingHistorySnapshot, draftSnapshot, projectId, syncHistoryAvailability])

  const handleUndo = useCallback(() => {
    clearPendingHistoryCommit()
    const previous = undoHistoryRef.current.pop()
    if (!previous) return

    const currentSnapshot = latestDraftSnapshotRef.current
    redoHistoryRef.current = [
      ...redoHistoryRef.current.slice(-(EDITOR_HISTORY_LIMIT - 1)),
      currentSnapshot,
    ]
    restoreEditorSnapshot(previous)
    syncHistoryAvailability()
  }, [clearPendingHistoryCommit, restoreEditorSnapshot, syncHistoryAvailability])

  const handleRedo = useCallback(() => {
    clearPendingHistoryCommit()
    const next = redoHistoryRef.current.pop()
    if (!next) return

    const currentSnapshot = latestDraftSnapshotRef.current
    undoHistoryRef.current = [
      ...undoHistoryRef.current.slice(-(EDITOR_HISTORY_LIMIT - 1)),
      currentSnapshot,
    ]
    restoreEditorSnapshot(next)
    syncHistoryAvailability()
  }, [clearPendingHistoryCommit, restoreEditorSnapshot, syncHistoryAvailability])

  const applyDrawingSnapshot = useCallback(
    ({ bubbles: nextBubbles, connections: nextConnections, floorWalls: nextFloorWalls, floorOpenings: nextFloorOpenings }: DrawingSnapshot) => {
      setIsFloorPlanEditedIn2D(false)
      setIsProjectStructurePreferred(false)
      replaceBubbles(nextBubbles)
      replaceConnections(nextConnections)
      // project-origin 레이아웃은 버블 자동 배치로 덮어쓰지 않는다.
      if (!IFC_DERIVED_FLOORPLAN_ONLY && floorPlanLayoutSource !== 'project') {
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
    setIsFloorPlanEditedIn2D(false)
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
    importFloorProjectFromWebIfc,
    clearImportMessage,
  } = useFloorProjectImport({
    stageSize,
    onApplyProject: applyFloorProject,
  })

  const {
    ifcLoadState,
    ifcLoadError,
    lastIfcContext,
    loadIfcFromStorageUrl,
    setIfcFragmentsLoader,
  } = useIfcLoadingLayer({
    importFloorProjectFromIfc,
    importFloorProjectFromWebIfc,
  })

  const handleOutputIfcStorageUrl = useCallback(async (ifcStorageUrl: string, action: string | null, assetId?: string | null) => {
    if (!projectId) return
    // assetId가 있으면 이를 dedup 키로 사용 (presigned URL은 매번 달라질 수 있어 불안정)
    // 프로젝트 ID를 포함해 프로젝트 간 dedup 충돌을 방지한다.
    const normalizedSourceKey = assetId?.trim() || ifcStorageUrl.trim()
    const dedupeKey = normalizedSourceKey ? `${projectId}:${normalizedSourceKey}` : ''
    if (!dedupeKey) return

    if (ifcLoadInFlightStorageUrlRef.current === dedupeKey) {
      return
    }
    if (lastLoadedIfcStorageUrlRef.current === dedupeKey) {
      return
    }

    ifcLoadInFlightStorageUrlRef.current = dedupeKey

    try {
      // private S3 버킷: assetId 또는 s3:// URL → download-url API로 presigned URL 발급
      const presignedUrl = await resolveIfcPresignedUrl(ifcStorageUrl, assetId ?? undefined)
      await loadIfcFromStorageUrl(presignedUrl, { webIfcWasmPath: '/wasm/' })
      lastLoadedIfcStorageUrlRef.current = dedupeKey
      // 2D 파싱 완료 후 3D 캔버스로 presigned URL과 assetId 전달
      setIfcSourceByProjectId((prev) => ({
        ...prev,
        [projectId]: {
          url: presignedUrl,
          assetId: assetId ?? null,
        },
      }))
      // IFC가 정상 로드되면 완료 action 문자열과 무관하게 편집 상태로 복귀해 무한 로딩을 방지한다.
      setWorkspacePhaseStatus('IFC_EDIT')
      if (action && IFC_COMPLETED_ACTION_SET.has(action)) {
        setFloorPlanGenerateStatusText('평면도 생성이 완료되었습니다.')
      }
    } catch (error: unknown) {
      console.error('[editor] IFC 로드 실패:', error)
      setWorkspacePhaseStatus('BUBBLE_DRAFT')
      setFloorPlanGenerateStatusText('IFC 결과 로드에 실패했습니다. 다시 시도하세요.')
    } finally {
      if (ifcLoadInFlightStorageUrlRef.current === dedupeKey) {
        ifcLoadInFlightStorageUrlRef.current = null
      }
    }
  }, [loadIfcFromStorageUrl, projectId, setFloorPlanGenerateStatusText])

  useEffect(() => {
    handleIfcSyncMessageRef.current = (url: string, action: string | null, assetId?: string | null) => {
      void handleOutputIfcStorageUrl(url, action, assetId)
    }
  }, [handleOutputIfcStorageUrl])

  // 에디터 첫 진입 시 프로젝트 IFC 소스를 1회 조회해 handleOutputIfcStorageUrl로 로드한다.
  useInitialIfcImport({
    projectId,
    hasIfcUploaded: hasIfcUploadedInCurrentProject,
    stageWidth: stageSize.width,
    stageHeight: stageSize.height,
    onResolvedIfcUrl: (url, assetId) => {
      handleIfcSyncMessageRef.current(url, null, assetId)
    },
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

  const {
    handleLabelChangeForPanel,
    handleTypeChangeForPanel,
    handleRatioChangeForPanel,
    handleColorChangeForPanel: baseHandleColorChangeForPanel,
    handleMaterialChangeForPanel: baseHandleMaterialChangeForPanel,
    handleWidthChangeForPanel: baseHandleWidthChangeForPanel,
    handleHeightChangeForPanel: baseHandleHeightChangeForPanel,
    handleWidthCommitForPanel: baseHandleWidthCommitForPanel,
    handleHeightCommitForPanel: baseHandleHeightCommitForPanel,
  } = useEditorAttributePanelHandlers({
    mode,
    canSyncBubbleStateFrom2D,
    isWallFirstEditing,
    isGridSnapEnabled,
    gridSnapIntervalMm,
    floorRooms,
    setIsFloorPlanEditedIn2D,
    markLocalBubbleSnapshotChanged,
    handleLabelChange,
    handleTypeChange,
    handleMaterialChange,
    handleRatioChange,
    handleColorChange,
    handleWidthChange,
    handleHeightChange,
    updateActiveRoom,
    syncPerimeterManualWallsForRoomResize,
    syncFloorDerivedStateFromRooms,
  })

  const {
    handleMaterialChangeForPanel,
    handleColorChangeForPanel,
    handleWidthChangeForPanel,
    handleHeightChangeForPanel,
    handleThicknessChangeForPanel,
  } = useThreeDIfcAttributeHandlers({
    mode,
    selectedIfcElement,
    setSelectedIfcElement,
    recordIfcElementChange,
    baseHandleMaterialChangeForPanel,
    baseHandleColorChangeForPanel,
    baseHandleWidthChangeForPanel,
    baseHandleHeightChangeForPanel,
  })

  const handleWidthCommitForPanel = useCallback(
    (id: string, widthMm: number) => baseHandleWidthCommitForPanel(id, widthMm),
    [baseHandleWidthCommitForPanel],
  )

  const handleHeightCommitForPanel = useCallback(
    (id: string, heightMm: number) => baseHandleHeightCommitForPanel(id, heightMm),
    [baseHandleHeightCommitForPanel],
  )

  /**
   * 2D 평면도 → 3D 생성 모달 열기.
   * IFC URL이 이미 있으면 모달 없이 바로 3D 모드로 전환한다.
   */
  /**
   * 3D 생성 모달 열기
   * - IFC URL이 이미 있으면 모달 없이 3D 모드로 바로 전환한다.
   * - IFC URL이 없으면 층고 입력 모달을 표시해 localFloorData를 구성한다.
   */
  const handleOpenGenerate3DModal = useCallback(() => {
    if (currentIfcUrl) {
      setIsGenerate3DModalOpen(false)
      setMode('3d')
      return
    }
    setIsGenerate3DModalOpen(true)
  }, [currentIfcUrl, setMode])

  /** 3D 생성 모달 닫기 */
  const handleCloseGenerate3DModal = useCallback(() => {
    setIsGenerate3DModalOpen(false)
  }, [])

  /**
   * 층고 확정 후 현재 평면도 데이터를 스냅샷으로 저장하고 3D 모드로 전환한다.
   * IFC URL이 있으면 IFC 기반 렌더링을 사용하므로 localFloorData를 설정하지 않는다.
   */
  const handleConfirmGenerate3D = useCallback((storyHeightMm: number) => {
    if (!currentIfcUrl) {
      setLocalFloorData({
        rooms: floorRooms,
        walls: mergedFloorWalls,
        storyHeightMm,
      })
    }
    setIsGenerate3DModalOpen(false)
    setMode('3d')
  }, [currentIfcUrl, floorRooms, mergedFloorWalls, setMode])

  /** IFC 로드 완료 시 호출: 파싱된 층 목록을 저장하고 최초 선택을 초기화한다. */
  const handleIfcStoreysLoad = useCallback((storeys: IfcStoreyInfo[]) => {
    const dedupedStoreys = Array.from(
      storeys.reduce((acc, storey) => {
        if (!Number.isFinite(storey.expressId)) return acc
        if (!acc.has(storey.expressId)) acc.set(storey.expressId, storey)
        return acc
      }, new Map<number, IfcStoreyInfo>()).values(),
    )
    const nextStoreyIdSet = new Set(dedupedStoreys.map((storey) => storey.expressId))
    const fallbackStoreyId = dedupedStoreys[0]?.expressId ?? null
    setIfcStoreys(dedupedStoreys)
    setLibraryElements((prev) =>
      prev.map((element) => {
        const normalizedCurrent = Number.isFinite(element.storeyExpressId) ? Number(element.storeyExpressId) : null
        const nextStoreyId = normalizedCurrent != null && nextStoreyIdSet.has(normalizedCurrent)
          ? normalizedCurrent
          : fallbackStoreyId
        if (normalizedCurrent === nextStoreyId) return element
        return { ...element, storeyExpressId: nextStoreyId }
      }),
    )
    // 활성 층/겹쳐보기/선택 상태는 가능한 한 유지하고,
    // 유효성 보정은 validIfcStoreyIdSet effect에서 처리한다.
    if (nextStoreyIdSet.size > 0) {
      setActiveIfcStoreyExpressId((prev) => {
        if (prev == null) return prev
        return nextStoreyIdSet.has(prev) ? prev : null
      })
      setOverlayIfcStoreyExpressIds((prev) => prev.filter((id) => nextStoreyIdSet.has(id)))
    }
  }, [])

  /** FloorViewPanel에서 IFC 층 선택 시 호출 (id는 expressId의 문자열 표현) */
  const handleSelectIfcStorey = useCallback((id: string) => {
    const expressId = Number(id)
    if (!Number.isFinite(expressId)) return
    if (validIfcStoreyIdSet.size > 0 && !validIfcStoreyIdSet.has(expressId)) return

    setActiveIfcStoreyExpressId((prev) => (prev === expressId ? null : expressId))
    // 활성 층은 겹쳐보기 목록에서 제외한다.
    setOverlayIfcStoreyExpressIds((prev) => prev.filter((value) => value !== expressId))
  }, [validIfcStoreyIdSet])

  /** FloorViewPanel에서 IFC 층 겹쳐보기 토글 시 호출 (id는 expressId의 문자열 표현) */
  const handleToggleIfcStoreyOverlay = useCallback((id: string) => {
    const expressId = Number(id)
    if (!Number.isFinite(expressId)) return
    if (validIfcStoreyIdSet.size > 0 && !validIfcStoreyIdSet.has(expressId)) return
    if (activeIfcStoreyExpressId != null && expressId === activeIfcStoreyExpressId) return
    setOverlayIfcStoreyExpressIds((prev) =>
      prev.includes(expressId) ? prev.filter((e) => e !== expressId) : [...prev, expressId],
    )
  }, [activeIfcStoreyExpressId, validIfcStoreyIdSet])

  const handleAutoLayoutBubbles = useCallback(() => {
    if (mode !== 'bubble') return
    if (isBubbleReadOnly) return
    if (bubbles.length < 2) return

    markLocalBubbleSnapshotChanged()
    const nextBubbles = runForceDirectedBubbleLayout({
      bubbles,
      connections,
      sitePoints: sitePlanPoints,
    })
    replaceBubbles(nextBubbles)
  }, [mode, isBubbleReadOnly, bubbles, connections, sitePlanPoints, replaceBubbles, markLocalBubbleSnapshotChanged])

  return {
    // 모드
    mode,
    projectId,
    currentProjectName,
    latestFloorPlanJobId,
    floorPlanGenerateStatusText,
    setMode,
    phaseStatus,
    canEditBubble,
    canEditIfc,
    isConverting,
    isEditorReadOnly,
    canUndo,
    canRedo,
    handleUndo,
    handleRedo,
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
    selectedIfcElement: mode === '3d' ? selectedIfcElement : null,
    threeDDeleteRequestToken,
    handleBubbleSelect,
    handleSelectIfcElement,
    handleSelectIfcElementByLocalId,
    handleSelectLibraryElementById,
    handleDeleteIfcElement,
    requestedIfcElementLocalId,
    ifcElementSelectionRequestToken,
    requestedLibraryElementId,
    libraryElementSelectionRequestToken,
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
    handleThicknessChange: handleThicknessChangeForPanel,
    handleWidthCommit: handleWidthCommitForPanel,
    handleHeightCommit: handleHeightCommitForPanel,
    handleRatioChange: handleRatioChangeForPanel,
    handleColorChange: handleColorChangeForPanel,
    handleMaterialChange: handleMaterialChangeForPanel,
    ifcElementChanges,
    currentIfcUrl,
    currentIfcAssetId,
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
    currentCollaborationUserType: collaborationUserType,
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
    libraryElements,
    handleAddLibraryPreset,
    handleChangeLibraryElement,
    handleDeleteLibraryElement,
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
    canGenerateFloorPlanFromBubble: bubbles.length > 0 && authUser?.user_type === 'DESIGNER' && (!isCurrentProjectOwnerKnown || isCurrentProjectOwner),
    canAutoLayoutBubbles: bubbles.length > 1,
    handleEditIfc,
    handleIfcUndo,
    handleIfcRedo,
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
    ifcLoadState,
    ifcLoadError,
    lastIfcContext,
    loadIfcFromStorageUrl,
    setIfcFragmentsLoader,
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
    handleUpdateFloorRoomPolygon,
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
    // 초대 알림 모달
    isNotificationModalOpen,
    handleOpenNotificationModal: () => setIsNotificationModalOpen(true),
    onCloseNotificationModal: () => setIsNotificationModalOpen(false),
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
    // 3D 생성 모달
    isGenerate3DModalOpen,
    handleOpenGenerate3DModal,
    handleCloseGenerate3DModal,
    handleConfirmGenerate3D,
    localFloorData,
    ifcStoreys,
    activeIfcStoreyExpressId,
    overlayIfcStoreyExpressIds,
    handleIfcStoreysLoad,
    handleSelectIfcStorey,
    handleToggleIfcStoreyOverlay,
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

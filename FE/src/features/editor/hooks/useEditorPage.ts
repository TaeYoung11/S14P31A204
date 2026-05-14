import { useState, useMemo, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { isAxiosError } from 'axios'
import type {
  AddSpaceFormData,
  BubbleFloor,
  BubbleFloorSummary,
  BubbleData,
  ConnectionData,
  EditorMode,
  PhaseStatus,
  FloorCommentNotification,
  FloorCommentPin,
  FloorLayer,
  CommentPin3DCreatePosition,
  FloorLayerOverlay,
  FloorOpening,
  FloorRoom,
  FloorWall,
  IfcElementChange,
  IfcElementInfo,
  Point2D,
  SaveStatus,
  WorkspaceSnapshot,
  ZoneData,
} from '../types'
import {
  DEFAULT_GRID_SNAP_INTERVAL_MM,
  FLOOR_MM_PER_PX,
  FLOOR_PLAN_EDIT_AUTHORITY,
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
import { useEditorKeyboardShortcuts } from './useEditorKeyboardShortcuts'
import type { EmptyCanvasDblClickInfo } from '../components/canvas/BubbleCanvas'
import {
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
import {
  workspaceSaveService,
  type WorkspaceHistorySnapshotResponse,
  type FloorPlanSnapshotPayload as SavedFloorPlanSnapshotPayload,
} from '../services/workspaceSave.service'
import { requestFloorPlanGenerate } from '../services/floorPlanGenerate.service'
import {
  FloorPlanLayoutValidationError,
} from '../services/floorPlanGenerate.contract'
import { saveBubbleSnapshotToDb } from '../services/workspaceBubble.service'
import type { SaveBubbleSnapshotResponse } from '../services/workspaceBubble.service'
import {
  publishBubbleRedoRequest,
  publishBubbleUndoRequest,
  publishFloorPlanRedoRequest,
  publishFloorPlanUndoRequest,
  publishIfcEditRequest,
  publishIfcRedoRequest,
  publishIfcUndoRequest,
} from '../services/workspaceCommand.service'
import { workspaceRealtimeService, type FloorPlanSceneType } from '../services/workspaceRealtime.service'
import {
  editorPinCommentQueryKeys,
  editorPinCommentService,
} from '../services/editorPinComment.service'
import { useProjectCommentRealtime } from '@/features/project/hooks/useProjectCommentRealtime'
import { useAuthStore } from '@/shared/stores/authStore'
import { useProjectStore } from '@/features/project/stores/projectStore'
import { projectService } from '@/features/project/services/project.service'
import { projectQueryKeys } from '@/features/project/constants/projectQueryKeys'
import type { ProjectCommentListItem } from '@/features/project/services/projectComment.service'
import { DEFAULT_PIN_CONTENT } from '@/shared/constants/pin'
import { useEditorProjectName } from './useEditorProjectName'
import { useInitialIfcImport } from './useInitialIfcImport'
import { useEditorUserContext } from './useEditorUserContext'
import { useFloorPlanGenerateTimeout } from './useFloorPlanGenerateTimeout'
import { useThreeDIfcAttributeHandlers } from './useThreeDIfcAttributeHandlers'
import { useEditorToolState } from './useEditorToolState'
import { useFloorWallToolState } from './useFloorWallToolState'
import { runForceDirectedBubbleLayout } from '../utils/forceBubbleLayout'
import { useBubbleSnapshotRealtime } from './useBubbleSnapshotRealtime'
import { useIfcLoadingLayer } from './useIfcLoadingLayer'
import type { FloorPlan3DData } from '../utils/floorPlanTo3D'
import {
  buildFloorPlanLayoutImportPayload,
  collectAutoDoorOpeningIdsFromWallIds,
  getPolygonAreaPx,
  getPolygonBounds,
  isFinitePolygonPoints,
  isSameConnection,
  mergeSelectedIds,
  resolveEditorMode,
} from '../utils/editorPageHelpers'
import {
  buildBubbleFloorMetaDerivedState,
  normalizeBubbleFloor,
  readNonZeroIntegerFromUnknown,
} from '../utils/bubbleFloorUtils'
import {
  buildFloorRemapMapForRename,
  computeBubbleStateAfterFloorDelete,
  getNextBubbleFloorToAdd,
} from '../utils/bubbleFloorMutations'
import {
  clearBubbleLocalDraftFromStorage,
  hasMultipleFloorHintFromLocalMeta,
  isBubbleDebugEnabled,
  isPossiblyFlattenedFloorSnapshot,
  isSnapshotPreferredForRecovery,
  logBubbleTrace,
  logBubbleDebug,
  readBubbleFloorMetaFromStorage,
  readBubbleLocalDraftFromStorage,
  readBubbleSavedRecoveryFromStorage,
  summarizeBubbleSnapshotForDebug,
  writeBubbleFloorMetaToStorage,
  writeBubbleLocalDraftToStorage,
  writeBubbleSavedRecoveryToStorage,
} from '../utils/bubbleSnapshotRecoveryUtils'
import {
  normalizeBubbleFloorMetaForSync,
  resolveBubbleSnapshotViewState,
  toBubbleSnapshotPayloadFromWorkspaceSnapshot,
} from '../utils/bubbleSnapshotSyncUtils'
import {
  CURSOR_INVALID_CODE,
  FLOOR_PLAN_CURSOR_INVALID_CODE,
  IFC_COMPLETED_ACTION_SET,
  isBubbleSnapshotPayload,
  WORKSPACE_SYNC_ACTION,
  type BubbleSnapshotPayload,
  type FloorPlanSnapshotPayload,
  type StompErrorMessage,
} from '../utils/workspaceSyncMessage'
import { isToolAllowedDuringConverting, isTwoDOrThreeDConverting as isTwoDOrThreeDConvertingByPhase } from '../utils/editorModeLocks'
import { resolveIfcPresignedUrl } from '../utils/ifcSource'
import {
  buildPinAuthorNameByUserId,
  buildUnreadCommentNotifications,
  mapApiPinToFloorCommentPin,
} from '../utils/commentPinMapper'
import {
  buildIfcSelectionTransformPatch,
  mergeIfcElementChangeByExpressId,
  shouldPublishIfcElementPatch,
} from '../utils/ifcElementChangeSync'
import { resolveWorkspaceSiteAreaM2 } from '../utils/numberUtils'
import { extractOuterRingFromCoordinates } from '@/features/project/utils/sitePolygon'
import { getRuntimeEnvString } from '@/shared/lib/runtimeEnv'

interface PendingServerPublishRecord {
  projectId: string
  baseIndex: number
  snapshot: WorkspaceSnapshot
  serializedSnapshot: string
  revisionId?: string | null
  sceneType?: FloorPlanSceneType
}

interface AwaitingServerSyncRecord {
  projectId: string
  serializedSnapshot: string
  historyDomain: 'bubble' | 'floorPlan'
  baseIndex: number
  startedAt: number
}

interface WorkspaceSiteBoundaryState {
  polygonRing: number[][] | null
  areaM2: number | null
}

interface GenerateFloorPlanOptions {
  openThreeDOnComplete?: boolean
  spaceHeightMm?: number
}

const OPENING_MIN_WIDTH_MM = 1
const OPENING_MAX_WIDTH_MM = 4000
const WORKSPACE_HISTORY_MAX_INDEX = 9
const OPENING_NORMALIZE_OPTIONS = {
  minWidthMm: OPENING_MIN_WIDTH_MM,
  maxWidthMm: OPENING_MAX_WIDTH_MM,
} as const
const IFC_DERIVED_FLOORPLAN_ONLY = true
const DEFAULT_BUBBLE_DB_SAVE_DEBOUNCE_MS = 1000
const MIN_BUBBLE_DB_SAVE_DEBOUNCE_MS = 200
const MAX_BUBBLE_DB_SAVE_DEBOUNCE_MS = 30_000
const BUBBLE_DB_SAVE_DEBOUNCE_SECONDS_ENV = getRuntimeEnvString('VITE_BUBBLE_DB_SAVE_DEBOUNCE_SECONDS', '1')
const BUBBLE_DB_SAVE_DEBOUNCE_SECONDS_STORAGE_KEY = 'editor:bubble-save-debounce-seconds'

const FLOOR_PLAN_GENERATE_TIMEOUT_MS = 120_000

const clampBubbleDbSaveDebounceMs = (value: number): number =>
  Math.min(MAX_BUBBLE_DB_SAVE_DEBOUNCE_MS, Math.max(MIN_BUBBLE_DB_SAVE_DEBOUNCE_MS, Math.round(value)))

const resolveBubbleDbSaveDebounceMs = (): number => {
  const envSeconds = Number(BUBBLE_DB_SAVE_DEBOUNCE_SECONDS_ENV)
  const envMs = Number.isFinite(envSeconds) && envSeconds > 0
    ? clampBubbleDbSaveDebounceMs(envSeconds * 1000)
    : DEFAULT_BUBBLE_DB_SAVE_DEBOUNCE_MS

  if (typeof window === 'undefined') return envMs
  const storageSecondsRaw = window.localStorage.getItem(BUBBLE_DB_SAVE_DEBOUNCE_SECONDS_STORAGE_KEY)
  if (!storageSecondsRaw) return envMs

  const storageSeconds = Number(storageSecondsRaw)
  if (!Number.isFinite(storageSeconds) || storageSeconds <= 0) return envMs
  return clampBubbleDbSaveDebounceMs(storageSeconds * 1000)
}

const logRoofDebug = (...args: unknown[]) => {
  if (!import.meta.env.DEV) return
  console.log('[roof-debug][useEditorPage]', ...args)
}

const logBootstrapFloor = (label: string, payload: Record<string, unknown>) => {
  console.info(`[bootstrap-floor] ${label}`, payload)
}

const createActiveBubbleFloorStorageKey = (projectId: string | undefined): string | null =>
  projectId ? `editor:active-bubble-floor:${projectId}` : null

const readActiveBubbleFloorFromStorage = (projectId: string | undefined): number | null => {
  if (typeof window === 'undefined') return null
  const storageKey = createActiveBubbleFloorStorageKey(projectId)
  if (!storageKey) return null
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || parsed === 0) return null
    return normalizeBubbleFloor(parsed)
  } catch {
    return null
  }
}

const traceBubbleSnapshot = (
  label: string,
  projectId: string | undefined,
  snapshot: BubbleSnapshotPayload | null | undefined,
  extra?: Record<string, unknown>,
) => {
  const summary = summarizeBubbleSnapshotForDebug(snapshot)
  logBubbleTrace(label, {
    projectId: projectId ?? null,
    bubbleCount: summary.bubbleCount,
    connectionCount: summary.connectionCount,
    bubbleFloors: summary.bubbleFloors,
    floorMetaFloors: summary.floorMetaFloors,
    floorCounts: summary.floorCounts,
    resolvedFloorCounts: summary.resolvedFloorCounts,
    floorFieldPresenceCounts: summary.floorFieldPresenceCounts,
    sampleRows: summary.bubbleFloorRows.slice(0, 10),
    ...extra,
  })
}

/**
 * EditorPage 전체 비즈니스 로직 훅
 * 버블·연결선·조닝·패널·평면도·UI 상태를 하위 훅에서 합성해 관리
 */
export function useEditorPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const { currentProjectName } = useEditorProjectName(projectId)
  const mode = resolveEditorMode(searchParams.get('mode'))
  const [selectedIfcElement, setSelectedIfcElement] = useState<IfcElementInfo | null>(null)
  /** 3D 사이드바 삭제 버튼으로 선택 요소 삭제를 요청하는 트리거 */
  const [threeDDeleteRequestToken, setThreeDDeleteRequestToken] = useState(0)
  const [ifcElementChangesById, setIfcElementChangesById] = useState<Record<number, IfcElementChange>>({})

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
    handleBubbleFloorChange,
    addBubble,
    addBubbleAt,
    replaceBubbles,
    deleteBubble,
  } = useBubbles()
  const [activeBubbleFloor, setActiveBubbleFloor] = useState(() => readActiveBubbleFloorFromStorage(projectId) ?? 1)
  const initialBubbleFloorMeta = useMemo(() => readBubbleFloorMetaFromStorage(projectId), [projectId])
  const [bubbleFloorNamesByNumber, setBubbleFloorNamesByNumber] = useState<Record<number, string>>(
    () => ({ 1: '1', ...initialBubbleFloorMeta.namesByFloor }),
  )
  const [extraBubbleFloors, setExtraBubbleFloors] = useState<number[]>(
    () => initialBubbleFloorMeta.extraFloors,
  )
  const bubbleFloorNumbers = useMemo(() => {
    const floors = new Set<number>()
    bubbles.forEach((bubble) => floors.add(normalizeBubbleFloor(bubble.floor)))
    extraBubbleFloors.forEach((floor) => floors.add(normalizeBubbleFloor(floor)))
    Object.keys(bubbleFloorNamesByNumber).forEach((floor) => floors.add(normalizeBubbleFloor(Number(floor))))
    if (floors.size === 0) floors.add(1)
    return [...floors].sort((left, right) => left - right)
  }, [bubbles, extraBubbleFloors, bubbleFloorNamesByNumber])
  const bubbleFloors = useMemo<BubbleFloor[]>(
    () =>
      bubbleFloorNumbers.map((floor) => ({
        floor,
        name: bubbleFloorNamesByNumber[floor]?.trim() || String(floor),
      })),
    [bubbleFloorNamesByNumber, bubbleFloorNumbers],
  )
  const bubbleFloorSummaries = useMemo<BubbleFloorSummary[]>(
    () => bubbleFloorNumbers.map((floor) => {
      const floorBubbles = bubbles.filter((bubble) => normalizeBubbleFloor(bubble.floor) === floor)
      const totalAreaM2 = floorBubbles.reduce((sum, bubble) =>
        sum + (Number.isFinite(bubble.ratio) ? bubble.ratio : 0), 0)
      return {
        floor,
        bubbleCount: floorBubbles.length,
        totalAreaM2,
      }
    }),
    [bubbleFloorNumbers, bubbles],
  )
  const resolvedActiveBubbleFloor = bubbleFloorNumbers.includes(activeBubbleFloor)
    ? activeBubbleFloor
    : (bubbleFloorNumbers[0] ?? 1)

  useEffect(() => {
    writeBubbleFloorMetaToStorage(projectId, {
      namesByFloor: bubbleFloorNamesByNumber,
      extraFloors: extraBubbleFloors,
    })
  }, [projectId, bubbleFloorNamesByNumber, extraBubbleFloors])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const storageKey = createActiveBubbleFloorStorageKey(projectId)
    if (!storageKey) return
    try {
      window.localStorage.setItem(storageKey, String(activeBubbleFloor))
    } catch {
      // localStorage 접근 실패는 치명적이지 않아 무시한다.
    }
  }, [projectId, activeBubbleFloor])

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
  const markLocalBubbleSnapshotChangedRef = useRef<() => void>(() => { })

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
    addFloorLayer: baseAddFloorLayer,
    renameFloorLayer: baseRenameFloorLayer,
    deleteFloorLayer: baseDeleteFloorLayer,
    setActiveLayerId: setActiveFloorLayerId,
    setFloorPlanFromProject,
    moveActiveRoom,
    updateActiveRoom,
    removeActiveRooms,
    clearFloorPlan,
    replaceFloorPlanState,
  } = useFloorPlan(projectId)
  /** 버블 편집 잠금은 현재 비활성 상태(false 고정) */
  const isBubbleEditLocked = false
  const canSyncBubbleStateFrom2D = false
  const isWallFirstEditing = FLOOR_PLAN_EDIT_AUTHORITY === 'wall-first'
  const [workspacePhaseStatus, setWorkspacePhaseStatus] = useState<PhaseStatus>('BUBBLE_DRAFT')
  const [workspaceSiteBoundary, setWorkspaceSiteBoundary] = useState<WorkspaceSiteBoundaryState>({
    polygonRing: null,
    areaM2: null,
  })
  const handleIfcSyncMessageRef = useRef<(
    url: string,
    action: string | null,
    assetId?: string | null,
    revisionId?: string | null,
  ) => void>(() => { })
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

  /**
   * 2D 구조 상태(벽/개구부/자동생성 숨김/IFC 변경 캐시)를 초기화한다.
   * 호출 상황에 따라 선택 상태와 IFC 변경 캐시 초기화를 선택적으로 수행한다.
   */
  const resetFloorPlanStructureState = useCallback((options?: {
    clearTwoDSelection?: boolean
    clearIfcElementChanges?: boolean
  }) => {
    setFloorWalls([])
    setFloorOpenings([])
    setHiddenAutoWallIds([])
    setHiddenAutoOpeningIds([])
    setIsProjectStructurePreferred(false)
    if (options?.clearIfcElementChanges !== false) {
      setIfcElementChangesById({})
    }
    if (options?.clearTwoDSelection) {
      clearTwoDStructureSelection()
    }
  }, [clearTwoDStructureSelection])
  const isTwoDOrThreeDConverting = isTwoDOrThreeDConvertingByPhase(workspacePhaseStatus, mode)

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
      resetFloorPlanStructureState({
        clearTwoDSelection: true,
        clearIfcElementChanges: false,
      })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [
    bubbles.length,
    clearFloorPlan,
    isFloorPlanGenerated,
    isFloorPlanGenerating,
    resetFloorPlanStructureState,
  ])

  // Delete/Backspace 키로 선택된 버블 또는 연결선 삭제 (input 포커스 중엔 무시)
  const handleDeleteSelected = useCallback(() => {
    if (useAuthStore.getState().user?.user_type !== 'DESIGNER') return
    if (isTwoDOrThreeDConverting) return
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
    isTwoDOrThreeDConverting,
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

  // UI 전용 상태
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [addSpaceFormData, setAddSpaceFormData] = useState<AddSpaceFormData>(INITIAL_ADD_SPACE_FORM)
  const [isCollaborationMode, setIsCollaborationMode] = useState(false)
  const [isAgentPanelMode, setIsAgentPanelMode] = useState(false)
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null)
  const [commentPins, setCommentPins] = useState<FloorCommentPin[]>([])
  const [commentNotifications, setCommentNotifications] = useState<FloorCommentNotification[]>([])
  const [isLibraryOpen, setIsLibraryOpen] = useState(false)
  const [isGridVisible, setIsGridVisible] = useState(false)
  /** 연결 도구에서 첫 번째로 선택된 버블 id */
  /** 인라인 라벨 편집 상태 */
  const [labelEditState, setLabelEditState] = useState<{
    id: string; label: string; x: number; y: number; width: number; height: number
  } | null>(null)
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false)
  const [isGridSnapEnabled, setIsGridSnapEnabled] = useState(false)
  const [gridSnapIntervalMm, setGridSnapIntervalMm] = useState<number>(DEFAULT_GRID_SNAP_INTERVAL_MM)
  const { wallCreatePreset, setWallCreatePreset } = useFloorWallToolState()
  const [isLayerOverlayMode, setIsLayerOverlayMode] = useState(false)
  const [overlayLayerIds, setOverlayLayerIds] = useState<string[]>([])
  const [overlayOpacityByLayerId, setOverlayOpacityByLayerId] = useState<Record<string, number>>({})
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [latestFloorPlanJobId, setLatestFloorPlanJobId] = useState<string | null>(null)
  const [floorPlanGenerateStatusText, setFloorPlanGenerateStatusText] = useState<string>('')
  const [autosaveReadyProjectId, setAutosaveReadyProjectId] = useState<string | null>(null)
  const [workspaceSnapshotCommitVersion, setWorkspaceSnapshotCommitVersion] = useState(0)
  const [bubbleHistoryCursor, setBubbleHistoryCursor] = useState({ baseIndex: -1, redoDepth: 0 })
  const [floorPlanHistoryCursor, setFloorPlanHistoryCursor] = useState({ baseIndex: -1, redoDepth: 0 })
  const attemptedInitialIfcImportProjectIdRef = useRef<string | null>(null)
  const bubbleHistoryBaseIndexRef = useRef(-1)
  const floorPlanHistoryBaseIndexRef = useRef(-1)
  const previousSnapshotRef = useRef<string | null>(null)
  const latestBubbleSnapshotRef = useRef<{
    bubbles: BubbleData[]
    connections: ConnectionData[]
    floorMeta: BubbleSnapshotPayload['floorMeta']
  }>({
    bubbles,
    connections,
    floorMeta: {
      namesByFloor: bubbleFloorNamesByNumber,
      extraFloors: extraBubbleFloors,
    },
  })
  const bootstrapStateAppliersRef = useRef({
    clearFloorPlan,
    clearSelection,
    clearTwoDStructureSelection,
    replaceBubbles,
    replaceConnections,
    replaceFloorPlanState,
    replaceZonesState,
  })
  const bubbleDbSaveTimerRef = useRef<number | null>(null)
  const bubbleDbSaveInFlightRef = useRef<Promise<SaveBubbleSnapshotResponse> | null>(null)
  const flushBubbleSnapshotSaveToDbRef = useRef<
    (force?: boolean) => Promise<SaveBubbleSnapshotResponse | null>
  >(async () => null)
  const bubbleSnapshotChangeVersionRef = useRef(0)
  const localBubbleChangeFlushRafRef = useRef<number | null>(null)
  const pendingLocalBubbleChangeTaskRef = useRef<(() => void) | null>(null)
  const floorPlanGenerateForbiddenRef = useRef(false)
  const pendingOpenThreeDOnGenerateCompleteRef = useRef(false)
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
  const [ifcRevisionByProjectId, setIfcRevisionByProjectId] = useState<Record<string, string | null>>({})
  const currentIfcUrl = projectId ? (ifcSourceByProjectId[projectId]?.url ?? null) : null
  const currentIfcAssetId = projectId ? (ifcSourceByProjectId[projectId]?.assetId ?? null) : null
  const currentIfcRevisionId = projectId ? (ifcRevisionByProjectId[projectId] ?? null) : null
  const workspaceCommandPublisher = useWorkspaceCommandPublisher({
    projectId,
    source: mode === '3d' ? '3d' : '2d',
    getBaseRevisionId: () => currentIfcRevisionId,
    getBaseIndex: () => floorPlanHistoryBaseIndexRef.current,
  })
  const bubbleDbDirtyRef = useRef(false)
  const hasUserEditedRef = useRef(false)
  const serverPublishRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingServerPublishRef = useRef<PendingServerPublishRecord | null>(null)
  const awaitingServerSyncRef = useRef<AwaitingServerSyncRecord | null>(null)
  const suppressGeneratedFloorPlanAutosaveRef = useRef(false)
  const floorPlanHistoryCommandInFlightRef = useRef(false)
  const draftLoadTokenRef = useRef(0)
  const draftLoadedProjectIdRef = useRef<string | null>(null)
  const draftLoadBaselineRef = useRef<string | null>(null)
  const draftLoadingProjectIdRef = useRef<string | null>(null)
  const suppressNextAutosaveRef = useRef(false)
  const workspaceEditTransactionDepthRef = useRef(0)
  const pendingWorkspaceSnapshotCommitRef = useRef(false)
  const isBubbleDragTransactionActiveRef = useRef(false)
  const lastWorkspaceSnapshotTransactionAtRef = useRef(0)
  const readingCommentPinIdsRef = useRef<Set<string>>(new Set())
  const readCommentFailureAtRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    lastLoadedIfcStorageUrlRef.current = null
    ifcLoadInFlightStorageUrlRef.current = null
    suppressGeneratedFloorPlanAutosaveRef.current = false
    pendingOpenThreeDOnGenerateCompleteRef.current = false
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
  const resolveServerHistoryBaseIndex = useCallback((snapshot: WorkspaceSnapshot): number =>
    snapshot.phaseStatus === 'BUBBLE_DRAFT'
      ? bubbleHistoryBaseIndexRef.current
      : floorPlanHistoryBaseIndexRef.current
    , [])
  const resolveServerHistoryDomain = useCallback((snapshot: WorkspaceSnapshot): AwaitingServerSyncRecord['historyDomain'] =>
    snapshot.phaseStatus === 'BUBBLE_DRAFT'
      ? 'bubble'
      : 'floorPlan'
    , [])
  const applyWorkspaceHistorySiteInfo = useCallback((siteInfo: WorkspaceHistorySnapshotResponse['siteInfo']) => {
    const polygonRing = extractOuterRingFromCoordinates(siteInfo?.polygon?.coordinates)
    const areaM2 = resolveWorkspaceSiteAreaM2(siteInfo as Record<string, unknown> | null | undefined)

    setWorkspaceSiteBoundary((prev) => {
      const shouldKeepPreviousPolygon = !polygonRing && prev.polygonRing
      const nextPolygonRing = shouldKeepPreviousPolygon ? prev.polygonRing : polygonRing
      const nextAreaM2 = areaM2 ?? (shouldKeepPreviousPolygon ? prev.areaM2 : null)
      if (prev.polygonRing === nextPolygonRing && prev.areaM2 === nextAreaM2) return prev
      return { polygonRing: nextPolygonRing, areaM2: nextAreaM2 }
    })
  }, [])
  const resolveFloorPlanSceneType = useCallback((): FloorPlanSceneType =>
    mode === '3d' ? 'THREE_D' : 'TWO_D'
    , [mode])
  /**
   * 현재 트랜잭션 상태를 기준으로 저장 상태를 계산한다.
   * - 편집 트랜잭션 중이면 `dirty`
   * - 아니면 `synced`
   */
  const resolveSnapshotSyncStatus = useCallback((): SaveStatus => (
    workspaceEditTransactionDepthRef.current > 0 || pendingWorkspaceSnapshotCommitRef.current
      ? 'dirty'
      : 'synced'
  ), [])

  /**
   * 버블 층 메타와 현재 활성 층을 일관된 규칙으로 동기화한다.
   * 활성 층이 목록에 없으면 첫 번째 가용 층(없으면 1층)을 선택한다.
   */
  const applyBubbleFloorMetaState = useCallback((
    floorMeta: { namesByFloor: Record<number, string>; extraFloors: number[] },
    availableFloors: number[],
  ) => {
    setBubbleFloorNamesByNumber(floorMeta.namesByFloor)
    setExtraBubbleFloors(floorMeta.extraFloors)
    setActiveBubbleFloor((prev) => (availableFloors.includes(prev) ? prev : (availableFloors[0] ?? 1)))
  }, [])

  /**
   * floorPlan layout payload를 에디터 상태에 반영한다.
   * bootstrap/remote 진입 경로에서 동일한 반영 규칙을 사용하기 위해 공통화했다.
   */
  const applyFloorPlanLayoutState = useCallback((params: {
    layout: NonNullable<FloorPlanSnapshotPayload['layout']>
    replaceLayoutState: (next: {
      isGenerated: boolean
      layoutSource: 'bubble' | 'project' | null
      layers: FloorLayer[]
      activeLayerId: string | null
    }) => void
    fallback: {
      isGenerated: boolean
      layoutSource: 'bubble' | 'project' | null
      layers: FloorLayer[]
      activeLayerId: string | null
    }
  }) => {
    const { layout, replaceLayoutState, fallback } = params
    replaceLayoutState({
      isGenerated: layout.isFloorPlanGenerated ?? fallback.isGenerated,
      layoutSource: layout.floorPlanLayoutSource ?? fallback.layoutSource,
      layers: layout.floorLayers ?? fallback.layers,
      activeLayerId: layout.activeFloorLayerId ?? fallback.activeLayerId,
    })
    setFloorWalls(layout.floorWalls ?? [])
    setFloorOpenings(layout.floorOpenings ?? [])
    setHiddenAutoWallIds(layout.hiddenAutoWallIds ?? [])
    setHiddenAutoOpeningIds(layout.hiddenAutoOpeningIds ?? [])
    setIsProjectStructurePreferred(layout.isProjectStructurePreferred ?? false)
    setIfcElementChangesById(Object.fromEntries(
      (layout.ifcElementChanges ?? []).map((change) => [change.expressId, change]),
    ))
    if (layout.phaseStatus) setWorkspacePhaseStatus(layout.phaseStatus)
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
  const isReadOnlyUser = currentUserType !== 'DESIGNER'
  const shouldForceCollaborationMode = isReadOnlyUser && mode !== 'bubble' && mode !== 'view'
  const effectiveIsCollaborationMode = isCollaborationMode || shouldForceCollaborationMode
  const targetPinId = searchParams.get('pinId')
  const currentProjectForRealtime = useMemo(
    () => (currentProject && currentProject.id === projectId ? [currentProject] : []),
    [currentProject, projectId],
  )
  const pinCommentsQuery = useQuery({
    queryKey: editorPinCommentQueryKeys.pins(projectId),
    queryFn: () => editorPinCommentService.getPinsWithComments(projectId ?? ''),
    enabled: !!projectId && (effectiveIsCollaborationMode || !!targetPinId),
    staleTime: 10 * 1000,
    retry: false,
  })
  const createPinMutation = useMutation({
    mutationFn: async ({
      x,
      y,
      commentContent,
      floorElevationMm,
      threeDPosition,
    }: {
      x: number
      y: number
      commentContent?: string
      floorElevationMm: number
      threeDPosition?: CommentPin3DCreatePosition
    }) => {
      if (!projectId) throw new Error('Missing project id')
      return editorPinCommentService.createPin(projectId, x, y, commentContent, floorElevationMm, threeDPosition)
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: editorPinCommentQueryKeys.pins(projectId) })
      setSelectedPinId(data.pinId)
    },
  })
  const createPinCommentMutation = useMutation({
    mutationFn: ({ pinId, content }: { pinId: string; content: string }) => {
      if (!projectId) throw new Error('Missing project id')
      return editorPinCommentService.createComment(projectId, pinId, content)
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: editorPinCommentQueryKeys.pins(projectId) })
      if (mode !== 'bubble' && mode !== 'view') {
        setIsCollaborationMode(true)
      }
      setSelectedPinId(variables.pinId)
    },
  })
  const resolvePinCommentMutation = useMutation({
    mutationFn: ({ pinId, commentId }: { pinId: string; commentId: string }) => {
      if (!projectId) throw new Error('Missing project id')
      return editorPinCommentService.resolveComment(projectId, pinId, commentId)
    },
    onSuccess: (_data, variables) => {
      const targetPin = commentPins.find((pin) => pin.id === variables.pinId)
      const hasRemainingOpenComment = targetPin?.messages.some(
        (message) =>
          !message.isPinMessage &&
          message.id !== variables.commentId &&
          message.status !== 'RESOLVED',
      ) ?? false
      setCommentPins((prev) =>
        prev.map((pin) =>
          pin.id === variables.pinId
            ? {
              ...pin,
              messages: pin.messages.map((message) =>
                message.id === variables.commentId ? { ...message, status: 'RESOLVED' } : message,
              ),
            }
            : pin,
        ),
      )
      if (!hasRemainingOpenComment) {
        resolvePinMutation.mutate(variables.pinId)
        return
      }
      void queryClient.invalidateQueries({ queryKey: editorPinCommentQueryKeys.pins(projectId) })
    },
  })
  const resolvePinMutation = useMutation({
    mutationFn: (pinId: string) => {
      if (!projectId) throw new Error('Missing project id')
      return editorPinCommentService.resolvePin(projectId, pinId)
    },
    onSuccess: (_data, pinId) => {
      setCommentPins((prev) =>
        prev.map((pin) =>
          pin.id === pinId
            ? {
              ...pin,
              messages: pin.messages.map((message) => ({ ...message, status: 'RESOLVED' })),
            }
            : pin,
        ),
      )
      setSelectedPinId(null)
      void queryClient.invalidateQueries({ queryKey: editorPinCommentQueryKeys.pins(projectId) })
    },
  })
  const deletePinMutation = useMutation({
    mutationFn: (pinId: string) => {
      if (!projectId) throw new Error('Missing project id')
      return editorPinCommentService.deletePin(projectId, pinId)
    },
    onSuccess: (_data, pinId) => {
      setCommentPins((prev) => prev.filter((pin) => pin.id !== pinId))
      setSelectedPinId((prev) => (prev === pinId ? null : prev))
      queryClient.setQueriesData<ProjectCommentListItem[]>(
        { queryKey: projectQueryKeys.commentsRoot() },
        (currentComments) => currentComments?.filter((comment) => comment.pinId !== pinId),
      )
      void queryClient.invalidateQueries({ queryKey: editorPinCommentQueryKeys.pins(projectId) })
      void queryClient.invalidateQueries({ queryKey: projectQueryKeys.commentsRoot() })
      void queryClient.invalidateQueries({ queryKey: projectQueryKeys.list() })
    },
  })
  const { mutate: markPinCommentsRead } = useMutation({
    mutationFn: (pinId: string) => {
      if (!projectId) throw new Error('Missing project id')
      return editorPinCommentService.markCommentsAsRead(projectId, pinId)
    },
    onSuccess: (_data, pinId) => {
      readCommentFailureAtRef.current.delete(pinId)
      setCommentPins((prev) =>
        prev.map((pin) =>
          pin.id === pinId ? { ...pin, hasUnreadCommentByOtherUser: false } : pin,
        ),
      )
      queryClient.setQueriesData<ProjectCommentListItem[]>(
        { queryKey: projectQueryKeys.commentsRoot() },
        (currentComments) => currentComments?.filter((comment) => comment.pinId !== pinId),
      )
      void queryClient.invalidateQueries({ queryKey: editorPinCommentQueryKeys.pins(projectId) })
      void queryClient.invalidateQueries({ queryKey: projectQueryKeys.commentsRoot() })
      void queryClient.invalidateQueries({ queryKey: projectQueryKeys.list() })
    },
    onError: (_error, pinId) => {
      readCommentFailureAtRef.current.set(pinId, Date.now())
    },
  })
  const editorCommentRealtimeOptions = useMemo(
    () => ({
      onCommentCreated: (payload: { projectId: string }) => {
        if (payload.projectId !== projectId) return
        const shouldKeepCollaborationMode =
          effectiveIsCollaborationMode || Boolean(selectedPinId) || Boolean(targetPinId)
        if (mode !== 'bubble' && mode !== 'view' && shouldKeepCollaborationMode) {
          setIsCollaborationMode(true)
        }
        void queryClient.invalidateQueries({ queryKey: editorPinCommentQueryKeys.pins(projectId) })
      },
    }),
    [effectiveIsCollaborationMode, mode, projectId, queryClient, selectedPinId, targetPinId],
  )
  const projectCommentRealtime = useProjectCommentRealtime(currentProjectForRealtime, editorCommentRealtimeOptions)
  const pinAuthorDirectoryQuery = useQuery({
    queryKey: ['editor', 'pin-author-directory', projectId],
    queryFn: () => {
      if (!projectId) throw new Error('Missing project id')
      return projectService.getWorkspaceDetail(projectId)
    },
    enabled: Boolean(projectId),
    staleTime: 60_000,
  })
  const pinAuthorNameByUserId = useMemo(() => {
    return buildPinAuthorNameByUserId(pinAuthorDirectoryQuery.data)
  }, [pinAuthorDirectoryQuery.data])

  useEffect(() => {
    if (!pinCommentsQuery.data) return
    const nextPins = pinCommentsQuery.data.map(({ pin, comments }) =>
      mapApiPinToFloorCommentPin(
        pin,
        comments,
        authUser?.id,
        currentUserName,
        collaborationUserType,
        counterpartType,
        pinAuthorNameByUserId,
      ),
    )
    const syncTimer = window.setTimeout(() => {
      setCommentPins(nextPins)
      setCommentNotifications(buildUnreadCommentNotifications(nextPins, collaborationUserType))
    }, 0)

    return () => window.clearTimeout(syncTimer)
  }, [
    authUser?.id,
    collaborationUserType,
    counterpartType,
    currentUserName,
    pinAuthorNameByUserId,
    pinCommentsQuery.data,
  ])

  useEffect(() => {
    if (!targetPinId) return
    if (!commentPins.some((pin) => pin.id === targetPinId)) return
    const openTargetPinTimer = window.setTimeout(() => {
      setIsCollaborationMode(true)
      setSelectedPinId(targetPinId)
    }, 0)

    return () => window.clearTimeout(openTargetPinTimer)
  }, [commentPins, targetPinId])

  useEffect(() => {
    if (!selectedPinId) return
    const selectedPin = commentPins.find((pin) => pin.id === selectedPinId)
    if (!selectedPin?.hasUnreadCommentByOtherUser) return
    if (readingCommentPinIdsRef.current.has(selectedPinId)) return
    const lastFailureAt = readCommentFailureAtRef.current.get(selectedPinId)
    if (lastFailureAt && Date.now() - lastFailureAt < 30_000) return

    readingCommentPinIdsRef.current.add(selectedPinId)
    markPinCommentsRead(selectedPinId, {
      onSettled: () => {
        readingCommentPinIdsRef.current.delete(selectedPinId)
      },
    })
  }, [commentPins, markPinCommentsRead, selectedPinId])

  const phaseStatus = workspacePhaseStatus
  const isEditorReadOnly = isReadOnlyUser
  const canEditBubble = !isEditorReadOnly && mode === 'bubble' && phaseStatus === 'BUBBLE_DRAFT' && !isBubbleEditLocked
  const canEditIfc = !isEditorReadOnly && phaseStatus === 'IFC_EDIT'
  const canEditFloorPlan =
    !isEditorReadOnly &&
    phaseStatus !== 'CONVERTING' &&
    (phaseStatus === 'IFC_EDIT' || isFloorPlanGenerated || floorPlanLayoutSource !== null)
  const isConverting = phaseStatus === 'CONVERTING'
  const isThreeDEditingLocked = mode === '3d' && (isEditorReadOnly || isTwoDOrThreeDConverting)
  const isTwoDEditingLocked = mode === '2d' && isTwoDOrThreeDConverting
  const isBubbleReadOnly = !canEditBubble
  // delete/connect 툴 잠금은 bubble 모드에서만 적용한다.
  // 3D/2D에서 도구 전환까지 막히지 않도록 모드 조건을 분리한다.
  const isToolSelectionLockedByBubbleMode = mode === 'bubble' && isBubbleReadOnly
  const {
    selectedTool,
    setSelectedTool,
    connectingFromId,
    setConnectingFromId,
    resetToolSelection,
    handleSetSelectedTool: baseHandleSetSelectedTool,
  } = useEditorToolState({ isBubbleReadOnly: isToolSelectionLockedByBubbleMode })
  const handleSetSelectedTool = useCallback((tool: string) => {
    if (isTwoDOrThreeDConverting && !isToolAllowedDuringConverting(tool)) return
    if (isEditorReadOnly && tool !== 'selection' && tool !== 'hand') return
    baseHandleSetSelectedTool(tool)
  }, [baseHandleSetSelectedTool, isEditorReadOnly, isTwoDOrThreeDConverting])

  useEffect(() => {
    if (!isTwoDOrThreeDConverting && !isEditorReadOnly) return
    if (selectedTool === 'selection' || selectedTool === 'hand') return
    baseHandleSetSelectedTool('selection')
  }, [baseHandleSetSelectedTool, isEditorReadOnly, isTwoDOrThreeDConverting, selectedTool])
  const addFloorLayer = useCallback(() => {
    if (!canEditFloorPlan) return
    baseAddFloorLayer()
  }, [baseAddFloorLayer, canEditFloorPlan])
  const renameFloorLayer = useCallback((layerId: string, name: string) => {
    if (!canEditFloorPlan) return
    baseRenameFloorLayer(layerId, name)
  }, [baseRenameFloorLayer, canEditFloorPlan])
  const deleteFloorLayer = useCallback((layerId: string) => {
    if (!canEditFloorPlan) return
    baseDeleteFloorLayer(layerId)
  }, [baseDeleteFloorLayer, canEditFloorPlan])
  const isFloorPlanHistoryMode = mode === '2d' || mode === '3d'
  const hasBubbleUndoHistory = bubbleHistoryCursor.baseIndex > 0
  const hasFloorPlanUndoHistory = floorPlanHistoryCursor.baseIndex > 0
  const hasBubbleRedoHistory = bubbleHistoryCursor.redoDepth > 0
  const hasFloorPlanRedoHistory = floorPlanHistoryCursor.redoDepth > 0
  const canUndo = mode === 'bubble'
    ? canEditBubble && (saveStatus === 'dirty' || hasBubbleUndoHistory)
    : isFloorPlanHistoryMode && canEditFloorPlan && saveStatus === 'synced' && hasFloorPlanUndoHistory
  const canRedo = mode === 'bubble'
    ? canEditBubble && hasBubbleRedoHistory
    : isFloorPlanHistoryMode && canEditFloorPlan && saveStatus === 'synced' && hasFloorPlanRedoHistory

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

  useEditorKeyboardShortcuts({
    mode,
    isEditorReadOnly,
    isDeleteEnabled: !isTwoDOrThreeDConverting,
    onDeleteSelected: handleDeleteSelected,
    onToggleLayerOverlay: () => setIsLayerOverlayMode((prev) => !prev),
    onSetTool: handleSetSelectedTool,
  })

  useEffect(() => {
    const layerIdSet = new Set(floorLayers.map((layer) => layer.id))
    const syncTimer = window.setTimeout(() => {
      setOverlayLayerIds((prev) => {
        const next = prev.filter((layerId) => layerIdSet.has(layerId) && layerId !== activeFloorLayerId)
        if (next.length === prev.length && next.every((layerId, index) => layerId === prev[index])) return prev
        return next
      })
      setOverlayOpacityByLayerId((prev) => {
        const next: Record<string, number> = {}
        floorLayers.forEach((layer) => {
          next[layer.id] = prev[layer.id] ?? 0.35
        })
        const prevKeys = Object.keys(prev)
        const nextKeys = Object.keys(next)
        if (
          prevKeys.length === nextKeys.length &&
          nextKeys.every((key) => prev[key] === next[key])
        ) {
          return prev
        }
        return next
      })
      if (floorLayers.length === 0) {
        setIsLayerOverlayMode((prev) => (prev ? false : prev))
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
  const activeLayerVisibleFloorWalls = useMemo(() => {
    if (!activeFloorLayerId) return mergedFloorWalls
    const scopedWalls = mergedFloorWalls.filter((wall) => wall.floorLayerId === activeFloorLayerId)
    if (floorRooms.length === 0) return scopedWalls
    return [
      ...mergedFloorWalls.filter((wall) => !wall.floorLayerId),
      ...scopedWalls,
    ]
  }, [activeFloorLayerId, floorRooms.length, mergedFloorWalls])

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

  const ifcElementChanges = useMemo(
    () => Object.values(ifcElementChangesById),
    [ifcElementChangesById],
  )

  const draftSnapshot = useMemo<WorkspaceSnapshot>(() => ({
    phaseStatus: workspacePhaseStatus,
    bubbles,
    connections,
    bubbleFloorNamesByNumber,
    extraBubbleFloors,
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
    ifcElementChanges,
  }), [
    workspacePhaseStatus,
    bubbles,
    connections,
    bubbleFloorNamesByNumber,
    extraBubbleFloors,
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
    ifcElementChanges,
  ])

  const latestDraftSnapshotRef = useRef(draftSnapshot)
  useLayoutEffect(() => {
    latestDraftSnapshotRef.current = draftSnapshot
  }, [draftSnapshot])

  useLayoutEffect(() => {
    latestBubbleSnapshotRef.current = {
      bubbles,
      connections,
      floorMeta: {
        namesByFloor: bubbleFloorNamesByNumber,
        extraFloors: extraBubbleFloors,
      },
    }
  }, [bubbleFloorNamesByNumber, bubbles, connections, extraBubbleFloors])

  useEffect(() => {
    bootstrapStateAppliersRef.current = {
      clearFloorPlan,
      clearSelection,
      clearTwoDStructureSelection,
      replaceBubbles,
      replaceConnections,
      replaceFloorPlanState,
      replaceZonesState,
    }
  }, [
    clearFloorPlan,
    clearSelection,
    clearTwoDStructureSelection,
    replaceBubbles,
    replaceConnections,
    replaceFloorPlanState,
    replaceZonesState,
  ])

  useEffect(() => {
    return () => {
      clearServerPublishRetry()
    }
  }, [clearServerPublishRetry])

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
    const {
      clearFloorPlan: clearFloorPlanForBootstrap,
      clearSelection: clearSelectionForBootstrap,
      clearTwoDStructureSelection: clearTwoDStructureSelectionForBootstrap,
      replaceBubbles: replaceBubblesForBootstrap,
      replaceConnections: replaceConnectionsForBootstrap,
      replaceFloorPlanState: replaceFloorPlanStateForBootstrap,
      replaceZonesState: replaceZonesStateForBootstrap,
    } = bootstrapStateAppliersRef.current

    if (draftLoadedProjectIdRef.current === normalizedProjectId) {
      return () => {
        isCancelled = true
      }
    }

    draftLoadTokenRef.current = loadToken

    draftLoadingProjectIdRef.current = projectId ?? null
    previousSnapshotRef.current = null
    hasUserEditedRef.current = false
    draftLoadBaselineRef.current = null
    pendingWorkspaceSnapshotCommitRef.current = false
    workspaceEditTransactionDepthRef.current = 0
    pendingServerPublishRef.current = null
    awaitingServerSyncRef.current = null
    bubbleHistoryBaseIndexRef.current = -1
    floorPlanHistoryBaseIndexRef.current = -1
    setBubbleHistoryCursor({ baseIndex: -1, redoDepth: 0 })
    setFloorPlanHistoryCursor({ baseIndex: -1, redoDepth: 0 })
    replaceBubblesForBootstrap([])
    replaceConnectionsForBootstrap([])
    replaceZonesStateForBootstrap([])
    clearFloorPlanForBootstrap()
    resetFloorPlanStructureState()
    setWorkspacePhaseStatus('BUBBLE_DRAFT')
    setWorkspaceSiteBoundary({ polygonRing: null, areaM2: null })
    setSelectedConnectionPair(null)
    setConnectingFromId(null)
    setSelectedFloorWallId(null)
    setSelectedFloorOpeningId(null)
    setSelectedFloorWallIds([])
    setSelectedFloorOpeningIds([])
    clearSelectionForBootstrap()

    if (!projectId) {
      draftLoadedProjectIdRef.current = null
      draftLoadingProjectIdRef.current = null
      return () => {
        isCancelled = true
      }
    }
    const localStoredBubbleFloorMeta = readBubbleFloorMetaFromStorage(projectId)
    const localStoredBubbleDraftPayload = readBubbleLocalDraftFromStorage(projectId)
    const localStoredBubbleSavedRecoveryPayload = readBubbleSavedRecoveryFromStorage(projectId)
    const localStoredBubbleDraftCandidate = localStoredBubbleDraftPayload?.snapshot
    const localStoredBubbleSavedRecoveryCandidate = localStoredBubbleSavedRecoveryPayload?.snapshot
    const localStoredBubbleDraft = isBubbleSnapshotPayload(localStoredBubbleDraftCandidate)
      ? localStoredBubbleDraftCandidate
      : null
    const localStoredBubbleSavedRecovery = isBubbleSnapshotPayload(localStoredBubbleSavedRecoveryCandidate)
      ? localStoredBubbleSavedRecoveryCandidate
      : null
    const localRecoverySource = localStoredBubbleDraft
      ? 'local-draft'
      : localStoredBubbleSavedRecovery
        ? 'saved-recovery'
        : 'none'
    const localRecoveryPayload = localStoredBubbleDraft
      ? localStoredBubbleDraftPayload
      : localStoredBubbleSavedRecovery
        ? localStoredBubbleSavedRecoveryPayload
        : null
    const localRecoverySnapshot = localStoredBubbleDraft ?? localStoredBubbleSavedRecovery
    const localRecoverySummary = localRecoverySnapshot
      ? summarizeBubbleSnapshotForDebug(localRecoverySnapshot)
      : null
    let bootstrapAppliedSource = 'none'
    logBubbleDebug('bootstrap:local-draft-loaded', {
      projectId,
      hasLocalDraft: Boolean(localStoredBubbleDraft),
      localDraftSavedAt: localStoredBubbleDraftPayload?.savedAt ?? null,
      localDraftSummary: localStoredBubbleDraft
        ? summarizeBubbleSnapshotForDebug(localStoredBubbleDraft)
        : null,
      hasSavedRecovery: Boolean(localStoredBubbleSavedRecovery),
      savedRecoverySavedAt: localStoredBubbleSavedRecoveryPayload?.savedAt ?? null,
      savedRecoverySummary: localStoredBubbleSavedRecovery
        ? summarizeBubbleSnapshotForDebug(localStoredBubbleSavedRecovery)
        : null,
      selectedLocalRecoverySource: localRecoverySource,
      selectedLocalRecoverySavedAt: localRecoveryPayload?.savedAt ?? null,
      selectedLocalRecoverySummary: localRecoverySummary,
    })
    traceBubbleSnapshot('bootstrap:local-recovery', projectId, localRecoverySnapshot, {
      localRecoverySource,
      localRecoverySavedAt: localRecoveryPayload?.savedAt ?? null,
      hasLocalDraft: Boolean(localStoredBubbleDraft),
      hasSavedRecovery: Boolean(localStoredBubbleSavedRecovery),
    })

    const buildBubbleWorkspaceSnapshot = (
      phaseStatus: PhaseStatus,
      snapshot: BubbleSnapshotPayload,
    ): WorkspaceSnapshot => {
      const { normalizedBubbles, floorMeta } = resolveBubbleSnapshotViewState(snapshot, {
        defaultColor: '#93c5fd',
        areaUnitLabel: 'm2',
        fallbackFloorMeta: localStoredBubbleFloorMeta,
      })
      return {
        phaseStatus,
        bubbles: normalizedBubbles,
        connections: snapshot.connections,
        bubbleFloorNamesByNumber: floorMeta.namesByFloor,
        extraBubbleFloors: floorMeta.extraFloors,
        zones: [],
        floorLayers: [],
        activeFloorLayerId: null,
        isFloorPlanGenerated: false,
        floorPlanLayoutSource: null,
        floorWalls: [],
        floorOpenings: [],
        hiddenAutoWallIds: [],
        hiddenAutoOpeningIds: [],
        isProjectStructurePreferred: false,
        ifcElementChanges: [],
      }
    }

    const applyBubbleSnapshot = (snapshot: BubbleSnapshotPayload) => {
      suppressNextAutosaveRef.current = true
      const { normalizedBubbles, floorMeta, availableFloors } = resolveBubbleSnapshotViewState(snapshot, {
        defaultColor: '#93c5fd',
        areaUnitLabel: 'm2',
        fallbackFloorMeta: localStoredBubbleFloorMeta,
      })

      // 복구 직전 원본 스냅샷과 정규화 결과의 층 분포를 함께 기록한다.
      logBubbleDebug('bootstrap:apply-snapshot:before', {
        projectId,
        rawSummary: summarizeBubbleSnapshotForDebug(snapshot),
        normalizedFloorCounts: normalizedBubbles.reduce<Record<number, number>>((acc, b) => {
          const floor = normalizeBubbleFloor(b.floor)
          acc[floor] = (acc[floor] ?? 0) + 1
          return acc
        }, {}),
        rawFloorCounts: snapshot.bubbles.reduce<Record<string, number>>((acc, b) => {
          const key = String(b.floor ?? 'undefined')
          acc[key] = (acc[key] ?? 0) + 1
          return acc
        }, {}),
        localStoredFloorMeta: localStoredBubbleFloorMeta,
      })

      // floorMeta 복원 결과를 기록해 층 목록/이름 복원 문제를 빠르게 추적한다.
      logBubbleDebug('bootstrap:apply-snapshot:floor-meta-resolved', {
        projectId,
        resolvedNamesByFloor: floorMeta.namesByFloor,
        resolvedExtraFloors: floorMeta.extraFloors,
        snapshotHadFloorMeta: Boolean(snapshot.floorMeta),
        usedFallback: !snapshot.floorMeta?.namesByFloor && !snapshot.floorMeta?.extraFloors,
      })

      replaceBubblesForBootstrap(normalizedBubbles)
      replaceConnectionsForBootstrap(snapshot.connections)
      applyBubbleFloorMetaState(floorMeta, availableFloors)
      setSelectedConnectionPair(null)
      setConnectingFromId(null)
      clearSelectionForBootstrap()
    }

    const publishBubbleSnapshotToRedis = async (snapshot: WorkspaceSnapshot, baseIndex: number) => {
      const serializedSnapshot = JSON.stringify(snapshot)
      setSaveStatus('syncing')
      awaitingServerSyncRef.current = {
        projectId,
        serializedSnapshot,
        historyDomain: resolveServerHistoryDomain(snapshot),
        baseIndex,
        startedAt: Date.now(),
      }
      try {
        await workspaceRealtimeService.publishSnapshot({
          projectId,
          snapshot,
          baseIndex,
        })
      } catch (error: unknown) {
        if (awaitingServerSyncRef.current?.serializedSnapshot === serializedSnapshot) {
          awaitingServerSyncRef.current = null
        }
        console.warn('[editor] Bubble history repair publish failed.', { projectId, baseIndex, error })
      }
    }

    const applyWorkspaceDetailFallback = async (
      seedBubbleBaseline = false,
      historySummaryForRecovery?: ReturnType<typeof summarizeBubbleSnapshotForDebug>,
      options?: { preferLocalDraft?: boolean },
    ): Promise<{ applied: boolean; summary: ReturnType<typeof summarizeBubbleSnapshotForDebug> | null }> => {
      const preferLocalDraft = options?.preferLocalDraft ?? true
      logBubbleDebug('bootstrap:db-fallback:begin', {
        projectId,
        seedBubbleBaseline,
        preferLocalDraft,
        historySummaryForRecovery: historySummaryForRecovery ?? null,
      })
      const workspaceDetail = await projectService.getWorkspaceDetail(projectId).catch(() => null)
      if (isCancelled || draftLoadTokenRef.current !== loadToken) return { applied: false, summary: null }
      if (!workspaceDetail) return { applied: false, summary: null }

      const dbPhaseStatus = workspaceDetail.phaseStatus
      if (dbPhaseStatus === 'BUBBLE_DRAFT' || dbPhaseStatus === 'CONVERTING' || dbPhaseStatus === 'IFC_EDIT') {
        setWorkspacePhaseStatus(dbPhaseStatus)
      }
      if (workspaceDetail.currentRevision !== undefined) {
        setIfcRevisionByProjectId((prev) => ({
          ...prev,
          [projectId]: workspaceDetail.currentRevision ?? null,
        }))
      }

      const dbBubbleSnapshot = isBubbleSnapshotPayload(workspaceDetail.bubbleSnapshotJson)
        ? workspaceDetail.bubbleSnapshotJson
        : null
      const dbSummary = dbBubbleSnapshot ? summarizeBubbleSnapshotForDebug(dbBubbleSnapshot) : null
      logBootstrapFloor('db-fetched', {
        projectId,
        phaseStatus: dbPhaseStatus ?? null,
        hasDbBubbleSnapshot: Boolean(dbBubbleSnapshot),
        dbSummary,
        dbResolvedFloorCounts: dbSummary?.resolvedFloorCounts ?? null,
        dbFloorFieldPresenceCounts: dbSummary?.floorFieldPresenceCounts ?? null,
      })

      let selectedRecoverySnapshot = dbBubbleSnapshot
      let selectedRecoverySummary = dbSummary
      let selectedRecoverySource: 'db' | 'local-draft' | 'saved-recovery' | 'none' = dbBubbleSnapshot ? 'db' : 'none'

      const dbLooksSingleFloorFlattened =
        (dbSummary?.bubbleCount ?? 0) > 0 &&
        (dbSummary?.bubbleFloors.length ?? 0) === 1 &&
        dbSummary?.bubbleFloors[0] === 1 &&
        (dbSummary?.floorMetaFloors.length ?? 0) === 0
      const localRecoveryLooksMultiFloor =
        Boolean(localRecoverySummary) &&
        (
          (localRecoverySummary?.bubbleFloors.some((floor) => floor > 1) ?? false)
          || (localRecoverySummary?.floorMetaFloors.some((floor) => floor > 1) ?? false)
        )

      if (preferLocalDraft && localRecoverySnapshot && localRecoverySummary) {
        if (!selectedRecoverySnapshot || !selectedRecoverySummary) {
          selectedRecoverySnapshot = localRecoverySnapshot
          selectedRecoverySummary = localRecoverySummary
          selectedRecoverySource = localRecoverySource === 'none' ? 'local-draft' : localRecoverySource
        } else if (isSnapshotPreferredForRecovery(localRecoverySummary, selectedRecoverySummary)) {
          selectedRecoverySnapshot = localRecoverySnapshot
          selectedRecoverySummary = localRecoverySummary
          selectedRecoverySource = localRecoverySource === 'none' ? 'local-draft' : localRecoverySource
        }
      } else if (
        !preferLocalDraft &&
        localRecoverySnapshot &&
        localRecoverySummary &&
        dbLooksSingleFloorFlattened &&
        localRecoveryLooksMultiFloor
      ) {
        selectedRecoverySnapshot = localRecoverySnapshot
        selectedRecoverySummary = localRecoverySummary
        selectedRecoverySource = localRecoverySource === 'none' ? 'local-draft' : localRecoverySource
      }

      logBubbleDebug('bootstrap:db-fallback:resolved-candidate', {
        projectId,
        selectedRecoverySource,
        dbSummary,
        localRecoverySource,
        localRecoverySummary,
        historySummaryForRecovery: historySummaryForRecovery ?? null,
      })
      logBootstrapFloor('db-candidate-selected', {
        projectId,
        selectedRecoverySource,
        selectedRecoverySummary,
        dbLooksSingleFloorFlattened,
        localDraftLooksMultiFloor: localRecoveryLooksMultiFloor,
        localRecoverySource,
        localRecoveryLooksMultiFloor,
        selectedRecoveryResolvedFloorCounts: selectedRecoverySummary?.resolvedFloorCounts ?? null,
        selectedRecoveryFloorFieldPresenceCounts: selectedRecoverySummary?.floorFieldPresenceCounts ?? null,
        historySummaryForRecovery: historySummaryForRecovery ?? null,
      })
      traceBubbleSnapshot('bootstrap:db-fallback:db-candidate', projectId, dbBubbleSnapshot, {
        selectedRecoverySource,
      })
      traceBubbleSnapshot('bootstrap:db-fallback:local-recovery-candidate', projectId, localRecoverySnapshot, {
        selectedRecoverySource,
        localRecoverySource,
      })

      if (selectedRecoverySnapshot && selectedRecoverySummary) {
        const canApplyOverHistory = historySummaryForRecovery
          ? isSnapshotPreferredForRecovery(selectedRecoverySummary, historySummaryForRecovery)
          : true
        if (!canApplyOverHistory) {
          logBubbleDebug('bootstrap:db-fallback:skip-apply-older-than-history', {
            projectId,
            source: selectedRecoverySource,
            selectedRecoverySummary,
            historySummaryForRecovery,
          })
          return { applied: false, summary: selectedRecoverySummary }
        }
        logBubbleDebug('bootstrap:db-fallback:apply-bubble-snapshot', {
          projectId,
          summary: selectedRecoverySummary,
          phaseStatus: dbPhaseStatus,
          source: selectedRecoverySource,
        })
        bootstrapAppliedSource = `db:${selectedRecoverySource}`
        logBootstrapFloor('db-apply', {
          projectId,
          source: selectedRecoverySource,
          summary: selectedRecoverySummary,
          resolvedFloorCounts: selectedRecoverySummary.resolvedFloorCounts,
          floorFieldPresenceCounts: selectedRecoverySummary.floorFieldPresenceCounts,
        })
        if (isBubbleDebugEnabled()) {
          console.table(selectedRecoverySummary.bubbleFloorRows)
        }
        applyBubbleSnapshot(selectedRecoverySnapshot)
        if (seedBubbleBaseline && dbPhaseStatus === 'BUBBLE_DRAFT') {
          if (canApplyOverHistory) {
            await publishBubbleSnapshotToRedis(
              buildBubbleWorkspaceSnapshot(dbPhaseStatus, selectedRecoverySnapshot),
              -1,
            )
            logBubbleDebug('bootstrap:db-fallback:republished-to-history', {
              projectId,
              source: selectedRecoverySource,
            })
          } else {
            logBubbleDebug('bootstrap:db-fallback:skip-republish-older-than-history', {
              projectId,
              source: selectedRecoverySource,
              selectedRecoverySummary,
              historySummaryForRecovery,
            })
          }
        }
        return { applied: true, summary: selectedRecoverySummary }
      }

      return { applied: false, summary: selectedRecoverySummary }
    }

    const applyRedisHistorySnapshot = async (
      dbBaselineSummary?: ReturnType<typeof summarizeBubbleSnapshotForDebug> | null,
    ) => {
      const history = await workspaceSaveService.loadHistorySnapshot(projectId)
      if (isCancelled || draftLoadTokenRef.current !== loadToken) return
      if (hasUserEditedRef.current) return
      applyWorkspaceHistorySiteInfo(history.siteInfo)
      logBubbleDebug('bootstrap:history-loaded', {
        projectId,
        bubbleBaseIndex: history.bubble?.baseIndex ?? -1,
        bubbleRedoDepth: history.bubble?.redoDepth ?? 0,
        floorPlanBaseIndex: history.floorPlan?.baseIndex ?? -1,
        floorPlanRedoDepth: history.floorPlan?.redoDepth ?? 0,
        historyBubbleSummary: isBubbleSnapshotPayload(history.bubble?.snapshot)
          ? summarizeBubbleSnapshotForDebug(history.bubble.snapshot)
          : null,
        historyFloorPlanBubbleSummary: isBubbleSnapshotPayload(history.floorPlan?.snapshot)
          ? summarizeBubbleSnapshotForDebug(history.floorPlan.snapshot)
          : null,
      })
      logBootstrapFloor('history-loaded', {
        projectId,
        bubbleBaseIndex: history.bubble?.baseIndex ?? -1,
        bubbleRedoDepth: history.bubble?.redoDepth ?? 0,
        floorPlanBaseIndex: history.floorPlan?.baseIndex ?? -1,
        floorPlanRedoDepth: history.floorPlan?.redoDepth ?? 0,
        historyBubbleSummary: isBubbleSnapshotPayload(history.bubble?.snapshot)
          ? summarizeBubbleSnapshotForDebug(history.bubble.snapshot)
          : null,
        historyFloorPlanBubbleSummary: isBubbleSnapshotPayload(history.floorPlan?.snapshot)
          ? summarizeBubbleSnapshotForDebug(history.floorPlan.snapshot)
          : null,
      })
      traceBubbleSnapshot(
        'bootstrap:history:bubble',
        projectId,
        isBubbleSnapshotPayload(history.bubble?.snapshot) ? history.bubble.snapshot : null,
        {
          bubbleBaseIndex: history.bubble?.baseIndex ?? -1,
          bubbleRedoDepth: history.bubble?.redoDepth ?? 0,
        },
      )
      traceBubbleSnapshot(
        'bootstrap:history:floor-plan',
        projectId,
        isBubbleSnapshotPayload(history.floorPlan?.snapshot) ? history.floorPlan.snapshot : null,
        {
          floorPlanBaseIndex: history.floorPlan?.baseIndex ?? -1,
          floorPlanRedoDepth: history.floorPlan?.redoDepth ?? 0,
        },
      )

      const bubbleBaseIndex = history.bubble?.baseIndex ?? -1
      const bubbleRedoDepth = history.bubble?.redoDepth ?? 0
      const floorPlanBaseIndex = history.floorPlan?.baseIndex ?? -1
      const floorPlanRedoDepth = history.floorPlan?.redoDepth ?? 0
      bubbleHistoryBaseIndexRef.current = bubbleBaseIndex
      floorPlanHistoryBaseIndexRef.current = floorPlanBaseIndex
      setBubbleHistoryCursor({ baseIndex: bubbleBaseIndex, redoDepth: bubbleRedoDepth })
      setFloorPlanHistoryCursor({ baseIndex: floorPlanBaseIndex, redoDepth: floorPlanRedoDepth })

      const nextPhaseStatus = history.phaseStatus ?? 'BUBBLE_DRAFT'
      setWorkspacePhaseStatus(nextPhaseStatus)

      const bubbleSnapshot = history.bubble?.snapshot
      const hasBubbleSnapshot = isBubbleSnapshotPayload(bubbleSnapshot)

      const floorPlanSnapshotRaw = history.floorPlan?.snapshot
      const floorPlanSnapshot: SavedFloorPlanSnapshotPayload | null | undefined = floorPlanSnapshotRaw
      const floorPlanBubbleSnapshot = isBubbleSnapshotPayload(floorPlanSnapshotRaw) ? floorPlanSnapshotRaw : null

      const resolvedHistoryBubbleSnapshot = hasBubbleSnapshot
        ? bubbleSnapshot
        : floorPlanBubbleSnapshot
      if (isBubbleSnapshotPayload(resolvedHistoryBubbleSnapshot)) {
        const resolvedSummary = summarizeBubbleSnapshotForDebug(resolvedHistoryBubbleSnapshot)
        const dbSummary = dbBaselineSummary ?? null
        const historyPreferred = dbSummary
          ? isSnapshotPreferredForRecovery(resolvedSummary, dbSummary)
          : true
        const dbPreferred = dbSummary
          ? isSnapshotPreferredForRecovery(dbSummary, resolvedSummary)
          : false
        const looksFlattenedByHistory = isPossiblyFlattenedFloorSnapshot(resolvedSummary)
        const historyMissingFloorMeta =
          resolvedSummary.bubbleCount > 0 &&
          resolvedSummary.floorMetaFloors.length === 0
        const shouldApplyHistoryBubbleSnapshot = !looksFlattenedByHistory
          && !historyMissingFloorMeta
          && (
            dbSummary === null
            || historyPreferred
            || (!dbPreferred && bubbleBaseIndex >= 0)
          )

        logBubbleDebug('bootstrap:history-compare', {
          projectId,
          dbSummary,
          resolvedSummary,
          historyPreferred,
          dbPreferred,
          bubbleBaseIndex,
          shouldApplyHistoryBubbleSnapshot,
          looksFlattenedByHistory,
          historyMissingFloorMeta,
        })
        logBootstrapFloor('history-compare', {
          projectId,
          dbSummary,
          historySummary: resolvedSummary,
          historyPreferred,
          dbPreferred,
          bubbleBaseIndex,
          shouldApplyHistoryBubbleSnapshot,
          looksFlattenedByHistory,
          historyMissingFloorMeta,
        })

        if (shouldApplyHistoryBubbleSnapshot) {
          logBubbleDebug('bootstrap:history-applied', { projectId, resolvedSummary })
          traceBubbleSnapshot('bootstrap:history:resolved-applied', projectId, resolvedHistoryBubbleSnapshot)
          applyBubbleSnapshot(resolvedHistoryBubbleSnapshot)
          bootstrapAppliedSource = 'history'
          logBootstrapFloor('history-applied', {
            projectId,
            summary: resolvedSummary,
          })
        }

        const looksFlattenedByLocalHint =
          Boolean(localRecoverySummary) &&
          resolvedSummary.bubbleCount > 0 &&
          resolvedSummary.bubbleFloors.length === 1 &&
          resolvedSummary.bubbleFloors[0] === 1 &&
          resolvedSummary.floorMetaFloors.length === 0 &&
          hasMultipleFloorHintFromLocalMeta(localStoredBubbleFloorMeta)
        if (!shouldApplyHistoryBubbleSnapshot && (looksFlattenedByHistory || looksFlattenedByLocalHint || historyMissingFloorMeta)) {
          logBubbleDebug('bootstrap:history-flattened-detected', {
            projectId,
            resolvedSummary,
            looksFlattenedByHistory,
            historyMissingFloorMeta,
            looksFlattenedByLocalHint,
            localStoredBubbleFloorMeta,
          })
          // [Fix A] DB 조회(async) 동안 잘못된 층 상태가 보이는 플래시를 방지하기 위해
          // 다층 로컬 드래프트가 있으면 즉시 적용한다.
          if (localRecoverySnapshot && localRecoverySummary?.bubbleFloors.some((f) => f !== 1)) {
            applyBubbleSnapshot(localRecoverySnapshot)
            bootstrapAppliedSource = `${localRecoverySource}-recovery`
            logBootstrapFloor('history-recover-local-draft-applied', {
              projectId,
              source: localRecoverySource,
              summary: localRecoverySummary,
            })
          }
          const restored = await applyWorkspaceDetailFallback(
            true,
            resolvedSummary,
            { preferLocalDraft: false },
          )
          logBubbleDebug('bootstrap:history-flattened-recovery-finished', { projectId, restored })
          if (restored.applied) {
            return
          }
        }
      }
      if (floorPlanSnapshot?.revisionId !== undefined) {
        setIfcRevisionByProjectId((prev) => ({
          ...prev,
          [projectId]: floorPlanSnapshot.revisionId ?? null,
        }))
      }
      if (history.floorPlan?.s3Url) {
        handleIfcSyncMessageRef.current(
          history.floorPlan.s3Url,
          null,
          undefined,
          floorPlanSnapshot?.revisionId ?? undefined,
        )
      }
      if (floorPlanSnapshot?.layout) {
        suppressNextAutosaveRef.current = true
        applyFloorPlanLayoutState({
          layout: floorPlanSnapshot.layout,
          replaceLayoutState: replaceFloorPlanStateForBootstrap,
          fallback: {
            isGenerated: true,
            layoutSource: 'project',
            layers: [],
            activeLayerId: null,
          },
        })

        setSelectedConnectionPair(null)
        setConnectingFromId(null)
        clearSelectionForBootstrap()
        clearTwoDStructureSelectionForBootstrap()
        return
      }

      if (hasBubbleSnapshot || floorPlanBubbleSnapshot) {
        return
      }

      await applyWorkspaceDetailFallback(
        bubbleBaseIndex < 0,
        undefined,
        { preferLocalDraft: true },
      )
    }

    let didHistoryBootstrapFail = false

    void (async () => {
      const dbBaseline = await applyWorkspaceDetailFallback(
        false,
        undefined,
        { preferLocalDraft: false },
      )
      await applyRedisHistorySnapshot(dbBaseline.summary)
    })()
      .catch(async () => {
        const didApplyFallback = await applyWorkspaceDetailFallback(
          false,
          undefined,
          { preferLocalDraft: true },
        )
        didHistoryBootstrapFail = !didApplyFallback.applied
        if (!didApplyFallback.applied && !isCancelled && draftLoadTokenRef.current === loadToken) {
          setSaveStatus('error')
        }
      })
      .finally(() => {
        if (isCancelled || draftLoadTokenRef.current !== loadToken) return
        draftLoadingProjectIdRef.current = null
        draftLoadBaselineRef.current = null
        if (didHistoryBootstrapFail) return
        logBootstrapFloor('bootstrap-final', {
          projectId,
          bootstrapAppliedSource,
        })
        draftLoadedProjectIdRef.current = projectId
        setAutosaveReadyProjectId(projectId)
      })

    return () => {
      isCancelled = true
      draftLoadingProjectIdRef.current = null
      draftLoadBaselineRef.current = null
    }
  }, [
    applyBubbleFloorMetaState,
    applyFloorPlanLayoutState,
    applyWorkspaceHistorySiteInfo,
    projectId,
    resolveServerHistoryDomain,
    resetFloorPlanStructureState,
    setConnectingFromId,
  ])

  useEffect(() => {
    if (!projectId || autosaveReadyProjectId !== projectId) return
    const pendingServerPublish = pendingServerPublishRef.current
    if (!pendingServerPublish || pendingServerPublish.projectId !== projectId) return
    if (
      awaitingServerSyncRef.current?.projectId === projectId &&
      awaitingServerSyncRef.current.serializedSnapshot === pendingServerPublish.serializedSnapshot
    ) return

    let isCancelled = false
    setSaveStatus('syncing')
    awaitingServerSyncRef.current = {
      projectId,
      serializedSnapshot: pendingServerPublish.serializedSnapshot,
      historyDomain: resolveServerHistoryDomain(pendingServerPublish.snapshot),
      baseIndex: pendingServerPublish.baseIndex,
      startedAt: Date.now(),
    }
    logBubbleDebug('publish:retry-begin', {
      projectId,
      baseIndex: pendingServerPublish.baseIndex,
      historyDomain: resolveServerHistoryDomain(pendingServerPublish.snapshot),
      summary: summarizeBubbleSnapshotForDebug(
        toBubbleSnapshotPayloadFromWorkspaceSnapshot(pendingServerPublish.snapshot),
      ),
    })

    void workspaceRealtimeService.publishSnapshot({
      projectId,
      snapshot: pendingServerPublish.snapshot,
      baseIndex: pendingServerPublish.baseIndex,
      revisionId: pendingServerPublish.revisionId,
      sceneType: pendingServerPublish.sceneType,
    })
      .then(() => {
        if (isCancelled) return
        // STOMP publish 성공은 클라이언트 전송 성공만 의미한다.
        // 서버가 Redis history ack를 브로드캐스트할 때까지 pending snapshot을 유지한다.
      })
      .catch(() => {
        if (isCancelled) return
        if (awaitingServerSyncRef.current?.serializedSnapshot === pendingServerPublish.serializedSnapshot) {
          awaitingServerSyncRef.current = null
        }
        logBubbleDebug('publish:retry-failed', {
          projectId,
          baseIndex: pendingServerPublish.baseIndex,
        })
        setSaveStatus('error')
        scheduleServerPublishRetry()
      })

    return () => {
      isCancelled = true
    }
  }, [autosaveReadyProjectId, projectId, resolveServerHistoryDomain, scheduleServerPublishRetry, serverPublishRetryTick])

  useEffect(() => {
    if (!projectId || autosaveReadyProjectId !== projectId) return
    if (draftLoadingProjectIdRef.current === projectId) return

    const shouldPublishBubbleDraft = mode === 'bubble' && workspacePhaseStatus === 'BUBBLE_DRAFT'
    const publishSnapshot: WorkspaceSnapshot = shouldPublishBubbleDraft
      ? {
        ...draftSnapshot,
        phaseStatus: 'BUBBLE_DRAFT',
        zones: [],
        floorLayers: [],
        activeFloorLayerId: null,
        isFloorPlanGenerated: false,
        floorPlanLayoutSource: null,
        floorWalls: [],
        floorOpenings: [],
        hiddenAutoWallIds: [],
        hiddenAutoOpeningIds: [],
        isProjectStructurePreferred: false,
        ifcElementChanges: [],
      }
      : draftSnapshot
    const serializedSnapshot = JSON.stringify(publishSnapshot)

    if (
      suppressGeneratedFloorPlanAutosaveRef.current &&
      resolveServerHistoryDomain(publishSnapshot) === 'floorPlan'
    ) {
      pendingServerPublishRef.current = null
      awaitingServerSyncRef.current = null
      previousSnapshotRef.current = serializedSnapshot
      hasUserEditedRef.current = false
      suppressGeneratedFloorPlanAutosaveRef.current = false
      setSaveStatus('synced')
      return
    }

    if (suppressNextAutosaveRef.current) {
      suppressNextAutosaveRef.current = false
      pendingServerPublishRef.current = null
      awaitingServerSyncRef.current = null
      previousSnapshotRef.current = serializedSnapshot
      setSaveStatus(resolveSnapshotSyncStatus())
      return
    }

    if (previousSnapshotRef.current !== null && previousSnapshotRef.current === serializedSnapshot) {
      return
    }

    if (
      awaitingServerSyncRef.current?.projectId === projectId &&
      awaitingServerSyncRef.current.serializedSnapshot === serializedSnapshot
    ) {
      return
    }

    if (previousSnapshotRef.current === null && !hasUserEditedRef.current) {
      previousSnapshotRef.current = serializedSnapshot
      return
    }

    if (!hasUserEditedRef.current) {
      return
    }

    if (workspaceEditTransactionDepthRef.current > 0) {
      pendingWorkspaceSnapshotCommitRef.current = true
      setSaveStatus('dirty')
      return
    }

    const serverPublishRecord: PendingServerPublishRecord = {
      projectId,
      baseIndex: resolveServerHistoryBaseIndex(publishSnapshot),
      snapshot: publishSnapshot,
      serializedSnapshot,
      revisionId: resolveServerHistoryDomain(publishSnapshot) === 'floorPlan' ? currentIfcRevisionId : undefined,
      sceneType: resolveServerHistoryDomain(publishSnapshot) === 'floorPlan' ? resolveFloorPlanSceneType() : undefined,
    }

    setSaveStatus('dirty')
    setSaveStatus('syncing')
    clearServerPublishRetry()
    pendingServerPublishRef.current = serverPublishRecord
    awaitingServerSyncRef.current = {
      projectId,
      serializedSnapshot,
      historyDomain: resolveServerHistoryDomain(publishSnapshot),
      baseIndex: serverPublishRecord.baseIndex,
      startedAt: Date.now(),
    }
    // STOMP 자동저장 publish 직전의 층 분포를 기록한다.
    const publishDebugSummary = summarizeBubbleSnapshotForDebug(
      toBubbleSnapshotPayloadFromWorkspaceSnapshot(publishSnapshot),
    )
    logBubbleDebug('publish:begin', {
      projectId,
      baseIndex: serverPublishRecord.baseIndex,
      historyDomain: resolveServerHistoryDomain(publishSnapshot),
      summary: publishDebugSummary,
      floorMeta: { namesByFloor: publishSnapshot.bubbleFloorNamesByNumber, extraFloors: publishSnapshot.extraBubbleFloors },
    })
    if (isBubbleDebugEnabled()) {
      console.table(publishDebugSummary.bubbleFloorRows)
    }

    void workspaceRealtimeService.publishSnapshot({
      projectId,
      snapshot: publishSnapshot,
      baseIndex: serverPublishRecord.baseIndex,
      revisionId: serverPublishRecord.revisionId,
      sceneType: serverPublishRecord.sceneType,
    })
      .then(() => {
        // baseline은 매칭되는 서버 history ack를 받은 뒤에만 갱신한다.
      })
      .catch(() => {
        if (awaitingServerSyncRef.current?.serializedSnapshot === serializedSnapshot) {
          awaitingServerSyncRef.current = null
        }
        pendingServerPublishRef.current = serverPublishRecord
        logBubbleDebug('publish:failed', {
          projectId,
          baseIndex: serverPublishRecord.baseIndex,
        })
        scheduleServerPublishRetry()
        setSaveStatus('error')
      })
  }, [
    autosaveReadyProjectId,
    clearServerPublishRetry,
    currentIfcRevisionId,
    draftSnapshot,
    mode,
    projectId,
    resolveServerHistoryDomain,
    resolveServerHistoryBaseIndex,
    resolveFloorPlanSceneType,
    resolveSnapshotSyncStatus,
    scheduleServerPublishRetry,
    workspacePhaseStatus,
    workspaceSnapshotCommitVersion,
  ])

  const updateBubbleHistoryCursor = useCallback((baseIndex: number, redoDepth: number) => {
    bubbleHistoryBaseIndexRef.current = baseIndex
    setBubbleHistoryCursor({ baseIndex, redoDepth })
    const awaitingSync = awaitingServerSyncRef.current
    if (!awaitingSync) return
    if (
      awaitingSync.projectId === projectId &&
      awaitingSync.historyDomain === 'bubble' &&
      workspaceEditTransactionDepthRef.current === 0 &&
      !pendingWorkspaceSnapshotCommitRef.current
    ) {
      previousSnapshotRef.current = awaitingSync.serializedSnapshot
      pendingServerPublishRef.current = null
      awaitingServerSyncRef.current = null
      setSaveStatus('synced')
    }
  }, [projectId])

  const updateFloorPlanHistoryCursor = useCallback((baseIndex: number, redoDepth: number) => {
    floorPlanHistoryCommandInFlightRef.current = false
    floorPlanHistoryBaseIndexRef.current = baseIndex
    setFloorPlanHistoryCursor({ baseIndex, redoDepth })
    const awaitingSync = awaitingServerSyncRef.current
    if (!awaitingSync) return
    if (
      awaitingSync.projectId === projectId &&
      awaitingSync.historyDomain === 'floorPlan' &&
      workspaceEditTransactionDepthRef.current === 0 &&
      !pendingWorkspaceSnapshotCommitRef.current
    ) {
      previousSnapshotRef.current = awaitingSync.serializedSnapshot
      pendingServerPublishRef.current = null
      awaitingServerSyncRef.current = null
      setSaveStatus('synced')
    }
  }, [projectId])

  const handleWorkspaceServerError = useCallback((error: StompErrorMessage) => {
    const awaitingSync = awaitingServerSyncRef.current
    if (!awaitingSync || awaitingSync.projectId !== projectId) return

    awaitingServerSyncRef.current = null
    floorPlanHistoryCommandInFlightRef.current = false
    if (error.code === CURSOR_INVALID_CODE || error.code === FLOOR_PLAN_CURSOR_INVALID_CODE) {
      pendingServerPublishRef.current = null
      previousSnapshotRef.current = null
      clearServerPublishRetry()
      setSaveStatus('dirty')
      return
    }

    if (
      pendingServerPublishRef.current?.serializedSnapshot === awaitingSync.serializedSnapshot
    ) {
      scheduleServerPublishRetry()
    } else {
      clearServerPublishRetry()
    }
    setSaveStatus('error')
  }, [clearServerPublishRetry, projectId, scheduleServerPublishRetry])

  const applyRemoteBubbleSnapshot = useCallback((
    snapshot: BubbleSnapshotPayload,
    meta?: { action: string | null; payloadBaseIndex: number | null },
  ) => {
    const incomingSignature = JSON.stringify({
      bubbles: snapshot.bubbles,
      connections: snapshot.connections,
      floorMeta: snapshot.floorMeta,
    })
    const latestLocalSnapshot = latestBubbleSnapshotRef.current
    const latestLocalSignature = JSON.stringify({
      bubbles: latestLocalSnapshot.bubbles,
      connections: latestLocalSnapshot.connections,
      floorMeta: latestLocalSnapshot.floorMeta,
    })
    const hasLocalBubbleEditInFlight =
      isBubbleDragTransactionActiveRef.current ||
      workspaceEditTransactionDepthRef.current > 0 ||
      pendingWorkspaceSnapshotCommitRef.current ||
      awaitingServerSyncRef.current !== null

    if (hasLocalBubbleEditInFlight && incomingSignature !== latestLocalSignature) {
      logBubbleDebug('remote-bubble:skipped-due-to-local-edit', {
        projectId,
        incoming: summarizeBubbleSnapshotForDebug(snapshot),
      })
      traceBubbleSnapshot('remote-bubble:skipped-due-to-local-edit', projectId, snapshot)
      return
    }

    const incomingSummary = summarizeBubbleSnapshotForDebug(snapshot)
    const localSummary = summarizeBubbleSnapshotForDebug(latestLocalSnapshot)
    const localBubbleIds = new Set(latestLocalSnapshot.bubbles.map((bubble) => bubble.id))
    const incomingBubbleIds = new Set(snapshot.bubbles.map((bubble) => bubble.id))
    const sameBubbleIdSet =
      localBubbleIds.size === incomingBubbleIds.size &&
      [...localBubbleIds].every((bubbleId) => incomingBubbleIds.has(bubbleId))
    const looksLikeUnexpectedFloorFlatten =
      sameBubbleIdSet &&
      localSummary.bubbleFloors.some((floor) => floor > 1) &&
      incomingSummary.bubbleFloors.length === 1 &&
      incomingSummary.bubbleFloors[0] === 1

    if (
      meta?.action === WORKSPACE_SYNC_ACTION.bubbleUpdated &&
      looksLikeUnexpectedFloorFlatten
    ) {
      logBubbleDebug('remote-bubble:skipped-flattened-overwrite', {
        projectId,
        action: meta?.action ?? null,
        payloadBaseIndex: meta?.payloadBaseIndex ?? null,
        localSummary,
        incomingSummary,
      })
      traceBubbleSnapshot('remote-bubble:skipped-flattened-overwrite', projectId, snapshot, {
        action: meta?.action ?? null,
        payloadBaseIndex: meta?.payloadBaseIndex ?? null,
      })
      return
    }

    suppressNextAutosaveRef.current = true
    const previousById = new Map(latestLocalSnapshot.bubbles.map((bubble) => [bubble.id, bubble] as const))

    // 원격 echo 원본의 층 필드 형태를 기록한다.
    logBubbleDebug('remote-bubble:incoming-floor-data', {
      projectId,
      incomingFloorCounts: snapshot.bubbles.reduce<Record<string, number>>((acc, b) => {
        const raw = (b as BubbleData & Record<string, unknown>)
        const key = `floor=${String(raw.floor ?? 'undefined')}/layer=${String(raw.layer ?? 'undefined')}`
        acc[key] = (acc[key] ?? 0) + 1
        return acc
      }, {}),
      incomingFloorMeta: snapshot.floorMeta,
      localFloorCounts: latestLocalSnapshot.bubbles.reduce<Record<number, number>>((acc, b) => {
        const floor = normalizeBubbleFloor(b.floor)
        acc[floor] = (acc[floor] ?? 0) + 1
        return acc
      }, {}),
      localFloorMeta: latestBubbleSnapshotRef.current.floorMeta,
    })

    const { normalizedBubbles, floorMeta, availableFloors } = resolveBubbleSnapshotViewState(snapshot, {
      previousById,
      areaUnitLabel: 'm²',
      fallbackFloorMeta: latestBubbleSnapshotRef.current.floorMeta,
    })

    // 층 정규화 결과를 기록해 원격 데이터로 인한 floor 변형 여부를 추적한다.
    logBubbleDebug('remote-bubble:normalized-floor-result', {
      projectId,
      normalizedFloorCounts: normalizedBubbles.reduce<Record<number, number>>((acc, b) => {
        const floor = normalizeBubbleFloor(b.floor)
        acc[floor] = (acc[floor] ?? 0) + 1
        return acc
      }, {}),
      floorChangedBubbles: normalizedBubbles
        .filter((b) => {
          const prev = previousById.get(b.id)
          return prev && normalizeBubbleFloor(prev.floor) !== b.floor
        })
        .map((b) => ({
          id: b.id,
          prevFloor: previousById.get(b.id)?.floor,
          newFloor: b.floor,
        })),
    })

    replaceBubbles(normalizedBubbles)
    replaceConnections(snapshot.connections)
    applyBubbleFloorMetaState(floorMeta, availableFloors)
    setSelectedConnectionPair(null)
    setConnectingFromId(null)
    awaitingServerSyncRef.current = null
    logBubbleDebug('remote-bubble:applied', {
      projectId,
      summary: summarizeBubbleSnapshotForDebug(snapshot),
    })
    traceBubbleSnapshot('remote-bubble:applied', projectId, snapshot)
    setSaveStatus(resolveSnapshotSyncStatus())
  }, [
    applyBubbleFloorMetaState,
    projectId,
    replaceBubbles,
    replaceConnections,
    resolveSnapshotSyncStatus,
    setConnectingFromId,
  ])

  const applyRemoteFloorPlanSnapshot = useCallback((snapshot: FloorPlanSnapshotPayload) => {
    const hasLocalFloorPlanEditInFlight =
      workspaceEditTransactionDepthRef.current > 0 ||
      pendingWorkspaceSnapshotCommitRef.current

    if (hasLocalFloorPlanEditInFlight) {
      floorPlanHistoryCommandInFlightRef.current = false
      setSaveStatus('dirty')
      return
    }

    suppressNextAutosaveRef.current = true
    if (projectId && snapshot.revisionId !== undefined) {
      setIfcRevisionByProjectId((prev) => ({
        ...prev,
        [projectId]: snapshot.revisionId ?? null,
      }))
    }

    if (isBubbleSnapshotPayload(snapshot)) {
      const previousById = new Map(latestBubbleSnapshotRef.current.bubbles.map((bubble) => [bubble.id, bubble] as const))
      const { normalizedBubbles, floorMeta, availableFloors } = resolveBubbleSnapshotViewState(snapshot, {
        previousById,
        areaUnitLabel: 'm²',
        fallbackFloorMeta: latestBubbleSnapshotRef.current.floorMeta,
      })
      replaceBubbles(normalizedBubbles)
      replaceConnections(snapshot.connections)
      applyBubbleFloorMetaState(floorMeta, availableFloors)
    }

    const layout = snapshot.layout
    if (layout) {
      applyFloorPlanLayoutState({
        layout,
        replaceLayoutState: replaceFloorPlanState,
        fallback: {
          isGenerated: isFloorPlanGenerated,
          layoutSource: floorPlanLayoutSource,
          layers: floorLayers,
          activeLayerId: activeFloorLayerId,
        },
      })
    }

    setConnectingFromId(null)
    clearConnectionAndTwoDSelection()
    clearSelection()
    floorPlanHistoryCommandInFlightRef.current = false
    awaitingServerSyncRef.current = null
    setSaveStatus(resolveSnapshotSyncStatus())
  }, [
    activeFloorLayerId,
    applyBubbleFloorMetaState,
    applyFloorPlanLayoutState,
    clearConnectionAndTwoDSelection,
    clearSelection,
    floorLayers,
    floorPlanLayoutSource,
    isFloorPlanGenerated,
    projectId,
    replaceBubbles,
    replaceConnections,
    replaceFloorPlanState,
    resolveSnapshotSyncStatus,
    setConnectingFromId,
  ])

  const undoUnsyncedLocalBubbleChange = useCallback(() => {
    const baselineSnapshot = previousSnapshotRef.current
    if (!baselineSnapshot) return false

    let parsedSnapshot: WorkspaceSnapshot
    try {
      parsedSnapshot = JSON.parse(baselineSnapshot) as WorkspaceSnapshot
    } catch {
      return false
    }

    if (!isBubbleSnapshotPayload(parsedSnapshot)) return false

    clearServerPublishRetry()
    if (bubbleDbSaveTimerRef.current !== null) {
      window.clearTimeout(bubbleDbSaveTimerRef.current)
      bubbleDbSaveTimerRef.current = null
    }
    bubbleDbDirtyRef.current = false
    pendingServerPublishRef.current = null
    awaitingServerSyncRef.current = null
    pendingWorkspaceSnapshotCommitRef.current = false
    workspaceEditTransactionDepthRef.current = 0
    isBubbleDragTransactionActiveRef.current = false
    hasUserEditedRef.current = false

    applyRemoteBubbleSnapshot({
      bubbles: parsedSnapshot.bubbles,
      connections: parsedSnapshot.connections,
      floorMeta: {
        namesByFloor: parsedSnapshot.bubbleFloorNamesByNumber ?? {},
        extraFloors: parsedSnapshot.extraBubbleFloors ?? [],
      },
    })
    previousSnapshotRef.current = baselineSnapshot
    return true
  }, [applyRemoteBubbleSnapshot, clearServerPublishRetry])

  const refreshHistoryCursorFromServer = useCallback(async (options?: {
    republishOnFailure?: boolean
    republishWhenStale?: boolean
  }) => {
    if (!projectId) return
    const republishOnFailure = options?.republishOnFailure ?? true
    const republishWhenStale = options?.republishWhenStale ?? true
    const awaitingSync = awaitingServerSyncRef.current
    const history = await workspaceSaveService.loadHistorySnapshot(projectId).catch(() => null)
    if (!history) {
      if (awaitingSync?.projectId === projectId) {
        awaitingServerSyncRef.current = null
        previousSnapshotRef.current = null
        setSaveStatus('dirty')
        if (republishOnFailure) {
          setWorkspaceSnapshotCommitVersion((version) => version + 1)
        }
      }
      return
    }

    const bubbleBaseIndex = history.bubble?.baseIndex ?? -1
    const bubbleRedoDepth = history.bubble?.redoDepth ?? 0
    const floorPlanBaseIndex = history.floorPlan?.baseIndex ?? -1
    const floorPlanRedoDepth = history.floorPlan?.redoDepth ?? 0

    bubbleHistoryBaseIndexRef.current = bubbleBaseIndex
    floorPlanHistoryBaseIndexRef.current = floorPlanBaseIndex
    setBubbleHistoryCursor({ baseIndex: bubbleBaseIndex, redoDepth: bubbleRedoDepth })
    setFloorPlanHistoryCursor({ baseIndex: floorPlanBaseIndex, redoDepth: floorPlanRedoDepth })

    if (!awaitingSync || awaitingSync.projectId !== projectId) return

    const currentBaseIndex = awaitingSync.historyDomain === 'bubble' ? bubbleBaseIndex : floorPlanBaseIndex
    awaitingServerSyncRef.current = null

    if (
      currentBaseIndex > awaitingSync.baseIndex ||
      (awaitingSync.baseIndex >= WORKSPACE_HISTORY_MAX_INDEX && currentBaseIndex === WORKSPACE_HISTORY_MAX_INDEX)
    ) {
      previousSnapshotRef.current = awaitingSync.serializedSnapshot
      pendingServerPublishRef.current = null
      setSaveStatus('synced')
      return
    }

    previousSnapshotRef.current = null
    setSaveStatus('dirty')
    if (republishWhenStale) {
      setWorkspaceSnapshotCommitVersion((version) => version + 1)
    }
  }, [projectId])

  const handleBubbleHistoryCursorInvalid = useCallback(() => {
    const awaitingSync = awaitingServerSyncRef.current
    if (!awaitingSync || awaitingSync.projectId !== projectId || awaitingSync.historyDomain !== 'bubble') return
    pendingServerPublishRef.current = null
    awaitingServerSyncRef.current = null
    previousSnapshotRef.current = null
    clearServerPublishRetry()
    setSaveStatus('dirty')
    void refreshHistoryCursorFromServer({ republishOnFailure: false, republishWhenStale: false })
  }, [clearServerPublishRetry, projectId, refreshHistoryCursorFromServer])

  const handleFloorPlanHistoryCursorInvalid = useCallback(() => {
    const awaitingSync = awaitingServerSyncRef.current
    if (!awaitingSync || awaitingSync.projectId !== projectId || awaitingSync.historyDomain !== 'floorPlan') return
    pendingServerPublishRef.current = null
    awaitingServerSyncRef.current = null
    previousSnapshotRef.current = null
    floorPlanHistoryCommandInFlightRef.current = false
    clearServerPublishRetry()
    setSaveStatus('dirty')
    void refreshHistoryCursorFromServer({ republishOnFailure: false, republishWhenStale: false })
  }, [clearServerPublishRetry, projectId, refreshHistoryCursorFromServer])

  useEffect(() => {
    if (saveStatus !== 'syncing') return
    const awaitingSync = awaitingServerSyncRef.current
    if (!awaitingSync || awaitingSync.projectId !== projectId) return

    const timerId = window.setTimeout(() => {
      const currentAwaitingSync = awaitingServerSyncRef.current
      if (!currentAwaitingSync || currentAwaitingSync.projectId !== projectId) return
      if (Date.now() - currentAwaitingSync.startedAt < 5000) return
      void refreshHistoryCursorFromServer()
    }, 5200)

    return () => window.clearTimeout(timerId)
  }, [projectId, refreshHistoryCursorFromServer, saveStatus])

  const { markLocalBubbleSnapshotChanged: markLocalBubbleSnapshotChangedRealtime } = useBubbleSnapshotRealtime({
    projectId,
    canPublish: canEditBubble,
    bubbles,
    connections,
    onRemoteSnapshot: applyRemoteBubbleSnapshot,
    onRemoteFloorPlanSnapshot: applyRemoteFloorPlanSnapshot,
    onPhaseStatusChanged: setWorkspacePhaseStatus,
    onIfcStorageUrlReceived: (ifcStorageUrl, action, assetId, revisionId) => {
      handleIfcSyncMessageRef.current(ifcStorageUrl, action, assetId, revisionId)
      if (
        pendingOpenThreeDOnGenerateCompleteRef.current &&
        action &&
        IFC_COMPLETED_ACTION_SET.has(action)
      ) {
        pendingOpenThreeDOnGenerateCompleteRef.current = false
        setMode('3d')
      }
    },
    onBubbleHistoryCursorChanged: updateBubbleHistoryCursor,
    onFloorPlanHistoryCursorChanged: updateFloorPlanHistoryCursor,
    onBubbleHistoryCursorInvalid: handleBubbleHistoryCursorInvalid,
    onFloorPlanHistoryCursorInvalid: handleFloorPlanHistoryCursorInvalid,
    onServerError: handleWorkspaceServerError,
    bubbleHistoryCursor,
    floorPlanHistoryCursor,
  })

  const getBubbleSnapshotSaveErrorSummary = useCallback((error: unknown) => {
    if (!isAxiosError(error)) {
      return error instanceof Error ? error.message : String(error)
    }

    if (error.response) {
      const responseData = error.response.data as { message?: unknown } | undefined
      return {
        status: error.response.status,
        message: typeof responseData?.message === 'string' ? responseData.message : error.message,
      }
    }

    return {
      message: error.message,
      code: error.code,
      url: error.config?.url,
      baseURL: error.config?.baseURL,
    }
  }, [])

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
    const saveStartVersion = bubbleSnapshotChangeVersionRef.current
    logBubbleDebug('db-save:begin', {
      projectId,
      force,
      saveStartVersion,
      summary: summarizeBubbleSnapshotForDebug(snapshot),
    })
    traceBubbleSnapshot('db-save:begin', projectId, snapshot, { force, saveStartVersion })
    let shouldTriggerFollowUpSave = false
    const saveTask = (async () => {
      if (isBubbleDebugEnabled()) {
        const summary = summarizeBubbleSnapshotForDebug(snapshot)
        console.table(summary.bubbleFloorRows)
      }
      const saved = await saveBubbleSnapshotToDb(
        projectId,
        snapshot.bubbles,
        snapshot.connections,
        normalizeBubbleFloorMetaForSync(snapshot.floorMeta),
      )
      const changedDuringSave = bubbleSnapshotChangeVersionRef.current !== saveStartVersion
      bubbleDbDirtyRef.current = changedDuringSave
      shouldTriggerFollowUpSave = changedDuringSave
      writeBubbleSavedRecoveryToStorage(projectId, snapshot)
      clearBubbleLocalDraftFromStorage(projectId)
      logBubbleDebug('db-save:success', {
        projectId,
        savedAt: saved.savedAt,
        phaseStatus: saved.phaseStatus,
        saveStartVersion,
        changedDuringSave,
        summary: summarizeBubbleSnapshotForDebug(snapshot),
      })
      traceBubbleSnapshot('db-save:success', projectId, snapshot, {
        force,
        savedAt: saved.savedAt,
        phaseStatus: saved.phaseStatus,
        saveStartVersion,
        changedDuringSave,
      })
      return saved
    })()
    bubbleDbSaveInFlightRef.current = saveTask
    try {
      return await saveTask
    } catch (error: unknown) {
      const errorSummary = getBubbleSnapshotSaveErrorSummary(error)
      console.warn('[editor] Bubble snapshot DB 저장 실패:', { projectId, error })
      console.warn('[editor] Bubble snapshot DB 저장 실패 상세:', { projectId, error: errorSummary })
      logBubbleDebug('db-save:failed', { projectId, force, error: errorSummary })
      return null
    } finally {
      if (bubbleDbSaveInFlightRef.current === saveTask) {
        bubbleDbSaveInFlightRef.current = null
      }
      if (shouldTriggerFollowUpSave && projectId && workspacePhaseStatus === 'BUBBLE_DRAFT') {
        // 저장 중에 수정이 한 번이라도 발생했으면 최신 스냅샷을 즉시 한 번 더 저장한다.
        void flushBubbleSnapshotSaveToDbRef.current(false)
      }
    }
  }, [getBubbleSnapshotSaveErrorSummary, projectId, workspacePhaseStatus])

  useEffect(() => {
    flushBubbleSnapshotSaveToDbRef.current = flushBubbleSnapshotSaveToDb
  }, [flushBubbleSnapshotSaveToDb])

  const scheduleBubbleSnapshotSaveToDb = useCallback((delayMs = resolveBubbleDbSaveDebounceMs()) => {
    if (!projectId) return
    if (workspacePhaseStatus !== 'BUBBLE_DRAFT') return

    bubbleDbDirtyRef.current = true
    logBubbleDebug('db-save:schedule', { projectId, delayMs })
    if (bubbleDbSaveTimerRef.current !== null) {
      window.clearTimeout(bubbleDbSaveTimerRef.current)
    }
    bubbleDbSaveTimerRef.current = window.setTimeout(() => {
      bubbleDbSaveTimerRef.current = null
      void flushBubbleSnapshotSaveToDb(false)
    }, delayMs)
  }, [flushBubbleSnapshotSaveToDb, projectId, workspacePhaseStatus])

  const flushPendingLocalBubbleChange = useCallback(() => {
    if (localBubbleChangeFlushRafRef.current !== null) {
      window.cancelAnimationFrame(localBubbleChangeFlushRafRef.current)
      localBubbleChangeFlushRafRef.current = null
    }
    const pendingTask = pendingLocalBubbleChangeTaskRef.current
    if (!pendingTask) return
    pendingLocalBubbleChangeTaskRef.current = null
    pendingTask()
  }, [])

  const markLocalBubbleSnapshotChanged = useCallback(() => {
    hasUserEditedRef.current = true
    bubbleSnapshotChangeVersionRef.current += 1
    pendingLocalBubbleChangeTaskRef.current = () => {
      writeBubbleLocalDraftToStorage(projectId, latestBubbleSnapshotRef.current)
      logBubbleDebug('local-change:mark', {
        projectId,
        changeVersion: bubbleSnapshotChangeVersionRef.current,
        summary: summarizeBubbleSnapshotForDebug(latestBubbleSnapshotRef.current),
      })
      markLocalBubbleSnapshotChangedRealtime()
      scheduleBubbleSnapshotSaveToDb()
    }
    if (localBubbleChangeFlushRafRef.current !== null) {
      window.cancelAnimationFrame(localBubbleChangeFlushRafRef.current)
    }
    localBubbleChangeFlushRafRef.current = window.requestAnimationFrame(() => {
      localBubbleChangeFlushRafRef.current = null
      flushPendingLocalBubbleChange()
    })
  }, [flushPendingLocalBubbleChange, markLocalBubbleSnapshotChangedRealtime, projectId, scheduleBubbleSnapshotSaveToDb])

  const markLocalFloorPlanSnapshotChanged = useCallback(() => {
    hasUserEditedRef.current = true
    setSaveStatus('dirty')
  }, [])

  const beginWorkspaceSnapshotTransaction = useCallback(() => {
    hasUserEditedRef.current = true
    workspaceEditTransactionDepthRef.current += 1
    lastWorkspaceSnapshotTransactionAtRef.current = Date.now()
    setSaveStatus('dirty')
  }, [])

  const commitWorkspaceSnapshotTransaction = useCallback(() => {
    workspaceEditTransactionDepthRef.current = Math.max(0, workspaceEditTransactionDepthRef.current - 1)
    if (workspaceEditTransactionDepthRef.current > 0) return
    pendingWorkspaceSnapshotCommitRef.current = false
    setWorkspaceSnapshotCommitVersion((version) => version + 1)
  }, [])

  const commitBubbleDragSnapshot = useCallback(() => {
    if (!isBubbleDragTransactionActiveRef.current) return
    isBubbleDragTransactionActiveRef.current = false
    markLocalBubbleSnapshotChanged()
    commitWorkspaceSnapshotTransaction()
  }, [commitWorkspaceSnapshotTransaction, markLocalBubbleSnapshotChanged])

  const flushOpenWorkspaceSnapshotTransaction = useCallback(() => {
    if (isBubbleDragTransactionActiveRef.current) {
      commitBubbleDragSnapshot()
      return
    }
    if (workspaceEditTransactionDepthRef.current <= 0) return
    workspaceEditTransactionDepthRef.current = 0
    pendingWorkspaceSnapshotCommitRef.current = false
    setWorkspaceSnapshotCommitVersion((version) => version + 1)
  }, [commitBubbleDragSnapshot])

  const handleManualSave = useCallback(() => {
    if (isEditorReadOnly) return
    hasUserEditedRef.current = true
    flushPendingLocalBubbleChange()
    flushOpenWorkspaceSnapshotTransaction()
    if (workspacePhaseStatus === 'BUBBLE_DRAFT') {
      bubbleDbDirtyRef.current = true
      void flushBubbleSnapshotSaveToDb(true)
    }
    setSaveStatus('dirty')
    setWorkspaceSnapshotCommitVersion((version) => version + 1)
  }, [
    flushBubbleSnapshotSaveToDb,
    flushOpenWorkspaceSnapshotTransaction,
    flushPendingLocalBubbleChange,
    isEditorReadOnly,
    workspacePhaseStatus,
  ])

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || event.key.toLowerCase() !== 's') return
      event.preventDefault()
      handleManualSave()
    }

    window.addEventListener('keydown', handleSaveShortcut)
    return () => window.removeEventListener('keydown', handleSaveShortcut)
  }, [handleManualSave])

  useEffect(() => {
    const handleInteractionEnd = () => {
      flushOpenWorkspaceSnapshotTransaction()
    }

    window.addEventListener('mouseup', handleInteractionEnd)
    window.addEventListener('touchend', handleInteractionEnd)
    window.addEventListener('blur', handleInteractionEnd)
    return () => {
      window.removeEventListener('mouseup', handleInteractionEnd)
      window.removeEventListener('touchend', handleInteractionEnd)
      window.removeEventListener('blur', handleInteractionEnd)
    }
  }, [flushOpenWorkspaceSnapshotTransaction])

  useEffect(() => {
    const handlePageExit = () => {
      flushPendingLocalBubbleChange()
      logBubbleDebug('page-exit:flush', {
        projectId,
        summary: summarizeBubbleSnapshotForDebug(latestBubbleSnapshotRef.current),
      })
      writeBubbleLocalDraftToStorage(projectId, latestBubbleSnapshotRef.current)
      flushOpenWorkspaceSnapshotTransaction()
      const shouldPersistOnExit =
        workspacePhaseStatus === 'BUBBLE_DRAFT' &&
        (hasUserEditedRef.current || bubbleDbDirtyRef.current)
      if (shouldPersistOnExit) {
        bubbleDbDirtyRef.current = true
        void flushBubbleSnapshotSaveToDb(true)
      }
    }

    window.addEventListener('beforeunload', handlePageExit)
    window.addEventListener('pagehide', handlePageExit)
    return () => {
      window.removeEventListener('beforeunload', handlePageExit)
      window.removeEventListener('pagehide', handlePageExit)
    }
  }, [flushBubbleSnapshotSaveToDb, flushOpenWorkspaceSnapshotTransaction, flushPendingLocalBubbleChange, projectId, workspacePhaseStatus])

  useEffect(() => {
    if (workspaceEditTransactionDepthRef.current <= 0) return
    const timerId = window.setTimeout(() => {
      if (workspaceEditTransactionDepthRef.current <= 0) return
      if (Date.now() - lastWorkspaceSnapshotTransactionAtRef.current < 1200) return
      flushOpenWorkspaceSnapshotTransaction()
    }, 1500)
    return () => window.clearTimeout(timerId)
  }, [flushOpenWorkspaceSnapshotTransaction, saveStatus, workspaceSnapshotCommitVersion])

  useEffect(() => {
    markLocalBubbleSnapshotChangedRef.current = markLocalBubbleSnapshotChanged
  }, [markLocalBubbleSnapshotChanged])

  useEffect(() => {
    return () => {
      if (bubbleDbSaveTimerRef.current !== null) {
        window.clearTimeout(bubbleDbSaveTimerRef.current)
        bubbleDbSaveTimerRef.current = null
      }
      if (localBubbleChangeFlushRafRef.current !== null) {
        window.cancelAnimationFrame(localBubbleChangeFlushRafRef.current)
        localBubbleChangeFlushRafRef.current = null
      }
      pendingLocalBubbleChangeTaskRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      // 프로젝트 전환/언마운트 시점 상태를 기록해 유실 원인 추적에 사용한다.
      logBubbleDebug('cleanup:fired', {
        projectId,
        hasUserEdited: hasUserEditedRef.current,
        willSave: hasUserEditedRef.current,
        floorSummary: summarizeBubbleSnapshotForDebug(latestBubbleSnapshotRef.current),
      })

      // 사용자가 편집하지 않은 경우(bootstrap 진행 중이거나 React StrictMode 이중 실행 등)
      // 초기 상태로 local draft와 DB를 덮어써 기존 드래프트 데이터가 손실되는 것을 방지한다.
      if (!hasUserEditedRef.current) return

      flushPendingLocalBubbleChange()
      const latestBubbleSnapshot = latestBubbleSnapshotRef.current
      writeBubbleLocalDraftToStorage(projectId, latestBubbleSnapshot)

      if (!projectId || workspacePhaseStatus !== 'BUBBLE_DRAFT') return

      bubbleDbDirtyRef.current = true
      void flushBubbleSnapshotSaveToDb(true)

      const latestSnapshot = latestDraftSnapshotRef.current
      const publishSnapshot: WorkspaceSnapshot = {
        ...latestSnapshot,
        phaseStatus: 'BUBBLE_DRAFT',
        zones: [],
        floorLayers: [],
        activeFloorLayerId: null,
        isFloorPlanGenerated: false,
        floorPlanLayoutSource: null,
        floorWalls: [],
        floorOpenings: [],
        hiddenAutoWallIds: [],
        hiddenAutoOpeningIds: [],
        isProjectStructurePreferred: false,
        ifcElementChanges: [],
      }
      void workspaceRealtimeService.publishSnapshot({
        projectId,
        snapshot: publishSnapshot,
        baseIndex: resolveServerHistoryBaseIndex(publishSnapshot),
      }).catch(() => {
        // 화면 이탈 시점 best-effort sync이므로 실패는 조용히 무시한다.
      })
    }
  }, [flushBubbleSnapshotSaveToDb, flushPendingLocalBubbleChange, projectId, resolveServerHistoryBaseIndex, workspacePhaseStatus])

  const updateFloorWallFromEditable = useCallback((wallId: string, updater: (wall: FloorWall) => FloorWall) => {
    setFloorWalls((prev) => {
      const ensured = prev.some((wall) => wall.id === wallId)
        ? prev
        : (() => {
          const autoWall = visibleAutoFloorWalls.find((wall) => wall.id === wallId)
          return autoWall
            ? [...prev, { ...autoWall, floorLayerId: autoWall.floorLayerId ?? activeFloorLayerId ?? undefined }]
            : prev
        })()
      return ensured.map((wall) => (wall.id === wallId ? updater(wall) : wall))
    })
  }, [activeFloorLayerId, visibleAutoFloorWalls])

  const ensureFloorWallInManual = useCallback((wallId: string) => {
    setFloorWalls((prev) => {
      if (prev.some((wall) => wall.id === wallId)) return prev
      const autoWall = visibleAutoFloorWalls.find((wall) => wall.id === wallId)
      return autoWall
        ? [...prev, { ...autoWall, floorLayerId: autoWall.floorLayerId ?? activeFloorLayerId ?? undefined }]
        : prev
    })
  }, [activeFloorLayerId, visibleAutoFloorWalls])

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
      const matchedBubbleForDebug = bubbles.find((bubble) => bubble.id === selectedId)
      const matchedRoomForDebug = floorRooms.find((room) => room.bubbleId === selectedId)
      const selectedBubbleFloor = normalizeBubbleFloor(matchedBubbleForDebug?.floor ?? resolvedActiveBubbleFloor)
      if (mode === '2d' && selectedId) {
        const matchedRoom = matchedRoomForDebug
        if (matchedRoom) {
          return {
            id: matchedRoom.bubbleId,
            floor: selectedBubbleFloor,
            label: matchedRoom.label,
            type: matchedRoom.type,
            widthMm: matchedRoom.widthMm,
            heightMm: matchedRoom.heightMm,
            ratio: matchedRoom.area,
            color: matchedRoom.color,
            material: undefined,
          }
        }
        return null
      }
      const matchedBubble = matchedBubbleForDebug
      if (matchedBubble) {
        return mode === '2d' ? { ...matchedBubble, material: undefined } : matchedBubble
      }
      if (!selectedId) return null
      const matchedRoom = matchedRoomForDebug
      if (!matchedRoom) return null
      return {
        id: matchedRoom.bubbleId,
        floor: selectedBubbleFloor,
        label: matchedRoom.label,
        type: matchedRoom.type,
        widthMm: matchedRoom.widthMm,
        heightMm: matchedRoom.heightMm,
        ratio: matchedRoom.area,
        color: matchedRoom.color,
        material: mode === '2d' ? undefined : matchedRoom.material,
      }
    },
    [bubbles, floorRooms, mode, resolvedActiveBubbleFloor, selectedId],
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
    if (isTwoDOrThreeDConverting) return false
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
      // 3D 삭제 가능 여부는 실제 3D 선택 상태(selectedIfcElement)만 기준으로 판단한다.
      // selectedIds는 버블 모드 선택 잔존값일 수 있어 삭제 버튼 동작을 왜곡할 수 있다.
      return Boolean(selectedIfcElement)
    }
    return false
  }, [
    isTwoDOrThreeDConverting,
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
    fixedScaleSitePoints,
    sitePlanPoints,
    layoutBoundaryInput,
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
    sitePolygonRing: workspaceSiteBoundary.polygonRing,
    siteAreaM2: workspaceSiteBoundary.areaM2,
    sitePolygonQueryEnabled: false,
    setSaveStatus,
  })
  const bubbleSitePoints = fixedScaleSitePoints
  const sharedSitePlanPoints = bubbles.length > 0 ? bubbleSitePoints : sitePlanPoints

  const zoomFitPoints = useMemo(() => {
    if (bubbles.length > 0) return bubbleSitePoints

    if (floorRooms.length > 0) {
      return floorRooms.flatMap((room) => {
        if (room.polygon && room.polygon.length >= 3) {
          return room.polygon.flatMap((point) => [point.x, point.y])
        }
        return [
          room.x,
          room.y,
          room.x + room.width,
          room.y,
          room.x + room.width,
          room.y + room.height,
          room.x,
          room.y + room.height,
        ]
      })
    }

    return sharedSitePlanPoints
  }, [bubbles.length, bubbleSitePoints, floorRooms, sharedSitePlanPoints])

  const {
    zoom: currentZoom,
    canvasZoom,
    handleWheelZoom,
    handleZoomIn,
    handleZoomOut,
    handleZoomChange,
  } = useEditorZoom({
    sitePlanPoints: zoomFitPoints,
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

  // 3D 생성 모달
  const [isGenerate3DModalOpen, setIsGenerate3DModalOpen] = useState(false)
  const [localFloorData, setLocalFloorData] = useState<FloorPlan3DData | null>(null)

  // ── 핸들러 ────────────────────────────────────────────────────────────────

  /** 편집 모드 전환 — 협업 모드·라이브러리는 모드 이탈 시 닫힘 */
  const setMode = useCallback((nextMode: EditorMode) => {
    setSearchParams({ mode: nextMode })
    if (nextMode === '3d' && mode !== '3d' && !currentIfcUrl) setIsGenerate3DModalOpen(true)
    if (nextMode !== mode) resetToolSelection()
    if (nextMode === 'view' || nextMode === 'bubble' || (!isEditorReadOnly && nextMode !== '2d')) {
      setIsCollaborationMode(false)
    }
    if (nextMode === 'view' || nextMode === 'bubble') setIsAgentPanelMode(false)
    if (nextMode !== '3d') setSelectedIfcElement(null)
    setIsLibraryOpen(false)
  }, [currentIfcUrl, isEditorReadOnly, mode, resetToolSelection, setIsGenerate3DModalOpen, setSearchParams])

  const handleOpenProjectFromCommentToast = useCallback((targetProjectId: string, pinId?: string) => {
    const pinQuery = pinId ? `&pinId=${encodeURIComponent(pinId)}` : ''
    if (targetProjectId !== projectId) {
      navigate(`/projects/${targetProjectId}/editor?mode=2d${pinQuery}`)
      return
    }
    setSearchParams({ mode: '2d', ...(pinId ? { pinId } : {}) })
    setIsCollaborationMode(true)
    setIsAgentPanelMode(false)
    if (pinId) {
      setSelectedPinId(pinId)
    }
  }, [navigate, projectId, setSearchParams])

  const handleOpenAddModal = () => {
    if (isBubbleReadOnly) return
    setAddSpaceFormData(INITIAL_ADD_SPACE_FORM)
    setIsAddModalOpen(true)
  }

  const handleConfirmAddSpace = () => {
    if (isBubbleReadOnly) return
    markLocalBubbleSnapshotChanged()
    addBubble(addSpaceFormData, resolvedActiveBubbleFloor)
    setIsAddModalOpen(false)
  }

  /**
   * 현재 활성 층 기준으로 새 버블 층을 추가한다.
   * - 기본 정책: 1층부터 시작해 사용되지 않은 가장 작은 양수층을 배정한다.
   * - 지하층 허용 정책: 활성층이 지하층이면 다음 지하층을 우선 배정한다.
   */
  const handleAddBubbleFloor = useCallback(() => {
    if (isBubbleReadOnly) return
    markLocalBubbleSnapshotChanged()
    const nextFloor = getNextBubbleFloorToAdd(bubbleFloorNumbers, resolvedActiveBubbleFloor)
    setExtraBubbleFloors((prev) => (prev.includes(nextFloor) ? prev : [...prev, nextFloor]))
    setBubbleFloorNamesByNumber((prev) => (
      prev[nextFloor] ? prev : { ...prev, [nextFloor]: String(nextFloor) }
    ))
    setActiveBubbleFloor(nextFloor)
  }, [bubbleFloorNumbers, isBubbleReadOnly, markLocalBubbleSnapshotChanged, resolvedActiveBubbleFloor])

  /**
   * 층 순서를 재배치한다.
   * - 입력한 숫자는 "해당 부호 그룹 내 목표 위치"로 해석한다.
   * - 실제 버블 floor 값/추가층 목록/활성층을 같은 매핑으로 일괄 재정렬한다.
   */
  const handleRenameBubbleFloor = useCallback((floor: number, name: string) => {
    if (isBubbleReadOnly) return
    const currentFloor = normalizeBubbleFloor(floor)
    const parsedTargetFloor = readNonZeroIntegerFromUnknown(name) ?? currentFloor
    const floorMap = buildFloorRemapMapForRename(
      bubbleFloorNumbers,
      currentFloor,
      parsedTargetFloor,
    )
    if (!floorMap) return

    markLocalBubbleSnapshotChanged()

    const remapFloor = (value: number | undefined): number => {
      const normalizedValue = normalizeBubbleFloor(value)
      return floorMap.get(normalizedValue) ?? normalizedValue
    }
    const nextBubbles = bubbles.map((bubble) => ({
      ...bubble,
      floor: remapFloor(bubble.floor),
    }))
    replaceBubbles(nextBubbles)
    const floorMeta = buildBubbleFloorMetaDerivedState(
      nextBubbles,
      extraBubbleFloors.map((value) => remapFloor(value)),
    )
    setExtraBubbleFloors(floorMeta.extraFloors)
    setBubbleFloorNamesByNumber(floorMeta.namesByFloor)
    setActiveBubbleFloor(remapFloor(resolvedActiveBubbleFloor))
  }, [
    bubbleFloorNumbers,
    bubbles,
    extraBubbleFloors,
    isBubbleReadOnly,
    markLocalBubbleSnapshotChanged,
    replaceBubbles,
    resolvedActiveBubbleFloor,
  ])

  /**
   * 특정 층과 해당 층의 버블/연결선을 삭제한다.
   * 삭제 후에는 층 번호를 연속 구간으로 압축해 floor 값 일관성을 유지한다.
   */
  const handleDeleteBubbleFloor = useCallback((floor: number) => {
    const normalizedFloor = normalizeBubbleFloor(floor)
    if (bubbleFloorNumbers.length <= 1) return
    if (isBubbleReadOnly) return

    markLocalBubbleSnapshotChanged()
    const {
      floorBubbleIds,
      nextBubbles,
      remapFloor,
    } = computeBubbleStateAfterFloorDelete({
      floorToDelete: normalizedFloor,
      bubbles,
      extraBubbleFloors,
    })
    const remainingConnections = connections.filter((connection) => (
      !floorBubbleIds.has(connection.from) && !floorBubbleIds.has(connection.to)
    ))

    if (floorBubbleIds.size > 0) {
      replaceConnections(remainingConnections)
      if (
        selectedConnectionPair &&
        (floorBubbleIds.has(selectedConnectionPair.from) || floorBubbleIds.has(selectedConnectionPair.to))
      ) {
        setSelectedConnectionPair(null)
      }
      if (connectingFromId && floorBubbleIds.has(connectingFromId)) {
        setConnectingFromId(null)
      }
    }

    replaceBubbles(nextBubbles)

    const floorMeta = buildBubbleFloorMetaDerivedState(
      nextBubbles,
      extraBubbleFloors
      .filter((value) => normalizeBubbleFloor(value) !== normalizedFloor)
        .map((value) => remapFloor(value)),
    )
    setExtraBubbleFloors(floorMeta.extraFloors)
    setBubbleFloorNamesByNumber(floorMeta.namesByFloor)

    const remappedActive = remapFloor(resolvedActiveBubbleFloor)
    setActiveBubbleFloor(
      floorMeta.sortedFloors.includes(remappedActive)
        ? remappedActive
        : (floorMeta.sortedFloors[0] ?? 1),
    )
  }, [
    bubbleFloorNumbers,
    bubbles,
    connections,
    connectingFromId,
    extraBubbleFloors,
    isBubbleReadOnly,
    markLocalBubbleSnapshotChanged,
    replaceBubbles,
    replaceConnections,
    resolvedActiveBubbleFloor,
    setConnectingFromId,
    selectedConnectionPair,
  ])

  /**
   * 속성 패널에서 선택 버블의 층을 변경하고, 동일 층을 현재 활성 층으로 동기화한다.
   */
  const handleSelectedBubbleFloorChange = useCallback((id: string, floor: number) => {
    if (isBubbleReadOnly) return
    const normalizedFloor = normalizeBubbleFloor(floor)
    markLocalBubbleSnapshotChanged()
    handleBubbleFloorChange(id, normalizedFloor)
    setActiveBubbleFloor(normalizedFloor)
  }, [
    handleBubbleFloorChange,
    isBubbleReadOnly,
    markLocalBubbleSnapshotChanged,
  ])

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
    if (shouldForceCollaborationMode) {
      setIsCollaborationMode(true)
      setIsAgentPanelMode(false)
      return
    }
    setIsCollaborationMode((prev) => {
      if (!prev) {
        setSelectedPinId(null)
        setIsAgentPanelMode(false)
      }
      return !prev
    })
  }

  const handleToggleAgentPanel = () => {
    setIsAgentPanelMode((prev) => {
      const next = !prev
      if (next) {
        setIsCollaborationMode(false)
        setSelectedPinId(null)
      }
      return next
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
    if (selectedPinId === pinId) {
      setSelectedPinId(null)
      return
    }
    setSelectedPinId(pinId)
    markPinNotificationsRead(pinId)
    const targetPin = commentPins.find((pin) => pin.id === pinId)
    const lastFailureAt = readCommentFailureAtRef.current.get(pinId)
    const isReadCoolingDown = lastFailureAt ? Date.now() - lastFailureAt < 30_000 : false
    if (targetPin?.hasUnreadCommentByOtherUser && !readingCommentPinIdsRef.current.has(pinId) && !isReadCoolingDown) {
      readingCommentPinIdsRef.current.add(pinId)
      markPinCommentsRead(pinId, {
        onSettled: () => {
          readingCommentPinIdsRef.current.delete(pinId)
        },
      })
    }
  }, [commentPins, markPinCommentsRead, markPinNotificationsRead, selectedPinId])

  /** 2D 평면도 핀 생성 + 첫 댓글 작성 */
  const resolveActiveFloorPinElevationMm = useCallback(() => {
    const activeIndex = Math.max(floorLayers.findIndex((layer) => layer.id === activeFloorLayerId), 0)
    const activeLayer = floorLayers[activeIndex]
    const fallbackCeilingHeightMm = 2700
    const elevationMm = activeLayer?.elevationMm ?? activeIndex * fallbackCeilingHeightMm
    const ceilingHeightMm = activeLayer?.ceilingHeightMm ?? fallbackCeilingHeightMm
    return elevationMm + ceilingHeightMm / 2
  }, [activeFloorLayerId, floorLayers])

  const handleCreateCommentPin = useCallback((
    x: number,
    y: number,
    content?: string,
    threeDPosition?: CommentPin3DCreatePosition,
  ) => {
    if (!projectId) return
    createPinMutation.mutate({
      x,
      y,
      commentContent: content,
      floorElevationMm: resolveActiveFloorPinElevationMm(),
      threeDPosition,
    })
  }, [createPinMutation, projectId, resolveActiveFloorPinElevationMm])

  const handleAddCommentReply = useCallback((
    pinId: string,
    content: string,
  ) => {
    const normalized = content.trim()
    if (!normalized) return
    if (!projectId) return
    createPinCommentMutation.mutate({ pinId, content: normalized })
  }, [createPinCommentMutation, projectId])

  const handleResolveComment = useCallback((pinId: string, commentId: string) => {
    if (!projectId) return
    if (collaborationUserType !== 'DESIGNER') return
    resolvePinCommentMutation.mutate({ pinId, commentId })
  }, [collaborationUserType, projectId, resolvePinCommentMutation])

  const handleResolvePin = useCallback((pinId: string) => {
    if (!projectId) return
    if (collaborationUserType !== 'DESIGNER') return
    resolvePinMutation.mutate(pinId)
  }, [collaborationUserType, projectId, resolvePinMutation])

  const handleDeletePin = useCallback((pinId: string) => {
    if (!projectId) return
    deletePinMutation.mutate(pinId)
  }, [deletePinMutation, projectId])

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
    const matchedFloor = bubbles.find((bubble) => bubble.id === id)?.floor
    if (matchedFloor !== undefined) setActiveBubbleFloor(normalizeBubbleFloor(matchedFloor))
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

  const handleClearCanvasSelection = () => {
    clearSelection()
    clearConnectionAndTwoDSelection()
    setSelectedIfcElement(null)
  }

  const handleSelectIfcElement = useCallback((element: IfcElementInfo | null) => {
    setSelectedIfcElement((previous) => {
      if (
        element?.category?.toLowerCase() === 'roof' ||
        element?.ifcClass?.toLowerCase() === 'ifcroof' ||
        previous?.category?.toLowerCase() === 'roof' ||
        previous?.ifcClass?.toLowerCase() === 'ifcroof'
      ) {
        logRoofDebug('handleSelectIfcElement setState', {
          mode,
          incoming: element
            ? { id: element.id, source: element.source, roofShape: element.roofShape, name: element.name }
            : null,
          previous: previous
            ? { id: previous.id, source: previous.source, roofShape: previous.roofShape, name: previous.name }
            : null,
        })
      }
      const selectionPatch = buildIfcSelectionTransformPatch({
        mode,
        previous,
        next: element,
      })
      if (selectionPatch) {
        setIfcElementChangesById((prev) =>
          mergeIfcElementChangeByExpressId(
            prev,
            selectionPatch.expressId,
            selectionPatch.patch,
          ))
      }
      return element
    })
    if (!element) return
    clearSelection()
    clearConnectionAndTwoDSelection()
  }, [clearSelection, clearConnectionAndTwoDSelection, mode])

  const recordIfcElementChange = useCallback((element: IfcElementInfo | null, patch: Omit<IfcElementChange, 'expressId'>) => {
    if (!element || element.source !== 'ifc' || typeof element.expressId !== 'number') return
    const expressId = element.expressId
    if (shouldPublishIfcElementPatch(element, patch)) {
      workspaceCommandPublisher.updateIfcElement(element, patch)
    }
    setIfcElementChangesById((prev) =>
      mergeIfcElementChangeByExpressId(
        prev,
        expressId,
        patch,
        { globalId: element.globalId, ifcClass: element.ifcClass },
      ))
  }, [workspaceCommandPublisher])

  const handleDeleteIfcElement = useCallback((element: IfcElementInfo) => {
    workspaceCommandPublisher.deleteIfcElement(element)
    recordIfcElementChange(element, { deleted: true })
    setSelectedIfcElement((prev) => (prev?.id === element.id ? null : prev))
  }, [recordIfcElementChange, workspaceCommandPublisher])

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
  const handleEmptyCanvasDblClick = (info: EmptyCanvasDblClickInfo, floor = resolvedActiveBubbleFloor) => {
    if (isBubbleReadOnly) return
    markLocalBubbleSnapshotChanged()
    const newBubble = addBubbleAt(info.x, info.y, floor)
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
    if (!isBubbleDragTransactionActiveRef.current) {
      isBubbleDragTransactionActiveRef.current = true
      beginWorkspaceSnapshotTransaction()
    }
    handleBubbleDrag(bubbleId, x, y)
  }, [beginWorkspaceSnapshotTransaction, isBubbleReadOnly, handleBubbleDrag])

  const handleBubbleDragStartInBubble = useCallback(() => {
    if (isBubbleReadOnly) return
    if (isBubbleDragTransactionActiveRef.current) return
    isBubbleDragTransactionActiveRef.current = true
    beginWorkspaceSnapshotTransaction()
  }, [beginWorkspaceSnapshotTransaction, isBubbleReadOnly])

  const handleBubbleDragEndInBubble = useCallback(() => {
    if (isBubbleReadOnly) return
    commitBubbleDragSnapshot()
  }, [commitBubbleDragSnapshot, isBubbleReadOnly])

  const handleBubbleResizeInBubble = useCallback((id: string, x: number, y: number, width: number, height: number) => {
    if (isBubbleReadOnly) return
    beginWorkspaceSnapshotTransaction()
    handleBubbleResize(id, x, y, width, height)
    markLocalBubbleSnapshotChanged()
    commitWorkspaceSnapshotTransaction()
  }, [
    beginWorkspaceSnapshotTransaction,
    commitWorkspaceSnapshotTransaction,
    isBubbleReadOnly,
    markLocalBubbleSnapshotChanged,
    handleBubbleResize,
  ])

  /** 2D 평면도 생성 버튼 핸들러 — 로딩 애니메이션 포함 */
  const handleGenerateFloorPlan = useCallback(async (options: GenerateFloorPlanOptions = {}) => {
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
        layoutBoundaryInput,
        { spaceHeightMm: options.spaceHeightMm },
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
      pendingOpenThreeDOnGenerateCompleteRef.current = Boolean(options.openThreeDOnComplete)
      startFloorPlanGenerateTimeout()

    } catch (error: unknown) {
      pendingOpenThreeDOnGenerateCompleteRef.current = false
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
  }, [
    authUser?.user_type,
    bubbles.length,
    clearFloorPlanGenerateTimeout,
    currentProjectName,
    flushBubbleSnapshotSaveToDb,
    isCurrentProjectOwner,
    isCurrentProjectOwnerKnown,
    layoutBoundaryInput,
    projectId,
    startFloorPlanGenerateTimeout,
    workspacePhaseStatus,
  ])

  /**
   * 버블 다이어그램 기준 2D 평면도 생성 진입점
   * - 버블이 있을 때만 생성
   * - 생성 시작 직후 2D 모드로 전환해 로딩/결과를 확인할 수 있게 한다.
   */
  const handleGenerateFloorPlanFromBubble = useCallback(() => {
    if (bubbles.length === 0) return
    setSelectedTool('selection')
    setConnectingFromId(null)
    handleGenerateFloorPlan()
    setMode('2d')
  }, [bubbles.length, handleGenerateFloorPlan, setConnectingFromId, setMode, setSelectedTool])

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
  const toggleLayerOverlayMode = () => {
    setIsLayerOverlayMode((prev) => {
      const next = !prev
      if (next) {
        setOverlayLayerIds((current) => {
          const validCurrent = current.filter((layerId) => layerId !== activeFloorLayerId)
          if (validCurrent.length > 0) return validCurrent
          return floorLayers
            .map((layer) => layer.id)
            .filter((layerId) => layerId !== activeFloorLayerId)
        })
      }
      return next
    })
  }
  const handleToggleOverlayLayer = (layerId: string) => {
    if (!activeFloorLayerId || layerId === activeFloorLayerId) return
    setOverlayLayerIds((prev) =>
      prev.includes(layerId) ? prev.filter((id) => id !== layerId) : [...prev, layerId],
    )
  }
  const handleSelectSingleOverlayLayer = (layerId: string) => {
    if (!activeFloorLayerId || layerId === activeFloorLayerId) return
    setIsLayerOverlayMode(true)
    setOverlayLayerIds((prev) => (prev.length === 1 && prev[0] === layerId ? [] : [layerId]))
  }
  const handleSetOverlayLayerOpacity = (layerId: string, opacity: number) => {
    const next = Math.min(Math.max(opacity, 0.1), 1)
    setOverlayOpacityByLayerId((prev) => ({ ...prev, [layerId]: next }))
  }
  const handleAddFloorLayer = useCallback(() => {
    addFloorLayer()
    markLocalFloorPlanSnapshotChanged()
  }, [addFloorLayer, markLocalFloorPlanSnapshotChanged])
  const handleRenameFloorLayer = useCallback((layerId: string, name: string) => {
    if (!name.trim()) return
    renameFloorLayer(layerId, name)
    markLocalFloorPlanSnapshotChanged()
  }, [markLocalFloorPlanSnapshotChanged, renameFloorLayer])
  const handleDeleteFloorLayer = useCallback((layerId: string) => {
    if (floorLayers.length <= 1) return
    const deletedWallIds = new Set(floorWalls.filter((wall) => wall.floorLayerId === layerId).map((wall) => wall.id))
    deleteFloorLayer(layerId)
    setFloorWalls((prev) => prev.filter((wall) => wall.floorLayerId !== layerId))
    setFloorOpenings((prev) => prev.filter((opening) => !deletedWallIds.has(opening.wallId)))
    setSelectedFloorWallId((prev) => (prev && deletedWallIds.has(prev) ? null : prev))
    setSelectedFloorWallIds((prev) => prev.filter((wallId) => !deletedWallIds.has(wallId)))
    setSelectedFloorOpeningId((prev) => {
      if (!prev) return prev
      const opening = floorOpenings.find((item) => item.id === prev)
      return opening && deletedWallIds.has(opening.wallId) ? null : prev
    })
    setSelectedFloorOpeningIds((prev) =>
      prev.filter((openingId) => {
        const opening = floorOpenings.find((item) => item.id === openingId)
        return opening ? !deletedWallIds.has(opening.wallId) : false
      }),
    )
    setOverlayLayerIds((prev) => prev.filter((id) => id !== layerId))
    setOverlayOpacityByLayerId((prev) => {
      if (!(layerId in prev)) return prev
      const next = { ...prev }
      delete next[layerId]
      return next
    })
    markLocalFloorPlanSnapshotChanged()
  }, [deleteFloorLayer, floorLayers.length, floorOpenings, floorWalls, markLocalFloorPlanSnapshotChanged])

  const {
    handleCreateFloorWall: baseHandleCreateFloorWall,
    handleSelectFloorWall,
    handleMoveFloorWall: baseHandleMoveFloorWall,
    handleUpdateFloorWallEndpoint: baseHandleUpdateFloorWallEndpoint,
    handleDeleteFloorWall: baseHandleDeleteFloorWall,
    handleCreateFloorOpening: baseHandleCreateFloorOpening,
    handleSelectFloorOpening,
    handleMoveFloorOpening: baseHandleMoveFloorOpening,
    handleUpdateFloorOpeningSize: baseHandleUpdateFloorOpeningSize,
    handleUpdateFloorWindowSillHeight: baseHandleUpdateFloorWindowSillHeight,
    handleUpdateFloorDoorSwingDirection: baseHandleUpdateFloorDoorSwingDirection,
    handleUpdateFloorDoorHingeSide: baseHandleUpdateFloorDoorHingeSide,
    handleDeleteFloorOpening: baseHandleDeleteFloorOpening,
    handleUpdateFloorWallType: baseHandleUpdateFloorWallType,
    handleUpdateFloorWallThickness: baseHandleUpdateFloorWallThickness,
    handleUpdateFloorWallHeight: baseHandleUpdateFloorWallHeight,
    handleUpdateFloorWallMaterial: baseHandleUpdateFloorWallMaterial,
  } = useEditorStructureEditHandlers({
    floorRooms,
    floorWalls,
    activeFloorLayerId,
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
  const handleCreateFloorWall = useCallback((...args: Parameters<typeof baseHandleCreateFloorWall>) => {
    if (!canEditFloorPlan) return
    baseHandleCreateFloorWall(...args)
  }, [baseHandleCreateFloorWall, canEditFloorPlan])
  const handleMoveFloorWall = useCallback((...args: Parameters<typeof baseHandleMoveFloorWall>) => {
    if (!canEditFloorPlan) return
    baseHandleMoveFloorWall(...args)
  }, [baseHandleMoveFloorWall, canEditFloorPlan])
  const handleUpdateFloorWallEndpoint = useCallback((...args: Parameters<typeof baseHandleUpdateFloorWallEndpoint>) => {
    if (!canEditFloorPlan) return
    baseHandleUpdateFloorWallEndpoint(...args)
  }, [baseHandleUpdateFloorWallEndpoint, canEditFloorPlan])
  const handleDeleteFloorWall = useCallback((...args: Parameters<typeof baseHandleDeleteFloorWall>) => {
    if (!canEditFloorPlan) return
    baseHandleDeleteFloorWall(...args)
  }, [baseHandleDeleteFloorWall, canEditFloorPlan])
  const handleCreateFloorOpening = useCallback((...args: Parameters<typeof baseHandleCreateFloorOpening>) => {
    if (!canEditFloorPlan) return
    baseHandleCreateFloorOpening(...args)
  }, [baseHandleCreateFloorOpening, canEditFloorPlan])
  const handleMoveFloorOpening = useCallback((...args: Parameters<typeof baseHandleMoveFloorOpening>) => {
    if (!canEditFloorPlan) return
    baseHandleMoveFloorOpening(...args)
  }, [baseHandleMoveFloorOpening, canEditFloorPlan])
  const handleUpdateFloorOpeningSize = useCallback((...args: Parameters<typeof baseHandleUpdateFloorOpeningSize>) => {
    if (!canEditFloorPlan) return
    baseHandleUpdateFloorOpeningSize(...args)
  }, [baseHandleUpdateFloorOpeningSize, canEditFloorPlan])
  const handleUpdateFloorWindowSillHeight = useCallback((...args: Parameters<typeof baseHandleUpdateFloorWindowSillHeight>) => {
    if (!canEditFloorPlan) return
    baseHandleUpdateFloorWindowSillHeight(...args)
  }, [baseHandleUpdateFloorWindowSillHeight, canEditFloorPlan])
  const handleUpdateFloorDoorSwingDirection = useCallback((...args: Parameters<typeof baseHandleUpdateFloorDoorSwingDirection>) => {
    if (!canEditFloorPlan) return
    baseHandleUpdateFloorDoorSwingDirection(...args)
  }, [baseHandleUpdateFloorDoorSwingDirection, canEditFloorPlan])
  const handleUpdateFloorDoorHingeSide = useCallback((...args: Parameters<typeof baseHandleUpdateFloorDoorHingeSide>) => {
    if (!canEditFloorPlan) return
    baseHandleUpdateFloorDoorHingeSide(...args)
  }, [baseHandleUpdateFloorDoorHingeSide, canEditFloorPlan])
  const handleDeleteFloorOpening = useCallback((...args: Parameters<typeof baseHandleDeleteFloorOpening>) => {
    if (!canEditFloorPlan) return
    baseHandleDeleteFloorOpening(...args)
  }, [baseHandleDeleteFloorOpening, canEditFloorPlan])
  const handleUpdateFloorWallType = useCallback((...args: Parameters<typeof baseHandleUpdateFloorWallType>) => {
    if (!canEditFloorPlan) return
    baseHandleUpdateFloorWallType(...args)
  }, [baseHandleUpdateFloorWallType, canEditFloorPlan])
  const handleUpdateFloorWallThickness = useCallback((...args: Parameters<typeof baseHandleUpdateFloorWallThickness>) => {
    if (!canEditFloorPlan) return
    baseHandleUpdateFloorWallThickness(...args)
  }, [baseHandleUpdateFloorWallThickness, canEditFloorPlan])
  const handleUpdateFloorWallHeight = useCallback((...args: Parameters<typeof baseHandleUpdateFloorWallHeight>) => {
    if (!canEditFloorPlan) return
    baseHandleUpdateFloorWallHeight(...args)
  }, [baseHandleUpdateFloorWallHeight, canEditFloorPlan])
  const handleUpdateFloorWallMaterial = useCallback((...args: Parameters<typeof baseHandleUpdateFloorWallMaterial>) => {
    if (!canEditFloorPlan) return
    baseHandleUpdateFloorWallMaterial(...args)
  }, [baseHandleUpdateFloorWallMaterial, canEditFloorPlan])

  const handleResizeFloorRoom = (bubbleId: string, x: number, y: number, width: number, height: number) => {
    if (!canEditFloorPlan || isWallFirstEditing) return
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
    markLocalFloorPlanSnapshotChanged()

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
    if (!canEditFloorPlan || isWallFirstEditing) return
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
    markLocalFloorPlanSnapshotChanged()
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
    if (!canEditFloorPlan || isWallFirstEditing) return
    setIsFloorPlanEditedIn2D(true)
    promoteCurrentAutoFloorOpenings()
    if (!isFinitePolygonPoints(polygon)) return
    const currentRoom = floorRooms.find((room) => room.bubbleId === bubbleId)
    if (!currentRoom) return
    markLocalFloorPlanSnapshotChanged()

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
    canEditFloorPlan,
    isWallFirstEditing,
    setIsFloorPlanEditedIn2D,
    markLocalFloorPlanSnapshotChanged,
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
  }, [clearSelection, clearConnectionAndTwoDSelection, setConnectingFromId])

  const handleUndo = useCallback(() => {
    if (!projectId) return
    if (mode === 'bubble') {
      if (!canUndo) return
      if (saveStatus === 'dirty' && !hasBubbleUndoHistory) {
        undoUnsyncedLocalBubbleChange()
        return
      }
      try {
        publishBubbleUndoRequest(projectId, { baseIndex: bubbleHistoryBaseIndexRef.current })
      } catch (error: unknown) {
        console.warn('[editor] Bubble undo publish failed.', { projectId, error })
      }
      return
    }

    if (!isFloorPlanHistoryMode || !canUndo) return
    if (floorPlanHistoryCommandInFlightRef.current) return
    try {
      floorPlanHistoryCommandInFlightRef.current = true
      setSaveStatus('syncing')
      publishFloorPlanUndoRequest(projectId, { baseIndex: floorPlanHistoryBaseIndexRef.current })
    } catch (error: unknown) {
      floorPlanHistoryCommandInFlightRef.current = false
      setSaveStatus('synced')
      console.warn('[editor] Floor-plan undo publish failed.', { projectId, error })
    }
  }, [
    canUndo,
    hasBubbleUndoHistory,
    isFloorPlanHistoryMode,
    mode,
    projectId,
    saveStatus,
    undoUnsyncedLocalBubbleChange,
  ])

  const handleRedo = useCallback(() => {
    if (!projectId) return
    if (mode === 'bubble') {
      if (!canRedo) return
      try {
        publishBubbleRedoRequest(projectId, { baseIndex: bubbleHistoryBaseIndexRef.current })
      } catch (error: unknown) {
        console.warn('[editor] Bubble redo publish failed.', { projectId, error })
      }
      return
    }

    if (!isFloorPlanHistoryMode || !canRedo) return
    if (floorPlanHistoryCommandInFlightRef.current) return
    try {
      floorPlanHistoryCommandInFlightRef.current = true
      setSaveStatus('syncing')
      publishFloorPlanRedoRequest(projectId, { baseIndex: floorPlanHistoryBaseIndexRef.current })
    } catch (error: unknown) {
      floorPlanHistoryCommandInFlightRef.current = false
      setSaveStatus('synced')
      console.warn('[editor] Floor-plan redo publish failed.', { projectId, error })
    }
  }, [canRedo, isFloorPlanHistoryMode, mode, projectId])

  /** 표준 FloorProject를 버블/2D/3D 공통 상태로 반영
   *  walls/openings 필드가 있으면(IFC 경로) 직접 매핑, 없으면 빈 배열 → autoWalls/autoOpenings 폴백
   */
  const applyFloorProject = useCallback((project: FloorProject) => {
    setIsFloorPlanEditedIn2D(false)
    const referenceBubbles = latestBubbleSnapshotRef.current.bubbles
    const bubbleIds = new Set(referenceBubbles.map((bubble) => bubble.id))
    const isBubbleGeneratedProject =
      project.rooms.length > 0 &&
      referenceBubbles.length > 0 &&
      (project.rooms.every((room) => bubbleIds.has(room.id)) || project.rooms.length <= referenceBubbles.length)
    const stageOptions = {
      width: stageSize.width,
      height: stageSize.height,
      ...(isBubbleGeneratedProject ? { scaleMode: 'canvas' as const, referenceBubbles } : {}),
    }
    const mappedWalls = mapFloorProjectToWalls(project, stageOptions)
    const mappedOpenings = mapFloorProjectToOpenings(project)
    setIsProjectStructurePreferred(mappedWalls.length > 0 || mappedOpenings.length > 0)
    // IFC 원좌표/회전 정보를 유지하기 위해 버블 재배치 경로(syncFloorPlanFromBubbles)를 타지 않는다.
    setFloorPlanFromProject(
      project,
      stageSize.width,
      stageSize.height,
      isBubbleGeneratedProject ? { scaleMode: 'canvas', referenceBubbles } : undefined,
    )
    setFloorWalls(mappedWalls)
    setHiddenAutoWallIds([])
    setFloorOpenings(mappedOpenings)
    setHiddenAutoOpeningIds([])
    resetInteractionSelection()
  }, [
    stageSize.width,
    stageSize.height,
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

  const handleOutputIfcStorageUrl = useCallback(async (
    ifcStorageUrl: string,
    action: string | null,
    assetId?: string | null,
    revisionId?: string | null,
  ) => {
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
      // 2D 파싱 완료 후 3D 캔버스로 presigned URL과 assetId 전달
      setIfcSourceByProjectId((prev) => ({
        ...prev,
        [projectId]: {
          url: presignedUrl,
          assetId: assetId ?? null,
        },
      }))
      if (revisionId !== undefined) {
        setIfcRevisionByProjectId((prev) => ({
          ...prev,
          [projectId]: revisionId ?? null,
        }))
      }
      // IFC가 정상 로드되면 완료 action 문자열과 무관하게 편집 상태로 복귀해 무한 로딩을 방지한다.
      const shouldSuppressGeneratedFloorPlanAutosave = action === 'FLOOR_PLAN_GENERATE_COMPLETED'
      if (shouldSuppressGeneratedFloorPlanAutosave) {
        suppressGeneratedFloorPlanAutosaveRef.current = true
        pendingServerPublishRef.current = null
        awaitingServerSyncRef.current = null
        clearServerPublishRetry()
        hasUserEditedRef.current = false
      }
      await loadIfcFromStorageUrl(presignedUrl, { webIfcWasmPath: '/wasm/' })
      lastLoadedIfcStorageUrlRef.current = dedupeKey
      setWorkspacePhaseStatus('IFC_EDIT')
      if (action && IFC_COMPLETED_ACTION_SET.has(action)) {
        clearFloorPlanGenerateTimeout()
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
  }, [clearFloorPlanGenerateTimeout, clearServerPublishRetry, loadIfcFromStorageUrl, projectId, setFloorPlanGenerateStatusText])

  useEffect(() => {
    handleIfcSyncMessageRef.current = (
      url: string,
      action: string | null,
      assetId?: string | null,
      revisionId?: string | null,
    ) => {
      void handleOutputIfcStorageUrl(url, action, assetId, revisionId)
    }
  }, [handleOutputIfcStorageUrl])

  // 에디터 첫 진입 시 프로젝트 IFC 소스를 1회 조회해 handleOutputIfcStorageUrl로 로드한다.
  useInitialIfcImport({
    projectId,
    hasIfcUploaded: hasIfcUploadedInCurrentProject,
    stageWidth: stageSize.width,
    stageHeight: stageSize.height,
    onResolvedIfcUrl: (url, assetId, revisionId) => {
      handleIfcSyncMessageRef.current(url, null, assetId, revisionId)
    },
    attemptedInitialIfcImportProjectIdRef,
  })

  const handleLlmIfcResult = useCallback((ifcStorageUrl: string, assetId: string | null, revisionId: string | null) => {
    clearImportMessage()
    handleIfcSyncMessageRef.current(ifcStorageUrl, 'IFC_EDIT_COMPLETED', assetId, revisionId)
  }, [clearImportMessage])

  /** AI 어시스턴트 편집 상태 */
  const llmEdit = useLlmEdit({
    projectId: projectId ?? null,
    mode,
    currentIfcRevisionId,
    currentIfcUrl,
    bubbles,
    connections,
    floorLayers,
    activeFloorLayerId,
    floorWalls: floorWalls.length > 0 ? floorWalls : autoFloorWalls,
    floorOpenings: mergedFloorOpenings,
    onIfcResult: handleLlmIfcResult,
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
    isTwoDEditingLocked,
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
    handlePositionChangeForPanel,
    handleRotationChangeForPanel,
    handleRoofShapeChangeForPanel,
  } = useThreeDIfcAttributeHandlers({
    mode,
    canEditThreeDAttributes: !isThreeDEditingLocked,
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
  }, [currentIfcUrl, setIsGenerate3DModalOpen, setMode])

  /** 3D 생성 모달 닫기 */
  const handleCloseGenerate3DModal = useCallback(() => {
    setIsGenerate3DModalOpen(false)
  }, [setIsGenerate3DModalOpen])

  /**
   * 층고 확정 후 현재 평면도 데이터를 스냅샷으로 저장하고 3D 모드로 전환한다.
   * IFC URL이 있으면 IFC 기반 렌더링을 사용하므로 localFloorData를 설정하지 않는다.
   */
  const handleConfirmGenerate3D = useCallback((storyHeightMm: number) => {
    setIsGenerate3DModalOpen(false)
    setLocalFloorData(null)
    if (currentIfcUrl) {
      setMode('3d')
      return
    }
    void handleGenerateFloorPlan({
      openThreeDOnComplete: true,
      spaceHeightMm: storyHeightMm,
    })
  }, [currentIfcUrl, handleGenerateFloorPlan, setIsGenerate3DModalOpen, setLocalFloorData, setMode])

  const handleAutoLayoutBubbles = useCallback(() => {
    if (mode !== 'bubble') return
    if (isBubbleReadOnly) return
    if (bubbles.length < 2) return

    markLocalBubbleSnapshotChanged()
    const floorByBubbleId = new Map(bubbles.map((bubble) => [bubble.id, normalizeBubbleFloor(bubble.floor)] as const))
    const nextById = new Map<string, BubbleData>()
    bubbleFloorNumbers.forEach((floor) => {
      const floorBubbles = bubbles.filter((bubble) => normalizeBubbleFloor(bubble.floor) === floor)
      const floorBubbleIdSet = new Set(floorBubbles.map((bubble) => bubble.id))
      const floorConnections = connections.filter((connection) =>
        floorBubbleIdSet.has(connection.from) && floorBubbleIdSet.has(connection.to))
      const laidOut = runForceDirectedBubbleLayout({
        bubbles: floorBubbles,
        connections: floorConnections,
        sitePoints: bubbleSitePoints,
      })
      laidOut.forEach((bubble) => {
        const normalizedFloor = floorByBubbleId.get(bubble.id) ?? floor
        nextById.set(bubble.id, { ...bubble, floor: normalizedFloor })
      })
    })
    const nextBubbles = bubbles.map((bubble) => nextById.get(bubble.id) ?? bubble)
    replaceBubbles(nextBubbles)
  }, [
    mode,
    isBubbleReadOnly,
    bubbles,
    connections,
    bubbleSitePoints,
    bubbleFloorNumbers,
    replaceBubbles,
    markLocalBubbleSnapshotChanged,
  ])

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
    sitePoints: bubbleSitePoints,
    sitePlanPoints: sharedSitePlanPoints,
    siteAreaM2,
    siteAreaPyeong,
    bubbleFloors,
    bubbleFloorSummaries,
    bubbleFloorNumbers,
    activeBubbleFloor: resolvedActiveBubbleFloor,
    setActiveBubbleFloor,
    handleAddBubbleFloor,
    handleRenameBubbleFloor,
    handleDeleteBubbleFloor,
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
    handleDeleteIfcElement,
    handleBubbleDrag: handleBubbleDragInBubble,
    handleBubbleDragStart: handleBubbleDragStartInBubble,
    handleBubbleDragEnd: handleBubbleDragEndInBubble,
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
    handlePositionChange: handlePositionChangeForPanel,
    handleRotationChange: handleRotationChangeForPanel,
    handleRoofShapeChange: handleRoofShapeChangeForPanel,
    handleWidthCommit: handleWidthCommitForPanel,
    handleHeightCommit: handleHeightCommitForPanel,
    handleRatioChange: handleRatioChangeForPanel,
    handleSelectedBubbleFloorChange,
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
    isCollaborationMode: effectiveIsCollaborationMode,
    isAgentPanelMode,
    selectedPinId,
    setSelectedPinId,
    selectedCommentPin,
    commentPins,
    commentNotifications,
    currentCollaborationUserType: collaborationUserType,
    currentCollaborationUserId: authUser?.id ?? null,
    currentCollaborationUserName: currentUserName,
    handleToggleCollaboration,
    handleToggleAgentPanel,
    handlePinClick,
    handleCreateCommentPin,
    handleAddCommentReply,
    handleResolvePin,
    handleDeletePin,
    handleResolveComment,
    resolvingPinId: resolvePinMutation.isPending
      ? (resolvePinMutation.variables ?? null)
      : null,
    deletingPinId: deletePinMutation.isPending
      ? (deletePinMutation.variables ?? null)
      : null,
    resolvingCommentId: resolvePinCommentMutation.isPending
      ? (resolvePinCommentMutation.variables?.commentId ?? null)
      : null,
    projectCommentToast: projectCommentRealtime.toast,
    onCloseProjectCommentToast: projectCommentRealtime.dismissToast,
    onOpenProjectFromCommentToast: handleOpenProjectFromCommentToast,
    // 줌
    zoom: currentZoom,
    canvasZoom,
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
    floorWallsForHierarchy: activeLayerVisibleFloorWalls,
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
    addFloorLayer: handleAddFloorLayer,
    renameFloorLayer: handleRenameFloorLayer,
    deleteFloorLayer: handleDeleteFloorLayer,
    setActiveFloorLayerId,
    toggleLayerOverlayMode,
    handleToggleOverlayLayer,
    handleSelectSingleOverlayLayer,
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
    isThreeDEditingLocked,
    isDeleteActionLocked: isTwoDOrThreeDConverting,
    setSelectedTool,
    handleSetSelectedTool,
    wallCreatePreset,
    handleManualSave,
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
    beginWorkspaceSnapshotTransaction,
    commitWorkspaceSnapshotTransaction,
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
    llmActiveJobId: llmEdit.activeJobId,
    llmJobProgress: llmEdit.jobProgress,
    llmChatLogs: llmEdit.chatLogs,
    llmIsChatLogsLoading: llmEdit.isChatLogsLoading,
    runLlmEdit: llmEdit.run,
    applyLlmEdit: llmEdit.apply,
    discardLlmEdit: llmEdit.discard,
  }
}

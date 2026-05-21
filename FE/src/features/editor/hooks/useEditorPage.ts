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
  SceneUpdateEvent,
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
import { toRectFloorRoom, translateFloorRoom } from '../utils/floorRoomTransform'
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
import { useEditorProjectName } from './useEditorProjectName'
import { useInitialIfcImport } from './useInitialIfcImport'
import { useEditorUserContext } from './useEditorUserContext'
import { useFloorPlanGenerateTimeout } from './useFloorPlanGenerateTimeout'
import { useThreeDIfcAttributeHandlers } from './useThreeDIfcAttributeHandlers'
import { useEditorToolState } from './useEditorToolState'
import { useFloorWallToolState } from './useFloorWallToolState'
import { useEditorViewportInsets } from './useEditorViewportInsets'
import { runForceDirectedBubbleLayout } from '../utils/forceBubbleLayout'
import { useBubbleSnapshotRealtime } from './useBubbleSnapshotRealtime'
import { useIfcLoadingLayer } from './useIfcLoadingLayer'
import { useBubbleDbSaveController } from './useBubbleDbSaveController'
import { useWorkspaceHistorySyncController } from './useWorkspaceHistorySyncController'
import { useWorkspaceRemoteSnapshotHandlers } from './useWorkspaceRemoteSnapshotHandlers'
import type { FloorPlan3DData } from '../utils/floorPlanTo3D'
import type { IfcStoreyInfo } from '../components/canvas/thatopen/ifcPropertyParser'
import type { ThreeDLibraryPreset } from '../components/canvas/threeDLibrary.types'
import {
  buildFloorPlanLayoutImportPayload,
  collectConnectedRoomIds,
  collectAutoDoorOpeningIdsFromWallIds,
  getPolygonAreaPx,
  getPolygonBounds,
  isFinitePolygonPoints,
  isSameConnection,
  mergeSelectedIds,
  resolveEditorMode,
  toFloorRoomFromBubble,
  upsertFloorRoomByBubbleId,
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
  WORKSPACE_SYNC_ACTION,
  isBubbleSnapshotPayload,
  type BubbleSnapshotPayload,
  type FloorPlanSnapshotPayload,
} from '../utils/workspaceSyncMessage'
import { isToolAllowedDuringConverting, isTwoDOrThreeDConverting as isTwoDOrThreeDConvertingByPhase } from '../utils/editorModeLocks'
import { isExpiredPresignedIfcUrl, normalizeIfcSourceDedupeKey, resolveIfcPresignedUrl } from '../utils/ifcSource'
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
import {
  buildElementHierarchyTree,
  buildElementRegistry,
  findRegistryElement,
  resolveRegistryElementSelectionTarget,
} from '../utils/editorElementRegistry'
import {
  applyIfcStoreyNameOverrides,
  normalizeIfcStoreyNameOverrides,
  resolveLibraryElementFloorLayerId,
} from '../utils/editorFloorLayerResolution'
import { createSceneUpdateEventBus } from '../utils/sceneUpdateEventBus'
import { resolveWorkspaceSiteAreaM2 } from '../utils/numberUtils'
import { extractOuterRingFromCoordinates } from '@/features/project/utils/sitePolygon'
import { getRuntimeEnvString } from '@/shared/lib/runtimeEnv'
import type { WorkspaceCommand } from '../types/workspaceCommand.types'
import { useWorkspaceCoordinateFramePolicy } from './useWorkspaceCoordinateFramePolicy'
import {
  logEditor3dUndoDebug,
  summarizeWorkspaceCommandFor3dUndo,
} from '../utils/editor3dUndoDebug'

interface PendingServerPublishRecord {
  projectId: string
  baseIndex: number
  snapshot: WorkspaceSnapshot
  serializedSnapshot: string
  revisionId?: string | null
  sceneType?: FloorPlanSceneType
  workspaceCommand?: WorkspaceCommand | null
  unsavedDbChangeVersion?: number
}

interface AwaitingServerSyncRecord {
  projectId: string
  serializedSnapshot: string
  historyDomain: 'bubble' | 'floorPlan'
  baseIndex: number
  startedAt: number
  unsavedDbChangeVersion?: number
}

const summarizeAwaitingServerSyncFor3dUndo = (
  record: AwaitingServerSyncRecord | null,
): Record<string, unknown> | null => {
  if (!record) return null
  return {
    projectId: record.projectId,
    historyDomain: record.historyDomain,
    baseIndex: record.baseIndex,
    ageMs: Date.now() - record.startedAt,
    hasUnsavedDbChangeVersion: record.unsavedDbChangeVersion !== undefined,
  }
}

const summarizePendingServerPublishFor3dUndo = (
  record: PendingServerPublishRecord | null,
): Record<string, unknown> | null => {
  if (!record) return null
  return {
    projectId: record.projectId,
    baseIndex: record.baseIndex,
    revisionId: record.revisionId ?? null,
    sceneType: record.sceneType ?? null,
    hasWorkspaceCommand: Boolean(record.workspaceCommand),
    workspaceCommand: summarizeWorkspaceCommandFor3dUndo(record.workspaceCommand),
    hasUnsavedDbChangeVersion: record.unsavedDbChangeVersion !== undefined,
  }
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
const IFC_SOURCE_CACHE_KEY_PREFIX = 'batang:editor:ifc-source:'
const PRESIGNED_IFC_CACHE_TTL_MS = 4 * 60 * 1000
const IFC_EDIT_COMMAND_DLQ_CODE = 'IFC_EDIT_COMMAND_DLQ'
const UUID_LIKE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const IFC_GLOBAL_ID_PATTERN = /^[0-9A-Za-z_$]{22}$/
const ROOM_PERIMETER_WALL_TOLERANCE_PX = 12
interface CachedIfcSource {
  url: string
  storageUrl: string | null
  assetId: string | null
  revisionId: string | null
  savedAt: number
}

interface FloorRoomMoveSession {
  key: string
  baselineRoomsByBubbleId: Map<string, FloorRoom>
  affectedElementGlobalIds: string[]
}

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

const logRoofDebug = (..._args: unknown[]) => {}

const toIfcGlobalId = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim()
  if (!trimmed) return null
  if (IFC_GLOBAL_ID_PATTERN.test(trimmed)) return trimmed
  const candidate = trimmed.split('-floor-')[0]
  return IFC_GLOBAL_ID_PATTERN.test(candidate) ? candidate : null
}

const resolveFloorRoomGlobalId = (room: FloorRoom): string | null =>
  toIfcGlobalId(room.globalId) ?? toIfcGlobalId(room.id)

const resolveFloorWallGlobalId = (wall: FloorWall): string | null =>
  toIfcGlobalId(wall.globalId) ?? toIfcGlobalId(wall.id)

const resolveIfcElementGlobalId = (element: IfcElementInfo): string | null => {
  const propertyGlobalId = element.properties?.GlobalId
  return toIfcGlobalId(element.globalId) ??
    (typeof propertyGlobalId === 'string' ? toIfcGlobalId(propertyGlobalId) : null) ??
    toIfcGlobalId(element.id)
}

const isIfcSpaceElement = (element: IfcElementInfo): boolean =>
  element.ifcClass.toLowerCase() === 'ifcspace' ||
  element.category.toLowerCase() === 'space'

const isIfcWallElement = (element: IfcElementInfo): boolean => {
  const ifcClass = element.ifcClass.toLowerCase()
  return ifcClass === 'ifcwall' ||
    ifcClass === 'ifcwallstandardcase' ||
    element.category.toLowerCase() === 'wall'
}

const isIfcOpeningElement = (element: IfcElementInfo): boolean => {
  const ifcClass = element.ifcClass.toLowerCase()
  const category = element.category.toLowerCase()
  return ifcClass === 'ifcdoor' ||
    ifcClass === 'ifcwindow' ||
    ifcClass === 'ifcopeningelement' ||
    category === 'door' ||
    category === 'window' ||
    category === 'opening'
}

const addElementCandidateId = (
  ids: Set<string>,
  value: string | number | boolean | null | undefined,
) => {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed) ids.add(trimmed)
    return
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    ids.add(String(value))
  }
}

const buildIfcElementCandidateIds = (element: IfcElementInfo): Set<string> => {
  const ids = new Set<string>()
  addElementCandidateId(ids, resolveIfcElementGlobalId(element))
  addElementCandidateId(ids, element.globalId)
  addElementCandidateId(ids, element.id)
  addElementCandidateId(ids, element.expressId)
  addElementCandidateId(ids, element.properties?.GlobalId)
  addElementCandidateId(ids, element.properties?.LocalID)
  addElementCandidateId(ids, element.properties?.RoomId)
  addElementCandidateId(ids, element.properties?.BubbleId)
  addElementCandidateId(ids, element.properties?.WallId)
  addElementCandidateId(ids, element.properties?.OpeningId)
  addElementCandidateId(ids, element.properties?.HostWallGlobalId)
  return ids
}

const hasCandidateId = (
  ids: Set<string>,
  ...values: Array<string | number | null | undefined>
): boolean =>
  values.some((value) => {
    if (typeof value === 'string') return ids.has(value.trim())
    if (typeof value === 'number' && Number.isFinite(value)) return ids.has(String(value))
    return false
  })

const toFiniteTranslationMm = (
  translation: IfcElementChange['translationMm'] | undefined,
): { x: number; y: number; z: number } | null => {
  if (!translation) return null
  const { x, y, z } = translation
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
    ? { x, y, z }
    : null
}

const getRoomAxisMmPerPx = (room: FloorRoom, axis: 'x' | 'y'): number => {
  const px = axis === 'x' ? room.width : room.height
  const mm = axis === 'x' ? room.widthMm : room.heightMm
  return Number.isFinite(px) && px > 0 && Number.isFinite(mm) && mm > 0
    ? mm / px
    : FLOOR_MM_PER_PX
}

const getRoomBoundsRect = (room: FloorRoom): AxisAlignedRect => {
  if (room.polygon && room.polygon.length >= 3) {
    const bounds = getPolygonBounds(room.polygon)
    return {
      x: bounds.minX,
      y: bounds.minY,
      width: Math.max(bounds.maxX - bounds.minX, 1),
      height: Math.max(bounds.maxY - bounds.minY, 1),
    }
  }
  return {
    x: room.x,
    y: room.y,
    width: room.width,
    height: room.height,
  }
}

const rangesOverlapWithTolerance = (
  a1: number,
  a2: number,
  b1: number,
  b2: number,
  tolerance = ROOM_PERIMETER_WALL_TOLERANCE_PX,
): boolean =>
  Math.min(Math.max(a1, a2), Math.max(b1, b2)) -
    Math.max(Math.min(a1, a2), Math.min(b1, b2)) >= -tolerance

const isWallAlignedWithRoomPerimeter = (
  wall: FloorWall,
  room: FloorRoom,
  tolerance = ROOM_PERIMETER_WALL_TOLERANCE_PX,
): boolean => {
  const rect = getRoomBoundsRect(room)
  const left = rect.x
  const right = rect.x + rect.width
  const top = rect.y
  const bottom = rect.y + rect.height
  const near = (a: number, b: number) => Math.abs(a - b) <= tolerance
  const sx = wall.start.x
  const sy = wall.start.y
  const ex = wall.end.x
  const ey = wall.end.y
  const isVertical = Math.abs(sx - ex) <= tolerance
  const isHorizontal = Math.abs(sy - ey) <= tolerance

  if (isVertical) {
    const wallX = (sx + ex) / 2
    return (near(wallX, left) || near(wallX, right)) &&
      rangesOverlapWithTolerance(sy, ey, top, bottom, tolerance)
  }

  if (isHorizontal) {
    const wallY = (sy + ey) / 2
    return (near(wallY, top) || near(wallY, bottom)) &&
      rangesOverlapWithTolerance(sx, ex, left, right, tolerance)
  }

  return false
}

const collectRoomMoveAffectedElementGlobalIds = (
  rooms: FloorRoom[],
  walls: FloorWall[],
  activeLayerId: string | null,
): string[] => {
  const ids = new Set<string>()
  rooms.forEach((room) => {
    const roomGlobalId = resolveFloorRoomGlobalId(room)
    if (roomGlobalId) ids.add(roomGlobalId)
  })
  walls.forEach((wall) => {
    if (activeLayerId && wall.floorLayerId && wall.floorLayerId !== activeLayerId) return
    if (!rooms.some((room) => isWallAlignedWithRoomPerimeter(wall, room))) return
    const wallGlobalId = resolveFloorWallGlobalId(wall)
    if (wallGlobalId) ids.add(wallGlobalId)
  })
  return Array.from(ids)
}

const getIfcSourceCacheKey = (projectId: string): string => `${IFC_SOURCE_CACHE_KEY_PREFIX}${projectId}`

const isPresignedIfcUrl = (url: string): boolean => url.includes('X-Amz-Signature=')

const isIfcObjectStorageKey = (url: string): boolean => {
  const normalized = url.trim()
  return normalized.startsWith('s3://') ||
    /^projects\/[^/]+\/revisions\/[^/]+\/ifc\//.test(normalized)
}

const readCachedIfcSource = (projectId: string): CachedIfcSource | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(getIfcSourceCacheKey(projectId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CachedIfcSource>
    if (typeof parsed.url !== 'string' || parsed.url.trim().length === 0) return null
    const savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : 0
    const storageUrl = typeof parsed.storageUrl === 'string' && parsed.storageUrl.trim()
      ? parsed.storageUrl.trim()
      : null
    const assetId = typeof parsed.assetId === 'string' && parsed.assetId.trim() ? parsed.assetId.trim() : null
    const revisionId = typeof parsed.revisionId === 'string' && parsed.revisionId.trim() ? parsed.revisionId.trim() : null

    if (!assetId && isPresignedIfcUrl(parsed.url) && Date.now() - savedAt > PRESIGNED_IFC_CACHE_TTL_MS) {
      return null
    }

    return {
      url: parsed.url.trim(),
      storageUrl,
      assetId,
      revisionId,
      savedAt,
    }
  } catch {
    return null
  }
}

const writeCachedIfcSource = (
  projectId: string,
  source: Pick<CachedIfcSource, 'url' | 'assetId' | 'revisionId'> & { storageUrl?: string | null },
): void => {
  if (typeof window === 'undefined') return
  if (!source.url.trim()) return
  window.localStorage.setItem(
    getIfcSourceCacheKey(projectId),
    JSON.stringify({
      url: source.url.trim(),
      storageUrl: source.storageUrl?.trim() || null,
      assetId: source.assetId,
      revisionId: source.revisionId,
      savedAt: Date.now(),
    } satisfies CachedIfcSource),
  )
}

const logBootstrapFloor = (label: string, payload: Record<string, unknown>) => {
  if (!isBubbleDebugEnabled()) return
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

const parseSafeFloorFromLayerId = (value: string): number | null => {
  const match = value.match(/^floor-(-?\d+)$/i)
  if (!match?.[1]) return null
  const parsed = Number.parseInt(match[1], 10)
  if (!Number.isFinite(parsed) || Math.abs(parsed) > 200) return null
  return normalizeBubbleFloor(parsed)
}

const resolveBubbleFloorFromLayer = (layer: FloorLayer, layerIndex: number): number => {
  const parsedFromStoreyName = readNonZeroIntegerFromUnknown(layer.storeyName)
  if (parsedFromStoreyName !== null) return normalizeBubbleFloor(parsedFromStoreyName)

  const parsedFromLayerName = readNonZeroIntegerFromUnknown(layer.name)
  if (parsedFromLayerName !== null) return normalizeBubbleFloor(parsedFromLayerName)

  const parsedFromLayerId = parseSafeFloorFromLayerId(layer.id)
  if (parsedFromLayerId !== null) return parsedFromLayerId

  return normalizeBubbleFloor(layerIndex + 1)
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

function extractBubbleFloorMetaFromWorkspaceSnapshot(snapshot: WorkspaceSnapshot): BubbleSnapshotPayload['floorMeta'] {
  return {
    namesByFloor: snapshot.bubbleFloorNamesByNumber ?? {},
    extraFloors: snapshot.extraBubbleFloors ?? [],
  }
}

/**
 * EditorPage 전체 비즈니스 로직 훅
 * 버블·연결선·조닝·패널·평면도·UI 상태를 하위 훅에서 합성해 관리
 */
interface EditorHistoryCursor {
  baseIndex: number
  redoDepth: number
}

export interface EditorHistoryControlsInput {
  mode: EditorMode
  canEditBubble: boolean
  canEditFloorPlan: boolean
  saveStatus: SaveStatus
  bubbleHistoryCursor: EditorHistoryCursor
  floorPlanHistoryCursor: EditorHistoryCursor
  floorPlanHistoryCommandInFlight: boolean
}

export const resolveEditorHistoryControls = ({
  mode,
  canEditBubble,
  canEditFloorPlan,
  saveStatus,
  bubbleHistoryCursor,
  floorPlanHistoryCursor,
  floorPlanHistoryCommandInFlight,
}: EditorHistoryControlsInput): { canUndo: boolean; canRedo: boolean } => {
  if (mode === 'bubble') {
    return {
      canUndo: canEditBubble && (saveStatus === 'dirty' || bubbleHistoryCursor.baseIndex > 0),
      canRedo: canEditBubble && bubbleHistoryCursor.redoDepth > 0,
    }
  }

  const isFloorPlanHistoryMode = mode === '2d' || mode === '3d'
  return {
    canUndo:
      isFloorPlanHistoryMode &&
      canEditFloorPlan &&
      floorPlanHistoryCursor.baseIndex > 0 &&
      !floorPlanHistoryCommandInFlight,
    canRedo:
      isFloorPlanHistoryMode &&
      canEditFloorPlan &&
      floorPlanHistoryCursor.redoDepth > 0 &&
      !floorPlanHistoryCommandInFlight,
  }
}

export function useEditorPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
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
  const markLocalFloorPlanSnapshotChangedRef = useRef<() => void>(() => { })
  const mapSnapshotForPersistenceRef = useRef<(snapshot: WorkspaceSnapshot) => WorkspaceSnapshot>((snapshot) => snapshot)
  const refreshHistoryCursorFromServerRef = useRef<(options?: {
    republishOnFailure?: boolean
    republishWhenStale?: boolean
  }) => Promise<void>>(async () => { })

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
    validationMessage: zoningValidationMessage,
    autoColorPreview: zoningAutoColorPreview,
    openAddModal: openZoningModal,
    openEditModal,
    closeModal: closeZoningModal,
    toggleBubble: toggleZoningBubble,
    confirmModal: confirmZoningModal,
    deleteZone,
    removeBubbleIds: removeBubbleIdsFromZones,
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
    setActiveLayerId: baseSetActiveFloorLayerId,
    setFloorPlanFromProject,
    moveActiveRoom,
    updateActiveRoom,
    addActiveRoom,
    removeActiveRooms,
    clearFloorPlan,
    replaceFloorPlanState,
    updateFloorLayers,
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
  const [isWorkspaceSiteBoundaryHydrated, setIsWorkspaceSiteBoundaryHydrated] = useState(false)
  const handleIfcSyncMessageRef = useRef<(
    url: string,
    action: string | null,
    assetId?: string | null,
    revisionId?: string | null,
  ) => Promise<boolean>>(async () => false)
  const workspaceCommandPublisherRef = useRef<ReturnType<typeof useWorkspaceCommandPublisher> | null>(null)
  const mergedFloorOpeningsRef = useRef<FloorOpening[]>([])
  const floorRoomMoveSessionRef = useRef<FloorRoomMoveSession | null>(null)
  const isFloorPlanGenerating = isFloorPlanGeneratingLocal || workspacePhaseStatus === 'CONVERTING'
  const floorRoomSyncStateRef = useRef<{
    floorLayers: FloorLayer[]
    floorWalls: FloorWall[]
  }>({ floorLayers, floorWalls })

  useLayoutEffect(() => {
    floorRoomSyncStateRef.current = { floorLayers, floorWalls }
  }, [floorLayers, floorWalls])

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
        markLocalFloorPlanSnapshotChangedRef.current()
        selectedRoomIds.forEach((id) => {
          const roomCommandId = floorRooms.find((room) => room.bubbleId === id)?.id ?? id
          const publisher = workspaceCommandPublisherRef.current
          publisher?.deleteRoom(roomCommandId)
          if (publisher && !publisher.hasPendingCommand()) {
            publisher.markSnapshotOnlyChange('room-delete', roomCommandId, { roomId: roomCommandId })
          }
        })
        removeActiveRooms(selectedRoomIds)
        if (canSyncBubbleStateFrom2D) {
          markLocalBubbleSnapshotChangedRef.current()
          removeBubbleIdsFromZones(selectedRoomIds)
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
      markLocalFloorPlanSnapshotChangedRef.current()

      const openingIdSet = new Set<string>([
        ...(selectedFloorOpeningIds.length > 0 ? selectedFloorOpeningIds : []),
        ...(selectedFloorOpeningId ? [selectedFloorOpeningId] : []),
      ])
      const wallIdSet = new Set<string>([
        ...(selectedFloorWallIds.length > 0 ? selectedFloorWallIds : []),
        ...(selectedFloorWallId ? [selectedFloorWallId] : []),
      ])
      const openingsToDelete = mergedFloorOpeningsRef.current.filter(
        (opening) => openingIdSet.has(opening.id) || wallIdSet.has(opening.wallId),
      )
      const publisher = workspaceCommandPublisherRef.current
      openingsToDelete.forEach((opening) => publisher?.deleteOpening(opening))
      wallIdSet.forEach((wallId) => publisher?.deleteWall(wallId))
      if (publisher && !publisher.hasPendingCommand()) {
        publisher.markSnapshotOnlyChange('2d-structure-delete', '2d-structure-delete', {
          openingCount: openingsToDelete.length,
          wallCount: wallIdSet.size,
        })
      }

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
      removeBubbleIdsFromZones(selectedIds)
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
    floorRooms,
    selectedConnectionPair,
    selectedId,
    selectedIds,
    clearSelection,
    removeActiveRooms,
    deleteBubble,
    removeConnectionsForBubble,
    removeConnection,
    removeBubbleIdsFromZones,
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
  const [noticeModal, setNoticeModal] = useState<{
    title?: string
    message: string
    description?: string
    confirmLabel?: string
  } | null>(null)
  const openNoticeModal = useCallback((notice: {
    title?: string
    message: string
    description?: string
    confirmLabel?: string
  }) => {
    setNoticeModal(notice)
  }, [])
  const onCloseNoticeModal = useCallback(() => {
    setNoticeModal(null)
  }, [])
  const [libraryElements, setLibraryElements] = useState<ThreeDLibraryPreset[]>([])
  const [hiddenElementIds, setHiddenElementIds] = useState<string[]>([])
  // 현재 표시 중인 IFC 층 expressId (null = 전체 표시)
  const [activeIfcStoreyExpressId, setActiveIfcStoreyExpressId] = useState<number | null>(null)
  // 겹쳐보기로 함께 표시할 IFC 층 expressId 목록
  const [overlayIfcStoreyExpressIds, setOverlayIfcStoreyExpressIds] = useState<number[]>([])
  const [ifcStoreyNameOverrides, setIfcStoreyNameOverrides] = useState<Record<string, string>>({})
  const applyIfcStoreyNameOverridesToLoadedStoreysRef = useRef<(overrides: Record<string, string>) => void>(() => {})
  const sceneUpdateEventBus = useMemo(() => createSceneUpdateEventBus(), [])
  const publishSceneUpdateEvent = useCallback((event: SceneUpdateEvent) => {
    sceneUpdateEventBus.publish(event)
  }, [sceneUpdateEventBus])
  const [isGridVisible, setIsGridVisible] = useState(false)
  const [userViewRotationRadians, setUserViewRotationRadians] = useState(0)
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
  const saveStatusRef = useRef<SaveStatus>(saveStatus)
  const [hasUnsavedDbChanges, setHasUnsavedDbChanges] = useState(false)
  const hasUnsavedDbChangesRef = useRef(false)
  const unsavedDbChangeVersionRef = useRef(0)
  const manualBubbleDbSaveStartVersionRef = useRef<number | null>(null)
  const bubbleDbSaveUnsavedVersionRef = useRef<number | null>(null)
  const pendingBubbleHistoryActionUnsavedVersionRef = useRef<number | null>(null)
  const pendingFloorPlanHistoryActionUnsavedVersionRef = useRef<number | null>(null)
  const [latestFloorPlanJobId, setLatestFloorPlanJobId] = useState<string | null>(null)
  const [floorPlanGenerateStatusText, setFloorPlanGenerateStatusText] = useState<string>('')
  const [autosaveReadyProjectId, setAutosaveReadyProjectId] = useState<string | null>(null)
  const [workspaceSnapshotCommitVersion, setWorkspaceSnapshotCommitVersion] = useState(0)
  const [bubbleHistoryCursor, setBubbleHistoryCursor] = useState({ baseIndex: -1, redoDepth: 0 })
  const [floorPlanHistoryCursor, setFloorPlanHistoryCursor] = useState({ baseIndex: -1, redoDepth: 0 })
  const attemptedInitialIfcImportProjectIdRef = useRef<string | null>(null)
  const [historyIfcHydratedProjectIds, setHistoryIfcHydratedProjectIds] = useState<string[]>([])
  /** 2D/3D 진입 시 IFC source 조회를 1회 완료한 projectId 목록 (성공/없음 둘 다 포함) */
  const [ifcSourceHydrationAttemptedProjectIds, setIfcSourceHydrationAttemptedProjectIds] = useState<string[]>([])
  const bubbleHistoryBaseIndexRef = useRef(-1)
  const bubbleHistoryRedoDepthRef = useRef(0)
  const floorPlanHistoryBaseIndexRef = useRef(-1)
  const floorPlanHistoryRedoDepthRef = useRef(0)
  const previousSnapshotRef = useRef<string | null>(null)
  const latestBubbleSnapshotRef = useRef<{
    bubbles: BubbleData[]
    connections: ConnectionData[]
    zones: ZoneData[]
    floorMeta: BubbleSnapshotPayload['floorMeta']
  }>({
    bubbles,
    connections,
    zones,
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
  const bubbleSnapshotChangeVersionRef = useRef(0)
  const localBubbleChangeFlushRafRef = useRef<number | null>(null)
  const pendingLocalBubbleChangeTaskRef = useRef<(() => void) | null>(null)
  const floorPlanGenerateForbiddenRef = useRef(false)
  const pendingOpenThreeDOnGenerateCompleteRef = useRef(false)
  const lastLoadedIfcStorageUrlRef = useRef<string | null>(null)
  const ifcLoadInFlightStorageUrlRef = useRef<string | null>(null)
  const threeDIfcSourceHydrationInFlightRef = useRef<string | null>(null)
  const modeSwitchFloorPlanHydrationInFlightRef = useRef<string | null>(null)
  const previousEditorModeRef = useRef<EditorMode>(mode)
  /**
   * 프로젝트별 IFC 소스 캐시.
   * - projectId 전환 시 effect로 상태를 초기화하지 않고, 렌더 단계에서 현재 프로젝트 값만 노출한다.
   * - react-hooks/set-state-in-effect 규칙을 만족하면서 기존 동작을 보존한다.
   */
  const [ifcSourceByProjectId, setIfcSourceByProjectId] = useState<
    Record<string, { url: string; storageUrl: string | null; assetId: string | null }>
  >({})
  const [ifcRevisionByProjectId, setIfcRevisionByProjectId] = useState<Record<string, string | null>>({})
  const currentIfcUrl = projectId ? (ifcSourceByProjectId[projectId]?.url ?? null) : null
  const currentIfcStorageUrl = projectId ? (ifcSourceByProjectId[projectId]?.storageUrl ?? null) : null
  const currentIfcAssetId = projectId ? (ifcSourceByProjectId[projectId]?.assetId ?? null) : null
  const currentIfcRevisionId = projectId ? (ifcRevisionByProjectId[projectId] ?? null) : null
  const workspaceCommandPublisher = useWorkspaceCommandPublisher({
    projectId,
    source: mode === '3d' ? '3d' : '2d',
    getBaseRevisionId: () => currentIfcRevisionId,
    getBaseIndex: () => floorPlanHistoryBaseIndexRef.current,
  })
  useEffect(() => {
    workspaceCommandPublisherRef.current = workspaceCommandPublisher
  }, [workspaceCommandPublisher])
  const hasUserEditedRef = useRef(false)
  const floorPlanSnapshotCommitScheduledRef = useRef(false)
  const serverPublishRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingServerPublishRef = useRef<PendingServerPublishRecord | null>(null)
  const awaitingServerSyncRef = useRef<AwaitingServerSyncRecord | null>(null)
  const suppressGeneratedFloorPlanAutosaveRef = useRef(false)
  const [isFloorPlanHistoryCommandInFlight, setIsFloorPlanHistoryCommandInFlight] = useState(false)
  const floorPlanHistoryCommandInFlightRef = useRef(false)
  const setFloorPlanHistoryCommandInFlight = useCallback((value: boolean) => {
    floorPlanHistoryCommandInFlightRef.current = value
    setIsFloorPlanHistoryCommandInFlight(value)
  }, [])
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
    saveStatusRef.current = saveStatus
  }, [saveStatus])

  const markUnsavedDbChanges = useCallback(() => {
    const hadUnsavedDbChanges = hasUnsavedDbChangesRef.current
    unsavedDbChangeVersionRef.current += 1
    hasUnsavedDbChangesRef.current = true
    setHasUnsavedDbChanges(true)
    return {
      hadUnsavedDbChanges,
      version: unsavedDbChangeVersionRef.current,
    }
  }, [])

  const clearUnsavedDbChangesIfUnchanged = useCallback((saveStartVersion: number) => {
    if (unsavedDbChangeVersionRef.current !== saveStartVersion) return
    hasUnsavedDbChangesRef.current = false
    setHasUnsavedDbChanges(false)
  }, [])

  const restoreUnsavedDbChangesIfUnchanged = useCallback((
    markVersion: number,
    hadUnsavedDbChanges: boolean,
  ) => {
    if (unsavedDbChangeVersionRef.current !== markVersion) return
    hasUnsavedDbChangesRef.current = hadUnsavedDbChanges
    setHasUnsavedDbChanges(hadUnsavedDbChanges)
  }, [])

  useEffect(() => {
    lastLoadedIfcStorageUrlRef.current = null
    ifcLoadInFlightStorageUrlRef.current = null
    suppressGeneratedFloorPlanAutosaveRef.current = false
    pendingOpenThreeDOnGenerateCompleteRef.current = false
    unsavedDbChangeVersionRef.current = 0
    manualBubbleDbSaveStartVersionRef.current = null
    bubbleDbSaveUnsavedVersionRef.current = null
    pendingBubbleHistoryActionUnsavedVersionRef.current = null
    pendingFloorPlanHistoryActionUnsavedVersionRef.current = null
    hasUnsavedDbChangesRef.current = false
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
    mode === 'bubble' && snapshot.phaseStatus === 'BUBBLE_DRAFT'
      ? bubbleHistoryBaseIndexRef.current
      : floorPlanHistoryBaseIndexRef.current
    , [mode])
  const resolveServerHistoryDomain = useCallback((snapshot: WorkspaceSnapshot): AwaitingServerSyncRecord['historyDomain'] =>
    mode === 'bubble' && snapshot.phaseStatus === 'BUBBLE_DRAFT'
      ? 'bubble'
      : 'floorPlan'
    , [mode])
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
    setIsWorkspaceSiteBoundaryHydrated(true)
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
   * 워크스페이스 편집 트랜잭션 ref를 초기 상태로 되돌린다.
   */
  const resetWorkspaceTransactionRefs = useCallback(() => {
    pendingWorkspaceSnapshotCommitRef.current = false
    workspaceEditTransactionDepthRef.current = 0
  }, [])

  /**
   * 서버 publish/sync 대기 ref를 초기화한다.
   */
  const clearPendingWorkspaceSyncRefs = useCallback(() => {
    pendingServerPublishRef.current = null
    awaitingServerSyncRef.current = null
  }, [])

  const clearUnsavedDbChangesOnHistorySync = useCallback((awaitingSync: AwaitingServerSyncRecord) => {
    if (awaitingSync.historyDomain !== 'floorPlan') return
    if (awaitingSync.unsavedDbChangeVersion === undefined) return
    clearUnsavedDbChangesIfUnchanged(awaitingSync.unsavedDbChangeVersion)
  }, [clearUnsavedDbChangesIfUnchanged])

  /**
   * 원격 floorPlan snapshot 반영 시, payload에 누락된 필드를 보완할 기본값이다.
   * 의존성을 명시한 memo로 유지해 핸들러 훅 재생성을 최소화한다.
   */
  const floorPlanSnapshotFallback = useMemo(() => ({
    isGenerated: isFloorPlanGenerated,
    layoutSource: floorPlanLayoutSource,
    layers: floorLayers,
    activeLayerId: activeFloorLayerId,
  }), [activeFloorLayerId, floorLayers, floorPlanLayoutSource, isFloorPlanGenerated])

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
    setActiveIfcStoreyExpressId(layout.activeIfcStoreyExpressId ?? null)
    setOverlayIfcStoreyExpressIds((layout.overlayIfcStoreyExpressIds ?? []).filter(Number.isFinite))
    const nextOverlayFloorLayerIds = layout.overlayFloorLayerIds ?? []
    setOverlayLayerIds(nextOverlayFloorLayerIds)
    setIsLayerOverlayMode(nextOverlayFloorLayerIds.length > 0)
    setHiddenElementIds(layout.hiddenElementIds ?? [])
    const nextIfcStoreyNameOverrides = normalizeIfcStoreyNameOverrides(layout.ifcStoreyNameOverrides)
    setIfcStoreyNameOverrides(nextIfcStoreyNameOverrides)
    applyIfcStoreyNameOverridesToLoadedStoreysRef.current(nextIfcStoreyNameOverrides)
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
  const addFloorLayer = useCallback((): FloorLayer | null => {
    if (!canEditFloorPlan) return null
    return baseAddFloorLayer()
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
  const { canUndo, canRedo } = resolveEditorHistoryControls({
    mode,
    canEditBubble,
    canEditFloorPlan,
    saveStatus,
    bubbleHistoryCursor,
    floorPlanHistoryCursor,
    floorPlanHistoryCommandInFlight: isFloorPlanHistoryCommandInFlight,
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
  useEffect(() => {
    mergedFloorOpeningsRef.current = mergedFloorOpenings
  }, [mergedFloorOpenings])

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
    activeIfcStoreyExpressId,
    overlayIfcStoreyExpressIds,
    overlayFloorLayerIds: overlayLayerIds,
    hiddenElementIds,
    ifcStoreyNameOverrides,
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
    activeIfcStoreyExpressId,
    overlayIfcStoreyExpressIds,
    overlayLayerIds,
    hiddenElementIds,
    ifcStoreyNameOverrides,
  ])

  const latestDraftSnapshotRef = useRef(draftSnapshot)
  useLayoutEffect(() => {
    latestDraftSnapshotRef.current = draftSnapshot
  }, [draftSnapshot])

  useLayoutEffect(() => {
    latestBubbleSnapshotRef.current = {
      bubbles,
      connections,
      zones,
      floorMeta: {
        namesByFloor: bubbleFloorNamesByNumber,
        extraFloors: extraBubbleFloors,
      },
    }
  }, [bubbleFloorNamesByNumber, bubbles, connections, extraBubbleFloors, zones])

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
    const clearBootstrapBubbleSelection = () => {
      setSelectedConnectionPair(null)
      setConnectingFromId(null)
      clearSelectionForBootstrap()
    }

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
    resetWorkspaceTransactionRefs()
    clearPendingWorkspaceSyncRefs()
    bubbleHistoryBaseIndexRef.current = -1
    bubbleHistoryRedoDepthRef.current = 0
    floorPlanHistoryBaseIndexRef.current = -1
    floorPlanHistoryRedoDepthRef.current = 0
    setBubbleHistoryCursor({ baseIndex: -1, redoDepth: 0 })
    setFloorPlanHistoryCursor({ baseIndex: -1, redoDepth: 0 })
    replaceBubblesForBootstrap([])
    replaceConnectionsForBootstrap([])
    replaceZonesStateForBootstrap([])
    clearFloorPlanForBootstrap()
    resetFloorPlanStructureState()
    setWorkspacePhaseStatus('BUBBLE_DRAFT')
    setWorkspaceSiteBoundary({ polygonRing: null, areaM2: null })
    setIsWorkspaceSiteBoundaryHydrated(false)
    clearBootstrapBubbleSelection()
    setSelectedFloorWallId(null)
    setSelectedFloorOpeningId(null)
    setSelectedFloorWallIds([])
    setSelectedFloorOpeningIds([])

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
        zones: snapshot.zones ?? [],
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
        activeIfcStoreyExpressId: null,
        overlayIfcStoreyExpressIds: [],
        overlayFloorLayerIds: [],
        hiddenElementIds: [],
        ifcStoreyNameOverrides: {},
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
      replaceZonesStateForBootstrap(snapshot.zones ?? [])
      applyBubbleFloorMetaState(floorMeta, availableFloors)
      clearBootstrapBubbleSelection()
    }

    const publishBubbleSnapshotToRedis = async (snapshot: WorkspaceSnapshot, baseIndex: number) => {
      const persistedSnapshot = mapSnapshotForPersistenceRef.current(snapshot)
      const serializedSnapshot = JSON.stringify(persistedSnapshot)
      setSaveStatus('syncing')
      awaitingServerSyncRef.current = {
        projectId,
        serializedSnapshot,
        historyDomain: resolveServerHistoryDomain(persistedSnapshot),
        baseIndex,
        startedAt: Date.now(),
        unsavedDbChangeVersion: hasUnsavedDbChangesRef.current ? unsavedDbChangeVersionRef.current : undefined,
      }
      try {
        await workspaceRealtimeService.publishSnapshot({
          projectId,
          snapshot: persistedSnapshot,
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
    ): Promise<{
      applied: boolean
      summary: ReturnType<typeof summarizeBubbleSnapshotForDebug> | null
      snapshot: BubbleSnapshotPayload | null
    }> => {
      const preferLocalDraft = options?.preferLocalDraft ?? true
      logBubbleDebug('bootstrap:db-fallback:begin', {
        projectId,
        seedBubbleBaseline,
        preferLocalDraft,
        historySummaryForRecovery: historySummaryForRecovery ?? null,
      })
      const workspaceDetail = await projectService.getWorkspaceDetail(projectId).catch(() => null)
      if (isCancelled || draftLoadTokenRef.current !== loadToken) return { applied: false, summary: null, snapshot: null }
      if (!workspaceDetail) return { applied: false, summary: null, snapshot: null }

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
      const dbHasZones = Boolean(dbBubbleSnapshot?.zones?.length)
      const localRecoveryLooksMultiFloor =
        Boolean(localRecoverySummary) &&
        (
          (localRecoverySummary?.bubbleFloors.some((floor) => floor > 1) ?? false)
          || (localRecoverySummary?.floorMetaFloors.some((floor) => floor > 1) ?? false)
        )
      const localRecoveryHasZones = Boolean(localRecoverySnapshot?.zones?.length)

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
      } else if (
        !preferLocalDraft &&
        localRecoverySnapshot &&
        localRecoverySummary &&
        !dbHasZones &&
        localRecoveryHasZones
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
        dbHasZones,
        localDraftLooksMultiFloor: localRecoveryLooksMultiFloor,
        localRecoverySource,
        localRecoveryLooksMultiFloor,
        localRecoveryHasZones,
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
          return { applied: false, summary: selectedRecoverySummary, snapshot: selectedRecoverySnapshot }
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
        return { applied: true, summary: selectedRecoverySummary, snapshot: selectedRecoverySnapshot }
      }

      return { applied: false, summary: selectedRecoverySummary, snapshot: selectedRecoverySnapshot }
    }

    const applyRedisHistorySnapshot = async (
      dbBaselineSummary?: ReturnType<typeof summarizeBubbleSnapshotForDebug> | null,
      dbBaselineSnapshot?: BubbleSnapshotPayload | null,
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
      bubbleHistoryRedoDepthRef.current = bubbleRedoDepth
      floorPlanHistoryBaseIndexRef.current = floorPlanBaseIndex
      floorPlanHistoryRedoDepthRef.current = floorPlanRedoDepth
      setBubbleHistoryCursor({ baseIndex: bubbleBaseIndex, redoDepth: bubbleRedoDepth })
      setFloorPlanHistoryCursor({ baseIndex: floorPlanBaseIndex, redoDepth: floorPlanRedoDepth })

      const bubbleSnapshot = history.bubble?.snapshot
      const hasBubbleSnapshot = isBubbleSnapshotPayload(bubbleSnapshot)

      const floorPlanSnapshotRaw = history.floorPlan?.snapshot
      const floorPlanSnapshot: SavedFloorPlanSnapshotPayload | null | undefined = floorPlanSnapshotRaw
      const floorPlanBubbleSnapshot = isBubbleSnapshotPayload(floorPlanSnapshotRaw) ? floorPlanSnapshotRaw : null
      const nextPhaseStatus = floorPlanSnapshot?.layout?.phaseStatus ?? history.phaseStatus ?? 'BUBBLE_DRAFT'
      setWorkspacePhaseStatus(nextPhaseStatus)

      const resolvedHistoryBubbleSnapshot = hasBubbleSnapshot
        ? bubbleSnapshot
        : floorPlanBubbleSnapshot
      if (isBubbleSnapshotPayload(resolvedHistoryBubbleSnapshot)) {
        const historyZones = resolvedHistoryBubbleSnapshot.zones
        const dbZones = dbBaselineSnapshot?.zones
        const shouldFallbackZonesFromDb =
          !Array.isArray(historyZones) &&
          Array.isArray(dbZones) &&
          dbZones.length > 0
        const mergedHistoryBubbleSnapshot: BubbleSnapshotPayload = shouldFallbackZonesFromDb
          ? { ...resolvedHistoryBubbleSnapshot, zones: dbZones }
          : resolvedHistoryBubbleSnapshot
        const resolvedSummary = summarizeBubbleSnapshotForDebug(mergedHistoryBubbleSnapshot)
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
          shouldFallbackZonesFromDb,
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
          shouldFallbackZonesFromDb,
        })

        if (shouldApplyHistoryBubbleSnapshot) {
          logBubbleDebug('bootstrap:history-applied', { projectId, resolvedSummary })
          traceBubbleSnapshot('bootstrap:history:resolved-applied', projectId, mergedHistoryBubbleSnapshot)
          applyBubbleSnapshot(mergedHistoryBubbleSnapshot)
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
        const loaded = await handleIfcSyncMessageRef.current(
          history.floorPlan.s3Url,
          null,
          undefined,
          floorPlanSnapshot?.revisionId ?? undefined,
        )
        if (loaded) {
          setHistoryIfcHydratedProjectIds((prev) =>
            prev.includes(projectId) ? prev : [...prev, projectId],
          )
        }
      } else {
        const cachedIfcSource = readCachedIfcSource(projectId)
        if (cachedIfcSource) {
          const loaded = await handleIfcSyncMessageRef.current(
            cachedIfcSource.storageUrl ?? cachedIfcSource.url,
            null,
            cachedIfcSource.assetId,
            cachedIfcSource.revisionId ?? floorPlanSnapshot?.revisionId ?? undefined,
          )
          if (loaded) {
            setHistoryIfcHydratedProjectIds((prev) =>
              prev.includes(projectId) ? prev : [...prev, projectId],
            )
          }
        }
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

        clearBootstrapBubbleSelection()
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
      await applyRedisHistorySnapshot(dbBaseline.summary, dbBaseline.snapshot)
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
        setIsWorkspaceSiteBoundaryHydrated(true)
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
    clearPendingWorkspaceSyncRefs,
    projectId,
    resetWorkspaceTransactionRefs,
    resolveServerHistoryDomain,
    resetFloorPlanStructureState,
    setConnectingFromId,
  ])

  useEffect(() => {
    if (!projectId || autosaveReadyProjectId !== projectId) return
    const pendingServerPublish = pendingServerPublishRef.current
    if (!pendingServerPublish || pendingServerPublish.projectId !== projectId) return
    logEditor3dUndoDebug('publish', 'retry_effect_evaluate', {
      projectId,
      pendingServerPublish: summarizePendingServerPublishFor3dUndo(pendingServerPublish),
      awaitingServerSync: summarizeAwaitingServerSyncFor3dUndo(awaitingServerSyncRef.current),
    })
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
      unsavedDbChangeVersion: pendingServerPublish.unsavedDbChangeVersion,
    }
    logEditor3dUndoDebug('publish', 'retry_begin', {
      projectId,
      pendingServerPublish: summarizePendingServerPublishFor3dUndo(pendingServerPublish),
      awaitingServerSync: summarizeAwaitingServerSyncFor3dUndo(awaitingServerSyncRef.current),
    })
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
      workspaceCommand: pendingServerPublish.workspaceCommand,
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
    const publishSourceSnapshot: WorkspaceSnapshot = shouldPublishBubbleDraft
      ? {
        ...draftSnapshot,
        phaseStatus: 'BUBBLE_DRAFT',
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
        activeIfcStoreyExpressId: null,
        overlayIfcStoreyExpressIds: [],
        overlayFloorLayerIds: [],
        hiddenElementIds: [],
        ifcStoreyNameOverrides: {},
      }
      : draftSnapshot
    const publishSnapshot = mapSnapshotForPersistenceRef.current(publishSourceSnapshot)
    const serializedSnapshot = JSON.stringify(publishSnapshot)
    const historyDomain = resolveServerHistoryDomain(publishSnapshot)
    const hasPendingFloorPlanCommand = historyDomain === 'floorPlan' && workspaceCommandPublisher.hasPendingCommand()
    const serverHistoryBaseIndex = resolveServerHistoryBaseIndex(publishSnapshot)

    logEditor3dUndoDebug('publish', 'autosave_effect_evaluate', {
      projectId,
      mode,
      saveStatus,
      historyDomain,
      baseIndex: serverHistoryBaseIndex,
      phaseStatus: publishSnapshot.phaseStatus,
      hasUserEdited: hasUserEditedRef.current,
      hasPendingFloorPlanCommand,
      previousSnapshotMatches: previousSnapshotRef.current === serializedSnapshot,
      awaitingSnapshotMatches:
        awaitingServerSyncRef.current?.projectId === projectId &&
        awaitingServerSyncRef.current.serializedSnapshot === serializedSnapshot,
      workspaceEditTransactionDepth: workspaceEditTransactionDepthRef.current,
      pendingWorkspaceSnapshotCommit: pendingWorkspaceSnapshotCommitRef.current,
      awaitingServerSync: summarizeAwaitingServerSyncFor3dUndo(awaitingServerSyncRef.current),
      pendingServerPublish: summarizePendingServerPublishFor3dUndo(pendingServerPublishRef.current),
    })

    if (
      suppressGeneratedFloorPlanAutosaveRef.current &&
      historyDomain === 'floorPlan'
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

    if (
      previousSnapshotRef.current !== null &&
      previousSnapshotRef.current === serializedSnapshot &&
      !hasPendingFloorPlanCommand
    ) {
      return
    }

    if (
      awaitingServerSyncRef.current?.projectId === projectId &&
      awaitingServerSyncRef.current.serializedSnapshot === serializedSnapshot &&
      !hasPendingFloorPlanCommand
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

    const workspaceCommand = historyDomain === 'floorPlan'
      ? workspaceCommandPublisher.consumePendingCommand()
      : null

    if (historyDomain === 'floorPlan') {
      logEditor3dUndoDebug('publish', 'floor_plan_command_consume', {
        projectId,
        mode,
        baseIndex: serverHistoryBaseIndex,
        hadPendingBeforeConsume: hasPendingFloorPlanCommand,
        hasCommand: Boolean(workspaceCommand),
        workspaceCommand: summarizeWorkspaceCommandFor3dUndo(workspaceCommand),
      })
    }

    if (historyDomain === 'floorPlan' && !workspaceCommand) {
      logEditor3dUndoDebug('publish', 'skip_floor_plan_publish_no_workspace_command', {
        projectId,
        mode,
        saveStatus,
        baseIndex: serverHistoryBaseIndex,
        phaseStatus: publishSnapshot.phaseStatus,
        awaitingServerSyncBeforeClear: summarizeAwaitingServerSyncFor3dUndo(awaitingServerSyncRef.current),
        pendingServerPublishBeforeClear: summarizePendingServerPublishFor3dUndo(pendingServerPublishRef.current),
      })
      pendingServerPublishRef.current = null
      awaitingServerSyncRef.current = null
      previousSnapshotRef.current = serializedSnapshot
      hasUserEditedRef.current = false
      clearServerPublishRetry()
      logEditor3dUndoDebug('publish', 'skip_floor_plan_publish_no_workspace_command_state_cleared', {
        projectId,
        baseIndex: serverHistoryBaseIndex,
      })
      window.setTimeout(() => setSaveStatus('synced'), 0)
      return
    }

    const serverPublishRecord: PendingServerPublishRecord = {
      projectId,
      baseIndex: serverHistoryBaseIndex,
      snapshot: publishSnapshot,
      serializedSnapshot,
      revisionId: historyDomain === 'floorPlan' ? currentIfcRevisionId : undefined,
      sceneType: historyDomain === 'floorPlan' ? resolveFloorPlanSceneType() : undefined,
      workspaceCommand,
      unsavedDbChangeVersion: hasUnsavedDbChangesRef.current ? unsavedDbChangeVersionRef.current : undefined,
    }

    window.setTimeout(() => {
      setSaveStatus('dirty')
      setSaveStatus('syncing')
    }, 0)
    clearServerPublishRetry()
    pendingServerPublishRef.current = serverPublishRecord
    awaitingServerSyncRef.current = {
      projectId,
      serializedSnapshot,
      historyDomain,
      baseIndex: serverPublishRecord.baseIndex,
      startedAt: Date.now(),
      unsavedDbChangeVersion: serverPublishRecord.unsavedDbChangeVersion,
    }
    logEditor3dUndoDebug('publish', 'server_publish_record_created', {
      projectId,
      mode,
      historyDomain,
      publishRecord: summarizePendingServerPublishFor3dUndo(serverPublishRecord),
      awaitingServerSync: summarizeAwaitingServerSyncFor3dUndo(awaitingServerSyncRef.current),
    })
    // STOMP 자동저장 publish 직전의 층 분포를 기록한다.
    const publishDebugSummary = summarizeBubbleSnapshotForDebug(
      toBubbleSnapshotPayloadFromWorkspaceSnapshot(publishSnapshot),
    )
    logBubbleDebug('publish:begin', {
      projectId,
      baseIndex: serverPublishRecord.baseIndex,
      historyDomain: resolveServerHistoryDomain(publishSnapshot),
      summary: publishDebugSummary,
      floorMeta: extractBubbleFloorMetaFromWorkspaceSnapshot(publishSnapshot),
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
      workspaceCommand: serverPublishRecord.workspaceCommand,
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
    saveStatus,
    workspaceCommandPublisher,
    workspacePhaseStatus,
    workspaceSnapshotCommitVersion,
  ])

  const requestRepublishSnapshotCommit = useCallback(() => {
    setWorkspaceSnapshotCommitVersion((version) => version + 1)
  }, [])

  const isCursorInvalidCode = useCallback((code: string | undefined) => (
    code === CURSOR_INVALID_CODE || code === FLOOR_PLAN_CURSOR_INVALID_CODE
  ), [])

  const {
    updateBubbleHistoryCursor,
    updateFloorPlanHistoryCursor,
    handleWorkspaceServerError,
    handleBubbleHistoryCursorInvalid,
    handleFloorPlanHistoryCursorInvalid,
    refreshHistoryCursorFromServer,
  } = useWorkspaceHistorySyncController({
    projectId,
    saveStatus,
    awaitingServerSyncRef,
    pendingServerPublishRef,
    previousSnapshotRef,
    bubbleHistoryBaseIndexRef,
    bubbleHistoryRedoDepthRef,
    floorPlanHistoryBaseIndexRef,
    floorPlanHistoryRedoDepthRef,
    workspaceEditTransactionDepthRef,
    pendingWorkspaceSnapshotCommitRef,
    floorPlanHistoryCommandInFlightRef,
    setFloorPlanHistoryCommandInFlight,
    setBubbleHistoryCursor,
    setFloorPlanHistoryCursor,
    setSaveStatus,
    requestRepublishSnapshotCommit,
    clearServerPublishRetry,
    scheduleServerPublishRetry,
    loadHistorySnapshot: workspaceSaveService.loadHistorySnapshot,
    isCursorInvalidCode,
    isNonRetriableServerErrorCode: (code) => code === IFC_EDIT_COMMAND_DLQ_CODE,
    onHistorySyncSuccess: clearUnsavedDbChangesOnHistorySync,
    maxHistoryIndex: WORKSPACE_HISTORY_MAX_INDEX,
  })

  useEffect(() => {
    refreshHistoryCursorFromServerRef.current = refreshHistoryCursorFromServer
  }, [refreshHistoryCursorFromServer])

  const handleBubbleHistoryCursorChanged = useCallback((baseIndex: number, redoDepth: number) => {
    updateBubbleHistoryCursor(baseIndex, redoDepth)
    pendingBubbleHistoryActionUnsavedVersionRef.current = null
  }, [updateBubbleHistoryCursor])

  const handleFloorPlanHistoryCursorChanged = useCallback((baseIndex: number, redoDepth: number) => {
    updateFloorPlanHistoryCursor(baseIndex, redoDepth)
    const pendingVersion = pendingFloorPlanHistoryActionUnsavedVersionRef.current
    if (pendingVersion === null) return
    pendingFloorPlanHistoryActionUnsavedVersionRef.current = null
    clearUnsavedDbChangesIfUnchanged(pendingVersion)
  }, [clearUnsavedDbChangesIfUnchanged, updateFloorPlanHistoryCursor])

  const { applyRemoteBubbleSnapshot, applyRemoteFloorPlanSnapshot } =
    useWorkspaceRemoteSnapshotHandlers({
      projectId,
      latestBubbleSnapshotRef,
      isBubbleDragTransactionActiveRef,
      workspaceEditTransactionDepthRef,
      pendingWorkspaceSnapshotCommitRef,
      awaitingServerSyncRef,
      floorPlanHistoryCommandInFlightRef,
      setFloorPlanHistoryCommandInFlight,
      suppressNextAutosaveRef,
      setSelectedConnectionPair,
      setConnectingFromId,
      setSaveStatus,
      setIfcRevisionByProjectId,
      clearConnectionAndTwoDSelection,
      clearSelection,
      resolveSnapshotSyncStatus,
      replaceBubbles,
      replaceConnections,
      replaceZonesState,
      applyBubbleFloorMetaState,
      applyFloorPlanLayoutState,
      replaceFloorPlanState,
      floorPlanFallback: floorPlanSnapshotFallback,
      traceBubbleSnapshot,
    })

  const { markLocalBubbleSnapshotChanged: markLocalBubbleSnapshotChangedRealtime } = useBubbleSnapshotRealtime({
    projectId,
    canPublish: canEditBubble,
    bubbles,
    connections,
    onRemoteSnapshot: applyRemoteBubbleSnapshot,
    onRemoteFloorPlanSnapshot: applyRemoteFloorPlanSnapshot,
    onPhaseStatusChanged: setWorkspacePhaseStatus,
    onIfcStorageUrlReceived: (ifcStorageUrl, action, assetId, revisionId) => {
      if (
        pendingOpenThreeDOnGenerateCompleteRef.current &&
        action === WORKSPACE_SYNC_ACTION.floorPlanGenerateCompleted &&
        projectId
      ) {
        pendingOpenThreeDOnGenerateCompleteRef.current = false
        const normalizedIfcUrl = ifcStorageUrl.trim()
        if (revisionId !== undefined) {
          setIfcRevisionByProjectId((prev) => ({
            ...prev,
            [projectId]: revisionId ?? null,
          }))
        }
        if (normalizedIfcUrl) {
          setIfcSourceByProjectId((prev) => ({
            ...prev,
            [projectId]: {
              url: normalizedIfcUrl,
              storageUrl: normalizedIfcUrl,
              assetId: assetId ?? null,
            },
          }))
          writeCachedIfcSource(projectId, {
            url: normalizedIfcUrl,
            storageUrl: normalizedIfcUrl,
            assetId: assetId ?? null,
            revisionId: revisionId ?? null,
          })
        }
        clearFloorPlanGenerateTimeout()
        setFloorPlanGenerateStatusText('평면도 생성 상태를 확인하는 중입니다.')
        setWorkspacePhaseStatus('IFC_EDIT')
        setSaveStatus('synced')
        setMode('3d')
        return
      }
      handleIfcSyncMessageRef.current(ifcStorageUrl, action, assetId, revisionId)
    },
    onBubbleHistoryCursorChanged: handleBubbleHistoryCursorChanged,
    onFloorPlanHistoryCursorChanged: handleFloorPlanHistoryCursorChanged,
    onBubbleHistoryCursorInvalid: handleBubbleHistoryCursorInvalid,
    onFloorPlanHistoryCursorInvalid: handleFloorPlanHistoryCursorInvalid,
    onServerError: handleWorkspaceServerError,
    bubbleHistoryCursor,
    floorPlanHistoryCursor,
  })

  const summarizeBubbleSnapshotSaveError = useCallback((error: unknown) => {
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

  const {
    clearDirty: clearBubbleSnapshotDirty,
    markDirty: markBubbleSnapshotDirty,
    isDirty: isBubbleSnapshotDirty,
    flushSaveToDb: flushBubbleSnapshotSaveToDb,
    scheduleSaveToDb: scheduleBubbleSnapshotSaveToDb,
    cancelScheduledSave: cancelScheduledBubbleSnapshotSave,
  } = useBubbleDbSaveController({
    projectId,
    workspacePhaseStatus,
    latestBubbleSnapshotRef,
    bubbleSnapshotChangeVersionRef,
    saveToDb: saveBubbleSnapshotToDb,
    normalizeFloorMetaForSync: normalizeBubbleFloorMetaForSync,
    writeSavedRecovery: writeBubbleSavedRecoveryToStorage,
    clearLocalDraft: clearBubbleLocalDraftFromStorage,
    resolveDebounceMs: resolveBubbleDbSaveDebounceMs,
    callbacks: {
      onSaveBegin: ({ force, saveStartVersion, snapshot }) => {
        bubbleDbSaveUnsavedVersionRef.current = hasUnsavedDbChangesRef.current
          ? unsavedDbChangeVersionRef.current
          : null
        logBubbleDebug('db-save:begin', {
          projectId,
          force,
          saveStartVersion,
          summary: summarizeBubbleSnapshotForDebug(snapshot),
        })
        traceBubbleSnapshot('db-save:begin', projectId, snapshot, { force, saveStartVersion })
      },
      onSaveSuccess: ({ saved, snapshot, force, saveStartVersion, changedDuringSave }) => {
        if (isBubbleDebugEnabled()) {
          const summary = summarizeBubbleSnapshotForDebug(snapshot)
          console.table(summary.bubbleFloorRows)
        }
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
        if (!changedDuringSave && bubbleDbSaveUnsavedVersionRef.current !== null) {
          clearUnsavedDbChangesIfUnchanged(bubbleDbSaveUnsavedVersionRef.current)
          bubbleDbSaveUnsavedVersionRef.current = null
        }
        if (force && manualBubbleDbSaveStartVersionRef.current !== null) {
          manualBubbleDbSaveStartVersionRef.current = null
        }
      },
      onSaveFailure: ({ error, force }) => {
        const errorSummary = summarizeBubbleSnapshotSaveError(error)
        console.warn('[editor] Bubble snapshot DB 저장 실패:', { projectId, error })
        console.warn('[editor] Bubble snapshot DB 저장 실패 상세:', { projectId, error: errorSummary })
        logBubbleDebug('db-save:failed', { projectId, force, error: errorSummary })
        bubbleDbSaveUnsavedVersionRef.current = null
        if (force) {
          manualBubbleDbSaveStartVersionRef.current = null
        }
      },
    },
  })

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
    cancelScheduledBubbleSnapshotSave()
    clearBubbleSnapshotDirty()
    clearPendingWorkspaceSyncRefs()
    resetWorkspaceTransactionRefs()
    isBubbleDragTransactionActiveRef.current = false
    hasUserEditedRef.current = false
    unsavedDbChangeVersionRef.current += 1
    hasUnsavedDbChangesRef.current = false
    setHasUnsavedDbChanges(false)

    applyRemoteBubbleSnapshot({
      bubbles: parsedSnapshot.bubbles,
      connections: parsedSnapshot.connections,
      zones: parsedSnapshot.zones,
      floorMeta: extractBubbleFloorMetaFromWorkspaceSnapshot(parsedSnapshot),
    })
    previousSnapshotRef.current = baselineSnapshot
    return true
  }, [
    applyRemoteBubbleSnapshot,
    cancelScheduledBubbleSnapshotSave,
    clearPendingWorkspaceSyncRefs,
    clearBubbleSnapshotDirty,
    clearServerPublishRetry,
    resetWorkspaceTransactionRefs,
  ])

  const saveFloorPlanSnapshotToDb = useCallback(async () => {
    if (!projectId) return null
    const dbSaveStartVersion = unsavedDbChangeVersionRef.current

    const baseIndex = floorPlanHistoryBaseIndexRef.current
    const hasValidBaseIndex = Number.isInteger(baseIndex) && baseIndex >= 0
    let s3Url = currentIfcStorageUrl?.trim() || null
    if (!s3Url && currentIfcUrl && isIfcObjectStorageKey(currentIfcUrl)) {
      s3Url = currentIfcUrl.trim()
    }
    if (!s3Url) {
      const workspaceDetail = await projectService.getWorkspaceDetail(projectId).catch(() => null)
      const fallbackStorageUrl = workspaceDetail?.ifcStorageUrl?.trim() || null
      if (fallbackStorageUrl) s3Url = fallbackStorageUrl
    }
    if (!hasValidBaseIndex && !s3Url) {
      console.warn('[editor] Floor-plan DB save skipped: missing baseIndex and IFC URL.', { projectId, baseIndex })
      setSaveStatus('error')
      return null
    }

    const normalizedRevisionId = currentIfcRevisionId?.trim() || null
    const revisionId = normalizedRevisionId && UUID_LIKE_PATTERN.test(normalizedRevisionId)
      ? normalizedRevisionId
      : null

    setSaveStatus('syncing')
    try {
      const saved = await workspaceSaveService.saveFloorPlanSnapshot(projectId, {
        revisionId,
        baseIndex: hasValidBaseIndex ? baseIndex : undefined,
        s3Url,
      })
      setWorkspacePhaseStatus(saved.phaseStatus ?? saved.status ?? workspacePhaseStatus)

      if (saved.revisionId) {
        setIfcRevisionByProjectId((prev) => ({
          ...prev,
          [projectId]: saved.revisionId ?? null,
        }))
      }

      if (saved.s3Url?.trim()) {
        const resolvedS3Url = saved.s3Url.trim()
        setIfcSourceByProjectId((prev) => ({
          ...prev,
          [projectId]: {
            url: currentIfcUrl ?? resolvedS3Url,
            storageUrl: resolvedS3Url,
            assetId: currentIfcAssetId,
          },
        }))
        writeCachedIfcSource(projectId, {
          url: currentIfcUrl ?? resolvedS3Url,
          storageUrl: resolvedS3Url,
          assetId: currentIfcAssetId,
          revisionId: saved.revisionId ?? revisionId,
        })
      }

      setSaveStatus('synced')
      clearUnsavedDbChangesIfUnchanged(dbSaveStartVersion)
      return saved
    } catch (error: unknown) {
      const parsedError = isAxiosError(error)
        ? {
          status: error.response?.status,
          code: (error.response?.data as { code?: unknown } | undefined)?.code,
          message: (error.response?.data as { message?: unknown } | undefined)?.message ?? error.message,
        }
        : error
      console.warn('[editor] Floor-plan snapshot DB save failed:', { projectId, error: parsedError })
      setSaveStatus('error')
      return null
    }
  }, [
    clearUnsavedDbChangesIfUnchanged,
    currentIfcAssetId,
    currentIfcRevisionId,
    currentIfcStorageUrl,
    currentIfcUrl,
    projectId,
    workspacePhaseStatus,
  ])

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
    markUnsavedDbChanges()
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
  }, [
    flushPendingLocalBubbleChange,
    markLocalBubbleSnapshotChangedRealtime,
    markUnsavedDbChanges,
    projectId,
    scheduleBubbleSnapshotSaveToDb,
  ])

  const markLocalFloorPlanSnapshotChanged = useCallback(() => {
    hasUserEditedRef.current = true
    markUnsavedDbChanges()
    if (!floorPlanSnapshotCommitScheduledRef.current) {
      floorPlanSnapshotCommitScheduledRef.current = true
      window.setTimeout(() => {
        floorPlanSnapshotCommitScheduledRef.current = false
        setWorkspaceSnapshotCommitVersion((version) => version + 1)
      }, 0)
    }
    setSaveStatus('dirty')
  }, [markUnsavedDbChanges])

  const beginWorkspaceSnapshotTransaction = useCallback(() => {
    hasUserEditedRef.current = true
    markUnsavedDbChanges()
    workspaceEditTransactionDepthRef.current += 1
    lastWorkspaceSnapshotTransactionAtRef.current = Date.now()
    floorRoomMoveSessionRef.current = null
    setSaveStatus('dirty')
  }, [markUnsavedDbChanges])

  /**
   * 열린 편집 트랜잭션을 서버 발행 대상 스냅샷으로 확정한다.
   * - pending 플래그를 해제
   * - commit version을 증가시켜 publish effect를 트리거
   */
  const requestWorkspaceSnapshotCommit = useCallback(() => {
    pendingWorkspaceSnapshotCommitRef.current = false
    setWorkspaceSnapshotCommitVersion((version) => version + 1)
  }, [])

  const commitWorkspaceSnapshotTransaction = useCallback(() => {
    workspaceEditTransactionDepthRef.current = Math.max(0, workspaceEditTransactionDepthRef.current - 1)
    if (workspaceEditTransactionDepthRef.current > 0) return
    floorRoomMoveSessionRef.current = null
    requestWorkspaceSnapshotCommit()
  }, [requestWorkspaceSnapshotCommit])

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
    requestWorkspaceSnapshotCommit()
  }, [commitBubbleDragSnapshot, requestWorkspaceSnapshotCommit])

  const handleManualSave = useCallback(() => {
    if (isEditorReadOnly) return
    hasUserEditedRef.current = true
    flushPendingLocalBubbleChange()
    flushOpenWorkspaceSnapshotTransaction()
    if (workspacePhaseStatus === 'BUBBLE_DRAFT') {
      markBubbleSnapshotDirty()
      const manualDbSaveStartVersion = unsavedDbChangeVersionRef.current
      manualBubbleDbSaveStartVersionRef.current = manualDbSaveStartVersion
      void flushBubbleSnapshotSaveToDb(true).then((saved) => {
        if (!saved) return
        clearUnsavedDbChangesIfUnchanged(manualDbSaveStartVersion)
        manualBubbleDbSaveStartVersionRef.current = null
      })
      setSaveStatus('dirty')
      setWorkspaceSnapshotCommitVersion((version) => version + 1)
    } else {
      void saveFloorPlanSnapshotToDb()
    }
  }, [
    flushBubbleSnapshotSaveToDb,
    flushOpenWorkspaceSnapshotTransaction,
    flushPendingLocalBubbleChange,
    isEditorReadOnly,
    markBubbleSnapshotDirty,
    clearUnsavedDbChangesIfUnchanged,
    saveFloorPlanSnapshotToDb,
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
        (hasUserEditedRef.current || isBubbleSnapshotDirty())
      if (shouldPersistOnExit) {
        markBubbleSnapshotDirty()
        void flushBubbleSnapshotSaveToDb(true)
      }
    }

    window.addEventListener('beforeunload', handlePageExit)
    window.addEventListener('pagehide', handlePageExit)
    return () => {
      window.removeEventListener('beforeunload', handlePageExit)
      window.removeEventListener('pagehide', handlePageExit)
    }
  }, [flushBubbleSnapshotSaveToDb, flushOpenWorkspaceSnapshotTransaction, flushPendingLocalBubbleChange, isBubbleSnapshotDirty, markBubbleSnapshotDirty, projectId, workspacePhaseStatus])

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

  const unmountCleanupContextRef = useRef<{
    projectId: string | undefined
    workspacePhaseStatus: PhaseStatus
    markBubbleSnapshotDirty: () => void
    flushBubbleSnapshotSaveToDb: (force?: boolean) => Promise<unknown>
    flushPendingLocalBubbleChange: () => void
    resolveServerHistoryBaseIndex: (snapshot: WorkspaceSnapshot) => number
  }>({
    projectId,
    workspacePhaseStatus,
    markBubbleSnapshotDirty,
    flushBubbleSnapshotSaveToDb,
    flushPendingLocalBubbleChange,
    resolveServerHistoryBaseIndex,
  })

  useEffect(() => {
    unmountCleanupContextRef.current = {
      projectId,
      workspacePhaseStatus,
      markBubbleSnapshotDirty,
      flushBubbleSnapshotSaveToDb,
      flushPendingLocalBubbleChange,
      resolveServerHistoryBaseIndex,
    }
  }, [
    flushBubbleSnapshotSaveToDb,
    flushPendingLocalBubbleChange,
    markBubbleSnapshotDirty,
    projectId,
    resolveServerHistoryBaseIndex,
    workspacePhaseStatus,
  ])

  useEffect(() => {
    markLocalFloorPlanSnapshotChangedRef.current = markLocalFloorPlanSnapshotChanged
  }, [markLocalFloorPlanSnapshotChanged])

  useEffect(() => {
    return () => {
      cancelScheduledBubbleSnapshotSave()
      if (localBubbleChangeFlushRafRef.current !== null) {
        window.cancelAnimationFrame(localBubbleChangeFlushRafRef.current)
        localBubbleChangeFlushRafRef.current = null
      }
      pendingLocalBubbleChangeTaskRef.current = null
    }
  }, [cancelScheduledBubbleSnapshotSave])

  useEffect(() => {
    return () => {
      const {
        projectId: cleanupProjectId,
        workspacePhaseStatus: cleanupPhaseStatus,
        markBubbleSnapshotDirty: markDirtyForCleanup,
        flushBubbleSnapshotSaveToDb: flushSaveForCleanup,
        flushPendingLocalBubbleChange: flushLocalChangeForCleanup,
        resolveServerHistoryBaseIndex: resolveBaseIndexForCleanup,
      } = unmountCleanupContextRef.current

      // 프로젝트 전환/언마운트 시점 상태를 기록해 유실 원인 추적에 사용한다.
      logBubbleDebug('cleanup:fired', {
        projectId: cleanupProjectId,
        hasUserEdited: hasUserEditedRef.current,
        willSave: hasUserEditedRef.current,
        floorSummary: summarizeBubbleSnapshotForDebug(latestBubbleSnapshotRef.current),
      })

      // 사용자가 편집하지 않은 경우(bootstrap 진행 중이거나 React StrictMode 이중 실행 등)
      // 초기 상태로 local draft와 DB를 덮어써 기존 드래프트 데이터가 손실되는 것을 방지한다.
      if (!hasUserEditedRef.current) return

      flushLocalChangeForCleanup()
      const latestBubbleSnapshot = latestBubbleSnapshotRef.current
      writeBubbleLocalDraftToStorage(cleanupProjectId, latestBubbleSnapshot)

      if (!cleanupProjectId || cleanupPhaseStatus !== 'BUBBLE_DRAFT') return

      markDirtyForCleanup()
      void flushSaveForCleanup(true)

      const latestSnapshot = latestDraftSnapshotRef.current
      const publishSnapshot: WorkspaceSnapshot = {
        ...latestSnapshot,
        phaseStatus: 'BUBBLE_DRAFT',
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
        activeIfcStoreyExpressId: null,
        overlayIfcStoreyExpressIds: [],
        overlayFloorLayerIds: [],
        hiddenElementIds: [],
        ifcStoreyNameOverrides: {},
      }
      const persistedSnapshot = mapSnapshotForPersistenceRef.current(publishSnapshot)
      void workspaceRealtimeService.publishSnapshot({
        projectId: cleanupProjectId,
        snapshot: persistedSnapshot,
        baseIndex: resolveBaseIndexForCleanup(persistedSnapshot),
      }).catch(() => {
        // 화면 이탈 시점 best-effort sync이므로 실패는 조용히 무시한다.
      })
    }
  }, [])

  const updateFloorWallFromEditable = useCallback((
    wallId: string,
    updater: (wall: FloorWall) => FloorWall,
    options: { floorLayerId?: string | null } = {},
  ) => {
    const targetFloorLayerId = options.floorLayerId?.trim() || null
    setFloorWalls((prev) => {
      const ensured = prev.some((wall) => wall.id === wallId)
        ? prev
        : (() => {
          const autoWall = visibleAutoFloorWalls.find((wall) => wall.id === wallId)
          return autoWall
            ? [...prev, { ...autoWall, floorLayerId: autoWall.floorLayerId ?? targetFloorLayerId ?? activeFloorLayerId ?? undefined }]
            : prev
        })()
      return ensured.map((wall) => {
        if (wall.id !== wallId) return wall
        const nextWall = updater(wall)
        return targetFloorLayerId && !nextWall.floorLayerId
          ? { ...nextWall, floorLayerId: targetFloorLayerId }
          : nextWall
      })
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
    const selectedOverlayLayerIdSet = new Set(overlayLayerIds)
    return floorLayers
      .filter((layer) => layer.id !== activeFloorLayerId && selectedOverlayLayerIdSet.has(layer.id))
      .map((layer) => ({
        layerId: layer.id,
        layerName: layer.name,
        storeyGlobalId: layer.storeyGlobalId,
        storeyName: layer.storeyName,
        opacity: overlayOpacityByLayerId[layer.id] ?? 0.35,
        rooms: layer.rooms,
      }))
  }, [isLayerOverlayMode, activeFloorLayerId, floorLayers, overlayLayerIds, overlayOpacityByLayerId])

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

  const activeFloorBubbleIdSet = useMemo(() => {
    const ids = bubbles
      .filter((bubble) => normalizeBubbleFloor(bubble.floor) === resolvedActiveBubbleFloor)
      .map((bubble) => bubble.id)
    return new Set(ids)
  }, [bubbles, resolvedActiveBubbleFloor])

  const zoningListItems = useMemo(
    () =>
      [...autoZones, ...manualZones].filter((zone) =>
        zone.bubbleIds.some((bubbleId) => activeFloorBubbleIdSet.has(bubbleId))),
    [activeFloorBubbleIdSet, autoZones, manualZones],
  )

  const viewportInsets = useEditorViewportInsets({
    mode,
    isEditorReadOnly,
    isCollaborationMode: effectiveIsCollaborationMode,
    isAgentPanelMode,
    isAttributePanelOpen: panelOpenState.attributes,
    attributePanelWidth: panelWidths.attributes,
  })

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
    viewportInsets,
    bubbles,
    floorRooms,
    floorWalls: mergedFloorWalls,
    floorOpenings: mergedFloorOpenings,
    sitePolygonRing: workspaceSiteBoundary.polygonRing,
    siteAreaM2: workspaceSiteBoundary.areaM2,
    sitePolygonQueryEnabled: false,
    siteBoundaryHydrated: isWorkspaceSiteBoundaryHydrated,
    setSaveStatus,
    onNotice: openNoticeModal,
  })
  const bubbleSitePoints = fixedScaleSitePoints
  const sharedSitePlanPoints = bubbles.length > 0 ? bubbleSitePoints : sitePlanPoints
  const {
    bubbleCanvasViewTransform,
    floorCanvasViewTransform,
    projectNorthViewRotationRadians,
    mapSnapshotForPersistence,
    mapBubblesForFloorPlanGenerate,
    mapLayoutBoundaryInputForFloorPlanGenerate,
  } = useWorkspaceCoordinateFramePolicy({
    bubbleSitePoints,
    sharedSitePlanPoints,
    userViewRotationRadians,
  })
  const toggleProjectNorthViewRotation = useCallback(() => {
    setUserViewRotationRadians((current) => (
      Math.abs(current - projectNorthViewRotationRadians) < 1e-9
        ? 0
        : projectNorthViewRotationRadians
    ))
  }, [projectNorthViewRotationRadians])
  // layout effect에서 먼저 ref를 갱신해 bootstrap 초기 publish 경로도 최신 매핑을 사용하게 한다.
  useLayoutEffect(() => {
    mapSnapshotForPersistenceRef.current = mapSnapshotForPersistence
  }, [mapSnapshotForPersistence])

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
    projectId,
    sitePlanPoints: zoomFitPoints,
    stageWidth: stageSize.width,
    stageHeight: stageSize.height,
    fitPaddingPx: EDITOR_SITE_FIT_PADDING_PX,
    viewportInsets,
  })
  const isWorkspaceBootstrapping = Boolean(projectId) && autosaveReadyProjectId !== projectId

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
  const hiddenElementIdSetForRender = useMemo(() => new Set(hiddenElementIds), [hiddenElementIds])
  const effectiveLocalFloorData = useMemo<FloorPlan3DData | null>(() => {
    if (currentIfcUrl) return localFloorData
    if (!isFloorPlanGenerated && !localFloorData) return null
    const activeLayer = floorLayers.find((layer) => layer.id === activeFloorLayerId)
    const renderRooms = activeFloorLayerId
      ? floorRooms
      : floorLayers.flatMap((layer) => layer.rooms)
    const visibleRooms = renderRooms.filter((room) => (
      !hiddenElementIdSetForRender.has(`2d:room:${room.id}`) &&
      !hiddenElementIdSetForRender.has(`2d:room:${room.bubbleId}`)
    ))
    const visibleWalls = activeLayerVisibleFloorWalls.filter((wall) => !hiddenElementIdSetForRender.has(`2d:wall:${wall.id}`))
    return {
      rooms: visibleRooms,
      walls: visibleWalls,
      storyHeightMm: activeLayer?.ceilingHeightMm ?? localFloorData?.storyHeightMm ?? 3000,
      activeFloorLayerId,
    }
  }, [
    activeFloorLayerId,
    activeLayerVisibleFloorWalls,
    currentIfcUrl,
    floorLayers,
    floorRooms,
    hiddenElementIdSetForRender,
    isFloorPlanGenerated,
    localFloorData,
  ])
  // IFC 기반 3D에서 파싱된 건물 층(IfcBuildingStorey) 목록
  const [ifcStoreys, setIfcStoreys] = useState<IfcStoreyInfo[]>([])
  useLayoutEffect(() => {
    applyIfcStoreyNameOverridesToLoadedStoreysRef.current = (overrides: Record<string, string>) => {
      setIfcStoreys((prev) => {
        const next = applyIfcStoreyNameOverrides(prev, overrides)
        const changed = next.some((storey, index) => storey.name !== prev[index]?.name)
        return changed ? next : prev
      })
    }
    return () => {
      applyIfcStoreyNameOverridesToLoadedStoreysRef.current = () => {}
    }
  }, [])
  const applyCurrentIfcStoreyNameOverrides = useCallback(
    (storeys: IfcStoreyInfo[]) => applyIfcStoreyNameOverrides(storeys, ifcStoreyNameOverrides),
    [ifcStoreyNameOverrides],
  )
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

  /** 실제 모드 전환 적용 — 협업 모드·라이브러리는 모드 이탈 시 닫힘 */
  const applyMode = useCallback((nextMode: EditorMode) => {
    setSearchParams({ mode: nextMode })
    if (nextMode !== mode) resetToolSelection()
    if (nextMode === 'view' || nextMode === 'bubble' || (!isEditorReadOnly && nextMode !== '2d')) {
      setIsCollaborationMode(false)
    }
    if (nextMode === 'view' || nextMode === 'bubble') setIsAgentPanelMode(false)
    if (nextMode !== '2d') setIsCollaborationMode(false)
    if (nextMode !== '3d') {
      setSelectedIfcElement(null)
      setRequestedIfcElementLocalId(null)
      setIfcElementSelectionRequestToken(0)
      setRequestedLibraryElementId(null)
      setLibraryElementSelectionRequestToken(0)
    }
    setIsLibraryOpen(false)
  }, [
    isEditorReadOnly,
    mode,
    resetToolSelection,
    setIsAgentPanelMode,
    setIsCollaborationMode,
    setIsLibraryOpen,
    setSearchParams,
    setSelectedIfcElement,
  ])

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

  /** 공간/방 생성 모달을 기본값으로 연다. */
  const openAddSpaceModal = () => {
    setAddSpaceFormData(INITIAL_ADD_SPACE_FORM)
    setIsAddModalOpen(true)
  }

  const handleOpenAddModal = () => {
    const canOpenAddModal = mode === '2d' ? canEditFloorPlan : !isBubbleReadOnly
    if (!canOpenAddModal) return
    openAddSpaceModal()
  }

  /**
   * 2D 모드에서 버블 생성 결과를 즉시 FloorRoom으로 동기화한다.
   * - 버블/평면도 스냅샷 dirty 플래그를 모두 갱신한다.
   * - 생성 직후 선택/동기화 상태를 한 번에 정리한다.
   */
  const handleConfirmAddSpaceInTwoD = () => {
    if (!canEditFloorPlan) return
    setIsFloorPlanEditedIn2D(true)
    markLocalBubbleSnapshotChanged()
    markLocalFloorPlanSnapshotChanged()

    const activeLayer = activeFloorLayerId
      ? floorLayers.find((layer) => layer.id === activeFloorLayerId) ?? null
      : null
    const activeLayerIndex = activeLayer
      ? floorLayers.findIndex((layer) => layer.id === activeLayer.id)
      : -1
    const targetFloor = activeLayer && activeLayerIndex >= 0
      ? resolveBubbleFloorFromLayer(activeLayer, activeLayerIndex)
      : resolvedActiveBubbleFloor
    const createdBubble = addBubble(addSpaceFormData, targetFloor)
    const connectedIds = collectConnectedRoomIds(createdBubble.id, connections)
    const createdRoom = toFloorRoomFromBubble(createdBubble, connectedIds)
    const targetLayerId = `floor-${normalizeBubbleFloor(createdBubble.floor)}`
    const matchedLayer = activeLayer
      ?? floorLayers.find((layer) => layer.id === targetLayerId)
      ?? null
    workspaceCommandPublisher.createRoom(createdRoom, {
      storeyGlobalId: matchedLayer?.storeyGlobalId,
      storeyName: matchedLayer?.storeyName ?? matchedLayer?.name,
    })

    if (matchedLayer) {
      const nextRooms = upsertFloorRoomByBubbleId(matchedLayer.rooms, createdRoom)
      const nextLayers = floorLayers.map((layer) => (
        layer.id === matchedLayer.id
          ? { ...layer, rooms: nextRooms }
          : layer
      ))
      replaceFloorPlanState({
        isGenerated: isFloorPlanGenerated,
        layoutSource: floorPlanLayoutSource,
        layers: nextLayers,
        activeLayerId: matchedLayer.id,
      })
      syncFloorDerivedStateFromRooms(nextRooms)
    } else {
      // 레이어 매핑 정보가 없을 때는 기존 활성 층 경로로 폴백한다.
      addActiveRoom(createdRoom)
      const nextRooms = upsertFloorRoomByBubbleId(floorRooms, createdRoom)
      syncFloorDerivedStateFromRooms(nextRooms)
    }

    handleBubbleSelect(createdBubble.id)
    clearConnectionAndTwoDSelection()
    setIsAddModalOpen(false)
  }

  const handleConfirmAddSpace = () => {
    if (mode === '2d') {
      handleConfirmAddSpaceInTwoD()
      return
    }
    if (isBubbleReadOnly) return
    markLocalBubbleSnapshotChanged()
    const createdBubble = addBubble(addSpaceFormData, resolvedActiveBubbleFloor)
    handleBubbleSelect(createdBubble.id)
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
      removeBubbleIdsFromZones(floorBubbleIds)
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
    removeBubbleIdsFromZones,
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

  const openAssistantPanel = useCallback(() => {
    setIsAgentPanelMode(true)
    setIsCollaborationMode(false)
    setSelectedPinId(null)
  }, [])

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
  }, [commentPins, markPinCommentsRead, markPinNotificationsRead])

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
    openEditModal({
      ...zone,
      bubbleIds: zone.bubbleIds.filter((bubbleId) => activeFloorBubbleIdSet.has(bubbleId)),
    })
  }

  const handleToggleZoningBubble = (bubbleId: string) => {
    if (isBubbleReadOnly) return
    toggleZoningBubble(bubbleId)
  }

  const handleConfirmZoningModal = () => {
    if (isBubbleReadOnly) return
    const changed = confirmZoningModal(activeFloorBubbleIdSet)
    if (changed) {
      markLocalBubbleSnapshotChanged()
    }
  }

  const handleDeleteZone = (zoneId: string) => {
    if (isBubbleReadOnly) return
    const exists = zones.some((zone) => zone.id === zoneId)
    if (!exists) return
    deleteZone(zoneId)
    markLocalBubbleSnapshotChanged()
  }

  /** 버블 삭제 — 연결선도 함께 제거 */
  const handleDeleteBubble = (id: string) => {
    if (isBubbleReadOnly) return
    markLocalBubbleSnapshotChanged()
    removeBubbleIdsFromZones([id])
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

  const handleClearCanvasSelection = useCallback(() => {
    clearSelection()
    clearConnectionAndTwoDSelection()
    setSelectedIfcElement(null)
  }, [clearConnectionAndTwoDSelection, clearSelection])

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
            { globalId: previous?.globalId, ifcClass: previous?.ifcClass },
          ))
        if (!workspaceCommandPublisher.hasPendingCommand()) {
          workspaceCommandPublisher.markSnapshotOnlyChange('ifc-selection-transform', String(selectionPatch.expressId), {
            expressId: selectionPatch.expressId,
            globalId: previous?.globalId,
            ifcClass: previous?.ifcClass,
          })
        }
        markLocalFloorPlanSnapshotChanged()
      }
      return element
    })
    if (!element) return
    clearSelection()
    // 3D 계층(벽/개구부)에서 선택한 상태를 유지해야 하므로
    // IFC 요소 선택 시 2D 구조물 선택 상태는 초기화하지 않는다.
    setSelectedConnectionPair(null)
  }, [clearSelection, markLocalFloorPlanSnapshotChanged, mode, workspaceCommandPublisher])

  const handleSelectIfcElementByLocalId = useCallback((localId: number) => {
    if (!Number.isFinite(localId)) return
    const normalizedLocalId = Math.trunc(localId)
    if (normalizedLocalId <= 0) return
    clearSelection()
    clearConnectionAndTwoDSelection()
    setRequestedIfcElementLocalId(normalizedLocalId)
    setIfcElementSelectionRequestToken((prev) => prev + 1)
  }, [clearSelection, clearConnectionAndTwoDSelection])

  /**
   * 3D 라이브러리 프리셋을 현재 활성 IFC 층에 새 인스턴스로 추가한다.
   * 협업/저장 동기화를 위해 React 상태 변경 전에 workspace command를 먼저 기록한다.
   */
  const handleAddLibraryPreset = useCallback((preset: ThreeDLibraryPreset, options?: { closePanel?: boolean }) => {
    const storeyExpressId = activeIfcStoreyExpressId ?? null
    const floorLayerId = storeyExpressId == null
      ? (activeFloorLayerId ?? floorLayers[0]?.id ?? null)
      : null

    // IFC 층이 있는데 현재 활성 층이 없으면 추가를 중단하고 설정 방법을 안내한다.
    if (storeyExpressId == null && ifcStoreys.length > 0) {
      openNoticeModal({
        title: '층 선택 필요',
        message: '층보기에서 층을 선택한 뒤 추가하세요.',
      })
      return
    }

    const nextPreset = {
      ...preset,
      id: `${preset.id}-${Date.now()}-${libraryElements.length}`,
      storeyExpressId,
      floorLayerId,
    }
    workspaceCommandPublisher.createLibraryElement(nextPreset)
    markLocalFloorPlanSnapshotChanged()
    publishSceneUpdateEvent({
      type: 'ELEMENT_ADDED',
      elementId: `library:${nextPreset.id}`,
      floorId: storeyExpressId != null ? String(storeyExpressId) : floorLayerId,
      payload: { sourceType: 'LIBRARY' },
    })
    setLibraryElements((prev) => [
      ...prev,
      nextPreset,
    ])
    clearSelection()
    clearConnectionAndTwoDSelection()
    setSelectedIfcElement({
      id: nextPreset.id,
      name: nextPreset.name,
      ifcClass: 'LibraryElement',
      category: nextPreset.type,
      source: 'library',
      expressId: nextPreset.id,
      globalId: nextPreset.id,
      lengthMm: nextPreset.lengthMm,
      heightMm: nextPreset.heightMm,
      thicknessMm: nextPreset.thicknessMm,
      positionX: nextPreset.position?.x,
      positionY: nextPreset.position?.y,
      positionZ: nextPreset.position?.z,
      rotationX: nextPreset.rotation?.x,
      rotationY: nextPreset.rotation?.y,
      rotationZ: nextPreset.rotation?.z,
      color: nextPreset.color,
      material: nextPreset.material,
      properties: {
        LibraryId: nextPreset.id,
        Type: nextPreset.type,
        StoreyExpressId: storeyExpressId ?? '',
        FloorLayerId: floorLayerId ?? '',
      },
    })
    setRequestedLibraryElementId(nextPreset.id)
    setLibraryElementSelectionRequestToken((prev) => prev + 1)
    if (options?.closePanel !== false) setIsLibraryOpen(false)
  }, [
    activeFloorLayerId,
    activeIfcStoreyExpressId,
    clearConnectionAndTwoDSelection,
    clearSelection,
    floorLayers,
    ifcStoreys,
    libraryElements.length,
    markLocalFloorPlanSnapshotChanged,
    openNoticeModal,
    publishSceneUpdateEvent,
    workspaceCommandPublisher,
  ])

  /**
   * 배치된 3D 라이브러리 요소의 위치, 회전, 치수, 색상 같은 속성을 갱신한다.
   * 층 정보가 누락된 과거 데이터는 요소 타입/층 이름 또는 현재 활성 층 기준으로 보정한다.
   */
  const handleChangeLibraryElement = useCallback((id: string, patch: Partial<ThreeDLibraryPreset>) => {
    const target = libraryElements.find((element) => element.id === id)
    if (!target) return
    const mergedTarget = { ...target, ...patch }
    const resolvedTargetFloorLayerId = resolveLibraryElementFloorLayerId(
      mergedTarget,
      floorLayers,
      activeFloorLayerId,
    )
    const commandElement = Number.isFinite(mergedTarget.storeyExpressId)
      ? mergedTarget
      : {
          ...mergedTarget,
          storeyExpressId: activeIfcStoreyExpressId ?? ifcStoreys[0]?.expressId ?? null,
          floorLayerId: resolvedTargetFloorLayerId,
        }
    workspaceCommandPublisher.updateLibraryElement(target, commandElement)
    markLocalFloorPlanSnapshotChanged()
    setLibraryElements((prev) =>
      prev.map((element) => {
        if (element.id !== id) return element
        const merged = { ...element, ...patch }
        if (Number.isFinite(merged.storeyExpressId)) return merged
        const resolvedFloorLayerId = resolveLibraryElementFloorLayerId(
          merged,
          floorLayers,
          activeFloorLayerId,
        )
        return {
          ...merged,
          storeyExpressId: activeIfcStoreyExpressId ?? ifcStoreys[0]?.expressId ?? null,
          floorLayerId: resolvedFloorLayerId,
        }
      }),
    )
    publishSceneUpdateEvent({
      type: 'ELEMENT_UPDATED',
      elementId: `library:${id}`,
      floorId: commandElement.storeyExpressId != null
        ? String(commandElement.storeyExpressId)
        : commandElement.floorLayerId ?? null,
      payload: { sourceType: 'LIBRARY' },
    })
  }, [
    activeFloorLayerId,
    activeIfcStoreyExpressId,
    floorLayers,
    ifcStoreys,
    libraryElements,
    markLocalFloorPlanSnapshotChanged,
    publishSceneUpdateEvent,
    workspaceCommandPublisher,
  ])

  /**
   * 배치된 3D 라이브러리 요소를 삭제하고 선택 상태 및 workspace command를 함께 정리한다.
   */
  const handleDeleteLibraryElement = useCallback((id: string) => {
    const target = libraryElements.find((element) => element.id === id)
    if (target) {
      workspaceCommandPublisher.deleteLibraryElement(target)
      markLocalFloorPlanSnapshotChanged()
    }
    setLibraryElements((prev) => prev.filter((element) => element.id !== id))
    setHiddenElementIds((prev) => prev.filter((elementId) => elementId !== `library:${id}`))
    setSelectedIfcElement((prev) => (prev?.source === 'library' ? null : prev))
    publishSceneUpdateEvent({
      type: 'ELEMENT_REMOVED',
      elementId: `library:${id}`,
      payload: { sourceType: 'LIBRARY' },
    })
  }, [libraryElements, markLocalFloorPlanSnapshotChanged, publishSceneUpdateEvent, workspaceCommandPublisher])

  const handleSelectLibraryElementById = useCallback((id: string) => {
    const normalizedId = id.trim()
    if (!normalizedId) return
    clearSelection()
    clearConnectionAndTwoDSelection()
    setRequestedLibraryElementId(normalizedId)
    setLibraryElementSelectionRequestToken((prev) => prev + 1)
  }, [clearSelection, clearConnectionAndTwoDSelection])

  const syncFloorRoomFromIfcSpaceTranslation = useCallback((
    element: IfcElementInfo,
    translationMm: { x: number; y: number; z: number } | null,
  ): string[] => {
    if (!isIfcSpaceElement(element) || !translationMm) return []
    const dx = translationMm.x / FLOOR_MM_PER_PX
    const dy = -translationMm.y / FLOOR_MM_PER_PX
    if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) return []

    const candidateIds = new Set<string>()
    const globalId = resolveIfcElementGlobalId(element)
    if (globalId) candidateIds.add(globalId)
    candidateIds.add(element.id)
    if (typeof element.expressId === 'number') candidateIds.add(String(element.expressId))

    const { floorLayers: latestFloorLayers, floorWalls: latestFloorWalls } = floorRoomSyncStateRef.current
    const affectedElementGlobalIds = new Set<string>()
    const hasTargetRoom = latestFloorLayers.some((layer) =>
      layer.rooms.some((room) => {
        const isTargetRoom =
          candidateIds.has(room.globalId ?? '') ||
          candidateIds.has(room.id) ||
          candidateIds.has(room.bubbleId)
        if (!isTargetRoom) return false
        collectRoomMoveAffectedElementGlobalIds([room], latestFloorWalls, layer.id)
          .forEach((id) => affectedElementGlobalIds.add(id))
        return true
      }),
    )

    if (!hasTargetRoom) return []
    updateFloorLayers((currentLayers) => {
      let didUpdateRoom = false
      const nextLayers = currentLayers.map((layer) => {
        let didUpdateLayer = false
        const nextRooms = layer.rooms.map((room) => {
          const isTargetRoom =
            candidateIds.has(room.globalId ?? '') ||
            candidateIds.has(room.id) ||
            candidateIds.has(room.bubbleId)
          if (!isTargetRoom) return room
          didUpdateRoom = true
          didUpdateLayer = true
          return translateFloorRoom(room, dx, dy)
        })
        return didUpdateLayer ? { ...layer, rooms: nextRooms } : layer
      })
      return didUpdateRoom ? nextLayers : currentLayers
    })
    return Array.from(affectedElementGlobalIds)
  }, [
    updateFloorLayers,
  ])

  const syncLocalFloorPlanFromThreeDTransform = useCallback((
    element: IfcElementInfo,
    patch: Omit<IfcElementChange, 'expressId'>,
  ): boolean => {
    if (currentIfcUrl) return false
    if (element.source !== 'ifc' || typeof element.expressId === 'number') return false

    let resolvedTranslationMm = toFiniteTranslationMm(patch.translationMm)
    const nextX = typeof patch.positionX === 'number' ? patch.positionX : null
    const nextY = typeof patch.positionY === 'number' ? patch.positionY : null
    const nextZ = typeof patch.positionZ === 'number' ? patch.positionZ : null
    if (
      !resolvedTranslationMm &&
      nextX !== null &&
      nextY !== null &&
      nextZ !== null &&
      typeof element.positionX === 'number' &&
      typeof element.positionY === 'number' &&
      typeof element.positionZ === 'number'
    ) {
      resolvedTranslationMm = {
        x: nextX - element.positionX,
        y: element.positionZ - nextZ,
        z: nextY - element.positionY,
      }
    }

    const candidateIds = buildIfcElementCandidateIds(element)
    const floorLayerIdFromElement =
      (typeof element.properties?.FloorLayerId === 'string' && element.properties.FloorLayerId.trim()) ||
      (typeof element.properties?.LayerId === 'string' && element.properties.LayerId.trim()) ||
      null
    let didSync = false

    if (isIfcSpaceElement(element) && resolvedTranslationMm) {
      const dx = resolvedTranslationMm.x / FLOOR_MM_PER_PX
      const dy = -resolvedTranslationMm.y / FLOOR_MM_PER_PX
      if (Math.abs(dx) >= 0.0001 || Math.abs(dy) >= 0.0001) {
        const { floorLayers: latestFloorLayers } = floorRoomSyncStateRef.current
        const hasTargetRoom = latestFloorLayers.some((layer) =>
          (!floorLayerIdFromElement || layer.id === floorLayerIdFromElement) &&
          layer.rooms.some((room) =>
            hasCandidateId(candidateIds, resolveFloorRoomGlobalId(room), room.globalId, room.id, room.bubbleId)),
        )
        if (hasTargetRoom) {
          updateFloorLayers((currentLayers) => {
            let didUpdateRoom = false
            const nextLayers = currentLayers.map((layer) => {
              if (floorLayerIdFromElement && layer.id !== floorLayerIdFromElement) return layer
              let didUpdateLayer = false
              const nextRooms = layer.rooms.map((room) => {
                const isTargetRoom = hasCandidateId(
                  candidateIds,
                  resolveFloorRoomGlobalId(room),
                  room.globalId,
                  room.id,
                  room.bubbleId,
                )
                if (!isTargetRoom) return room
                didUpdateRoom = true
                didUpdateLayer = true
                return translateFloorRoom(room, dx, dy)
              })
              return didUpdateLayer ? { ...layer, rooms: nextRooms } : layer
            })
            return didUpdateRoom ? nextLayers : currentLayers
          })
          didSync = true
        }
      }
    }

    if (isIfcWallElement(element)) {
      const wallId = typeof element.properties?.WallId === 'string' && element.properties.WallId.trim()
        ? element.properties.WallId.trim()
        : element.id
      const hasFiniteStartEnd =
        patch.startMm &&
        patch.endMm &&
        Number.isFinite(patch.startMm.x) &&
        Number.isFinite(patch.startMm.y) &&
        Number.isFinite(patch.endMm.x) &&
        Number.isFinite(patch.endMm.y)
      if (wallId && resolvedTranslationMm) {
        const dx = resolvedTranslationMm.x / FLOOR_MM_PER_PX
        const dy = -resolvedTranslationMm.y / FLOOR_MM_PER_PX
        if (Math.abs(dx) >= 0.0001 || Math.abs(dy) >= 0.0001) {
          updateFloorWallFromEditable(
            wallId,
            (wall) => ({
              ...wall,
              start: { x: wall.start.x + dx, y: wall.start.y + dy },
              end: { x: wall.end.x + dx, y: wall.end.y + dy },
              startMm: wall.startMm
                ? { x: wall.startMm.x + resolvedTranslationMm.x, y: wall.startMm.y - resolvedTranslationMm.y }
                : wall.startMm,
              endMm: wall.endMm
                ? { x: wall.endMm.x + resolvedTranslationMm.x, y: wall.endMm.y - resolvedTranslationMm.y }
                : wall.endMm,
            }),
            { floorLayerId: floorLayerIdFromElement },
          )
          didSync = true
        }
      } else if (wallId && hasFiniteStartEnd) {
        updateFloorWallFromEditable(
          wallId,
          (wall) => ({
            ...wall,
            start: {
              x: (patch.startMm as Point2D).x / FLOOR_MM_PER_PX,
              y: (patch.startMm as Point2D).y / FLOOR_MM_PER_PX,
            },
            end: {
              x: (patch.endMm as Point2D).x / FLOOR_MM_PER_PX,
              y: (patch.endMm as Point2D).y / FLOOR_MM_PER_PX,
            },
            startMm: patch.startMm,
            endMm: patch.endMm,
          }),
          { floorLayerId: floorLayerIdFromElement },
        )
        didSync = true
      }
    }

    if (didSync) markLocalFloorPlanSnapshotChanged()
    return didSync
  }, [
    currentIfcUrl,
    markLocalFloorPlanSnapshotChanged,
    updateFloorLayers,
    updateFloorWallFromEditable,
  ])

  const syncFloorPlanFromIfcElementDelete = useCallback((element: IfcElementInfo): boolean => {
    const candidateIds = buildIfcElementCandidateIds(element)
    let didSync = false

    if (isIfcSpaceElement(element)) {
      const matchesRoom = (room: FloorRoom) =>
        hasCandidateId(candidateIds, resolveFloorRoomGlobalId(room), room.globalId, room.id, room.bubbleId)
      const hasTargetRoom = floorLayers.some((layer) => layer.rooms.some(matchesRoom))

      if (hasTargetRoom) {
        updateFloorLayers((currentLayers) => {
          let didRemoveRoom = false
          const nextLayers = currentLayers.map((layer) => {
            const nextRooms = layer.rooms.filter((room) => {
              const shouldRemove = matchesRoom(room)
              if (shouldRemove) didRemoveRoom = true
              return !shouldRemove
            })
            return nextRooms.length === layer.rooms.length ? layer : { ...layer, rooms: nextRooms }
          })
          return didRemoveRoom ? nextLayers : currentLayers
        })
        didSync = true
      }
    }

    const wallIdsToDelete = new Set<string>()
    if (isIfcWallElement(element)) {
      floorWalls.forEach((wall) => {
        const wallGlobalId = resolveFloorWallGlobalId(wall)
        if (!hasCandidateId(candidateIds, wallGlobalId, wall.globalId, wall.id)) return
        addElementCandidateId(wallIdsToDelete, wallGlobalId)
        addElementCandidateId(wallIdsToDelete, wall.globalId)
        addElementCandidateId(wallIdsToDelete, wall.id)
      })

      if (wallIdsToDelete.size > 0) {
        setFloorWalls((prev) => {
          const next = prev.filter((wall) =>
            !hasCandidateId(wallIdsToDelete, resolveFloorWallGlobalId(wall), wall.globalId, wall.id),
          )
          return next.length === prev.length ? prev : next
        })
        setSelectedFloorWallId((prev) => (prev && wallIdsToDelete.has(prev) ? null : prev))
        setSelectedFloorWallIds((prev) => prev.filter((wallId) => !wallIdsToDelete.has(wallId)))
        didSync = true
      }
    }

    const openingIdsToDelete = new Set<string>()
    if (isIfcOpeningElement(element)) {
      floorOpenings.forEach((opening) => {
        if (!hasCandidateId(candidateIds, opening.globalId, opening.id)) return
        addElementCandidateId(openingIdsToDelete, opening.globalId)
        addElementCandidateId(openingIdsToDelete, opening.id)
      })
    }
    if (wallIdsToDelete.size > 0) {
      floorOpenings.forEach((opening) => {
        if (!hasCandidateId(wallIdsToDelete, opening.hostWallGlobalId, opening.wallId)) return
        addElementCandidateId(openingIdsToDelete, opening.globalId)
        addElementCandidateId(openingIdsToDelete, opening.id)
      })
    }

    if (openingIdsToDelete.size > 0) {
      setFloorOpenings((prev) => {
        const next = prev.filter((opening) => !hasCandidateId(openingIdsToDelete, opening.globalId, opening.id))
        return next.length === prev.length ? prev : next
      })
      setSelectedFloorOpeningId((prev) => (prev && openingIdsToDelete.has(prev) ? null : prev))
      setSelectedFloorOpeningIds((prev) => prev.filter((openingId) => !openingIdsToDelete.has(openingId)))
      didSync = true
    }

    if (didSync) {
      markLocalFloorPlanSnapshotChanged()
    }
    return didSync
  }, [
    floorLayers,
    floorOpenings,
    floorWalls,
    markLocalFloorPlanSnapshotChanged,
    updateFloorLayers,
  ])

  const recordIfcElementChange = useCallback((element: IfcElementInfo | null, patch: Omit<IfcElementChange, 'expressId' | 'localId' | 'localIds'>) => {
    if (!element || element.source !== 'ifc' || typeof element.expressId !== 'number') return
    markLocalFloorPlanSnapshotChanged()
    const expressId = element.expressId
    let resolvedTranslationMm = toFiniteTranslationMm(patch.translationMm)
    if (shouldPublishIfcElementPatch(element, patch)) {
      const commandPatch: Record<string, unknown> = { ...patch }
      const nextX = typeof patch.positionX === 'number' ? patch.positionX : null
      const nextY = typeof patch.positionY === 'number' ? patch.positionY : null
      const nextZ = typeof patch.positionZ === 'number' ? patch.positionZ : null
      if (resolvedTranslationMm) {
        commandPatch.translationMm = resolvedTranslationMm
      } else if (
        nextX !== null &&
        nextY !== null &&
        nextZ !== null &&
        typeof element.positionX === 'number' &&
        typeof element.positionY === 'number' &&
        typeof element.positionZ === 'number'
      ) {
        resolvedTranslationMm = {
          x: nextX - element.positionX,
          y: element.positionZ - nextZ,
          z: nextY - element.positionY,
        }
        commandPatch.translationMm = resolvedTranslationMm
      }
      const isSpaceTranslation = isIfcSpaceElement(element) && resolvedTranslationMm !== null
      const affectedElementGlobalIds = isSpaceTranslation
        ? syncFloorRoomFromIfcSpaceTranslation(element, resolvedTranslationMm)
        : []
      const spaceGlobalId = isSpaceTranslation ? resolveIfcElementGlobalId(element) : null
      if (isSpaceTranslation && spaceGlobalId) {
        workspaceCommandPublisher.updateRoom(spaceGlobalId, {
          ...commandPatch,
          translationMm: resolvedTranslationMm,
          affectedElementGlobalIds,
        })
      } else {
        workspaceCommandPublisher.updateIfcElement(element, commandPatch)
      }
      if (!workspaceCommandPublisher.hasPendingCommand()) {
        workspaceCommandPublisher.markSnapshotOnlyChange('ifc-element-change', String(expressId), {
          expressId,
          globalId: element.globalId,
          ifcClass: element.ifcClass,
        })
      }
    }

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

      return mergeIfcElementChangeByExpressId(
        prev,
        expressId,
        {
          ...patch,
          localId: Number.isFinite(localId) ? localId : previous?.localId,
          localIds: mergedLocalIds.length > 0 ? mergedLocalIds : previous?.localIds,
        },
        { globalId: element.globalId, ifcClass: element.ifcClass },
      )
    })
    if (!workspaceCommandPublisher.hasPendingCommand()) {
      workspaceCommandPublisher.markSnapshotOnlyChange('ifc-element-change', String(expressId), {
        expressId,
        globalId: element.globalId,
        ifcClass: element.ifcClass,
      })
    }
  }, [markLocalFloorPlanSnapshotChanged, syncFloorRoomFromIfcSpaceTranslation, workspaceCommandPublisher])

  const handleDeleteIfcElement = useCallback((element: IfcElementInfo) => {
    workspaceCommandPublisher.deleteIfcElement(element)
    syncFloorPlanFromIfcElementDelete(element)
    recordIfcElementChange(element, { deleted: true })
    setSelectedIfcElement((prev) => (prev?.id === element.id ? null : prev))
  }, [recordIfcElementChange, syncFloorPlanFromIfcElementDelete, workspaceCommandPublisher])

  const handleCommitIfcElementTransform = useCallback((
    element: IfcElementInfo,
    patch: Omit<IfcElementChange, 'expressId'>,
  ) => {
    setSelectedIfcElement((prev) => {
      if (!prev || prev.source !== element.source) return prev
      const isSameElement = prev.id === element.id || (
        typeof prev.expressId === 'number' &&
        typeof element.expressId === 'number' &&
        prev.expressId === element.expressId
      )
      if (!isSameElement) return prev
      const nextPositionX = typeof patch.positionX === 'number' ? patch.positionX : prev.positionX
      const nextPositionY = typeof patch.positionY === 'number' ? patch.positionY : prev.positionY
      const nextPositionZ = typeof patch.positionZ === 'number' ? patch.positionZ : prev.positionZ
      const nextRotationX = typeof patch.rotationX === 'number' ? patch.rotationX : prev.rotationX
      const nextRotationY = typeof patch.rotationY === 'number' ? patch.rotationY : prev.rotationY
      const nextRotationZ = typeof patch.rotationZ === 'number' ? patch.rotationZ : prev.rotationZ
      const nextLengthMm = typeof patch.lengthMm === 'number' ? patch.lengthMm : prev.lengthMm
      const nextHeightMm = typeof patch.heightMm === 'number' ? patch.heightMm : prev.heightMm
      const nextThicknessMm = typeof patch.thicknessMm === 'number' ? patch.thicknessMm : prev.thicknessMm
      return {
        ...prev,
        lengthMm: nextLengthMm,
        heightMm: nextHeightMm,
        thicknessMm: nextThicknessMm,
        positionX: nextPositionX,
        positionY: nextPositionY,
        positionZ: nextPositionZ,
        rotationX: nextRotationX,
        rotationY: nextRotationY,
        rotationZ: nextRotationZ,
        properties: {
          ...prev.properties,
          Length: nextLengthMm ?? prev.properties.Length,
          Height: nextHeightMm ?? prev.properties.Height,
          Thickness: nextThicknessMm ?? prev.properties.Thickness,
          PositionX: typeof nextPositionX === 'number' ? Number(nextPositionX.toFixed(3)) : prev.properties.PositionX,
          PositionY: typeof nextPositionY === 'number' ? Number(nextPositionY.toFixed(3)) : prev.properties.PositionY,
          PositionZ: typeof nextPositionZ === 'number' ? Number(nextPositionZ.toFixed(3)) : prev.properties.PositionZ,
          RotationX: typeof nextRotationX === 'number' ? Number(nextRotationX.toFixed(2)) : prev.properties.RotationX,
          RotationY: typeof nextRotationY === 'number' ? Number(nextRotationY.toFixed(2)) : prev.properties.RotationY,
          RotationZ: typeof nextRotationZ === 'number' ? Number(nextRotationZ.toFixed(2)) : prev.properties.RotationZ,
        },
      }
    })
    syncLocalFloorPlanFromThreeDTransform(element, patch)
    recordIfcElementChange(element, patch)
  }, [recordIfcElementChange, syncLocalFloorPlanFromThreeDTransform])

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
    const scale = canvasZoom / 100
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
    // 기존 IFC가 이미 존재하는 프로젝트에서 사용자가 실수로 자동 생성을 트리거하면
    // current revision pointer가 새 revision으로 덮여 기존 IFC가 사라진다.
    // 명시적 재생성 UX가 도입되기 전까지는 여기서 차단한다.
    if (currentIfcUrl || currentIfcRevisionId) {
      setFloorPlanGenerateStatusText('이미 생성된 IFC가 있어 자동 생성을 중단했습니다. 기존 IFC를 3D로 열거나 새 프로젝트에서 시도하세요.')
      return
    }
    if (workspacePhaseStatus === 'CONVERTING') {
      setFloorPlanGenerateStatusText('이미 평면도 생성 중입니다. 잠시만 기다려주세요.')
      return
    }
    try {
      cancelScheduledBubbleSnapshotSave()
      const savedSnapshot = await flushBubbleSnapshotSaveToDb(true)
      if (!savedSnapshot) {
        console.error('[editor] 버블 스냅샷 DB 저장 결과가 없어 평면도 생성 요청을 중단합니다.', { projectId })
        return
      }
      const latestSnapshot = latestBubbleSnapshotRef.current
      // 2D 레이어 편집이 버블 원본과 분리되어 있을 수 있어(예: canSyncBubbleStateFrom2D=false),
      // 생성 직전에는 레이어 Room 정보를 버블 스냅샷에 우선 병합해 층/치수/좌표 드리프트를 줄인다.
      const roomByBubbleId = new Map<string, {
        floor: number
        x: number
        y: number
        width: number
        height: number
        widthMm: number
        heightMm: number
        label: string
        type: string
        material?: string
        color: string
      }>()
      floorLayers.forEach((layer, index) => {
        const floorNumber = resolveBubbleFloorFromLayer(layer, index)
        layer.rooms.forEach((room) => {
          roomByBubbleId.set(room.bubbleId, {
            floor: floorNumber,
            x: room.x,
            y: room.y,
            width: room.width,
            height: room.height,
            widthMm: room.widthMm,
            heightMm: room.heightMm,
            label: room.label,
            type: room.type,
            material: room.material,
            color: room.color,
          })
        })
      })

      const mergedGenerationBubbles = latestSnapshot.bubbles.map((bubble) => {
        const room = roomByBubbleId.get(bubble.id)
        if (!room) return bubble
        return {
          ...bubble,
          floor: room.floor,
          x: room.x,
          y: room.y,
          width: room.width,
          height: room.height,
          widthMm: room.widthMm,
          heightMm: room.heightMm,
          label: room.label,
          type: room.type,
          material: room.material ?? bubble.material,
          color: room.color,
        }
      })

      const generationBubbles = mapBubblesForFloorPlanGenerate(mergedGenerationBubbles)
      const generationBoundaryInput = mapLayoutBoundaryInputForFloorPlanGenerate(layoutBoundaryInput)
      const layoutImport = buildFloorPlanLayoutImportPayload(
        projectId,
        currentProjectName,
        generationBubbles,
        latestSnapshot.connections,
        generationBoundaryInput,
        {
          spaceHeightMm: options.spaceHeightMm,
          additionalFloors: floorLayers.map((layer, index) => resolveBubbleFloorFromLayer(layer, index)),
        },
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
    currentIfcRevisionId,
    currentIfcUrl,
    currentProjectName,
    floorLayers,
    flushBubbleSnapshotSaveToDb,
    isCurrentProjectOwner,
    isCurrentProjectOwnerKnown,
    layoutBoundaryInput,
    mapBubblesForFloorPlanGenerate,
    mapLayoutBoundaryInputForFloorPlanGenerate,
    projectId,
    cancelScheduledBubbleSnapshotSave,
    startFloorPlanGenerateTimeout,
    workspacePhaseStatus,
  ])

  // 2D/3D 진입 시 IFC source 조회가 아직 끝나지 않은 경우, 자동 생성 버튼 활성화를 막는다.
  // 이 윈도우에서 사용자가 버튼을 누르면 기존 IFC가 새 revision으로 덮일 수 있다.
  const isIfcSourceHydrationPending =
    Boolean(projectId)
    && hasIfcUploadedInCurrentProject
    && !currentIfcUrl
    && (mode === '2d' || mode === '3d')
    && !ifcSourceHydrationAttemptedProjectIds.includes(projectId ?? '')

  const canGenerateFloorPlanFromBubble = bubbles.length > 0
    && !currentIfcUrl
    && !isIfcSourceHydrationPending
    && authUser?.user_type === 'DESIGNER'
    && (!isCurrentProjectOwnerKnown || isCurrentProjectOwner)

  /** 외부 UI에서 사용하는 모드 전환 핸들러 */
  const setMode = useCallback((nextMode: EditorMode) => {
    applyMode(nextMode)
  }, [applyMode])

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

  const resolveBubbleFloorForLayerSelection = useCallback((layerId: string): number | null => {
    const targetLayer = floorLayers.find((layer) => layer.id === layerId)
    if (!targetLayer) return null

    const layerIndex = floorLayers.findIndex((layer) => layer.id === layerId)
    if (layerIndex < 0) return null
    return resolveBubbleFloorFromLayer(targetLayer, layerIndex)
  }, [floorLayers])

  const setActiveFloorLayerId = useCallback((layerId: string | null) => {
    baseSetActiveFloorLayerId(layerId)
    if (!layerId) return
    const nextFloor = resolveBubbleFloorForLayerSelection(layerId)
    if (nextFloor === null) return

    setActiveBubbleFloor(nextFloor)
    setExtraBubbleFloors((prev) => (prev.includes(nextFloor) ? prev : [...prev, nextFloor]))
    setBubbleFloorNamesByNumber((prev) => (prev[nextFloor] ? prev : { ...prev, [nextFloor]: String(nextFloor) }))
  }, [baseSetActiveFloorLayerId, resolveBubbleFloorForLayerSelection])

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
      markLocalFloorPlanSnapshotChanged()
      return
    }

    setIsLayerOverlayMode((prev) => {
      const next = !prev
      if (next) {
        const baseLayerId = activeFloorLayerId ?? (mode === '3d' ? (floorLayers[0]?.id ?? null) : null)
        if (!activeFloorLayerId && baseLayerId) {
          setActiveFloorLayerId(baseLayerId)
          clearSelection()
          clearConnectionAndTwoDSelection()
          setSelectedIfcElement(null)
        }
        setOverlayLayerIds((current) => {
          const validCurrent = current.filter((layerId) => layerId !== baseLayerId)
          if (validCurrent.length > 0) return validCurrent
          return floorLayers
            .map((layer) => layer.id)
            .filter((layerId) => layerId !== baseLayerId)
        })
      }
      return next
    })
    markLocalFloorPlanSnapshotChanged()
  }, [
    activeFloorLayerId,
    activeIfcStoreyExpressId,
    clearConnectionAndTwoDSelection,
    clearSelection,
    floorLayers,
    ifcStoreys,
    markLocalFloorPlanSnapshotChanged,
    mode,
    setActiveFloorLayerId,
    setOverlayIfcStoreyExpressIds,
  ])

  useEditorKeyboardShortcuts({
    mode,
    isEditorReadOnly,
    isDeleteEnabled: !isTwoDOrThreeDConverting,
    onDeleteSelected: handleDeleteSelected,
    onToggleLayerOverlay: toggleLayerOverlayMode,
    onSetTool: handleSetSelectedTool,
  })

  const handleToggleOverlayLayer = (layerId: string) => {
    const baseLayerId = activeFloorLayerId ?? (mode === '3d' ? floorLayers.find((layer) => layer.id !== layerId)?.id ?? null : null)
    if (!baseLayerId || layerId === baseLayerId) return
    if (!activeFloorLayerId) {
      setActiveFloorLayerId(baseLayerId)
      clearSelection()
      clearConnectionAndTwoDSelection()
      setSelectedIfcElement(null)
    }
    setOverlayLayerIds((prev) =>
      prev.includes(layerId) ? prev.filter((id) => id !== layerId) : [...prev, layerId],
    )
    markLocalFloorPlanSnapshotChanged()
  }
  const handleSelectSingleOverlayLayer = (layerId: string) => {
    const baseLayerId = activeFloorLayerId ?? (mode === '3d' ? floorLayers.find((layer) => layer.id !== layerId)?.id ?? null : null)
    if (!baseLayerId || layerId === baseLayerId) return
    if (!activeFloorLayerId) {
      setActiveFloorLayerId(baseLayerId)
      clearSelection()
      clearConnectionAndTwoDSelection()
      setSelectedIfcElement(null)
    }
    setIsLayerOverlayMode(true)
    setOverlayLayerIds((prev) => (prev.length === 1 && prev[0] === layerId ? [] : [layerId]))
    markLocalFloorPlanSnapshotChanged()
  }
  const handleSetOverlayLayerOpacity = (layerId: string, opacity: number) => {
    const normalized = opacity > 1 ? opacity / 100 : opacity
    const next = Math.min(Math.max(normalized, 0.1), 1)
    setOverlayOpacityByLayerId((prev) => {
      if (prev[layerId] === next) return prev
      return { ...prev, [layerId]: next }
    })
    markLocalFloorPlanSnapshotChanged()
  }
  const syncBubbleFloorForLayer = useCallback((layer: FloorLayer, layerIndex: number) => {
    const nextFloor = resolveBubbleFloorFromLayer(layer, layerIndex)
    setActiveBubbleFloor(nextFloor)
    setExtraBubbleFloors((prev) => (prev.includes(nextFloor) ? prev : [...prev, nextFloor]))
    setBubbleFloorNamesByNumber((prev) => (prev[nextFloor] ? prev : { ...prev, [nextFloor]: String(nextFloor) }))
  }, [])
  const handleAddFloorLayer = useCallback(() => {
    const createdLayer = addFloorLayer()
    if (!createdLayer) return
    syncBubbleFloorForLayer(createdLayer, floorLayers.length)
    workspaceCommandPublisher.createFloorLayer(createdLayer)
    markLocalFloorPlanSnapshotChanged()
  }, [addFloorLayer, floorLayers.length, markLocalFloorPlanSnapshotChanged, syncBubbleFloorForLayer, workspaceCommandPublisher])
  const handleRenameFloorLayer = useCallback((layerId: string, name: string) => {
    const normalizedName = name.trim()
    if (!normalizedName) return
    const currentLayer = floorLayers.find((layer) => layer.id === layerId)
    if (!currentLayer || currentLayer.name === normalizedName) return
    renameFloorLayer(layerId, normalizedName)
    workspaceCommandPublisher.markFloorPlanLayoutChanged({
      action: 'rename_floor_layer',
      layerId,
      name: normalizedName,
    })
    markLocalFloorPlanSnapshotChanged()
  }, [floorLayers, markLocalFloorPlanSnapshotChanged, renameFloorLayer, workspaceCommandPublisher])
  const handleDeleteFloorLayer = useCallback((layerId: string) => {
    if (floorLayers.length <= 1) return
    const deletedLayer = floorLayers.find((layer) => layer.id === layerId)
    if (!deletedLayer) return
    const deletedRoomIds = new Set((deletedLayer?.rooms ?? []).flatMap((room) => [room.id, room.bubbleId].filter(Boolean)))
    const deletedWallIds = new Set(floorWalls.filter((wall) => wall.floorLayerId === layerId).map((wall) => wall.id))
    const deletedOpeningIds = new Set(floorOpenings.filter((opening) => deletedWallIds.has(opening.wallId)).map((opening) => opening.id))
    const deletedLayerName = deletedLayer.name ?? null
    deleteFloorLayer(layerId)
    setFloorWalls((prev) => prev.filter((wall) => wall.floorLayerId !== layerId))
    setFloorOpenings((prev) => prev.filter((opening) => !deletedWallIds.has(opening.wallId)))
    setHiddenElementIds((prev) =>
      prev.filter((elementId) => {
        if (deletedRoomIds.has(elementId.replace(/^2d:room:/, ''))) return false
        if (deletedWallIds.has(elementId.replace(/^2d:wall:/, ''))) return false
        if (deletedOpeningIds.has(elementId.replace(/^2d:opening:/, ''))) return false
        return true
      }),
    )
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
    workspaceCommandPublisher.markFloorPlanLayoutChanged({
      action: 'delete_floor_layer',
      layerId,
      layerName: deletedLayerName,
    })
    markLocalFloorPlanSnapshotChanged()
  }, [
    deleteFloorLayer,
    floorLayers,
    floorOpenings,
    floorWalls,
    markLocalFloorPlanSnapshotChanged,
    workspaceCommandPublisher,
  ])

  const handleSelectFloorLayer = useCallback((layerId: string) => {
    if (!floorLayers.some((layer) => layer.id === layerId)) return
    const nextLayerId = mode === '3d' && activeFloorLayerId === layerId ? null : layerId
    setActiveFloorLayerId(nextLayerId)
    clearSelection()
    clearConnectionAndTwoDSelection()
    setSelectedIfcElement(null)
    setOverlayLayerIds((prev) => nextLayerId ? prev.filter((id) => id !== nextLayerId) : prev)
    publishSceneUpdateEvent({
      type: 'FLOOR_SELECTED',
      floorId: nextLayerId,
      payload: { sourceType: 'FROM_2D' },
    })
    markLocalFloorPlanSnapshotChanged()
  }, [
    activeFloorLayerId,
    clearConnectionAndTwoDSelection,
    clearSelection,
    floorLayers,
    markLocalFloorPlanSnapshotChanged,
    mode,
    publishSceneUpdateEvent,
    setActiveFloorLayerId,
  ])

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
    floorLayers,
    activeFloorLayerId,
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
    onFloorPlanChanged: markLocalFloorPlanSnapshotChanged,
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

  useEffect(() => {
    if (mode !== '3d' || !selectedIfcElement) return
    if (selectedIfcElement.source === 'library') return
    const roomId = typeof selectedIfcElement.properties?.BubbleId === 'string'
      ? selectedIfcElement.properties.BubbleId
      : null
    const wallId = typeof selectedIfcElement.properties?.WallId === 'string'
      ? selectedIfcElement.properties.WallId
      : null
    const openingId = typeof selectedIfcElement.properties?.OpeningId === 'string'
      ? selectedIfcElement.properties.OpeningId
      : null

    if (openingId && selectedFloorOpeningId !== openingId) {
      handleSelectFloorOpening(openingId)
      return
    }
    if (wallId && selectedFloorWallId !== wallId) {
      handleSelectFloorWall(wallId)
      return
    }
    if (roomId && selectedId !== roomId) {
      handleBubbleSelect(roomId)
    }
  }, [
    handleBubbleSelect,
    handleSelectFloorOpening,
    handleSelectFloorWall,
    mode,
    selectedFloorOpeningId,
    selectedFloorWallId,
    selectedId,
    selectedIfcElement,
  ])

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
    const commandRoom = floorRooms.find((room) => room.bubbleId === bubbleId)
    const roomCommandId = commandRoom?.id ?? bubbleId
    workspaceCommandPublisher.updateRoom(roomCommandId, {
      globalId: commandRoom?.globalId,
      x,
      y,
      width: nextWidthPx,
      height: nextHeightPx,
      widthMm: nextWidthMm,
      heightMm: nextHeightMm,
      area: nextAreaM2,
    })
    if (!workspaceCommandPublisher.hasPendingCommand()) {
      workspaceCommandPublisher.markSnapshotOnlyChange('room-resize', roomCommandId, { roomId: roomCommandId })
    }

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
    const selectedSet = new Set(selectedIds)
    const movedSourceRooms = shouldMoveMulti
      ? floorRooms.filter((room) => selectedSet.has(room.bubbleId))
      : floorRooms.filter((room) => room.bubbleId === bubbleId)
    const moveSessionKey = shouldMoveMulti
      ? movedSourceRooms.map((room) => room.bubbleId).sort().join('|')
      : bubbleId
    let moveSession = floorRoomMoveSessionRef.current
    if (!moveSession || moveSession.key !== moveSessionKey) {
      moveSession = {
        key: moveSessionKey,
        baselineRoomsByBubbleId: new Map(movedSourceRooms.map((room) => [room.bubbleId, room] as const)),
        affectedElementGlobalIds: collectRoomMoveAffectedElementGlobalIds(
          movedSourceRooms,
          floorWalls,
          activeFloorLayerId,
        ),
      }
      floorRoomMoveSessionRef.current = moveSession
    }
    const toRoomMoveTranslationMm = (baselineRoom: FloorRoom, nextX: number, nextY: number) => ({
      x: (nextX - baselineRoom.x) * getRoomAxisMmPerPx(baselineRoom, 'x'),
      y: (nextY - baselineRoom.y) * getRoomAxisMmPerPx(baselineRoom, 'y'),
      z: 0,
    })

    if (shouldMoveMulti) {
      nextRooms.forEach((room) => {
        const current = floorRooms.find((item) => item.bubbleId === room.bubbleId)
        if (!current) return
        if (current.x === room.x && current.y === room.y) return
        const baselineRoom = moveSession.baselineRoomsByBubbleId.get(room.bubbleId) ?? current
        workspaceCommandPublisher.updateRoom(current.id ?? room.bubbleId, {
          globalId: current.globalId,
          x: room.x,
          y: room.y,
          translationMm: toRoomMoveTranslationMm(baselineRoom, room.x, room.y),
          affectedElementGlobalIds: moveSession.affectedElementGlobalIds,
        })
        if (!workspaceCommandPublisher.hasPendingCommand()) {
          workspaceCommandPublisher.markSnapshotOnlyChange('room-move', current.id ?? room.bubbleId, {
            roomId: current.id ?? room.bubbleId,
          })
        }
        moveActiveRoom(room.bubbleId, room.x, room.y)
        if (canSyncBubbleStateFrom2D) {
          markLocalBubbleSnapshotChanged()
          handleBubbleMove(room.bubbleId, room.x, room.y)
        }
      })
    } else {
      const current = floorRooms.find((room) => room.bubbleId === bubbleId)
      const baselineRoom = current ? moveSession.baselineRoomsByBubbleId.get(bubbleId) ?? current : null
      workspaceCommandPublisher.updateRoom(current?.id ?? bubbleId, {
        globalId: current?.globalId,
        x,
        y,
        translationMm: baselineRoom ? toRoomMoveTranslationMm(baselineRoom, x, y) : { x: 0, y: 0, z: 0 },
        affectedElementGlobalIds: moveSession.affectedElementGlobalIds,
      })
      if (!workspaceCommandPublisher.hasPendingCommand()) {
        workspaceCommandPublisher.markSnapshotOnlyChange('room-move', current?.id ?? bubbleId, {
          roomId: current?.id ?? bubbleId,
        })
      }
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
    workspaceCommandPublisher.updateRoom(currentRoom.id ?? bubbleId, {
      globalId: currentRoom.globalId,
      x: bounds.minX,
      y: bounds.minY,
      width: nextWidthPx,
      height: nextHeightPx,
      widthMm: nextWidthMm,
      heightMm: nextHeightMm,
      area: nextAreaM2,
      polygon: polygon.map((point) => [point.x, point.y]),
    })
    if (!workspaceCommandPublisher.hasPendingCommand()) {
      workspaceCommandPublisher.markSnapshotOnlyChange('room-polygon', currentRoom.id ?? bubbleId, {
        roomId: currentRoom.id ?? bubbleId,
      })
    }

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
    workspaceCommandPublisher,
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

  const handleUndo = useCallback(async () => {
    if (!projectId) return
    if (mode === 'bubble') {
      if (!canUndo) return
      if (saveStatus === 'dirty' && !hasBubbleUndoHistory) {
        undoUnsyncedLocalBubbleChange()
        return
      }
      if (bubbleHistoryBaseIndexRef.current <= 0) return
      const unsavedMark = markUnsavedDbChanges()
      try {
        publishBubbleUndoRequest(projectId, { baseIndex: bubbleHistoryBaseIndexRef.current })
        pendingBubbleHistoryActionUnsavedVersionRef.current = unsavedMark.version
      } catch (error: unknown) {
        pendingBubbleHistoryActionUnsavedVersionRef.current = null
        restoreUnsavedDbChangesIfUnchanged(unsavedMark.version, unsavedMark.hadUnsavedDbChanges)
        console.warn('[editor] Bubble undo publish failed.', { projectId, error })
      }
      return
    }

    if (!isFloorPlanHistoryMode || !canEditFloorPlan) return
    if (floorPlanHistoryCommandInFlightRef.current) return
    if (floorPlanHistoryBaseIndexRef.current <= 0) {
      await refreshHistoryCursorFromServer({ republishOnFailure: false, republishWhenStale: false })
    }
    if (floorPlanHistoryBaseIndexRef.current <= 0) return
    const unsavedMark = markUnsavedDbChanges()
    try {
      setFloorPlanHistoryCommandInFlight(true)
      setSaveStatus('syncing')
      publishFloorPlanUndoRequest(projectId, { baseIndex: floorPlanHistoryBaseIndexRef.current })
      pendingFloorPlanHistoryActionUnsavedVersionRef.current = unsavedMark.version
    } catch (error: unknown) {
      setFloorPlanHistoryCommandInFlight(false)
      pendingFloorPlanHistoryActionUnsavedVersionRef.current = null
      restoreUnsavedDbChangesIfUnchanged(unsavedMark.version, unsavedMark.hadUnsavedDbChanges)
      setSaveStatus('synced')
      console.warn('[editor] Floor-plan undo publish failed.', { projectId, error })
    }
  }, [
    canUndo,
    canEditFloorPlan,
    hasBubbleUndoHistory,
    isFloorPlanHistoryMode,
    markUnsavedDbChanges,
    mode,
    projectId,
    refreshHistoryCursorFromServer,
    restoreUnsavedDbChangesIfUnchanged,
    saveStatus,
    setFloorPlanHistoryCommandInFlight,
    undoUnsyncedLocalBubbleChange,
  ])

  const handleRedo = useCallback(() => {
    if (!projectId) return
    if (mode === 'bubble') {
      if (!canRedo) return
      if (bubbleHistoryRedoDepthRef.current <= 0) return
      const unsavedMark = markUnsavedDbChanges()
      try {
        publishBubbleRedoRequest(projectId, { baseIndex: bubbleHistoryBaseIndexRef.current })
        pendingBubbleHistoryActionUnsavedVersionRef.current = unsavedMark.version
      } catch (error: unknown) {
        pendingBubbleHistoryActionUnsavedVersionRef.current = null
        restoreUnsavedDbChangesIfUnchanged(unsavedMark.version, unsavedMark.hadUnsavedDbChanges)
        console.warn('[editor] Bubble redo publish failed.', { projectId, error })
      }
      return
    }

    if (!isFloorPlanHistoryMode || !canRedo) return
    if (floorPlanHistoryCommandInFlightRef.current) return
    if (floorPlanHistoryRedoDepthRef.current <= 0) return
    const unsavedMark = markUnsavedDbChanges()
    try {
      setFloorPlanHistoryCommandInFlight(true)
      setSaveStatus('syncing')
      publishFloorPlanRedoRequest(projectId, { baseIndex: floorPlanHistoryBaseIndexRef.current })
      pendingFloorPlanHistoryActionUnsavedVersionRef.current = unsavedMark.version
    } catch (error: unknown) {
      setFloorPlanHistoryCommandInFlight(false)
      pendingFloorPlanHistoryActionUnsavedVersionRef.current = null
      restoreUnsavedDbChangesIfUnchanged(unsavedMark.version, unsavedMark.hadUnsavedDbChanges)
      setSaveStatus('synced')
      console.warn('[editor] Floor-plan redo publish failed.', { projectId, error })
    }
  }, [
    canRedo,
    isFloorPlanHistoryMode,
    markUnsavedDbChanges,
    mode,
    projectId,
    restoreUnsavedDbChangesIfUnchanged,
    setFloorPlanHistoryCommandInFlight,
  ])

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
  ): Promise<boolean> => {
    if (!projectId) return false
    // assetId가 있으면 이를 dedup 키로 사용 (presigned URL은 매번 달라질 수 있어 불안정)
    // 프로젝트 ID를 포함해 프로젝트 간 dedup 충돌을 방지한다.
    if (revisionId !== undefined) {
      setIfcRevisionByProjectId((prev) => ({
        ...prev,
        [projectId]: revisionId ?? null,
      }))
      if (ifcStorageUrl.trim().length > 0) {
        writeCachedIfcSource(projectId, {
          url: ifcStorageUrl,
          storageUrl: ifcStorageUrl,
          assetId: assetId ?? null,
          revisionId: revisionId ?? null,
        })
      }
    }

    const normalizedRevisionKey = revisionId?.trim() || ''
    const normalizedStorageSourceKey = ifcStorageUrl.trim()
      ? normalizeIfcSourceDedupeKey(ifcStorageUrl)
      : ''
    const normalizedSourceKey = assetId?.trim() || normalizedStorageSourceKey
    if (
      !normalizedSourceKey &&
      !revisionId &&
      (
        action === WORKSPACE_SYNC_ACTION.floorPlanUndo ||
        action === WORKSPACE_SYNC_ACTION.floorPlanRedo
      )
    ) {
      setIfcSourceByProjectId((prev) => {
        const { [projectId]: _removed, ...rest } = prev
        return rest
      })
      setIfcRevisionByProjectId((prev) => ({
        ...prev,
        [projectId]: null,
      }))
      lastLoadedIfcStorageUrlRef.current = null
      ifcLoadInFlightStorageUrlRef.current = null
      pendingServerPublishRef.current = null
      awaitingServerSyncRef.current = null
      pendingWorkspaceSnapshotCommitRef.current = false
      clearServerPublishRetry()
      hasUserEditedRef.current = false
      suppressNextAutosaveRef.current = true
      setWorkspacePhaseStatus('BUBBLE_DRAFT')
      setSaveStatus('synced')
      return true
    }
    if (!normalizedSourceKey && revisionId) {
      if (currentIfcUrl && currentIfcRevisionId === revisionId) {
        setWorkspacePhaseStatus('IFC_EDIT')
        return true
      }

      const source = await projectService.getIfcSource(projectId).catch(() => null)

      if (source?.currentIfcUrl) {
        return handleIfcSyncMessageRef.current(
          source.currentIfcStorageUrl ?? source.currentIfcUrl,
          action,
          source.currentIfcAssetId,
          source.currentRevision ?? revisionId,
        )
      }
      return false
    }
    const dedupeSourceKey = assetId?.trim()
      || (normalizedRevisionKey ? `revision:${normalizedRevisionKey}` : normalizedSourceKey)
    const dedupeKey = dedupeSourceKey
      ? `${projectId}:${dedupeSourceKey}:${normalizedRevisionKey || 'no-revision'}`
      : ''
    if (!dedupeKey) return false

    if (ifcLoadInFlightStorageUrlRef.current === dedupeKey) {
      return true
    }
    if (lastLoadedIfcStorageUrlRef.current === dedupeKey) {
      return true
    }

    ifcLoadInFlightStorageUrlRef.current = dedupeKey
    let didLoadIfc = false

    try {
      // private S3 bucket storage key: refresh the latest IFC source from the project API.
      const refreshIfcSource = async () => {
        let lastError: unknown = null
        for (let attempt = 0; attempt < 5; attempt += 1) {
          try {
            const source = await projectService.getIfcSource(projectId)
            const sourceRevision = source.currentRevision ?? revisionId ?? null
            const isExpectedRevision =
              !revisionId ||
              !source.currentRevision ||
              source.currentRevision === revisionId
            if (source.currentIfcUrl && isExpectedRevision) {
              return {
                url: source.currentIfcUrl,
                storageUrl: source.currentIfcStorageUrl ?? source.currentIfcUrl,
                assetId: source.currentIfcAssetId ?? null,
                revisionId: sourceRevision,
              }
            }
            lastError = new Error('Fresh IFC URL revision is not ready.')
          } catch (error: unknown) {
            lastError = error
          }
          await new Promise((resolve) => window.setTimeout(resolve, 500))
        }
        throw lastError instanceof Error
          ? lastError
          : new Error('Fresh IFC URL is unavailable.')
      }

      const normalizedIfcStorageUrl = ifcStorageUrl.trim()
      let resolvedUrl: string
      let resolvedStorageUrl = normalizedIfcStorageUrl
      let resolvedAssetId = assetId ?? null
      let resolvedRevisionId = revisionId ?? null
      const shouldSkipFloorProjectImport =
        action === WORKSPACE_SYNC_ACTION.floorPlanUpdated
      const shouldUseEventIfcStorageUrl =
        action === WORKSPACE_SYNC_ACTION.floorPlanUndo ||
        action === WORKSPACE_SYNC_ACTION.floorPlanRedo

      const shouldRefreshLatestIfcSource =
        !shouldUseEventIfcStorageUrl &&
        (!normalizedIfcStorageUrl || (!assetId && isIfcObjectStorageKey(normalizedIfcStorageUrl)))

      if (shouldRefreshLatestIfcSource) {
        const refreshed = await refreshIfcSource()
        resolvedUrl = refreshed.url
        resolvedStorageUrl = refreshed.storageUrl
        resolvedAssetId = refreshed.assetId
        resolvedRevisionId = refreshed.revisionId
      } else {
        resolvedUrl = await resolveIfcPresignedUrl(ifcStorageUrl, assetId ?? undefined)
        resolvedStorageUrl = normalizedIfcStorageUrl || resolvedUrl
      }

      if (isExpiredPresignedIfcUrl(resolvedUrl)) {
        if (shouldUseEventIfcStorageUrl) {
          resolvedUrl = await resolveIfcPresignedUrl(resolvedStorageUrl, resolvedAssetId ?? undefined)
        } else {
          const refreshed = await refreshIfcSource()
          resolvedUrl = refreshed.url
          resolvedStorageUrl = refreshed.storageUrl
          resolvedAssetId = refreshed.assetId
          resolvedRevisionId = refreshed.revisionId
        }
      }
      // 2D 파싱 완료 후 3D 캔버스로 presigned URL과 assetId 전달
      setIfcSourceByProjectId((prev) => ({
        ...prev,
        [projectId]: {
          url: resolvedUrl,
          storageUrl: resolvedStorageUrl,
          assetId: resolvedAssetId,
        },
      }))
      // IFC가 정상 로드되면 완료 action 문자열과 무관하게 편집 상태로 복귀해 무한 로딩을 방지한다.
      const shouldSuppressGeneratedFloorPlanAutosave = action === 'FLOOR_PLAN_GENERATE_COMPLETED'
      if (shouldSuppressGeneratedFloorPlanAutosave) {
        suppressGeneratedFloorPlanAutosaveRef.current = true
        pendingServerPublishRef.current = null
        awaitingServerSyncRef.current = null
        clearServerPublishRetry()
        hasUserEditedRef.current = false
      }
      try {
        await loadIfcFromStorageUrl(resolvedUrl, {
          webIfcWasmPath: '/',
          skipFloorProjectImport: shouldSkipFloorProjectImport,
        })
      } catch (loadError: unknown) {
        const message = loadError instanceof Error ? loadError.message : ''
        if (!message.includes('(403)')) throw loadError

        if (shouldUseEventIfcStorageUrl) {
          resolvedUrl = await resolveIfcPresignedUrl(resolvedStorageUrl, resolvedAssetId ?? undefined)
        } else {
          const refreshed = await refreshIfcSource()
          resolvedUrl = refreshed.url
          resolvedStorageUrl = refreshed.storageUrl
          resolvedAssetId = refreshed.assetId
          resolvedRevisionId = refreshed.revisionId
        }
        setIfcSourceByProjectId((prev) => ({
          ...prev,
          [projectId]: {
            url: resolvedUrl,
            storageUrl: resolvedStorageUrl,
            assetId: resolvedAssetId,
          },
        }))
        await loadIfcFromStorageUrl(resolvedUrl, {
          webIfcWasmPath: '/',
          skipFloorProjectImport: shouldSkipFloorProjectImport,
        })
      }
      writeCachedIfcSource(projectId, {
        url: resolvedUrl,
        storageUrl: resolvedStorageUrl,
        assetId: resolvedAssetId,
        revisionId: resolvedRevisionId,
      })
      lastLoadedIfcStorageUrlRef.current = dedupeKey
      if (
        action === WORKSPACE_SYNC_ACTION.floorPlanUpdated ||
        action === WORKSPACE_SYNC_ACTION.floorPlanGenerateCompleted ||
        action === WORKSPACE_SYNC_ACTION.floorPlanUndo ||
        action === WORKSPACE_SYNC_ACTION.floorPlanRedo
      ) {
        pendingServerPublishRef.current = null
        awaitingServerSyncRef.current = null
        clearServerPublishRetry()
        hasUserEditedRef.current = false
        suppressNextAutosaveRef.current = true
        setSaveStatus('synced')
      }
      setWorkspacePhaseStatus('IFC_EDIT')
      didLoadIfc = true
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
    if (!didLoadIfc) {
      setIfcSourceByProjectId((prev) => {
        if (currentIfcUrl) {
          return {
            ...prev,
            [projectId]: {
              url: currentIfcUrl,
              storageUrl: currentIfcStorageUrl,
              assetId: currentIfcAssetId,
            },
          }
        }
        const { [projectId]: _removed, ...rest } = prev
        return rest
      })
    }
    return didLoadIfc
  }, [
    clearFloorPlanGenerateTimeout,
    clearServerPublishRetry,
    currentIfcAssetId,
    currentIfcRevisionId,
    currentIfcStorageUrl,
    currentIfcUrl,
    loadIfcFromStorageUrl,
    projectId,
    setFloorPlanGenerateStatusText,
  ])

  useEffect(() => {
    handleIfcSyncMessageRef.current = (
      url: string,
      action: string | null,
      assetId?: string | null,
      revisionId?: string | null,
    ) => {
      return handleOutputIfcStorageUrl(url, action, assetId, revisionId)
    }
  }, [handleOutputIfcStorageUrl])

  useEffect(() => {
    const previousMode = previousEditorModeRef.current
    previousEditorModeRef.current = mode
    if (previousMode === mode) return
    if (mode !== '2d' && mode !== '3d') return
    if (!projectId) return
    if (workspaceEditTransactionDepthRef.current > 0) return

    const requestKey = `${projectId}:${previousMode}->${mode}`
    if (modeSwitchFloorPlanHydrationInFlightRef.current === requestKey) return

    let cancelled = false
    modeSwitchFloorPlanHydrationInFlightRef.current = requestKey

    const waitForPendingWorkspaceSync = async () => {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        if (!pendingWorkspaceSnapshotCommitRef.current && !awaitingServerSyncRef.current) return
        await new Promise((resolve) => window.setTimeout(resolve, 250))
        if (cancelled) return
      }
    }

    const hydrateLatestFloorPlanOnModeSwitch = async () => {
      await waitForPendingWorkspaceSync()
      if (cancelled) return

      const [history, source] = await Promise.all([
        workspaceSaveService.loadHistorySnapshot(projectId).catch(() => null),
        projectService.getIfcSource(projectId).catch(() => null),
      ])
      if (cancelled) return

      const floorPlanHistory = history?.floorPlan ?? null
      const floorPlanSnapshot = floorPlanHistory?.snapshot ?? null
      const floorPlanRevision = floorPlanSnapshot?.revisionId?.trim() || null
      const sourceRevision = source?.currentRevision?.trim() || null
      const currentRevision = currentIfcRevisionId?.trim() || null
      const resolvedRevision = floorPlanRevision ?? sourceRevision ?? null
      const historyBaseIndex =
        typeof floorPlanHistory?.baseIndex === 'number' ? floorPlanHistory.baseIndex : null
      const shouldAcceptHistoryCursor =
        historyBaseIndex === null ||
        historyBaseIndex >= floorPlanHistoryBaseIndexRef.current ||
        (floorPlanRevision !== null && floorPlanRevision !== currentRevision)
      const floorPlanIfcUrl = floorPlanHistory?.s3Url?.trim() || null
      const sourceIfcUrl = source?.currentIfcUrl?.trim() || null
      const sourceIfcStorageUrl = source?.currentIfcStorageUrl?.trim() || sourceIfcUrl
      const resolvedIfcUrl = floorPlanIfcUrl ?? sourceIfcStorageUrl ?? null

      if (floorPlanSnapshot?.layout && shouldAcceptHistoryCursor) {
        suppressNextAutosaveRef.current = true
        applyFloorPlanLayoutState({
          layout: floorPlanSnapshot.layout,
          replaceLayoutState: replaceFloorPlanState,
          fallback: floorPlanSnapshotFallback,
        })

        const nextBaseIndex = floorPlanHistory?.baseIndex ?? floorPlanHistoryBaseIndexRef.current
        const nextRedoDepth = floorPlanHistory?.redoDepth ?? floorPlanHistoryRedoDepthRef.current
        floorPlanHistoryBaseIndexRef.current = nextBaseIndex
        floorPlanHistoryRedoDepthRef.current = nextRedoDepth
        setFloorPlanHistoryCursor({ baseIndex: nextBaseIndex, redoDepth: nextRedoDepth })
        pendingWorkspaceSnapshotCommitRef.current = false
        pendingServerPublishRef.current = null
        awaitingServerSyncRef.current = null
        setSaveStatus(resolveSnapshotSyncStatus())
      }

      if (resolvedRevision !== null) {
        setIfcRevisionByProjectId((prev) => ({
          ...prev,
          [projectId]: resolvedRevision,
        }))
      }

      if (sourceIfcUrl) {
        setIfcSourceByProjectId((prev) => ({
          ...prev,
          [projectId]: {
            url: sourceIfcUrl,
            storageUrl: sourceIfcStorageUrl,
            assetId: source?.currentIfcAssetId ?? null,
          },
        }))
        writeCachedIfcSource(projectId, {
          url: sourceIfcUrl,
          storageUrl: sourceIfcStorageUrl,
          assetId: source?.currentIfcAssetId ?? null,
          revisionId: sourceRevision ?? resolvedRevision,
        })
      }

      if (mode === '2d' && resolvedIfcUrl && !floorPlanSnapshot?.layout) {
        await handleIfcSyncMessageRef.current(
          resolvedIfcUrl,
          null,
          floorPlanIfcUrl ? undefined : source?.currentIfcAssetId,
          resolvedRevision,
        )
        return
      }

      if (mode !== '3d' || !resolvedIfcUrl) return
      if (currentIfcUrl && resolvedRevision !== null && resolvedRevision === currentRevision) return

      await handleIfcSyncMessageRef.current(
        resolvedIfcUrl,
        WORKSPACE_SYNC_ACTION.floorPlanUpdated,
        floorPlanIfcUrl ? undefined : source?.currentIfcAssetId,
        resolvedRevision,
      )
    }

    void hydrateLatestFloorPlanOnModeSwitch().finally(() => {
      if (modeSwitchFloorPlanHydrationInFlightRef.current === requestKey) {
        modeSwitchFloorPlanHydrationInFlightRef.current = null
      }
    })

    return () => {
      cancelled = true
    }
  }, [
    applyFloorPlanLayoutState,
    currentIfcRevisionId,
    currentIfcUrl,
    floorPlanSnapshotFallback,
    mode,
    projectId,
    replaceFloorPlanState,
    resolveSnapshotSyncStatus,
  ])

  // 에디터 첫 진입 시 프로젝트 IFC 소스를 1회 조회한다.
  // - 3D 모드: handleOutputIfcStorageUrl로 IFC 파싱/로드까지 수행한다.
  // - 2D 모드: state(currentIfcUrl/revisionId)만 채워 자동 생성 버튼이 활성화되지 않도록 한다.
  //   2D에서 IFC 파싱은 사용자가 3D로 진입할 때 수행한다 (위 3D 분기 또는 useInitialIfcImport).
  useEffect(() => {
    if (!projectId) return
    if (mode !== '2d' && mode !== '3d') return
    if (currentIfcUrl) return
    if (saveStatus === 'syncing') return
    if (modeSwitchFloorPlanHydrationInFlightRef.current?.startsWith(`${projectId}:`)) return
    if (threeDIfcSourceHydrationInFlightRef.current === projectId) return

    let cancelled = false
    threeDIfcSourceHydrationInFlightRef.current = projectId

    const hydrateLatestIfcSource = async (): Promise<{ fetchFailed: boolean }> => {
      let fetchFailed = false
      const source = await projectService.getIfcSource(projectId).catch((error: unknown) => {
        fetchFailed = true
        if (import.meta.env.DEV) {
          console.warn('[ifc-source][hydrate-failed]', { projectId, mode, error })
        }
        return null
      })
      if (cancelled) return { fetchFailed }
      if (!source?.currentIfcUrl) {
        if (import.meta.env.DEV && !fetchFailed) {
          console.warn('[ifc-source][hydrate-empty]', { projectId, mode })
        }
        return { fetchFailed }
      }
      if (import.meta.env.DEV) {
        console.log('[ifc-source][hydrate]', {
          projectId,
          mode,
          currentIfcUrl: source.currentIfcUrl,
          currentIfcAssetId: source.currentIfcAssetId,
          currentRevision: source.currentRevision,
        })
      }
      if (mode === '3d') {
        handleIfcSyncMessageRef.current(
          source.currentIfcStorageUrl ?? source.currentIfcUrl,
          null,
          source.currentIfcAssetId,
          source.currentRevision,
        )
        return { fetchFailed: false }
      }
      // 2D: floor project를 IFC로 덮지 않도록 state만 채운다.
      const resolvedUrl = source.currentIfcUrl
      setIfcSourceByProjectId((prev) => ({
        ...prev,
        [projectId]: {
          url: resolvedUrl,
          storageUrl: source.currentIfcStorageUrl ?? resolvedUrl,
          assetId: source.currentIfcAssetId ?? null,
        },
      }))
      if (source.currentRevision !== undefined) {
        setIfcRevisionByProjectId((prev) => ({
          ...prev,
          [projectId]: source.currentRevision ?? null,
        }))
      }
      return { fetchFailed: false }
    }

    void hydrateLatestIfcSource()
      .then(({ fetchFailed }) => {
        // IFC source 조회 실패는 attempted로 기록하지 않는다.
        // 일시적 실패로 자동 생성 버튼이 다시 열려 기존 IFC가 덮이는 것을 막고,
        // 의존성이 바뀌면 재시도할 여지를 남긴다.
        if (!cancelled && !fetchFailed) {
          setIfcSourceHydrationAttemptedProjectIds((prev) =>
            prev.includes(projectId) ? prev : [...prev, projectId],
          )
        }
      })
      .finally(() => {
        if (threeDIfcSourceHydrationInFlightRef.current === projectId) {
          threeDIfcSourceHydrationInFlightRef.current = null
        }
      })

    return () => {
      cancelled = true
    }
  }, [currentIfcRevisionId, currentIfcUrl, mode, projectId, saveStatus])

  useInitialIfcImport({
    projectId,
    hasIfcUploaded: hasIfcUploadedInCurrentProject && !historyIfcHydratedProjectIds.includes(projectId ?? ''),
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
  const getFloorPlanHistoryBaseIndex = useCallback(() => floorPlanHistoryBaseIndexRef.current, [])

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
    getFloorPlanHistoryBaseIndex,
    onIfcResult: handleLlmIfcResult,
    onToggleAssistantPanel: openAssistantPanel,
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
  /** IFC 로드 완료 시 호출: 파싱된 층 목록을 저장하고 최초 선택을 초기화한다. */
  const handleIfcStoreysLoad = useCallback((storeys: IfcStoreyInfo[]) => {
    const dedupedStoreys = Array.from(
      storeys.reduce((acc, storey) => {
        if (!Number.isFinite(storey.expressId)) return acc
        if (!acc.has(storey.expressId)) acc.set(storey.expressId, storey)
        return acc
      }, new Map<number, IfcStoreyInfo>()).values(),
    )
    const nextStoreys = applyCurrentIfcStoreyNameOverrides(dedupedStoreys)
    const nextStoreyIdSet = new Set(nextStoreys.map((storey) => storey.expressId))
    const fallbackStoreyId = nextStoreys[0]?.expressId ?? null
    setIfcStoreys(nextStoreys)
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
  }, [
    applyCurrentIfcStoreyNameOverrides,
    setIfcStoreys,
    setLibraryElements,
    setActiveIfcStoreyExpressId,
    setOverlayIfcStoreyExpressIds,
  ])

  /** FloorViewPanel에서 IFC 층 선택 시 호출 (id는 expressId의 문자열 표현) */
  const handleSelectIfcStorey = useCallback((id: string) => {
    const expressId = Number(id)
    if (!Number.isFinite(expressId)) return
    if (validIfcStoreyIdSet.size > 0 && !validIfcStoreyIdSet.has(expressId)) return

    const nextExpressId = activeIfcStoreyExpressId === expressId ? null : expressId
    setActiveIfcStoreyExpressId(nextExpressId)
    // 활성 층은 겹쳐보기 목록에서 제외한다.
    setOverlayIfcStoreyExpressIds((prev) => prev.filter((value) => value !== expressId))
    publishSceneUpdateEvent({
      type: 'FLOOR_SELECTED',
      floorId: nextExpressId != null ? String(nextExpressId) : null,
      payload: { sourceType: 'IFC_MOCK' },
    })
    markLocalFloorPlanSnapshotChanged()
  }, [
    activeIfcStoreyExpressId,
    markLocalFloorPlanSnapshotChanged,
    publishSceneUpdateEvent,
    validIfcStoreyIdSet,
    setActiveIfcStoreyExpressId,
    setOverlayIfcStoreyExpressIds,
  ])

  /** FloorViewPanel에서 IFC 층 겹쳐보기 토글 시 호출 (id는 expressId의 문자열 표현) */
  const handleToggleIfcStoreyOverlay = useCallback((id: string) => {
    const expressId = Number(id)
    if (!Number.isFinite(expressId)) return
    if (validIfcStoreyIdSet.size > 0 && !validIfcStoreyIdSet.has(expressId)) return
    if (activeIfcStoreyExpressId != null && expressId === activeIfcStoreyExpressId) return
    setOverlayIfcStoreyExpressIds((prev) =>
      prev.includes(expressId) ? prev.filter((e) => e !== expressId) : [...prev, expressId],
    )
    publishSceneUpdateEvent({
      type: 'FLOOR_VISIBILITY_CHANGED',
      floorId: String(expressId),
      payload: { sourceType: 'IFC_MOCK', overlay: !overlayIfcStoreyExpressIds.includes(expressId) },
    })
    markLocalFloorPlanSnapshotChanged()
  }, [
    activeIfcStoreyExpressId,
    markLocalFloorPlanSnapshotChanged,
    overlayIfcStoreyExpressIds,
    publishSceneUpdateEvent,
    validIfcStoreyIdSet,
    setOverlayIfcStoreyExpressIds,
  ])

  const handleRenameIfcStorey = useCallback((id: string, name: string) => {
    const expressId = Number(id)
    const trimmedName = name.trim()
    if (!Number.isFinite(expressId) || !trimmedName) return
    setIfcStoreys((prev) =>
      prev.map((storey) => (
        storey.expressId === expressId ? { ...storey, name: trimmedName } : storey
      )),
    )
    setIfcStoreyNameOverrides((prev) =>
      normalizeIfcStoreyNameOverrides({ ...prev, [String(expressId)]: trimmedName }))
    markLocalFloorPlanSnapshotChanged()
  }, [markLocalFloorPlanSnapshotChanged, setIfcStoreys])

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

  const registryFloorRooms = useMemo(
    () => (floorLayers.length > 0 ? floorLayers.flatMap((layer) => layer.rooms) : floorRooms),
    [floorLayers, floorRooms],
  )

  const elementRegistry = useMemo(
    () => buildElementRegistry({
      ifcStoreys,
      floorLayers,
      floorRooms: registryFloorRooms,
      floorWalls: mergedFloorWalls,
      floorOpenings: mergedFloorOpenings,
      libraryElements,
      ifcElementChanges,
      selectedIfcElement,
      selectedRoomId: selectedId,
      selectedFloorWallId,
      selectedFloorOpeningId,
      activeIfcStoreyId: activeIfcStoreyExpressId,
      activeFloorLayerId,
      overlayIfcStoreyIds: overlayIfcStoreyExpressIds,
      overlayFloorLayerIds: overlayLayerIds,
      hiddenElementIds,
    }),
    [
      activeFloorLayerId,
      activeIfcStoreyExpressId,
      floorLayers,
      hiddenElementIds,
      ifcElementChanges,
      ifcStoreys,
      libraryElements,
      mergedFloorWalls,
      mergedFloorOpenings,
      overlayIfcStoreyExpressIds,
      overlayLayerIds,
      registryFloorRooms,
      selectedFloorOpeningId,
      selectedFloorWallId,
      selectedId,
      selectedIfcElement,
    ],
  )

  const elementHierarchyTree = useMemo(
    () => buildElementHierarchyTree(elementRegistry),
    [elementRegistry],
  )
  const lastPublishedSelectedElementIdRef = useRef<string | null>(null)
  useEffect(() => {
    const selectedElementId = elementRegistry.selectedElementId
    if (lastPublishedSelectedElementIdRef.current === selectedElementId) return
    lastPublishedSelectedElementIdRef.current = selectedElementId
    if (!selectedElementId) return
    const selectedElement = findRegistryElement(elementRegistry, selectedElementId)
    publishSceneUpdateEvent({
      type: 'ELEMENT_SELECTED',
      elementId: selectedElementId,
      floorId: selectedElement?.floorId ?? null,
      source2dId: selectedElement?.source2dId,
      payload: selectedElement
        ? { sourceType: selectedElement.sourceType, category: selectedElement.category }
        : undefined,
    })
  }, [elementRegistry, publishSceneUpdateEvent])

  const visibleLibraryElements = useMemo(
    () => {
      const hiddenSet = new Set(hiddenElementIds)
      const overlayIfcSet = new Set(overlayIfcStoreyExpressIds)
      const overlayFloorSet = new Set(overlayLayerIds)
      return libraryElements.filter((element) => {
        if (hiddenSet.has(`library:${element.id}`)) return false
        if (Number.isFinite(element.storeyExpressId)) {
          const storeyExpressId = Number(element.storeyExpressId)
          return activeIfcStoreyExpressId == null ||
            storeyExpressId === activeIfcStoreyExpressId ||
            overlayIfcSet.has(storeyExpressId)
        }
        const resolvedFloorLayerId = resolveLibraryElementFloorLayerId(
          element,
          floorLayers,
          activeFloorLayerId,
        )
        if (!resolvedFloorLayerId || !activeFloorLayerId) return true
        return resolvedFloorLayerId === activeFloorLayerId || overlayFloorSet.has(resolvedFloorLayerId)
      })
    },
    [
      activeFloorLayerId,
      activeIfcStoreyExpressId,
      floorLayers,
      hiddenElementIds,
      libraryElements,
      overlayIfcStoreyExpressIds,
      overlayLayerIds,
    ],
  )
  const hiddenIfcElementLocalIds = useMemo(
    () => hiddenElementIds
      .map((elementId) => {
        const match = elementId.match(/^ifc:(\d+)$/)
        if (!match?.[1]) return null
        const localId = Number(match[1])
        return Number.isFinite(localId) ? localId : null
      })
      .filter((localId): localId is number => localId != null),
    [hiddenElementIds],
  )

  const handleSelectRegistryElement = useCallback((elementId: string) => {
    const element = findRegistryElement(elementRegistry, elementId)
    if (!element) return
    publishSceneUpdateEvent({
      type: 'TREE_NODE_SELECTED',
      elementId,
      floorId: element.floorId,
      source2dId: element.source2dId,
      payload: { sourceType: element.sourceType },
    })
    const target = resolveRegistryElementSelectionTarget(element)
    if (element.floorId) {
      if (target.kind === 'ifc') {
        const floorExpressId = Number(element.floorId)
        if (Number.isFinite(floorExpressId) && activeIfcStoreyExpressId !== floorExpressId) {
          handleSelectIfcStorey(element.floorId)
        }
      } else if (target.kind === 'room' || target.kind === 'wall' || target.kind === 'opening') {
        if (activeFloorLayerId !== element.floorId) handleSelectFloorLayer(element.floorId)
      }
    }
    if (target.kind === 'ifc') {
      publishSceneUpdateEvent({ type: 'ELEMENT_SELECTED', elementId, floorId: element.floorId })
      handleSelectIfcElementByLocalId(target.localId)
      return
    }
    if (target.kind === 'library') {
      publishSceneUpdateEvent({ type: 'ELEMENT_SELECTED', elementId, floorId: element.floorId })
      handleSelectLibraryElementById(target.id)
      return
    }
    if (target.kind === 'room') {
      publishSceneUpdateEvent({ type: 'ELEMENT_SELECTED', elementId, floorId: element.floorId, source2dId: target.id })
      handleBubbleSelect(target.id)
      return
    }
    if (target.kind === 'wall') {
      publishSceneUpdateEvent({ type: 'ELEMENT_SELECTED', elementId, floorId: element.floorId, source2dId: target.id })
      handleSelectFloorWall(target.id)
      return
    }
    if (target.kind === 'opening') {
      publishSceneUpdateEvent({ type: 'ELEMENT_SELECTED', elementId, floorId: element.floorId, source2dId: target.id })
      handleSelectFloorOpening(target.id)
    }
  }, [
    activeFloorLayerId,
    activeIfcStoreyExpressId,
    elementRegistry,
    handleBubbleSelect,
    handleSelectFloorLayer,
    handleSelectFloorOpening,
    handleSelectFloorWall,
    handleSelectIfcElementByLocalId,
    handleSelectIfcStorey,
    handleSelectLibraryElementById,
    publishSceneUpdateEvent,
  ])

  const handleToggleElementVisibility = useCallback((elementId: string) => {
    const willHide = !hiddenElementIds.includes(elementId)
    if (willHide && elementRegistry.selectedElementId === elementId) {
      handleClearCanvasSelection()
    }
    setHiddenElementIds((prev) => (
      prev.includes(elementId)
        ? prev.filter((id) => id !== elementId)
        : [...prev, elementId]
    ))
    markLocalFloorPlanSnapshotChanged()
    publishSceneUpdateEvent({
      type: 'ELEMENT_UPDATED',
      elementId,
      payload: { hidden: willHide },
    })
  }, [
    elementRegistry.selectedElementId,
    handleClearCanvasSelection,
    hiddenElementIds,
    markLocalFloorPlanSnapshotChanged,
    publishSceneUpdateEvent,
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
    isWorkspaceBootstrapping,
    sitePoints: bubbleSitePoints,
    sitePlanPoints: sharedSitePlanPoints,
    bubbleCanvasViewTransform,
    floorCanvasViewTransform,
    userViewRotationRadians,
    setUserViewRotationRadians,
    projectNorthViewRotationRadians,
    toggleProjectNorthViewRotation,
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
    elementRegistry,
    elementHierarchyTree,
    selectedElementId: elementRegistry.selectedElementId,
    hiddenElementIds,
    hiddenIfcElementLocalIds,
    handleSelectRegistryElement,
    handleToggleElementVisibility,
    threeDDeleteRequestToken,
    handleBubbleSelect,
    handleSelectIfcElement,
    handleSelectIfcElementByLocalId,
    handleSelectLibraryElementById,
    handleDeleteIfcElement,
    handleCommitIfcElementTransform,
    requestedIfcElementLocalId,
    ifcElementSelectionRequestToken,
    requestedLibraryElementId,
    libraryElementSelectionRequestToken,
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
    zoningValidationMessage,
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
    libraryElements: visibleLibraryElements,
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
    floorWallsForHierarchy: activeLayerVisibleFloorWalls,
    floorOpenings: mergedFloorOpenings,
    selectedFloorWallId,
    selectedFloorWallIds,
    selectedFloorOpeningId,
    selectedFloorOpeningIds,
    handleGenerateFloorPlan,
    handleAutoLayoutBubbles,
    canGenerateFloorPlanFromBubble,
    isIfcSourceHydrationPending,
    canAutoLayoutBubbles: bubbles.length > 1,
    handleEditIfc,
    handleIfcUndo,
    handleIfcRedo,
    addFloorLayer: handleAddFloorLayer,
    renameFloorLayer: handleRenameFloorLayer,
    deleteFloorLayer: handleDeleteFloorLayer,
    setActiveFloorLayerId: handleSelectFloorLayer,
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
    hasUnsavedDbChanges,
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
    // 공통 안내 모달
    noticeModal,
    onCloseNoticeModal,
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
    localFloorData: effectiveLocalFloorData,
    ifcStoreys,
    activeIfcStoreyExpressId,
    overlayIfcStoreyExpressIds,
    handleIfcStoreysLoad,
    handleSelectIfcStorey,
    handleToggleIfcStoreyOverlay,
    handleRenameIfcStorey,
    // AI 어시스턴트
    llmProvider: llmEdit.provider,
    llmPrompt: llmEdit.prompt,
    setLlmPrompt: llmEdit.setPrompt,
    llmStatus: llmEdit.status,
    llmIsLoading: llmEdit.isLoading,
    llmMessage: llmEdit.message,
    llmSuggestions: llmEdit.suggestions,
    llmPreview: llmEdit.preview,
    selectedWallForChat: llmEdit.selectedWallForChat,
    llmCanRun: llmEdit.canRun,
    llmActiveJobId: llmEdit.activeJobId,
    llmJobProgress: llmEdit.jobProgress,
    llmClarificationArtifact: llmEdit.clarificationArtifact,
    llmChatLogs: llmEdit.chatLogs,
    llmIsChatLogsLoading: llmEdit.isChatLogsLoading,
    runLlmEdit: llmEdit.run,
    applyLlmEdit: llmEdit.apply,
    discardLlmEdit: llmEdit.discard,
    selectLlmAlternative: llmEdit.selectAlternative,
    selectWallForChat: llmEdit.selectWallForChat,
    clearSelectedWallForChat: llmEdit.clearSelectedWallForChat,
  }
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { Layer, Line, Stage, Arc, Group, Circle, Text, Rect } from 'react-konva'
import { FileText, Image as ImageIcon, LayoutDashboard, Paperclip, Sparkles, X } from 'lucide-react'
import type { KonvaEventObject } from 'konva/lib/Node'
import type Konva from 'konva'
import Spinner from '../../../../shared/components/Spinner'
import type {
  ConnectionData,
  FloorCommentAttachmentInput,
  FloorCommentPin,
  FloorLayerOverlay,
  FloorOpening,
  FloorRoom,
  FloorWall,
  Point2D,
} from '../../types'
import {
  FLOOR_MM_PER_PX,
  FLOOR_OPENING_PRESETS,
  FLOOR_WALL_HEIGHT_MAX_MM,
  FLOOR_WALL_HEIGHT_MIN_MM,
  FLOOR_WALL_PRESETS,
  FLOOR_WALL_THICKNESS_MAX_MM,
  FLOOR_WALL_THICKNESS_MIN_MM,
} from '../../constants'
import { deriveAutoWallsFromRooms } from '../../utils/autoWalls'
import { findSharedWall, type DoorInfo } from '../../utils/floorPlanLayout'
import { hexToRgba } from '../../utils/bubbleCalc'
import { computeDimensionGuides } from '../../utils/dimensionGuides'
import { lineIntersectsRect, pointInRect, type AxisAlignedRect } from '../../utils/geometry2d'
import { getWallGeometryKey, shouldRemoveAsContainedOverlap } from '../../utils/wallGeometry'
import { useSpacePanning } from '../../hooks/useSpacePanning'
import { DimensionGuidesLayer } from './DimensionGuidesLayer'

// ── 유틸 ─────────────────────────────────────────────────────────────────────
const DEFAULT_GRID_SNAP_SIZE_PX = 10
const WALL_SNAP_DISTANCE = 14
const WALL_MIN_LENGTH = 8

/** 개구부 최소/최대 표시 길이(px) */
const OPENING_MIN_PX = 16
const OPENING_MAX_PX = 56
const OPENING_SNAP_THRESHOLD = 0.03
const OPENING_CREATE_SNAP_THRESHOLD = 0.06
const OPENING_MIN_CLEARANCE_MM = 300
const ROOM_ADJACENT_SNAP_DISTANCE = 14
const ROOM_EDGE_ALIGN_SNAP_DISTANCE = 14

/** 단일 좌표값을 그리드에 스냅 — enabled=false이면 원본 값 반환 */
function snapCoordinate(value: number, enabled: boolean, gridSizePx: number): number {
  if (!enabled) return value
  const step = Math.max(gridSizePx, 0.1)
  return Math.round(value / step) * step
}

/** 2D 포인트를 그리드에 스냅 (항상 스냅 적용) */
function snapToGrid(point: Point2D, gridSizePx: number): Point2D {
  return {
    x: snapCoordinate(point.x, true, gridSizePx),
    y: snapCoordinate(point.y, true, gridSizePx),
  }
}

/** 실제 두께(mm)를 캔버스 선 두께(px)로 변환 */
function wallThicknessMmToPx(thicknessMm: number): number {
  // 벽이 과도하게 두껍게 보이지 않도록 시각 스케일만 완만하게 보정한다.
  return Math.min(Math.max(Math.round(thicknessMm / (FLOOR_MM_PER_PX * 1.4)), 2), 90)
}

function openingWidthMmToPx(widthMm: number): number {
  return Math.min(Math.max(Math.round(widthMm / FLOOR_MM_PER_PX), OPENING_MIN_PX), OPENING_MAX_PX)
}

function getWallPointAtPosition(wall: FloorWall, t: number): Point2D {
  return {
    x: wall.start.x + (wall.end.x - wall.start.x) * t,
    y: wall.start.y + (wall.end.y - wall.start.y) * t,
  }
}


function getProjectedWallPosition(point: Point2D, wall: FloorWall): number {
  const vx = wall.end.x - wall.start.x
  const vy = wall.end.y - wall.start.y
  const lenSq = vx * vx + vy * vy
  if (lenSq <= 0) return 0
  const wx = point.x - wall.start.x
  const wy = point.y - wall.start.y
  return Math.min(Math.max((wx * vx + wy * vy) / lenSq, 0), 1)
}

function distancePointToSegment(point: Point2D, start: Point2D, end: Point2D): number {
  const vx = end.x - start.x
  const vy = end.y - start.y
  const lenSq = vx * vx + vy * vy
  if (lenSq <= 0) return Math.hypot(point.x - start.x, point.y - start.y)
  const wx = point.x - start.x
  const wy = point.y - start.y
  const t = Math.min(Math.max((wx * vx + wy * vy) / lenSq, 0), 1)
  const px = start.x + vx * t
  const py = start.y + vy * t
  return Math.hypot(point.x - px, point.y - py)
}

interface OpeningSnapResult {
  wallPosition: number
  guidePosition: number | null
}

function rectsOverlap(a: AxisAlignedRect, b: AxisAlignedRect, padding = 0): boolean {
  return (
    a.x + padding < b.x + b.width &&
    a.x + a.width > b.x + padding &&
    a.y + padding < b.y + b.height &&
    a.y + a.height > b.y + padding
  )
}

function rangesOverlap(minA: number, maxA: number, minB: number, maxB: number): boolean {
  return minA < maxB && maxA > minB
}


type RoomEdgeKey = 'top' | 'right' | 'bottom' | 'left'

function getRoomEdgeCoverageByWalls(
  room: FloorRoom,
  walls: FloorWall[],
  tolerance = 1.5,
): Record<RoomEdgeKey, boolean> {
  const left = room.x
  const right = room.x + room.width
  const top = room.y
  const bottom = room.y + room.height

  const minCoverLength = 8
  let coverTop = 0
  let coverBottom = 0
  let coverLeft = 0
  let coverRight = 0

  walls.forEach((wall) => {
    const sx = wall.start.x
    const sy = wall.start.y
    const ex = wall.end.x
    const ey = wall.end.y
    const isHorizontal = Math.abs(sy - ey) <= tolerance
    const isVertical = Math.abs(sx - ex) <= tolerance
    if (!isHorizontal && !isVertical) return

    if (isHorizontal) {
      const wallY = (sy + ey) / 2
      const segMinX = Math.min(sx, ex)
      const segMaxX = Math.max(sx, ex)
      if (Math.abs(wallY - top) <= tolerance) {
        coverTop += Math.max(0, Math.min(segMaxX, right) - Math.max(segMinX, left))
      }
      if (Math.abs(wallY - bottom) <= tolerance) {
        coverBottom += Math.max(0, Math.min(segMaxX, right) - Math.max(segMinX, left))
      }
    }

    if (isVertical) {
      const wallX = (sx + ex) / 2
      const segMinY = Math.min(sy, ey)
      const segMaxY = Math.max(sy, ey)
      if (Math.abs(wallX - left) <= tolerance) {
        coverLeft += Math.max(0, Math.min(segMaxY, bottom) - Math.max(segMinY, top))
      }
      if (Math.abs(wallX - right) <= tolerance) {
        coverRight += Math.max(0, Math.min(segMaxY, bottom) - Math.max(segMinY, top))
      }
    }
  })

  return {
    top: coverTop >= Math.max(room.width - tolerance * 2, minCoverLength),
    right: coverRight >= Math.max(room.height - tolerance * 2, minCoverLength),
    bottom: coverBottom >= Math.max(room.width - tolerance * 2, minCoverLength),
    left: coverLeft >= Math.max(room.height - tolerance * 2, minCoverLength),
  }
}

function getSnappedRoomPosition(
  roomBubbleId: string,
  rawX: number,
  rawY: number,
  width: number,
  height: number,
  rooms: FloorRoom[],
): Point2D {
  let snappedX = rawX
  let snappedY = rawY
  let bestXDistance = ROOM_ADJACENT_SNAP_DISTANCE + 1
  let bestYDistance = ROOM_ADJACENT_SNAP_DISTANCE + 1

  const rawLeft = rawX
  const rawRight = rawX + width
  const rawTop = rawY
  const rawBottom = rawY + height

  for (const room of rooms) {
    if (room.bubbleId === roomBubbleId) continue
    const otherLeft = room.x
    const otherRight = room.x + room.width
    const otherTop = room.y
    const otherBottom = room.y + room.height

    if (rangesOverlap(rawTop, rawBottom, otherTop, otherBottom)) {
      const diffToOtherLeft = Math.abs(rawRight - otherLeft)
      if (diffToOtherLeft <= ROOM_ADJACENT_SNAP_DISTANCE && diffToOtherLeft < bestXDistance) {
        bestXDistance = diffToOtherLeft
        snappedX = otherLeft - width
        const topDiff = Math.abs(rawTop - otherTop)
        const bottomDiff = Math.abs(rawBottom - otherBottom)
        if (topDiff <= ROOM_EDGE_ALIGN_SNAP_DISTANCE && topDiff <= bottomDiff) {
          snappedY = otherTop
        } else if (bottomDiff <= ROOM_EDGE_ALIGN_SNAP_DISTANCE) {
          snappedY = otherBottom - height
        }
      }

      const diffToOtherRight = Math.abs(rawLeft - otherRight)
      if (diffToOtherRight <= ROOM_ADJACENT_SNAP_DISTANCE && diffToOtherRight < bestXDistance) {
        bestXDistance = diffToOtherRight
        snappedX = otherRight
        const topDiff = Math.abs(rawTop - otherTop)
        const bottomDiff = Math.abs(rawBottom - otherBottom)
        if (topDiff <= ROOM_EDGE_ALIGN_SNAP_DISTANCE && topDiff <= bottomDiff) {
          snappedY = otherTop
        } else if (bottomDiff <= ROOM_EDGE_ALIGN_SNAP_DISTANCE) {
          snappedY = otherBottom - height
        }
      }
    }

    if (rangesOverlap(rawLeft, rawRight, otherLeft, otherRight)) {
      const diffToOtherTop = Math.abs(rawBottom - otherTop)
      if (diffToOtherTop <= ROOM_ADJACENT_SNAP_DISTANCE && diffToOtherTop < bestYDistance) {
        bestYDistance = diffToOtherTop
        snappedY = otherTop - height
        const leftDiff = Math.abs(rawLeft - otherLeft)
        const rightDiff = Math.abs(rawRight - otherRight)
        if (leftDiff <= ROOM_EDGE_ALIGN_SNAP_DISTANCE && leftDiff <= rightDiff) {
          snappedX = otherLeft
        } else if (rightDiff <= ROOM_EDGE_ALIGN_SNAP_DISTANCE) {
          snappedX = otherRight - width
        }
      }

      const diffToOtherBottom = Math.abs(rawTop - otherBottom)
      if (diffToOtherBottom <= ROOM_ADJACENT_SNAP_DISTANCE && diffToOtherBottom < bestYDistance) {
        bestYDistance = diffToOtherBottom
        snappedY = otherBottom
        const leftDiff = Math.abs(rawLeft - otherLeft)
        const rightDiff = Math.abs(rawRight - otherRight)
        if (leftDiff <= ROOM_EDGE_ALIGN_SNAP_DISTANCE && leftDiff <= rightDiff) {
          snappedX = otherLeft
        } else if (rightDiff <= ROOM_EDGE_ALIGN_SNAP_DISTANCE) {
          snappedX = otherRight - width
        }
      }
    }
  }

  return { x: snappedX, y: snappedY }
}


/** 흰색 계열 방은 연한 파란 계열로, 나머지는 원색 14% 투명도로 채우기 */
function getRoomFill(color: string): string {
  const normalized = color.trim().toUpperCase()
  if (normalized === '#FFFFFF' || normalized === '#FFF') return '#F0F4FF'
  return hexToRgba(color, 0.14)
}

// ── 평면도 생성 전 안내 화면 ─────────────────────────────────────────────────

interface FloorPlanEmptyProps {
  onGenerate?: () => void
  canGenerate?: boolean
}

/**
 * 평면도가 아직 생성되지 않은 경우 표시되는 안내 화면
 * "평면도 생성 시작" 버튼 클릭 시 onGenerate 호출
 */
function FloorPlanEmpty({ onGenerate, canGenerate = true }: FloorPlanEmptyProps) {
  const description = canGenerate
    ? '버블 다이어그램의 공간 크기와 연결 관계를 바탕으로\n2D 평면도 초안을 자동 생성합니다.'
    : '버블 다이어그램에서 공간을 1개 이상 추가하면\n2D 평면도를 생성할 수 있습니다.'

  const helper = canGenerate
    ? '생성 후 바로 2D 편집 모드로 이어집니다.'
    : '먼저 버블 탭에서 공간을 추가한 뒤 다시 시도해 주세요.'

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-white">
      <div className="w-full max-w-[440px] mx-6 rounded-3xl border border-[#E8ECF8] bg-[#FCFDFF] shadow-sm">
        <div className="px-8 pt-8 pb-7 flex flex-col items-center gap-5 text-center">
          <div className="w-20 h-20 rounded-3xl bg-[#F0F2FF] flex items-center justify-center shadow-sm">
            <LayoutDashboard size={36} className="text-[#3B45B3]" />
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-[16px] font-extrabold text-[#1C1C1E] tracking-[-0.01em]">
              2D 평면도 자동 생성
            </h3>
            <p className="text-[12px] text-[#637190] leading-relaxed whitespace-pre-line">
              {description}
            </p>
          </div>

          <button
            onClick={onGenerate}
            disabled={!canGenerate}
            className="inline-flex items-center gap-2 bg-[#3B45B3] hover:bg-[#2D3599] text-white text-[12px] font-extrabold px-6 py-3 rounded-2xl transition-all shadow-md hover:shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles size={15} />
            평면도 생성 시작
          </button>

          <p className={`text-[11px] leading-relaxed ${canGenerate ? 'text-[#8A94AB]' : 'text-[#D14343]'}`}>
            {helper}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── 평면도 생성 중 로딩 화면 ──────────────────────────────────────────────────

/**
 * 평면도 생성 중에 표시되는 로딩 화면
 * 진행 애니메이션 바를 포함한다.
 */
function FloorPlanLoading() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-5">
        <div className="relative">
          <div className="w-20 h-20 rounded-3xl bg-[#F0F2FF] flex items-center justify-center">
            <LayoutDashboard size={36} className="text-[#3B45B3] opacity-40" />
          </div>
          <div className="absolute -bottom-2 -right-2">
            <Spinner size="md" className="text-[#3B45B3]" />
          </div>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-[13px] font-extrabold text-[#3B45B3]">평면도 생성 중...</p>
          <p className="text-[11px] text-[#6B7A99]">버블 다이어그램을 분석하고 레이아웃을 배치하는 중입니다</p>
        </div>
        <div className="w-48 h-1.5 bg-[#E2E6EF] rounded-full overflow-hidden">
          <div className="h-full bg-[#3B45B3] rounded-full animate-[progress_1.8s_ease-in-out_forwards]" />
        </div>
      </div>
    </div>
  )
}

// ── 협업 모드 핀 오버레이 ────────────────────────────────────────────────────

interface CollaborationPinOverlayProps {
  pins: FloorCommentPin[]
  selectedPinId?: string | null
  onPinClick?: (id: string) => void
  onMouseEnter?: (e: KonvaEventObject<MouseEvent>) => void
  onMouseLeave?: (e: KonvaEventObject<MouseEvent>) => void
}

/**
 * 2D 협업 모드에서 평면도 위에 렌더링되는 핀 오버레이
 * 핀 클릭 시 해당 스레드 탭으로 이동한다.
 */
function CollaborationPinOverlay({
  pins,
  selectedPinId,
  onPinClick,
  onMouseEnter,
  onMouseLeave,
}: CollaborationPinOverlayProps) {
  return (
    <>
      {pins.map((pin, index) => {
        const isSelected = selectedPinId === pin.id
        const indexText = String(index + 1)
        return (
          <Group
            key={pin.id}
            x={pin.x}
            y={pin.y}
            onClick={(e) => {
              e.cancelBubble = true
              onPinClick?.(pin.id)
            }}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
          >
            <Line points={[0, 12, 0, 22]} stroke={isSelected ? '#3B45B3' : '#1C1C1E'} strokeWidth={2} />
            <Circle radius={12} fill={isSelected ? '#3B45B3' : '#1C1C1E'} />
            <Text text={indexText} x={-3.8} y={-5.2} fill="white" fontSize={11} fontStyle="bold" />
          </Group>
        )
      })}
    </>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface TwoDCanvasProps {
  stageSize: { width: number; height: number }
  isCollaborationMode?: boolean
  selectedPinId?: string | null
  commentPins?: FloorCommentPin[]
  onPinClick?: (id: string) => void
  onPinCreate?: (x: number, y: number, content: string, attachments?: FloorCommentAttachmentInput[]) => void
  rooms?: FloorRoom[]
  overlayLayers?: FloorLayerOverlay[]
  connections?: ConnectionData[]
  /** 평면도 생성 완료 여부 */
  isGenerated?: boolean
  /** 평면도 생성 중(로딩) 여부 */
  isGenerating?: boolean
  /** "평면도 생성" 버튼 클릭 핸들러 */
  onGenerate?: () => void
  /** 생성 가능 여부(버블 존재 여부) */
  canGenerate?: boolean
  isGridVisible?: boolean
  selectedId?: string | null
  selectedIds?: string[]
  onSelect?: (id: string | null, isShift?: boolean) => void
  onMarqueeSelect?: (ids: string[], append?: boolean) => void
  onTwoDMarqueeSelect?: (
    payload: { roomIds: string[]; wallIds: string[]; openingIds: string[] },
    append?: boolean,
  ) => void
  onRoomMove?: (bubbleId: string, x: number, y: number) => void
  onRoomResize?: (bubbleId: string, x: number, y: number, width: number, height: number) => void
  walls?: FloorWall[]
  openings?: FloorOpening[]
  selectedWallId?: string | null
  selectedWallIds?: string[]
  selectedOpeningId?: string | null
  selectedOpeningIds?: string[]
  onWallSelect?: (wallId: string | null, append?: boolean) => void
  onWallCreate?: (
    start: Point2D,
    end: Point2D,
    options?: { type?: FloorWall['type']; thickness?: number; heightMm?: number },
  ) => void
  onWallMove?: (wallId: string, dx: number, dy: number) => void
  onWallEndpointChange?: (wallId: string, endpoint: 'start' | 'end', point: Point2D) => void
  onWallDelete?: (wallId: string) => void
  onOpeningCreate?: (
    wallId: string,
    type: FloorOpening['type'],
    wallPosition: number,
    preferredId?: string,
  ) => void
  onOpeningSelect?: (openingId: string | null, append?: boolean) => void
  onOpeningMove?: (openingId: string, wallPosition: number, wallId?: string) => void
  onOpeningDelete?: (openingId: string) => void
  wallCreatePreset?: { type: FloorWall['type']; thickness: number; heightMm: number }
  isGridSnapEnabled?: boolean
  gridSnapIntervalMm?: number
  scale?: number
  selectedTool?: string
  onWheelZoom?: (factor: number) => void
}

/**
 * 2D 평면도 캔버스
 * - 미생성 상태: 생성 시작 버튼 화면
 * - 생성 중: 로딩 애니메이션 화면
 * - 생성 완료: Konva Stage 기반 평면도 렌더링
 * - 손 도구: Stage draggable로 패닝 지원
 */
export function TwoDCanvas({
  stageSize,
  isCollaborationMode,
  selectedPinId,
  commentPins = [],
  onPinClick,
  onPinCreate,
  rooms = [],
  overlayLayers = [],
  connections = [],
  isGenerated = false,
  isGenerating = false,
  onGenerate,
  canGenerate = true,
  isGridVisible = false,
  selectedId,
  selectedIds = [],
  onSelect,
  onMarqueeSelect,
  onTwoDMarqueeSelect,
  onRoomMove,
  onRoomResize,
  walls = [],
  openings = [],
  selectedWallId = null,
  selectedWallIds = [],
  selectedOpeningId = null,
  selectedOpeningIds = [],
  onWallSelect,
  onWallCreate,
  onWallMove,
  onWallEndpointChange,
  onWallDelete,
  onOpeningCreate,
  onOpeningSelect,
  onOpeningMove,
  onOpeningDelete,
  wallCreatePreset,
  isGridSnapEnabled = true,
  gridSnapIntervalMm = 250,
  scale = 1,
  selectedTool = 'selection',
  onWheelZoom,
}: TwoDCanvasProps) {
  const stageRef = useRef<Konva.Stage | null>(null)
  const isSpacePressed = useSpacePanning()
  const [isMiddlePanning, setIsMiddlePanning] = useState(false)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [isDrawingWall, setIsDrawingWall] = useState(false)
  const [wallDraftStart, setWallDraftStart] = useState<Point2D | null>(null)
  const [wallDraftEnd, setWallDraftEnd] = useState<Point2D | null>(null)
  const [wallDragState, setWallDragState] = useState<{ wallId: string; lastPoint: Point2D } | null>(null)
  const [roomDragState, setRoomDragState] = useState<{
    roomBubbleId: string
    startX: number
    startY: number
    startPointer: Point2D
  } | null>(null)
  const [openingDragState, setOpeningDragState] = useState<{ openingId: string } | null>(null)
  const [resizingRoomBubbleId, setResizingRoomBubbleId] = useState<string | null>(null)
  const [openingSnapGuide, setOpeningSnapGuide] = useState<{ wallId: string; wallPosition: number } | null>(null)
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const isDrawingMarquee = useRef(false)
  const marqueeStart = useRef<Point2D | null>(null)
  const marqueeAppendRef = useRef(false)
  const [pinDraft, setPinDraft] = useState<{
    x: number
    y: number
    message: string
    attachments: FloorCommentAttachmentInput[]
  } | null>(null)
  const createOpeningGuideTimerRef = useRef<number | null>(null)
  const pinInputRef = useRef<HTMLInputElement | null>(null)
  const pinImageInputRef = useRef<HTMLInputElement | null>(null)
  const pinFileInputRef = useRef<HTMLInputElement | null>(null)
  const skipStageClickClearRef = useRef(false)
  const isPanMode = selectedTool === 'hand' || isSpacePressed || isMiddlePanning
  const baseOffsetX = (stageSize.width * (1 - scale)) / 2
  const baseOffsetY = (stageSize.height * (1 - scale)) / 2

  const isWallTool = selectedTool === 'wall'
  const isDoorTool = selectedTool === 'door'
  const isWindowTool = selectedTool === 'window'
  const isResizeTool = selectedTool === 'resize'
  const isOpeningTool = isDoorTool || isWindowTool
  const gridSnapStepPx = Math.max(gridSnapIntervalMm / FLOOR_MM_PER_PX, DEFAULT_GRID_SNAP_SIZE_PX / 4)
  // 리사이즈도 이동/벽 생성과 동일한 전역 스냅 간격을 사용한다.
  const resizeSnapStepPx = gridSnapStepPx
  const snapResizeHandle = (value: number) =>
    snapCoordinate(value, isGridSnapEnabled, resizeSnapStepPx)
  const wallDraftType = wallCreatePreset?.type ?? 'general'
  const wallDraftThicknessMm = Math.min(
    Math.max(
      Math.round(wallCreatePreset?.thickness ?? FLOOR_WALL_PRESETS.general.thickness),
      FLOOR_WALL_THICKNESS_MIN_MM,
    ),
    FLOOR_WALL_THICKNESS_MAX_MM,
  )
  const wallDraftHeightMm = Math.min(
    Math.max(
      Math.round(wallCreatePreset?.heightMm ?? FLOOR_WALL_PRESETS.general.heightMm),
      FLOOR_WALL_HEIGHT_MIN_MM,
    ),
    FLOOR_WALL_HEIGHT_MAX_MM,
  )
  const isInteractionLockedByCollaboration = Boolean(isCollaborationMode)

  const createAttachmentFromFile = (file: File): FloorCommentAttachmentInput => {
    const mimeType = file.type || 'application/octet-stream'
    return {
      kind: mimeType.startsWith('image/') ? 'image' : 'file',
      name: file.name,
      mimeType,
      sizeBytes: file.size,
      url: URL.createObjectURL(file),
    }
  }

  const formatFileSize = (sizeBytes: number): string => {
    if (sizeBytes < 1024) return `${sizeBytes} B`
    const kb = sizeBytes / 1024
    if (kb < 1024) return `${kb.toFixed(1)} KB`
    return `${(kb / 1024).toFixed(1)} MB`
  }

  const getCanvasPoint = (stage: Konva.Stage): Point2D | null => {
    const pointer = stage.getPointerPosition()
    if (!pointer) return null
    const transform = stage.getAbsoluteTransform().copy()
    transform.invert()
    return transform.point(pointer)
  }

  const cancelWallDraft = () => {
    setIsDrawingWall(false)
    setWallDraftStart(null)
    setWallDraftEnd(null)
  }

  /** 벽 스냅 후보: 기존 벽 끝점 + 현재 방 외곽 코너 */
  const wallSnapCandidates = useMemo<Point2D[]>(() => {
    const points: Point2D[] = []
    for (const wall of walls) {
      points.push(wall.start, wall.end)
    }
    for (const room of rooms) {
      points.push(
        { x: room.x, y: room.y },
        { x: room.x + room.width, y: room.y },
        { x: room.x + room.width, y: room.y + room.height },
        { x: room.x, y: room.y + room.height },
      )
    }
    return points
  }, [walls, rooms])

  /**
   * 벽 생성용 스냅 좌표 계산
   * 1) 그리드 스냅
   * 2) 가까운 점 스냅
   * 3) Shift 키 눌렀을 때 직교(수평/수직) 잠금
   */
  const getSnappedWallPoint = (
    raw: Point2D,
    start: Point2D | null,
    isOrthogonalLocked: boolean,
  ): Point2D => {
    let point = isGridSnapEnabled ? snapToGrid(raw, gridSnapStepPx) : raw

    let minDistance = Number.POSITIVE_INFINITY
    let nearest: Point2D | null = null
    for (const candidate of wallSnapCandidates) {
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y)
      if (distance < minDistance) {
        minDistance = distance
        nearest = candidate
      }
    }
    if (nearest && minDistance <= WALL_SNAP_DISTANCE) {
      point = { x: nearest.x, y: nearest.y }
    }

    if (start && isOrthogonalLocked) {
      const dx = Math.abs(point.x - start.x)
      const dy = Math.abs(point.y - start.y)
      point = dx >= dy ? { x: point.x, y: start.y } : { x: start.x, y: point.y }
    }

    return point
  }

  /** 패닝 모드 진입·해제 시 Stage 커서 동기화 */
  useEffect(() => {
    const container = stageRef.current?.container()
    if (!container) return
    if (isPanMode) {
      container.style.cursor = isMiddlePanning ? 'grabbing' : 'grab'
      return
    }
    container.style.cursor = 'default'
  }, [isPanMode, isMiddlePanning])

  /** 벽 도구 상태에서 Esc를 누르면 현재 생성 중인 벽 세그먼트를 취소 */
  useEffect(() => {
    if (!isWallTool || !isDrawingWall) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      cancelWallDraft()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isWallTool, isDrawingWall])

  useEffect(() => {
    return () => {
      if (createOpeningGuideTimerRef.current !== null) {
        clearTimeout(createOpeningGuideTimerRef.current)
        createOpeningGuideTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!isCollaborationMode) {
      if (pinDraft) {
        pinDraft.attachments.forEach((attachment) => URL.revokeObjectURL(attachment.url))
        const clearTimer = window.setTimeout(() => setPinDraft(null), 0)
        return () => window.clearTimeout(clearTimer)
      }
      return
    }
    if (!pinDraft) return
    const timer = window.setTimeout(() => pinInputRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [isCollaborationMode, pinDraft])

  /** 벽 도구 이탈 시 생성 중 상태를 정리 */
  useEffect(() => {
    if (isWallTool) return
    const timer = window.setTimeout(() => {
      cancelWallDraft()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [isWallTool])

  // ── 그리드 라인 (보조: 50px 간격, 주요: 250px 간격) ──────────────────────
  const gridLines = useMemo(() => {
    if (!isGridVisible || stageSize.width === 0 || stageSize.height === 0) {
      return { minor: [] as number[][], major: [] as number[][] }
    }
    const MINOR = 50
    const MAJOR = 250
    const minor: number[][] = []
    const major: number[][] = []

    // 줌/패닝 상태에서도 화면 전체를 채우도록 가시 월드 범위 기준으로 그리드를 생성한다.
    const safeScale = scale === 0 ? 1 : scale
    const stageX = baseOffsetX + panOffset.x
    const stageY = baseOffsetY + panOffset.y
    const worldMinX = (-stageX) / safeScale
    const worldMaxX = (stageSize.width - stageX) / safeScale
    const worldMinY = (-stageY) / safeScale
    const worldMaxY = (stageSize.height - stageY) / safeScale

    const startX = Math.floor(worldMinX / MINOR) * MINOR
    const endX = Math.ceil(worldMaxX / MINOR) * MINOR
    const startY = Math.floor(worldMinY / MINOR) * MINOR
    const endY = Math.ceil(worldMaxY / MINOR) * MINOR

    for (let x = startX; x <= endX; x += MINOR) {
      const pts = [x, startY, x, endY]
      if (x % MAJOR === 0) major.push(pts)
      else minor.push(pts)
    }
    for (let y = startY; y <= endY; y += MINOR) {
      const pts = [startX, y, endX, y]
      if (y % MAJOR === 0) major.push(pts)
      else minor.push(pts)
    }
    return { minor, major }
  }, [isGridVisible, stageSize.width, stageSize.height, scale, baseOffsetX, baseOffsetY, panOffset.x, panOffset.y])

  // ── 연결된 방 쌍에서 문(Door) 정보 추출 ───────────────────────────────────
  const doorList = useMemo(() => {
    if (!isGenerated || !rooms.length || !connections.length) return []
    const roomMap = new Map(rooms.map((r) => [r.id, r]))
    const processed = new Set<string>()
    const doors: ReturnType<typeof findSharedWall>[] = []

    for (const conn of connections) {
      const key = [conn.from, conn.to].sort().join('--')
      if (processed.has(key)) continue
      processed.add(key)
      const a = roomMap.get(conn.from)
      const b = roomMap.get(conn.to)
      if (!a || !b) continue
      const door = findSharedWall(a, b, key)
      if (door) doors.push(door)
    }
    return doors
  }, [isGenerated, rooms, connections])

  /**
   * 연결 기반 자동 문 보조 렌더 유지 목록.
   * - 기존에는 openings가 1개라도 생기면 전부 숨겨져 "자동 문이 사라진 것처럼" 보였다.
   * - 연결쌍별로 실제 개구부가 존재하지 않는 경우에만 보조 문을 유지한다.
   */
  const fallbackDoorList = useMemo(() => {
    if (!doorList.length) return []
    const visibleWallIdSet = new Set(walls.map((wall) => wall.id))
    return doorList.filter((door) => {
      if (!door) return false
      const pair = door.key.split('--').sort()
      const sharedWallId = `auto-shared-${pair.join('-')}`
      const autoOpeningId = `auto-door-${pair.join('-')}`
      if (!visibleWallIdSet.has(sharedWallId)) return false
      return !openings.some((opening) =>
        opening.type === 'door' &&
        (opening.wallId === sharedWallId || opening.id === autoOpeningId),
      )
    })
  }, [doorList, openings, walls])

  const autoRoomWalls = useMemo<FloorWall[]>(() => {
    if (!isGenerated || rooms.length === 0) return []
    // useEditorPage와 동일한 자동 벽 파생 규칙을 공통 유틸로 공유한다.
    return deriveAutoWallsFromRooms(rooms)
  }, [isGenerated, rooms])

  const openingTargetWalls = useMemo(() => {
    if (autoRoomWalls.length === 0) return walls
    const manualIds = new Set(walls.map((wall) => wall.id))
    const fallbackWalls = autoRoomWalls.filter((wall) => !manualIds.has(wall.id))
    return [...walls, ...fallbackWalls]
  }, [walls, autoRoomWalls])

  const wallById = useMemo(() => {
    const map = new Map<string, FloorWall>()
    for (const wall of openingTargetWalls) map.set(wall.id, wall)
    return map
  }, [openingTargetWalls])

  const openingById = useMemo(() => {
    const map = new Map<string, FloorOpening>()
    for (const opening of openings) map.set(opening.id, opening)
    return map
  }, [openings])

  const dedupedRenderWalls = useMemo(() => {
    const byGeometry = new Map<string, FloorWall>()
    const isAutoWall = (wallId: string) =>
      wallId.startsWith('auto-room-') || wallId.startsWith('auto-shared-')

    walls.forEach((wall) => {
      const key = getWallGeometryKey(wall)
      const existing = byGeometry.get(key)
      if (!existing) {
        byGeometry.set(key, wall)
        return
      }
      // 같은 좌표 벽이 중복될 때는 수동 벽을 우선 표시한다.
      if (isAutoWall(existing.id) && !isAutoWall(wall.id)) {
        byGeometry.set(key, wall)
      }
    })

    const uniqueWalls = Array.from(byGeometry.values())
    const hiddenWallIds = new Set<string>()

    const chooseWallToHide = (a: FloorWall, b: FloorWall): string | null => {
      const aContainedByB = shouldRemoveAsContainedOverlap(a, b)
      const bContainedByA = shouldRemoveAsContainedOverlap(b, a)
      if (!aContainedByB && !bContainedByA) return null

      const aIsAuto = isAutoWall(a.id)
      const bIsAuto = isAutoWall(b.id)

      // 수동 벽과 자동 벽이 겹치면 자동 벽을 숨겨 수동 편집 결과를 우선한다.
      if (aContainedByB && !aIsAuto && bIsAuto) return b.id
      if (bContainedByA && !bIsAuto && aIsAuto) return a.id
      if (aContainedByB && aIsAuto && !bIsAuto) return a.id
      if (bContainedByA && bIsAuto && !aIsAuto) return b.id

      // 같은 성격(수동/자동)끼리는 더 짧은(포함된) 선분을 숨긴다.
      if (aContainedByB) return a.id
      if (bContainedByA) return b.id
      return null
    }

    for (let i = 0; i < uniqueWalls.length; i += 1) {
      const base = uniqueWalls[i]
      if (!base || hiddenWallIds.has(base.id)) continue
      for (let j = i + 1; j < uniqueWalls.length; j += 1) {
        const candidate = uniqueWalls[j]
        if (!candidate || hiddenWallIds.has(candidate.id)) continue
        const hideId = chooseWallToHide(base, candidate)
        if (!hideId) continue
        hiddenWallIds.add(hideId)
      }
    }

    return uniqueWalls.filter((wall) => !hiddenWallIds.has(wall.id))
  }, [walls])

  const dimensionGuides = useMemo(
    () => computeDimensionGuides({ isGenerated, rooms, walls: dedupedRenderWalls }),
    [isGenerated, rooms, dedupedRenderWalls],
  )

  const selectedWallGeometryKey = useMemo(() => {
    if (!selectedWallId) return null
    const selectedWall = walls.find((wall) => wall.id === selectedWallId)
    if (!selectedWall) return null
    return getWallGeometryKey(selectedWall)
  }, [selectedWallId, walls])

  const createOpeningOnWall = (wall: FloorWall, point: Point2D) => {
    if (!isOpeningTool) return
    const openingType: FloorOpening['type'] = isDoorTool ? 'door' : 'window'
    const wallPosition = getProjectedWallPosition(point, wall)
    const presetWidthMm = FLOOR_OPENING_PRESETS[openingType].widthMm
    const snapped = getSnappedOpeningWallPosition(
      wallPosition,
      wall,
      null,
      presetWidthMm,
      OPENING_CREATE_SNAP_THRESHOLD,
    )
    onOpeningCreate?.(wall.id, openingType, snapped.wallPosition)
    if (snapped.guidePosition !== null) {
      setOpeningSnapGuide({ wallId: wall.id, wallPosition: snapped.guidePosition })
      if (createOpeningGuideTimerRef.current !== null) clearTimeout(createOpeningGuideTimerRef.current)
      createOpeningGuideTimerRef.current = window.setTimeout(() => {
        setOpeningSnapGuide(null)
        createOpeningGuideTimerRef.current = null
      }, 220)
      return
    }
    setOpeningSnapGuide(null)
  }

  /**
   * 연결 기반 보조 문을 실제 개구부 데이터로 승격한다.
   * Select에서 문 조작을 시작할 수 있도록 최소 보강한다.
   */
  const promoteFallbackDoorToOpening = (door: DoorInfo): string | null => {
    const pair = door.key.split('--').sort()
    const wallId = `auto-shared-${pair.join('-')}`
    const openingId = `auto-door-${pair.join('-')}`

    const anchor: Point2D | null =
      door.direction === 'vertical' && door.wallX !== undefined && door.doorCenterY !== undefined
        ? { x: door.wallX, y: door.doorCenterY }
        : door.direction === 'horizontal' && door.wallY !== undefined && door.doorCenterX !== undefined
          ? { x: door.doorCenterX, y: door.wallY }
          : null
    if (!anchor) return null

    let wall = wallById.get(wallId) ?? null
    if (!wall) {
      let nearest: FloorWall | null = null
      let nearestDistance = Number.POSITIVE_INFINITY
      openingTargetWalls.forEach((candidate) => {
        const distance = distancePointToSegment(anchor, candidate.start, candidate.end)
        if (distance < nearestDistance) {
          nearest = candidate
          nearestDistance = distance
        }
      })
      wall = nearestDistance <= 24 ? nearest : null
    }
    if (!wall) return null

    const wallPosition = getProjectedWallPosition(anchor, wall)
    onOpeningCreate?.(wall.id, 'door', wallPosition, openingId)
    return openingId
  }

  const findNearestWallForOpeningDrag = (point: Point2D, fallbackWallId: string): FloorWall | null => {
    let nearest: FloorWall | null = null
    let nearestDistance = Number.POSITIVE_INFINITY

    openingTargetWalls.forEach((wall) => {
      const distance = distancePointToSegment(point, wall.start, wall.end)
      const hitThreshold = Math.max(14, wallThicknessMmToPx(wall.thickness) + 6)
      if (distance <= hitThreshold && distance < nearestDistance) {
        nearest = wall
        nearestDistance = distance
      }
    })

    if (nearest) return nearest
    return wallById.get(fallbackWallId) ?? null
  }

  /** Room 리사이즈 충돌 검사: Room- Room 중첩 + Room 내부를 관통하는 Wall 금지 */
  const canResizeRoom = (
    roomBubbleId: string,
    nextRect: AxisAlignedRect,
  ): boolean => {
    const overlapPadding = 2
    for (const room of rooms) {
      if (room.bubbleId === roomBubbleId) continue
      const otherRect: AxisAlignedRect = {
        x: room.x,
        y: room.y,
        width: room.width,
        height: room.height,
      }
      if (rectsOverlap(nextRect, otherRect, overlapPadding)) return false
    }
    // 벽 충돌로 리사이즈가 막혀 조작감이 급격히 나빠지는 문제를 방지한다.
    // 벽 정합성은 상위(onRoomResize) 동기화 경로에서 보정한다.
    return true
  }

  /** Room 리사이즈 적용 (충돌 통과 시에만 업데이트) */
  const applyRoomResize = (
    roomBubbleId: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ): boolean => {
    const currentRoom = rooms.find((room) => room.bubbleId === roomBubbleId)
    if (!currentRoom) return false
    const nextRect: AxisAlignedRect = {
      x,
      y,
      width: Math.max(width, 40),
      height: Math.max(height, 40),
    }
    if (!canResizeRoom(roomBubbleId, nextRect)) return false
    onRoomResize?.(roomBubbleId, nextRect.x, nextRect.y, nextRect.width, nextRect.height)
    return true
  }

  const syncHandlePosition = (
    e: KonvaEventObject<DragEvent>,
    x: number,
    y: number,
  ) => {
    e.target.position({ x, y })
    e.target.getLayer()?.batchDraw()
  }

  /**
   * 개구부 벽 위치 스냅:
   * - 벽 끝점(0/1), 중앙(0.5)
   * - 같은 벽의 다른 개구부 중심
   * - 다른 개구부와 최소 이격(센터 기준) 후보
   */
  const getSnappedOpeningWallPosition = (
    rawWallPosition: number,
    wall: FloorWall,
    movingOpeningId: string | null,
    movingWidthMm: number,
    snapThreshold = OPENING_SNAP_THRESHOLD,
  ): OpeningSnapResult => {
    const wallLengthPx = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y)
    const wallLengthMm = Math.max(wallLengthPx * FLOOR_MM_PER_PX, 1)
    let value = Math.min(Math.max(rawWallPosition, 0), 1)
    if (isGridSnapEnabled) {
      const ratioStep = Math.min(Math.max(gridSnapStepPx / Math.max(wallLengthPx, 1), 0.005), 0.25)
      value = Math.round(value / ratioStep) * ratioStep
    }

    const endpointCandidates = [0, 1]
    const centerCandidates = [0.5]
    const siblingCenterCandidates: number[] = []
    const spacingCandidates: number[] = []

    const siblings = openings.filter((opening) => opening.wallId === wall.id && opening.id !== movingOpeningId)
    for (const sibling of siblings) {
      siblingCenterCandidates.push(sibling.wallPosition)

      // 개구부 간 최소 간격 후보(센터 기준)
      const minCenterGapMm = (movingWidthMm + sibling.widthMm) / 2 + OPENING_MIN_CLEARANCE_MM
      const gapRatio = minCenterGapMm / wallLengthMm
      spacingCandidates.push(Math.min(Math.max(sibling.wallPosition - gapRatio, 0), 1))
      spacingCandidates.push(Math.min(Math.max(sibling.wallPosition + gapRatio, 0), 1))
    }

    const findBestCandidate = (candidates: number[]): { candidate: number; diff: number } | null => {
      const unique = Array.from(new Set(candidates))
      let bestCandidate: number | null = null
      let bestDiff = Number.POSITIVE_INFINITY
      unique.forEach((candidate) => {
        const diff = Math.abs(candidate - value)
        if (diff < bestDiff) {
          bestDiff = diff
          bestCandidate = candidate
        }
      })
      if (bestCandidate === null) return null
      return { candidate: bestCandidate, diff: bestDiff }
    }

    // 우선순위: 끝점 -> 중앙 -> 같은 벽의 다른 개구부 중심 -> 최소 간격 후보
    const candidateGroups = [
      endpointCandidates,
      centerCandidates,
      siblingCenterCandidates,
      spacingCandidates,
    ]

    for (const group of candidateGroups) {
      const best = findBestCandidate(group)
      if (!best) continue
      if (best.diff <= snapThreshold) {
        value = best.candidate
        return { wallPosition: value, guidePosition: best.candidate }
      }
    }

    return { wallPosition: value, guidePosition: null }
  }

  /** 방 위에 마우스가 올라왔을 때 현재 도구에 맞는 커서 적용 */
  const handleMouseEnter = (e: KonvaEventObject<MouseEvent>) => {
    const container = e.target.getStage()?.container()
    if (container) container.style.cursor = isPanMode ? 'grab' : 'pointer'
  }
  /** 방에서 마우스가 벗어날 때 기본 커서로 복원 */
  const handleMouseLeave = (e: KonvaEventObject<MouseEvent>) => {
    const container = e.target.getStage()?.container()
    if (container) container.style.cursor = 'default'
  }

  const toScreenPoint = (point: Point2D): Point2D => ({
    x: point.x * scale + baseOffsetX + panOffset.x,
    y: point.y * scale + baseOffsetY + panOffset.y,
  })

  const startPinDraftAt = (point: Point2D) => {
    setPinDraft((prev) => {
      if (prev) prev.attachments.forEach((attachment) => URL.revokeObjectURL(attachment.url))
      return {
        x: point.x,
        y: point.y,
        message: '',
        attachments: [],
      }
    })
  }

  const addPinDraftFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const nextAttachments = Array.from(files).map(createAttachmentFromFile)
    setPinDraft((prev) => (prev ? { ...prev, attachments: [...prev.attachments, ...nextAttachments] } : prev))
  }

  const removePinDraftAttachment = (targetUrl: string) => {
    setPinDraft((prev) => {
      if (!prev) return prev
      const target = prev.attachments.find((attachment) => attachment.url === targetUrl)
      if (target) URL.revokeObjectURL(target.url)
      return {
        ...prev,
        attachments: prev.attachments.filter((attachment) => attachment.url !== targetUrl),
      }
    })
  }

  const savePinDraft = () => {
    if (!pinDraft) return
    const message = pinDraft.message.trim()
    if (!message && pinDraft.attachments.length === 0) return
    onPinCreate?.(pinDraft.x, pinDraft.y, message, pinDraft.attachments)
    setPinDraft(null)
  }

  const cancelPinDraft = () => {
    if (!pinDraft) return
    pinDraft.attachments.forEach((attachment) => URL.revokeObjectURL(attachment.url))
    setPinDraft(null)
  }

  // ── 생성 전 / 생성 중 화면 ───────────────────────────────────────────────
  if (!isGenerated && !isGenerating) return <FloorPlanEmpty onGenerate={onGenerate} canGenerate={canGenerate} />
  if (isGenerating) return <FloorPlanLoading />

  // ── 생성 완료: Konva 평면도 렌더링 ───────────────────────────────────────
  return (
    <div className="absolute inset-0">
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        className="absolute inset-0"
        scaleX={scale}
        scaleY={scale}
        x={baseOffsetX + panOffset.x}
        y={baseOffsetY + panOffset.y}
        draggable={isPanMode}
        onDragMove={(e) => {
          if (e.target.getType() !== 'Stage') return
          setPanOffset({
            x: e.target.x() - baseOffsetX,
            y: e.target.y() - baseOffsetY,
          })
        }}
        onDragStart={(e) => {
          if (e.target.getType() !== 'Stage') return
          const container = e.target.getStage()?.container()
          if (container && isPanMode) container.style.cursor = 'grabbing'
        }}
        onDragEnd={(e) => {
          if (e.target.getType() !== 'Stage') return
          const container = e.target.getStage()?.container()
          if (container && isPanMode) container.style.cursor = 'grab'
        }}
        onMouseDown={(e) => {
        const stage = e.target.getStage()
        if (!stage) return

        if (isWallTool && e.evt.button === 2 && isDrawingWall) {
          e.evt.preventDefault()
          cancelWallDraft()
          return
        }

        if (e.evt.button === 1) {
          e.evt.preventDefault()
          setIsMiddlePanning(true)
          stage.draggable(true)
          stage.startDrag()
          stage.container().style.cursor = 'grabbing'
          return
        }

        if (e.evt.button !== 0) return
        if (isInteractionLockedByCollaboration) return
        if (selectedTool === 'selection') {
          if (isPanMode) return
          if (e.target.getType() !== 'Stage') return
          const point = getCanvasPoint(stage)
          if (!point) return
          isDrawingMarquee.current = true
          marqueeStart.current = point
          marqueeAppendRef.current = e.evt.shiftKey
          setMarquee({ x: point.x, y: point.y, width: 0, height: 0 })
          return
        }
        if (!isWallTool) return
        const point = getCanvasPoint(stage)
        if (!point) return
        const snappedPoint = getSnappedWallPoint(point, wallDraftStart, e.evt.shiftKey)
        skipStageClickClearRef.current = true
        e.cancelBubble = true
        onWallSelect?.(null)
        setOpeningSnapGuide(null)

        if (!isDrawingWall || !wallDraftStart) {
          setIsDrawingWall(true)
          setWallDraftStart(snappedPoint)
          setWallDraftEnd(snappedPoint)
          return
        }

        const distance = Math.hypot(snappedPoint.x - wallDraftStart.x, snappedPoint.y - wallDraftStart.y)
        if (distance < WALL_MIN_LENGTH) return
        onWallCreate?.(wallDraftStart, snappedPoint, {
          type: wallDraftType,
          thickness: wallDraftThicknessMm,
          heightMm: wallDraftHeightMm,
        })
        // CAD 스타일 연속 벽 생성: 이전 끝점을 다음 시작점으로 유지
        setWallDraftStart(snappedPoint)
        setWallDraftEnd(snappedPoint)
      }}
        onMouseMove={(e) => {
        const stage = e.target.getStage()
        if (!stage) return

        if (isDrawingMarquee.current && marqueeStart.current) {
          const pos = getCanvasPoint(stage)
          if (!pos) return
          const sx = marqueeStart.current.x
          const sy = marqueeStart.current.y
          setMarquee({
            x: Math.min(sx, pos.x),
            y: Math.min(sy, pos.y),
            width: Math.abs(pos.x - sx),
            height: Math.abs(pos.y - sy),
          })
          return
        }

        if (openingDragState) {
          const point = getCanvasPoint(stage)
          if (!point) return
          const opening = openingById.get(openingDragState.openingId)
          if (!opening) return
          const wall = findNearestWallForOpeningDrag(point, opening.wallId)
          if (!wall) return
          const wallPosition = getProjectedWallPosition(point, wall)
          const snapped = getSnappedOpeningWallPosition(
            wallPosition,
            wall,
            openingDragState.openingId,
            opening.widthMm,
          )
          onOpeningMove?.(openingDragState.openingId, snapped.wallPosition, wall.id)
          setOpeningSnapGuide(
            snapped.guidePosition === null
              ? null
              : { wallId: wall.id, wallPosition: snapped.guidePosition },
          )
          return
        }

        if (wallDragState) {
          const point = getCanvasPoint(stage)
          if (!point) return
          const dx = point.x - wallDragState.lastPoint.x
          const dy = point.y - wallDragState.lastPoint.y
          if (dx !== 0 || dy !== 0) {
            onWallMove?.(wallDragState.wallId, dx, dy)
            setWallDragState({ wallId: wallDragState.wallId, lastPoint: point })
          }
          return
        }

        if (!isDrawingWall || !isWallTool) return
        const point = getCanvasPoint(stage)
        if (!point) return
        setWallDraftEnd(getSnappedWallPoint(point, wallDraftStart, e.evt.shiftKey))
      }}
        onMouseUp={(e) => {
        const stage = e.target.getStage()
        if (!stage) return

        if (isMiddlePanning) {
          stage.stopDrag()
          stage.container().style.cursor = isSpacePressed || selectedTool === 'hand' ? 'grab' : 'default'
          setIsMiddlePanning(false)
        }

        if (wallDragState) {
          setWallDragState(null)
        }
        if (roomDragState) {
          setRoomDragState(null)
        }
        if (openingDragState) {
          setOpeningDragState(null)
          setOpeningSnapGuide(null)
        }
        if (isDrawingMarquee.current) {
          isDrawingMarquee.current = false
          marqueeStart.current = null
          if (marquee && (marquee.width > 5 || marquee.height > 5)) {
            const roomIds = rooms
              .filter((room) => {
                const roomRight = room.x + room.width
                const roomBottom = room.y + room.height
                const marqueeRight = marquee.x + marquee.width
                const marqueeBottom = marquee.y + marquee.height
                return room.x < marqueeRight && roomRight > marquee.x && room.y < marqueeBottom && roomBottom > marquee.y
              })
              .map((room) => room.bubbleId)
            const rect: AxisAlignedRect = marquee
            const wallIds = dedupedRenderWalls
              .filter((wall) => lineIntersectsRect(wall.start, wall.end, rect))
              .map((wall) => wall.id)
            const openingIds = openings
              .filter((opening) => {
                const wall = wallById.get(opening.wallId)
                if (!wall) return false
                const anchor = getWallPointAtPosition(wall, opening.wallPosition)
                return pointInRect(anchor, rect)
              })
              .map((opening) => opening.id)

            if (onTwoDMarqueeSelect) {
              onTwoDMarqueeSelect(
                { roomIds, wallIds, openingIds },
                marqueeAppendRef.current,
              )
            } else {
              onMarqueeSelect?.(roomIds, marqueeAppendRef.current)
            }
          }
          setMarquee(null)
          marqueeAppendRef.current = false
        }
      }}
        onClick={(e) => {
        if (e.target.getType() !== 'Stage') return
        if (isPanMode) return
        if (isInteractionLockedByCollaboration) {
          const stage = e.target.getStage()
          if (!stage) return
          const point = getCanvasPoint(stage)
          if (!point) return
          startPinDraftAt(point)
          return
        }
        if (skipStageClickClearRef.current) {
          skipStageClickClearRef.current = false
          return
        }
        onSelect?.(null)
        onWallSelect?.(null)
        onOpeningSelect?.(null)
        setOpeningSnapGuide(null)
      }}
        onDblClick={() => {
        if (!isWallTool || !isDrawingWall) return
        cancelWallDraft()
      }}
        onContextMenu={(e) => {
        if (!isWallTool || !isDrawingWall) return
        e.evt.preventDefault()
        cancelWallDraft()
      }}
        onWheel={(e) => {
        if (!e.evt.ctrlKey && !e.evt.metaKey) return
        e.evt.preventDefault()
        onWheelZoom?.(e.evt.deltaY < 0 ? 1.1 : 0.9)
      }}
      >
        <Layer>
        {/* 그리드 라인 */}
        {isGridVisible && (
          <>
            {gridLines.minor.map((pts, i) => (
              <Line key={`mg-${i}`} points={pts} stroke="#EAECF4" strokeWidth={0.5} />
            ))}
            {gridLines.major.map((pts, i) => (
              <Line key={`Mg-${i}`} points={pts} stroke="#D4D8EC" strokeWidth={1} />
            ))}
          </>
        )}

        {/* 자동 치수선 오버레이 (실시설계 2D 도면 스타일 보강) */}
        <DimensionGuidesLayer guides={dimensionGuides} />

        {/* 층 겹쳐보기 오버레이(비활성 층) */}
        {overlayLayers.map((overlay) => (
          <Group key={`overlay-${overlay.layerId}`} listening={false}>
            {overlay.rooms.map((room) => (
              <Group key={`overlay-room-${overlay.layerId}-${room.id}`} listening={false}>
                <Rect
                  x={room.x}
                  y={room.y}
                  width={room.width}
                  height={room.height}
                  fill={hexToRgba(room.color, Math.min(Math.max(overlay.opacity * 0.35, 0.06), 0.35))}
                />
                <Rect
                  x={room.x}
                  y={room.y}
                  width={room.width}
                  height={room.height}
                  stroke="#6B7A99"
                  strokeWidth={1}
                  dash={[6, 4]}
                  fill="transparent"
                />
                <Text
                  x={room.x}
                  y={room.y + room.height / 2 - 6}
                  width={room.width}
                  align="center"
                  text={overlay.layerName}
                  fontSize={9}
                  fontStyle="bold"
                  fill="#6B7A99"
                />
              </Group>
            ))}
          </Group>
        ))}

        {/* 방(Room) 렌더링 */}
        {rooms.map((room) => {
          const isSelected = selectedIds.includes(room.bubbleId) || selectedId === room.bubbleId
          const canResizeSelectedRoom = isSelected && (selectedTool === 'selection' || isResizeTool)
          const fill = getRoomFill(room.color)
          const labelFontSize = Math.max(9, Math.min(13, room.width / 8))
          const areaFontSize = Math.max(8, Math.min(11, room.width / 10))
          const edgeCoveredByWall = getRoomEdgeCoverageByWalls(room, dedupedRenderWalls)

          return (
            <Group
              key={room.id}
              listening={!isInteractionLockedByCollaboration}
              onClick={(e) => {
                if (isPanMode || isWallTool) return
                e.cancelBubble = true
                // 문/창문 도구는 "벽 클릭 삽입"만 허용한다.
                // Room/빈 영역 클릭으로는 생성하지 않는다.
                if (isOpeningTool) return
                onWallSelect?.(null)
                onOpeningSelect?.(null)
                if (e.evt.shiftKey) {
                  onSelect?.(room.bubbleId, true)
                  return
                }
                onSelect?.(isSelected ? null : room.bubbleId, false)
              }}
              draggable={
                isSelected &&
                selectedTool === 'selection' &&
                !isPanMode &&
                resizingRoomBubbleId !== room.bubbleId
              }
              onDragStart={(e) => {
                e.cancelBubble = true
                onWallSelect?.(null)
                onOpeningSelect?.(null)
                if (!isSelected) onSelect?.(room.bubbleId, false)
                const stage = e.target.getStage()
                const point = stage ? getCanvasPoint(stage) : null
                if (!point) return
                setRoomDragState({
                  roomBubbleId: room.bubbleId,
                  startX: room.x,
                  startY: room.y,
                  startPointer: point,
                })
              }}
              onDragMove={(e) => {
                const stage = e.target.getStage()
                const point = stage ? getCanvasPoint(stage) : null
                if (!point || !roomDragState || roomDragState.roomBubbleId !== room.bubbleId) {
                  e.target.position({ x: 0, y: 0 })
                  e.target.getLayer()?.batchDraw()
                  return
                }
                const dx = point.x - roomDragState.startPointer.x
                const dy = point.y - roomDragState.startPointer.y
                const rawNextX = snapCoordinate(roomDragState.startX + dx, isGridSnapEnabled, gridSnapStepPx)
                const rawNextY = snapCoordinate(roomDragState.startY + dy, isGridSnapEnabled, gridSnapStepPx)
                const snapped = getSnappedRoomPosition(
                  room.bubbleId,
                  rawNextX,
                  rawNextY,
                  room.width,
                  room.height,
                  rooms,
                )
                onRoomMove?.(room.bubbleId, snapped.x, snapped.y)
                // Group 드래그 오프셋은 상태 반영 직후 0으로 되돌려 누적 오차를 방지한다.
                e.target.position({ x: 0, y: 0 })
                e.target.getLayer()?.batchDraw()
              }}
              onDragEnd={(e) => {
                setRoomDragState(null)
                e.target.position({ x: 0, y: 0 })
                e.target.getLayer()?.batchDraw()
              }}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              {/* 배경 채우기 */}
              <Rect x={room.x} y={room.y} width={room.width} height={room.height} fill={fill} />
              {/* Room 경계선(회색 실선): 벽이 있는 엣지는 숨겨 이중선 느낌을 줄인다. */}
              {!edgeCoveredByWall.top && (
                <Line
                  points={[room.x, room.y, room.x + room.width, room.y]}
                  stroke="#B8BFCC"
                  strokeWidth={1.5}
                />
              )}
              {!edgeCoveredByWall.right && (
                <Line
                  points={[room.x + room.width, room.y, room.x + room.width, room.y + room.height]}
                  stroke="#B8BFCC"
                  strokeWidth={1.5}
                />
              )}
              {!edgeCoveredByWall.bottom && (
                <Line
                  points={[room.x + room.width, room.y + room.height, room.x, room.y + room.height]}
                  stroke="#B8BFCC"
                  strokeWidth={1.5}
                />
              )}
              {!edgeCoveredByWall.left && (
                <Line
                  points={[room.x, room.y + room.height, room.x, room.y]}
                  stroke="#B8BFCC"
                  strokeWidth={1.5}
                />
              )}
              {/* 공간 이름 */}
              <Text
                x={room.x} y={room.y + room.height / 2 - labelFontSize - 3}
                width={room.width} align="center"
                text={room.label} fontSize={labelFontSize} fontStyle="bold"
                fill={isSelected ? '#3B45B3' : '#1C1C1E'}
              />
              {/* 면적 */}
              <Text
                x={room.x} y={room.y + room.height / 2 + 3}
                width={room.width} align="center"
                text={`${room.area.toFixed(1)} m²`} fontSize={areaFontSize} fontStyle="bold"
                fill="#ADB5BD"
              />

              {/* 2D 방 리사이즈 핸들 */}
              {canResizeSelectedRoom && (
                <>
                  {/* 가장자리 핸들 (상/하/좌/우) */}
                  <Circle
                    x={room.x + room.width / 2}
                    y={room.y}
                    radius={5.5}
                    fill="#FFFFFF"
                    stroke="#3B45B3"
                    strokeWidth={2}
                    draggable
                    onDragStart={(e) => {
                      e.cancelBubble = true
                      setRoomDragState(null)
                      setResizingRoomBubbleId(room.bubbleId)
                    }}
                    onDragMove={(e) => {
                      e.cancelBubble = true
                      const bottom = room.y + room.height
                      const py = snapResizeHandle(e.target.y())
                      const nextY = Math.min(py, bottom - 40)
                      const applied = applyRoomResize(room.bubbleId, room.x, nextY, room.width, bottom - nextY)
                      if (!applied) syncHandlePosition(e, room.x + room.width / 2, room.y)
                    }}
                    onDragEnd={(e) => {
                      syncHandlePosition(e, room.x + room.width / 2, room.y)
                      setResizingRoomBubbleId(null)
                    }}
                    onMouseDown={(e) => { e.cancelBubble = true }}
                  />
                  <Circle
                    x={room.x + room.width / 2}
                    y={room.y + room.height}
                    radius={5.5}
                    fill="#FFFFFF"
                    stroke="#3B45B3"
                    strokeWidth={2}
                    draggable
                    onDragStart={(e) => {
                      e.cancelBubble = true
                      setRoomDragState(null)
                      setResizingRoomBubbleId(room.bubbleId)
                    }}
                    onDragMove={(e) => {
                      e.cancelBubble = true
                      const top = room.y
                      const py = snapResizeHandle(e.target.y())
                      const nextBottom = Math.max(py, top + 40)
                      const applied = applyRoomResize(room.bubbleId, room.x, top, room.width, nextBottom - top)
                      if (!applied) syncHandlePosition(e, room.x + room.width / 2, room.y + room.height)
                    }}
                    onDragEnd={(e) => {
                      syncHandlePosition(e, room.x + room.width / 2, room.y + room.height)
                      setResizingRoomBubbleId(null)
                    }}
                    onMouseDown={(e) => { e.cancelBubble = true }}
                  />
                  <Circle
                    x={room.x}
                    y={room.y + room.height / 2}
                    radius={5.5}
                    fill="#FFFFFF"
                    stroke="#3B45B3"
                    strokeWidth={2}
                    draggable
                    onDragStart={(e) => {
                      e.cancelBubble = true
                      setRoomDragState(null)
                      setResizingRoomBubbleId(room.bubbleId)
                    }}
                    onDragMove={(e) => {
                      e.cancelBubble = true
                      const right = room.x + room.width
                      const px = snapResizeHandle(e.target.x())
                      const nextX = Math.min(px, right - 40)
                      const applied = applyRoomResize(room.bubbleId, nextX, room.y, right - nextX, room.height)
                      if (!applied) syncHandlePosition(e, room.x, room.y + room.height / 2)
                    }}
                    onDragEnd={(e) => {
                      syncHandlePosition(e, room.x, room.y + room.height / 2)
                      setResizingRoomBubbleId(null)
                    }}
                    onMouseDown={(e) => { e.cancelBubble = true }}
                  />
                  <Circle
                    x={room.x + room.width}
                    y={room.y + room.height / 2}
                    radius={5.5}
                    fill="#FFFFFF"
                    stroke="#3B45B3"
                    strokeWidth={2}
                    draggable
                    onDragStart={(e) => {
                      e.cancelBubble = true
                      setRoomDragState(null)
                      setResizingRoomBubbleId(room.bubbleId)
                    }}
                    onDragMove={(e) => {
                      e.cancelBubble = true
                      const left = room.x
                      const px = snapResizeHandle(e.target.x())
                      const nextRight = Math.max(px, left + 40)
                      const applied = applyRoomResize(room.bubbleId, left, room.y, nextRight - left, room.height)
                      if (!applied) syncHandlePosition(e, room.x + room.width, room.y + room.height / 2)
                    }}
                    onDragEnd={(e) => {
                      syncHandlePosition(e, room.x + room.width, room.y + room.height / 2)
                      setResizingRoomBubbleId(null)
                    }}
                    onMouseDown={(e) => { e.cancelBubble = true }}
                  />

                  <Circle
                    x={room.x}
                    y={room.y}
                    radius={6}
                    fill="#FFFFFF"
                    stroke="#3B45B3"
                    strokeWidth={2}
                    draggable
                    onDragStart={(e) => {
                      e.cancelBubble = true
                      setRoomDragState(null)
                      setResizingRoomBubbleId(room.bubbleId)
                    }}
                    onDragMove={(e) => {
                      e.cancelBubble = true
                      const right = room.x + room.width
                      const bottom = room.y + room.height
                      const px = snapResizeHandle(e.target.x())
                      const py = snapResizeHandle(e.target.y())
                      const nextX = Math.min(px, right - 40)
                      const nextY = Math.min(py, bottom - 40)
                      const applied = applyRoomResize(room.bubbleId, nextX, nextY, right - nextX, bottom - nextY)
                      if (!applied) syncHandlePosition(e, room.x, room.y)
                    }}
                    onDragEnd={(e) => {
                      syncHandlePosition(e, room.x, room.y)
                      setResizingRoomBubbleId(null)
                    }}
                    onMouseDown={(e) => { e.cancelBubble = true }}
                  />
                  <Circle
                    x={room.x + room.width}
                    y={room.y}
                    radius={6}
                    fill="#FFFFFF"
                    stroke="#3B45B3"
                    strokeWidth={2}
                    draggable
                    onDragStart={(e) => {
                      e.cancelBubble = true
                      setRoomDragState(null)
                      setResizingRoomBubbleId(room.bubbleId)
                    }}
                    onDragMove={(e) => {
                      e.cancelBubble = true
                      const left = room.x
                      const bottom = room.y + room.height
                      const px = snapResizeHandle(e.target.x())
                      const py = snapResizeHandle(e.target.y())
                      const nextRight = Math.max(px, left + 40)
                      const nextY = Math.min(py, bottom - 40)
                      const applied = applyRoomResize(room.bubbleId, left, nextY, nextRight - left, bottom - nextY)
                      if (!applied) syncHandlePosition(e, room.x + room.width, room.y)
                    }}
                    onDragEnd={(e) => {
                      syncHandlePosition(e, room.x + room.width, room.y)
                      setResizingRoomBubbleId(null)
                    }}
                    onMouseDown={(e) => { e.cancelBubble = true }}
                  />
                  <Circle
                    x={room.x}
                    y={room.y + room.height}
                    radius={6}
                    fill="#FFFFFF"
                    stroke="#3B45B3"
                    strokeWidth={2}
                    draggable
                    onDragStart={(e) => {
                      e.cancelBubble = true
                      setRoomDragState(null)
                      setResizingRoomBubbleId(room.bubbleId)
                    }}
                    onDragMove={(e) => {
                      e.cancelBubble = true
                      const right = room.x + room.width
                      const top = room.y
                      const px = snapResizeHandle(e.target.x())
                      const py = snapResizeHandle(e.target.y())
                      const nextX = Math.min(px, right - 40)
                      const nextBottom = Math.max(py, top + 40)
                      const applied = applyRoomResize(room.bubbleId, nextX, top, right - nextX, nextBottom - top)
                      if (!applied) syncHandlePosition(e, room.x, room.y + room.height)
                    }}
                    onDragEnd={(e) => {
                      syncHandlePosition(e, room.x, room.y + room.height)
                      setResizingRoomBubbleId(null)
                    }}
                    onMouseDown={(e) => { e.cancelBubble = true }}
                  />
                  <Circle
                    x={room.x + room.width}
                    y={room.y + room.height}
                    radius={6}
                    fill="#FFFFFF"
                    stroke="#3B45B3"
                    strokeWidth={2}
                    draggable
                    onDragStart={(e) => {
                      e.cancelBubble = true
                      setRoomDragState(null)
                      setResizingRoomBubbleId(room.bubbleId)
                    }}
                    onDragMove={(e) => {
                      e.cancelBubble = true
                      const left = room.x
                      const top = room.y
                      const px = snapResizeHandle(e.target.x())
                      const py = snapResizeHandle(e.target.y())
                      const nextRight = Math.max(px, left + 40)
                      const nextBottom = Math.max(py, top + 40)
                      const applied = applyRoomResize(room.bubbleId, left, top, nextRight - left, nextBottom - top)
                      if (!applied) syncHandlePosition(e, room.x + room.width, room.y + room.height)
                    }}
                    onDragEnd={(e) => {
                      syncHandlePosition(e, room.x + room.width, room.y + room.height)
                      setResizingRoomBubbleId(null)
                    }}
                    onMouseDown={(e) => { e.cancelBubble = true }}
                  />
                </>
              )}
            </Group>
          )
        })}

        {/* 2D 편집 벽 렌더링 */}
        {dedupedRenderWalls.map((wall) => {
          const isMultiSelectedWall = selectedWallIds.includes(wall.id)
          const isSelectedWall =
            isMultiSelectedWall ||
            selectedWallId === wall.id ||
            (selectedWallGeometryKey !== null && getWallGeometryKey(wall) === selectedWallGeometryKey)
          const presetStroke = FLOOR_WALL_PRESETS[wall.type]?.stroke ?? '#2F3448'
          const strokeWidthPx = wallThicknessMmToPx(wall.thickness)
          return (
            <Group
              key={wall.id}
              // Resize/Room 툴에서는 벽 이벤트를 잠시 비활성화해
              // 방 핸들이 안정적으로 우선 잡히도록 한다.
              listening={!isInteractionLockedByCollaboration && !isResizeTool}
            >
              <Line
                points={[wall.start.x, wall.start.y, wall.end.x, wall.end.y]}
                stroke={isSelectedWall ? '#3B45B3' : presetStroke}
                strokeWidth={isSelectedWall ? strokeWidthPx + 1 : strokeWidthPx}
                lineCap="round"
                lineJoin="round"
                dash={wall.type === 'partition' ? [10, 6] : undefined}
                shadowColor={isSelectedWall ? '#3B45B3' : undefined}
                shadowBlur={isSelectedWall ? 6 : 0}
                shadowOpacity={isSelectedWall ? 0.2 : 0}
                onClick={(e) => {
                  if (isPanMode) return
                  e.cancelBubble = true
                  const stage = e.target.getStage()
                  const point = stage ? getCanvasPoint(stage) : null
                  if (isWallTool) return
                  if (selectedTool === 'delete') {
                    onWallDelete?.(wall.id)
                    return
                  }
                  if (isOpeningTool && point) {
                    createOpeningOnWall(wall, point)
                    return
                  }
                  // 선택 모드의 선택/드래그 시작은 onMouseDown에서 처리해 중복 토글을 방지한다.
                  if (selectedTool === 'selection') return
                  if (!isWallTool) return
                }}
                onMouseDown={(e) => {
                  if (selectedTool !== 'selection' || isPanMode) return
                  if (e.evt.button !== 0) return
                  if (e.evt.shiftKey) {
                    e.cancelBubble = true
                    onWallSelect?.(wall.id, true)
                    return
                  }
                  const stage = e.target.getStage()
                  if (!stage) return
                  const point = getCanvasPoint(stage)
                  if (!point) return
                  e.cancelBubble = true
                  onWallSelect?.(wall.id, false)
                  setWallDragState({ wallId: wall.id, lastPoint: point })
                }}
              />

              {isSelectedWall && selectedTool === 'selection' && (
                <>
                  <Circle
                    x={wall.start.x}
                    y={wall.start.y}
                    radius={6}
                    fill="#FFFFFF"
                    stroke="#3B45B3"
                    strokeWidth={2}
                    draggable
                    onDragMove={(e) => {
                      const x = snapCoordinate(e.target.x(), isGridSnapEnabled, gridSnapStepPx)
                      const y = snapCoordinate(e.target.y(), isGridSnapEnabled, gridSnapStepPx)
                      onWallEndpointChange?.(wall.id, 'start', { x, y })
                    }}
                    onMouseDown={(e) => {
                      e.cancelBubble = true
                    }}
                  />
                  <Circle
                    x={wall.end.x}
                    y={wall.end.y}
                    radius={6}
                    fill="#FFFFFF"
                    stroke="#3B45B3"
                    strokeWidth={2}
                    draggable
                    onDragMove={(e) => {
                      const x = snapCoordinate(e.target.x(), isGridSnapEnabled, gridSnapStepPx)
                      const y = snapCoordinate(e.target.y(), isGridSnapEnabled, gridSnapStepPx)
                      onWallEndpointChange?.(wall.id, 'end', { x, y })
                    }}
                    onMouseDown={(e) => {
                      e.cancelBubble = true
                    }}
                  />
                </>
              )}
            </Group>
          )
        })}

        {/* 개구부 스냅 가이드 */}
        {openingSnapGuide && (() => {
          const guideWall = wallById.get(openingSnapGuide.wallId)
          if (!guideWall) return null
          const anchor = getWallPointAtPosition(guideWall, openingSnapGuide.wallPosition)
          const dx = guideWall.end.x - guideWall.start.x
          const dy = guideWall.end.y - guideWall.start.y
          const len = Math.hypot(dx, dy)
          if (len <= 0) return null
          const nx = -dy / len
          const ny = dx / len
          const guideLen = 22
          return (
            <Group>
              <Line
                points={[
                  anchor.x - nx * guideLen,
                  anchor.y - ny * guideLen,
                  anchor.x + nx * guideLen,
                  anchor.y + ny * guideLen,
                ]}
                stroke="#4C57D3"
                strokeWidth={1.5}
                dash={[4, 4]}
              />
              <Circle x={anchor.x} y={anchor.y} radius={3} fill="#4C57D3" />
            </Group>
          )
        })()}

        {/* 벽 생성 드래그 미리보기 */}
        {isWallTool && isDrawingWall && wallDraftStart && wallDraftEnd && (
          <Line
            points={[wallDraftStart.x, wallDraftStart.y, wallDraftEnd.x, wallDraftEnd.y]}
            stroke={FLOOR_WALL_PRESETS[wallDraftType]?.stroke ?? '#3B45B3'}
            strokeWidth={wallThicknessMmToPx(wallDraftThicknessMm)}
            lineCap="round"
            dash={[8, 6]}
          />
        )}

        {/* 문/창문 렌더링 및 편집 */}
        {openings.map((opening) => {
          const wall = wallById.get(opening.wallId)
          if (!wall) return null
          const anchor = getWallPointAtPosition(wall, opening.wallPosition)
          const angleDeg = (Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x) * 180) / Math.PI
          const openingWidthPx = openingWidthMmToPx(opening.widthMm)
          const isSelectedOpening = selectedOpeningId === opening.id || selectedOpeningIds.includes(opening.id)
          const wallStrokePx = wallThicknessMmToPx(wall.thickness)
          const doorHingeSide = opening.doorHingeSide ?? 'left'
          const doorSwingDirection = opening.doorSwingDirection ?? 'inward'
          const hingeX = doorHingeSide === 'left' ? -openingWidthPx / 2 : openingWidthPx / 2
          const doorLeafEndX = doorHingeSide === 'left' ? openingWidthPx / 2 : -openingWidthPx / 2
          const doorLeafEndY = doorSwingDirection === 'outward' ? -openingWidthPx : openingWidthPx
          const arcRotation = doorHingeSide === 'left'
            ? (doorSwingDirection === 'outward' ? -90 : 0)
            : (doorSwingDirection === 'outward' ? 180 : 90)

          return (
            <Group
              key={opening.id}
              x={anchor.x}
              y={anchor.y}
              rotation={angleDeg}
              listening={!isInteractionLockedByCollaboration}
              onClick={(e) => {
                if (isPanMode) return
                e.cancelBubble = true
                if (isWallTool) return
                if (isOpeningTool) {
                  const stage = e.target.getStage()
                  const point = stage ? getCanvasPoint(stage) : null
                  if (!point) return
                  createOpeningOnWall(wall, point)
                  return
                }
                if (selectedTool === 'delete') {
                  onOpeningDelete?.(opening.id)
                  return
                }
                // 선택 모드의 선택/드래그 시작은 onMouseDown에서 처리해 중복 토글을 방지한다.
                if (selectedTool === 'selection') return
                onOpeningSelect?.(opening.id, e.evt.shiftKey)
                onWallSelect?.(null)
                onSelect?.(null)
              }}
                onMouseDown={(e) => {
                  if (selectedTool !== 'selection' || isPanMode || e.evt.button !== 0) return
                  if (e.evt.shiftKey) {
                    e.cancelBubble = true
                    onOpeningSelect?.(opening.id, true)
                    return
                  }
                  e.cancelBubble = true
                  onOpeningSelect?.(opening.id, false)
                  setOpeningDragState({ openingId: opening.id })
                  setOpeningSnapGuide(null)
                }}
            >
              {opening.type === 'door' ? (
                <>
                  <Line
                    points={[-openingWidthPx / 2, 0, openingWidthPx / 2, 0]}
                    stroke="white"
                    strokeWidth={Math.max(wallStrokePx + 1, 5)}
                    lineCap="round"
                  />
                  <Circle x={hingeX} y={0} radius={2} fill="#3B45B3" />
                  {doorSwingDirection === 'sliding' ? (
                    <Line
                      points={[-openingWidthPx / 2, -6, openingWidthPx / 2, -6]}
                      stroke={isSelectedOpening ? '#4C57D3' : '#3B45B3'}
                      strokeWidth={1.5}
                      dash={[8, 4]}
                    />
                  ) : (
                    <>
                      <Line
                        points={[hingeX, 0, doorLeafEndX, doorLeafEndY]}
                        stroke={isSelectedOpening ? '#4C57D3' : '#3B45B3'}
                        strokeWidth={1.4}
                      />
                      <Arc
                        x={hingeX}
                        y={0}
                        innerRadius={0}
                        outerRadius={openingWidthPx}
                        angle={90}
                        rotation={arcRotation}
                        stroke={isSelectedOpening ? '#4C57D3' : '#3B45B3'}
                        strokeWidth={isSelectedOpening ? 2 : 1.5}
                        fill="rgba(59,69,179,0.07)"
                      />
                    </>
                  )}
                </>
              ) : (
                <Line
                  points={[-openingWidthPx / 2, 0, openingWidthPx / 2, 0]}
                  stroke={isSelectedOpening ? '#0B7DAA' : '#0EA5E9'}
                  strokeWidth={Math.max(wallStrokePx - 1, 4)}
                  lineCap="round"
                  dash={[10, 4]}
                />
              )}

              {isSelectedOpening && (
                <Circle x={0} y={0} radius={5} fill="#FFFFFF" stroke="#3B45B3" strokeWidth={2} />
              )}
            </Group>
          )
        })}

        {/* 연결 기반 자동 문 보조 렌더링(연결별 개구부 데이터가 없을 때만 표시) */}
        {fallbackDoorList.map((door) => {
          if (!door) return null

          // 수직 공유벽: 벽 x 기준, 문 중심 y 기준
          if (door.direction === 'vertical' && door.wallX !== undefined && door.doorCenterY !== undefined) {
            const { wallX, doorCenterY, doorW } = door
            const start = doorCenterY - doorW / 2
            return (
              <Group
                key={door.key}
                listening={!isInteractionLockedByCollaboration}
                onClick={(e) => {
                  if (isPanMode) return
                  e.cancelBubble = true
                  if (selectedTool === 'delete') {
                    const openingId = promoteFallbackDoorToOpening(door)
                    if (openingId) onOpeningDelete?.(openingId)
                    return
                  }
                  if (selectedTool === 'selection') {
                    const openingId = promoteFallbackDoorToOpening(door)
                    if (!openingId) return
                    onOpeningSelect?.(openingId, e.evt.shiftKey)
                    onWallSelect?.(null)
                    onSelect?.(null)
                    return
                  }
                  if (!isDoorTool) return
                  promoteFallbackDoorToOpening(door)
                }}
              >
                <Line points={[wallX, start, wallX, start + doorW]} stroke="white" strokeWidth={5} />
                <Circle x={wallX} y={start} radius={2} fill="#3B45B3" />
                <Arc x={wallX} y={start} innerRadius={0} outerRadius={doorW} angle={90} rotation={0} stroke="#3B45B3" strokeWidth={1.5} fill="rgba(59,69,179,0.05)" />
              </Group>
            )
          }

          // 수평 공유벽: 벽 y 기준, 문 중심 x 기준
          if (door.direction === 'horizontal' && door.wallY !== undefined && door.doorCenterX !== undefined) {
            const { wallY, doorCenterX, doorW } = door
            const start = doorCenterX - doorW / 2
            return (
              <Group
                key={door.key}
                listening={!isInteractionLockedByCollaboration}
                onClick={(e) => {
                  if (isPanMode) return
                  e.cancelBubble = true
                  if (selectedTool === 'delete') {
                    const openingId = promoteFallbackDoorToOpening(door)
                    if (openingId) onOpeningDelete?.(openingId)
                    return
                  }
                  if (selectedTool === 'selection') {
                    const openingId = promoteFallbackDoorToOpening(door)
                    if (!openingId) return
                    onOpeningSelect?.(openingId, e.evt.shiftKey)
                    onWallSelect?.(null)
                    onSelect?.(null)
                    return
                  }
                  if (!isDoorTool) return
                  promoteFallbackDoorToOpening(door)
                }}
              >
                <Line points={[start, wallY, start + doorW, wallY]} stroke="white" strokeWidth={5} />
                <Circle x={start} y={wallY} radius={2} fill="#3B45B3" />
                <Arc x={start} y={wallY} innerRadius={0} outerRadius={doorW} angle={90} rotation={0} stroke="#3B45B3" strokeWidth={1.5} fill="rgba(59,69,179,0.05)" />
              </Group>
            )
          }

          return null
        })}

        {/* 협업 모드 오버레이: 치수선 + 핀 */}
        {isCollaborationMode && (
          <CollaborationPinOverlay
            pins={commentPins}
            selectedPinId={selectedPinId}
            onPinClick={onPinClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          />
        )}
        {/* 2D Room 마퀴 선택 사각형 */}
        {marquee && (
          <Rect
            x={marquee.x}
            y={marquee.y}
            width={marquee.width}
            height={marquee.height}
            fill="rgba(59,69,179,0.07)"
            stroke="#3B45B3"
            strokeWidth={1}
            dash={[4, 3]}
            listening={false}
          />
        )}
        </Layer>
      </Stage>

      {isCollaborationMode && pinDraft && (
        <div
          className="absolute z-20 w-[260px] rounded-xl border border-[#D9DEF0] bg-white p-3 shadow-lg"
          style={{
            left: Math.min(Math.max(toScreenPoint(pinDraft).x + 12, 8), Math.max(stageSize.width - 268, 8)),
            top: Math.min(Math.max(toScreenPoint(pinDraft).y - 12, 8), Math.max(stageSize.height - 120, 8)),
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <p className="mb-2 text-[11px] font-bold text-[#3B45B3]">핀 댓글 작성</p>
          <div className="mb-2 flex items-center gap-2">
            <button
              onClick={() => pinImageInputRef.current?.click()}
              className="rounded-md p-1.5 text-[#7D88A0] hover:bg-[#F1F4FF] hover:text-[#3B45B3]"
              title="이미지 첨부"
            >
              <ImageIcon size={14} />
            </button>
            <button
              onClick={() => pinFileInputRef.current?.click()}
              className="rounded-md p-1.5 text-[#7D88A0] hover:bg-[#F1F4FF] hover:text-[#3B45B3]"
              title="파일 첨부"
            >
              <Paperclip size={14} />
            </button>
            <input
              ref={pinImageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                addPinDraftFiles(e.target.files)
                e.currentTarget.value = ''
              }}
            />
            <input
              ref={pinFileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                addPinDraftFiles(e.target.files)
                e.currentTarget.value = ''
              }}
            />
          </div>
          {pinDraft.attachments.length > 0 && (
            <div className="mb-2 max-h-24 overflow-y-auto space-y-1.5 rounded-lg border border-[#EEF1F8] bg-[#FAFBFF] p-2">
              {pinDraft.attachments.map((attachment) => (
                <div key={attachment.url} className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1">
                  <div className="min-w-0 flex items-center gap-1.5 text-[10px] text-[#55627D]">
                    {attachment.kind === 'image' ? <ImageIcon size={11} /> : <FileText size={11} />}
                    <span className="truncate">{attachment.name}</span>
                    <span className="shrink-0 text-[#98A3BA]">{formatFileSize(attachment.sizeBytes)}</span>
                  </div>
                  <button
                    onClick={() => removePinDraftAttachment(attachment.url)}
                    className="text-[#9AA4BA] hover:text-[#49556F]"
                    title="첨부 제거"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <input
            ref={pinInputRef}
            value={pinDraft.message}
            onChange={(e) => setPinDraft((prev) => (prev ? { ...prev, message: e.target.value } : prev))}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                cancelPinDraft()
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                savePinDraft()
              }
            }}
            placeholder="댓글을 입력하세요"
            className="w-full rounded-lg border border-[#E2E6EF] bg-[#FAFBFF] px-3 py-2 text-xs outline-none focus:border-[#3B45B3]"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              onClick={cancelPinDraft}
              className="rounded-lg border border-[#E2E6EF] px-2.5 py-1.5 text-[11px] font-bold text-[#68768F]"
            >
              취소
            </button>
            <button
              onClick={savePinDraft}
              disabled={!pinDraft.message.trim() && pinDraft.attachments.length === 0}
              className="rounded-lg bg-[#3B45B3] px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-45"
            >
              저장
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

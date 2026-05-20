import { useCallback } from 'react'
import { FLOOR_MM_PER_PX } from '../constants'
import type { EditorMode, FloorRoom } from '../types'
import { calcAreaM2FromMm } from '../utils/bubbleCalc'
import type { AxisAlignedRect } from '../utils/geometry2d'
import { toRectFloorRoom } from '../utils/floorRoomTransform'
import { getPolygonAreaPx, scalePolygonToRect } from '../utils/editorPageHelpers'

interface UseEditorAttributePanelHandlersParams {
  mode: EditorMode
  isTwoDEditingLocked: boolean
  canSyncBubbleStateFrom2D: boolean
  isWallFirstEditing: boolean
  isGridSnapEnabled: boolean
  gridSnapIntervalMm: number
  floorRooms: FloorRoom[]
  setIsFloorPlanEditedIn2D: (value: boolean) => void
  markLocalBubbleSnapshotChanged: () => void
  markLocalFloorPlanSnapshotChanged: () => void
  handleLabelChange: (id: string, label: string) => void
  handleTypeChange: (id: string, type: string) => void
  handleMaterialChange: (id: string, material: string) => void
  handleRatioChange: (id: string, ratio: number) => void
  handleColorChange: (id: string, color: string) => void
  handleWidthChange: (id: string, widthMm: number) => void
  handleHeightChange: (id: string, heightMm: number) => void
  updateActiveRoom: (bubbleId: string, updater: (room: FloorRoom) => FloorRoom) => void
  syncPerimeterManualWallsForRoomResize: (
    bubbleId: string,
    prevRect: AxisAlignedRect,
    nextRect: AxisAlignedRect,
  ) => void
  syncFloorDerivedStateFromRooms: (nextRooms: FloorRoom[]) => void
}

/**
 * 우측 속성 패널에서 사용하는 버블/2D 공용 속성 변경 핸들러를 제공한다.
 * - 페이지 훅은 조립만 담당하고, 모드별 값 반영/검증 로직은 여기서 처리한다.
 */
export function useEditorAttributePanelHandlers({
  mode,
  isTwoDEditingLocked,
  canSyncBubbleStateFrom2D,
  isWallFirstEditing,
  isGridSnapEnabled,
  gridSnapIntervalMm,
  floorRooms,
  setIsFloorPlanEditedIn2D,
  markLocalBubbleSnapshotChanged,
  markLocalFloorPlanSnapshotChanged,
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
}: UseEditorAttributePanelHandlersParams) {
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

  const handleLabelChangeForPanel = useCallback((id: string, label: string) => {
    if (mode === '2d' && isTwoDEditingLocked) return
    if (mode !== '2d') {
      markLocalBubbleSnapshotChanged()
      handleLabelChange(id, label)
      return
    }
    if (canSyncBubbleStateFrom2D) {
      markLocalBubbleSnapshotChanged()
      handleLabelChange(id, label)
    }
    setIsFloorPlanEditedIn2D(true)
    markLocalFloorPlanSnapshotChanged()
    updateActiveRoom(id, (room) => ({ ...room, label }))
  }, [mode, isTwoDEditingLocked, canSyncBubbleStateFrom2D, markLocalBubbleSnapshotChanged, handleLabelChange, setIsFloorPlanEditedIn2D, markLocalFloorPlanSnapshotChanged, updateActiveRoom])

  const handleTypeChangeForPanel = useCallback((id: string, type: string) => {
    if (mode === '2d' && isTwoDEditingLocked) return
    if (mode !== '2d') {
      markLocalBubbleSnapshotChanged()
      handleTypeChange(id, type)
      return
    }
    if (canSyncBubbleStateFrom2D) {
      markLocalBubbleSnapshotChanged()
      handleTypeChange(id, type)
    }
    setIsFloorPlanEditedIn2D(true)
    markLocalFloorPlanSnapshotChanged()
    updateActiveRoom(id, (room) => ({ ...room, type }))
  }, [mode, isTwoDEditingLocked, canSyncBubbleStateFrom2D, markLocalBubbleSnapshotChanged, handleTypeChange, setIsFloorPlanEditedIn2D, markLocalFloorPlanSnapshotChanged, updateActiveRoom])

  const handleMaterialChangeForPanel = useCallback((id: string, material: string) => {
    if (mode === '2d') {
      if (isTwoDEditingLocked) return
      setIsFloorPlanEditedIn2D(true)
      markLocalFloorPlanSnapshotChanged()
      updateActiveRoom(id, (room) => ({ ...room, material }))
      return
    }
    markLocalBubbleSnapshotChanged()
    handleMaterialChange(id, material)
  }, [mode, isTwoDEditingLocked, setIsFloorPlanEditedIn2D, markLocalFloorPlanSnapshotChanged, updateActiveRoom, markLocalBubbleSnapshotChanged, handleMaterialChange])

  const applyRoomDimensionIn2D = useCallback((bubbleId: string, axis: 'width' | 'height', nextMm: number) => {
    if (mode !== '2d') return
    if (isTwoDEditingLocked) return
    if (isWallFirstEditing) return
    if (!Number.isFinite(nextMm) || nextMm <= 0) return
    setIsFloorPlanEditedIn2D(true)
    const room = floorRooms.find((item) => item.bubbleId === bubbleId)
    if (!room) return

    const currentWidthMm = Math.max(room.widthMm, 1)
    const currentHeightMm = Math.max(room.heightMm, 1)
    const snappedMm = snapDimensionMm(nextMm)
    const nextWidthMm = axis === 'width' ? snappedMm : currentWidthMm
    const nextHeightMm = axis === 'height' ? snappedMm : currentHeightMm
    const nextWidthPx = Math.max(40, nextWidthMm / FLOOR_MM_PER_PX)
    const nextHeightPx = Math.max(40, nextHeightMm / FLOOR_MM_PER_PX)
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

    const currentPolygon = room.polygon?.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    const hasEditablePolygon = !!currentPolygon && currentPolygon.length >= 3
    const nextPolygon = hasEditablePolygon ? scalePolygonToRect(currentPolygon, prevRect, nextRect) : undefined
    const nextArea = hasEditablePolygon && nextPolygon
      ? Math.max((getPolygonAreaPx(nextPolygon) * FLOOR_MM_PER_PX * FLOOR_MM_PER_PX) / 1_000_000, 0.01)
      : calcAreaM2FromMm(nextWidthMm, nextHeightMm)

    const toResizedRoom = (targetRoom: FloorRoom): FloorRoom =>
      hasEditablePolygon && nextPolygon
        ? {
            ...targetRoom,
            x: targetRoom.x,
            y: targetRoom.y,
            width: nextWidthPx,
            height: nextHeightPx,
            widthMm: nextWidthMm,
            heightMm: nextHeightMm,
            area: nextArea,
            polygon: nextPolygon,
            contour: undefined,
            transform: undefined,
          }
        : toRectFloorRoom(targetRoom, {
            x: targetRoom.x,
            y: targetRoom.y,
            width: nextWidthPx,
            height: nextHeightPx,
            widthMm: nextWidthMm,
            heightMm: nextHeightMm,
            area: nextArea,
          })

    if (canSyncBubbleStateFrom2D) {
      markLocalBubbleSnapshotChanged()
      if (axis === 'width') handleWidthChange(bubbleId, nextWidthMm)
      else handleHeightChange(bubbleId, nextHeightMm)
    }

    markLocalFloorPlanSnapshotChanged()
    const nextRooms = floorRooms.map((item) => (item.bubbleId === bubbleId ? toResizedRoom(item) : item))
    updateActiveRoom(bubbleId, toResizedRoom)
    syncPerimeterManualWallsForRoomResize(bubbleId, prevRect, nextRect)
    syncFloorDerivedStateFromRooms(nextRooms)
  }, [
    mode,
    isTwoDEditingLocked,
    isWallFirstEditing,
    floorRooms,
    setIsFloorPlanEditedIn2D,
    snapDimensionMm,
    canSyncBubbleStateFrom2D,
    markLocalBubbleSnapshotChanged,
    handleWidthChange,
    handleHeightChange,
    markLocalFloorPlanSnapshotChanged,
    updateActiveRoom,
    syncPerimeterManualWallsForRoomResize,
    syncFloorDerivedStateFromRooms,
  ])

  const applyDimensionByMode = useCallback((id: string, axis: 'width' | 'height', valueMm: number) => {
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

  const handleRatioChangeForPanel = useCallback((id: string, ratio: number) => {
    if (mode === '2d') {
      if (isTwoDEditingLocked) return
      if (!Number.isFinite(ratio) || ratio < 0) return
      setIsFloorPlanEditedIn2D(true)
      markLocalFloorPlanSnapshotChanged()
      updateActiveRoom(id, (room) => ({ ...room, area: ratio }))
      return
    }
    markLocalBubbleSnapshotChanged()
    handleRatioChange(id, ratio)
  }, [mode, isTwoDEditingLocked, setIsFloorPlanEditedIn2D, markLocalFloorPlanSnapshotChanged, updateActiveRoom, markLocalBubbleSnapshotChanged, handleRatioChange])

  const handleColorChangeForPanel = useCallback((id: string, color: string) => {
    if (mode === '2d') {
      if (isTwoDEditingLocked) return
      setIsFloorPlanEditedIn2D(true)
      markLocalFloorPlanSnapshotChanged()
      updateActiveRoom(id, (room) => ({ ...room, color }))
      return
    }
    markLocalBubbleSnapshotChanged()
    handleColorChange(id, color)
  }, [mode, isTwoDEditingLocked, setIsFloorPlanEditedIn2D, markLocalFloorPlanSnapshotChanged, updateActiveRoom, markLocalBubbleSnapshotChanged, handleColorChange])

  return {
    handleLabelChangeForPanel,
    handleTypeChangeForPanel,
    handleMaterialChangeForPanel,
    handleWidthChangeForPanel,
    handleHeightChangeForPanel,
    handleWidthCommitForPanel,
    handleHeightCommitForPanel,
    handleRatioChangeForPanel,
    handleColorChangeForPanel,
  }
}

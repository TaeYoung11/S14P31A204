import { useEffect, useMemo, useRef, useState } from 'react'
import type { FloorLayerOverlay, FloorRoom } from '../../types'
import { useSpacePanning } from '../../hooks/useSpacePanning'
import { toCanvasPolygon, validateFloorPlanInSiteBoundary } from '../../utils/siteBoundaryValidation'
import ThreeDLibraryPanel from './ThreeDLibraryPanel'
import ThreeDRoomBox from './ThreeDRoomBox'

interface ThreeDCanvasProps {
  sitePoints?: number[]
  isCollaborationMode?: boolean
  isLibraryOpen?: boolean
  onToggleLibrary?: () => void
  isGridVisible?: boolean
  rooms?: FloorRoom[]
  overlayLayers?: FloorLayerOverlay[]
  scale?: number
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  /** 현재 활성 도구 ('selection' | 'hand' | ...) */
  selectedTool?: string
  /** Ctrl/Cmd + Wheel 확대/축소 */
  onWheelZoom?: (factor: number) => void
}

/**
 * 3D 뷰 캔버스
 * 2D 평면도 데이터를 기반으로 CSS 3D Transform 박스 모델을 렌더링.
 * 손 도구(hand) 선택 시 마우스 드래그로 뷰를 이동(패닝)할 수 있다.
 */
export function ThreeDCanvas({
  sitePoints = [],
  isCollaborationMode,
  isLibraryOpen,
  onToggleLibrary,
  isGridVisible = false,
  rooms = [],
  overlayLayers = [],
  scale = 1,
  selectedId,
  onSelect,
  selectedTool = 'selection',
  onWheelZoom,
}: ThreeDCanvasProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [selectedCategory, setSelectedCategory] = useState('지붕')
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [startPos, setStartPos] = useState({ x: 0, y: 0 })
  const isSpacePressed = useSpacePanning()
  const [isMiddlePanning, setIsMiddlePanning] = useState(false)

  const WALL_HEIGHT = 60
  const isPanMode = selectedTool === 'hand' || isSpacePressed || isMiddlePanning
  const sitePolygon = useMemo(() => toCanvasPolygon(sitePoints), [sitePoints])
  const sitePolygonPoints = useMemo(
    () => sitePolygon.map((point) => `${point.x},${point.y}`).join(' '),
    [sitePolygon],
  )
  const outsideRoomIdSet = useMemo(() => {
    const result = validateFloorPlanInSiteBoundary(sitePoints, rooms, [], [])
    return result.outsideRoomIds
  }, [sitePoints, rooms])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      onWheelZoom?.(e.deltaY < 0 ? 1.1 : 0.9)
    }

    root.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      root.removeEventListener('wheel', handleWheel)
    }
  }, [onWheelZoom])

  useEffect(() => {
    const updateViewportSize = () => {
      const root = rootRef.current
      if (!root) return
      setViewportSize({ width: root.clientWidth, height: root.clientHeight })
    }
    updateViewportSize()
    window.addEventListener('resize', updateViewportSize)
    return () => window.removeEventListener('resize', updateViewportSize)
  }, [])

  const baseCenterOffset = useMemo(() => {
    if (rooms.length === 0 || viewportSize.width === 0 || viewportSize.height === 0) {
      return { x: 0, y: 0 }
    }
    const minX = Math.min(...rooms.map((r) => r.x))
    const maxX = Math.max(...rooms.map((r) => r.x + r.width))
    const minY = Math.min(...rooms.map((r) => r.y))
    const maxY = Math.max(...rooms.map((r) => r.y + r.height))
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    return {
      x: viewportSize.width / 2 - cx,
      y: viewportSize.height / 2 - cy,
    }
  }, [rooms, viewportSize.height, viewportSize.width])

  // ── 패닝 핸들러 (손 도구 / Space / 휠 버튼 드래그) ─────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault()
      setIsMiddlePanning(true)
      setIsDragging(true)
      setStartPos({ x: e.clientX - offset.x, y: e.clientY - offset.y })
      return
    }
    if (!isPanMode || e.button !== 0) return
    setIsDragging(true)
    setStartPos({ x: e.clientX - offset.x, y: e.clientY - offset.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    setOffset({ x: e.clientX - startPos.x, y: e.clientY - startPos.y })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setIsMiddlePanning(false)
  }

  const cursorStyle = isDragging ? 'grabbing' : isPanMode ? 'grab' : 'default'

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 bg-[#F0F2F9] overflow-hidden flex items-center justify-center select-none"
      style={{ cursor: cursorStyle }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* 라이브러리 팝업 패널 */}
      {isLibraryOpen && (
        <ThreeDLibraryPanel
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          onClose={onToggleLibrary ?? (() => {})}
        />
      )}

      {/* 배경 */}
      <div
        className={`absolute inset-0 transition-all duration-1000 ${
          isCollaborationMode
            ? 'bg-[#2A2E35]'
            : 'bg-gradient-to-br from-[#E2E6EF] to-[#BEC4D1]'
        }`}
      />

      {/* 원근감 그리드 (그리드 토글 활성 시) */}
      {isGridVisible && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div
            className="absolute bottom-[-20%] left-[-20%] right-[-20%] top-[-20%]"
            style={{
              backgroundImage: `
                linear-gradient(rgba(59,69,179,0.1) 1px, transparent 1px),
                linear-gradient(90deg, rgba(59,69,179,0.1) 1px, transparent 1px)
              `,
              backgroundSize: '40px 40px',
              transform: 'perspective(1200px) rotateX(60deg)',
              transformOrigin: 'center center',
            }}
          />
        </div>
      )}

      {/* 3D 뷰포트 */}
      <div
        className="relative w-full h-full flex items-center justify-center p-20 preserve-3d"
        style={{ pointerEvents: 'none' }}
      >
        {rooms.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="px-6 py-4 rounded-2xl bg-white/80 border border-white/50 shadow-sm text-center">
              <p className="text-[13px] font-extrabold text-[#1C1C1E]">표시할 3D 공간이 없습니다</p>
              <p className="text-[11px] text-[#6B7A99] mt-1">
                버블 다이어그램에서 공간을 추가하거나 평면도를 생성해 주세요.
              </p>
            </div>
          </div>
        )}
        <div
          className="relative w-full h-full preserve-3d"
          style={{
            transform: `perspective(2000px) rotateX(60deg) rotateZ(-35deg) scale(${scale * 0.85}) translate(${baseCenterOffset.x + offset.x}px, ${baseCenterOffset.y + offset.y}px)`,
            transition: isDragging ? 'none' : 'transform 0.7s ease-out',
          }}
        >
          <div className="absolute inset-0 bg-black/5 blur-3xl transform translate-z-[-10px]" />

          {/* 대지 경계 오버레이 */}
          {sitePolygon.length >= 3 && (
            <svg className="absolute inset-0 overflow-visible pointer-events-none">
              <polygon
                points={sitePolygonPoints}
                fill="rgba(59,69,179,0.08)"
                stroke="#3B45B3"
                strokeWidth={2}
                strokeDasharray="10 6"
              />
            </svg>
          )}

          {/* 방(공간) 박스 렌더링 */}
          {overlayLayers.map((overlay) =>
            overlay.rooms.map((room) => (
              <ThreeDRoomBox
                key={`overlay-${overlay.layerId}-${room.id}`}
                room={room}
                height={WALL_HEIGHT}
                selectedTool={selectedTool}
                isPanActive={isPanMode}
                isOverlay
                overlayOpacity={overlay.opacity}
              />
            )),
          )}

          {/* 활성층 방 렌더링 */}
          {rooms.map((room) => (
            <ThreeDRoomBox
              key={room.id}
              room={room}
              height={WALL_HEIGHT}
              isSelected={selectedId === room.bubbleId}
              isOutsideSite={outsideRoomIdSet.has(room.bubbleId)}
              onSelect={onSelect}
              selectedTool={selectedTool}
              isPanActive={isPanMode}
            />
          ))}

          {/* 협업 모드 핀 오버레이 */}
          {isCollaborationMode && rooms.length > 0 && (
            <div className="absolute inset-0 preserve-3d pointer-events-none">
              <div
                className="absolute z-50 pointer-events-auto"
                style={{
                  transform: `translate3d(${rooms[0]?.x ?? 0}px, ${rooms[0]?.y ?? 0}px, ${WALL_HEIGHT + 20}px) rotateZ(35deg) rotateX(-60deg)`,
                }}
              >
                <div className="bg-[#3B45B3] text-white px-2.5 py-1 rounded-lg text-[10px] font-black shadow-lg flex items-center gap-1.5 border border-white/20">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                  #041
                </div>
                <div className="w-px h-10 bg-gradient-to-b from-[#3B45B3] to-transparent mx-auto" />
              </div>
            </div>
          )}
        </div>
      </div>

      {outsideRoomIdSet.size > 0 && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-[11px] font-bold text-[#991B1B]">
          대지 경계 밖 공간 {outsideRoomIdSet.size}개
        </div>
      )}
    </div>
  )
}

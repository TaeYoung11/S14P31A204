import { useEffect, useMemo, useRef, useState } from 'react'
import { Square, DoorOpen, LayoutGrid, Home, Box, Layers, X } from 'lucide-react'
import type { FloorLayerOverlay, FloorRoom } from '../../types'
import { hexToRgba } from '../../utils/bubbleCalc'
import { useSpacePanning } from '../../hooks/useSpacePanning'

// ── 라이브러리 패널 카테고리 목록 ────────────────────────────────────────────
const LIBRARY_CATEGORIES = [
  { id: '벽', icon: Square },
  { id: '문', icon: DoorOpen },
  { id: '창문', icon: LayoutGrid },
  { id: '지붕', icon: Home },
  { id: '바닥', icon: Layers },
  { id: '가구', icon: Box },
] as const

// ── 라이브러리 패널 서브컴포넌트 ─────────────────────────────────────────────

interface LibraryPanelProps {
  selectedCategory: string
  onSelectCategory: (id: string) => void
  onClose: () => void
}

/**
 * 3D 뷰어 왼쪽에 열리는 건축 요소 라이브러리 패널
 * 카테고리 선택 후 해당 요소 목록을 표시한다 (현재 준비 중).
 */
function LibraryPanel({ selectedCategory, onSelectCategory, onClose }: LibraryPanelProps) {
  return (
    <div className="absolute left-8 top-[10%] w-[500px] h-[70%] bg-white/80 backdrop-blur-xl border border-white/40 rounded-[32px] shadow-2xl z-50 flex overflow-hidden animate-in fade-in slide-in-from-left-4 duration-300">
      <button
        onClick={onClose}
        className="absolute top-5 right-5 flex items-center gap-1.5 px-3 py-1.5 bg-[#F0F2F9] hover:bg-[#E2E6EF] text-[#6B7A99] hover:text-[#1C1C1E] rounded-xl transition-all z-10"
      >
        <X size={14} />
        <span className="text-[11px] font-bold">닫기</span>
      </button>

      {/* 카테고리 사이드바 */}
      <div className="w-[120px] bg-white/40 border-r border-[#F0F2F9] flex flex-col items-center py-8 gap-6 overflow-y-auto">
        <div className="w-[72px] h-[72px] bg-[#3B45B3]/20 rounded-2xl flex items-center justify-center text-[#3B45B3] font-black text-lg shadow-inner mb-4">
          {selectedCategory}
        </div>
        <div className="w-full px-3 flex flex-col gap-1">
          {LIBRARY_CATEGORIES.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelectCategory(item.id)}
              className={`w-full flex flex-col items-center py-3 rounded-2xl transition-all ${
                selectedCategory === item.id
                  ? 'bg-white shadow-md text-[#3B45B3]'
                  : 'text-[#ADB5BD] hover:bg-white/50'
              }`}
            >
              <item.icon size={20} />
              <span className="text-[10px] font-bold mt-1.5">{item.id}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 라이브러리 콘텐츠 영역 */}
      <div className="flex-1 p-8 bg-gradient-to-br from-white/20 to-transparent">
        <h3 className="text-2xl font-black text-[#1C1C1E] mb-8">{selectedCategory} 라이브러리</h3>
        {/* 실제 라이브러리 요소 목록은 API 연동 완료 후 이 영역에 렌더링한다. */}
        <div className="flex flex-col items-center justify-center h-[60%] text-[#ADB5BD] opacity-50 italic">
          준비 중인 기능입니다...
        </div>
      </div>
    </div>
  )
}

interface ThreeDCanvasProps {
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
        <LibraryPanel
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

          {/* 방(공간) 박스 렌더링 */}
          {overlayLayers.map((overlay) =>
            overlay.rooms.map((room) => (
              <Room3D
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
            <Room3D
              key={room.id}
              room={room}
              height={WALL_HEIGHT}
              isSelected={selectedId === room.bubbleId}
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
    </div>
  )
}

// ── 방(공간) 하나를 3D 박스로 표현하는 서브 컴포넌트 ─────────────────────────

interface Room3DProps {
  room: FloorRoom
  height: number
  isSelected?: boolean
  onSelect?: (id: string | null) => void
  selectedTool?: string
  isPanActive?: boolean
  isOverlay?: boolean
  overlayOpacity?: number
}

/** CSS 3D Transform 기반 방 박스 렌더러 — 상단·하단·4면 벽체로 구성 */
function Room3D({
  room,
  height,
  isSelected,
  onSelect,
  selectedTool = 'selection',
  isPanActive = false,
  isOverlay = false,
  overlayOpacity = 0.35,
}: Room3DProps) {
  const color = room.color || '#3B45B3'
  const lightColor = hexToRgba(color, 0.4)
  const darkColor = hexToRgba(color, 0.8)

  const isHand = selectedTool === 'hand' || isPanActive

  return (
    <div
      className={`absolute preserve-3d transition-all duration-500 group ${
        isHand ? 'cursor-inherit' : 'cursor-pointer'
      } ${isSelected && !isHand ? 'translate-z-6' : !isHand ? 'hover:translate-z-4' : ''}`}
      style={{
        left: room.x,
        top: room.y,
        width: room.width,
        height: room.height,
        pointerEvents: isOverlay ? 'none' : 'auto',
        opacity: isOverlay ? Math.min(Math.max(overlayOpacity, 0.1), 0.9) : 1,
      }}
      onClick={(e) => {
        if (isOverlay) return
        if (isHand) return
        e.stopPropagation()
        onSelect?.(isSelected ? null : room.bubbleId)
      }}
    >
      {/* 바닥 */}
      <div
        className="absolute inset-0 shadow-inner"
        style={{ 
          backgroundColor: isOverlay ? hexToRgba(color, 0.06) : isSelected ? hexToRgba(color, 0.2) : hexToRgba(color, 0.1), 
          border: `1px solid ${isOverlay ? hexToRgba('#3B45B3', 0.45) : isSelected ? color : hexToRgba(color, 0.2)}` 
        }}
      />

      {/* 천장 (라벨 표시) */}
      <div
        className="absolute inset-0 flex items-center justify-center overflow-hidden"
        style={{ 
          transform: `translateZ(${height}px)`, 
          backgroundColor: isOverlay ? hexToRgba(color, 0.03) : isSelected ? hexToRgba(color, 0.1) : hexToRgba(color, 0.05), 
          border: isOverlay ? `1px dashed ${hexToRgba('#3B45B3', 0.7)}` : isSelected ? `3px solid #3B45B3` : `2px solid ${color}`,
          boxShadow: isSelected ? '0 0 15px rgba(59,69,179,0.4)' : 'none'
        }}
      >
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[10px] font-black text-[#1C1C1E]">{room.label}</span>
          <span className="text-[8px] font-bold text-[#ADB5BD]">{room.area.toFixed(1)}m²</span>
        </div>
      </div>

      {/* 앞면 벽 */}
      <div
        className="absolute w-full origin-bottom"
        style={{ height, bottom: 0, transform: 'rotateX(-90deg)', background: `linear-gradient(to top, ${darkColor}, ${lightColor})`, border: `1px solid ${hexToRgba('#000', 0.1)}` }}
      />
      {/* 뒷면 벽 */}
      <div
        className="absolute w-full origin-top"
        style={{ height, top: 0, transform: 'rotateX(90deg)', background: `linear-gradient(to bottom, ${darkColor}, ${lightColor})` }}
      />
      {/* 오른쪽 벽 */}
      <div
        className="absolute h-full origin-right"
        style={{ width: height, right: 0, top: 0, transform: 'rotateY(90deg)', background: `linear-gradient(to right, ${darkColor}, ${lightColor})` }}
      />
      {/* 왼쪽 벽 */}
      <div
        className="absolute h-full origin-left"
        style={{ width: height, left: 0, top: 0, transform: 'rotateY(-90deg)', background: `linear-gradient(to left, ${darkColor}, ${lightColor})` }}
      />

      {/* 호버 글로우 */}
      <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
    </div>
  )
}

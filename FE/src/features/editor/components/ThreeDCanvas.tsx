import { useState } from 'react'
import { Square, DoorOpen, LayoutGrid, Home, Box, Layers, X } from 'lucide-react'
import type { FloorRoom } from '../types'
import { hexToRgba } from '../utils/bubbleCalc'

// ── 라이브러리 패널 카테고리 목록 ────────────────────────────────────────────
const LIBRARY_CATEGORIES = [
  { id: '벽', icon: Square },
  { id: '문', icon: DoorOpen },
  { id: '창문', icon: LayoutGrid },
  { id: '지붕', icon: Home },
  { id: '바닥', icon: Layers },
  { id: '가구', icon: Box },
] as const

interface ThreeDCanvasProps {
  isCollaborationMode?: boolean
  isLibraryOpen?: boolean
  onToggleLibrary?: () => void
  selectedPinId?: string | null
  onPinClick?: (id: string) => void
  isGridVisible?: boolean
  rooms?: FloorRoom[]
  scale?: number
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  /** 현재 활성 도구 ('selection' | 'hand' | ...) */
  selectedTool?: string
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
  selectedPinId: _selectedPinId,
  onPinClick: _onPinClick,
  isGridVisible = false,
  rooms = [],
  scale = 1,
  selectedId,
  onSelect,
  selectedTool = 'selection',
}: ThreeDCanvasProps) {
  const [selectedCategory, setSelectedCategory] = useState('지붕')
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [startPos, setStartPos] = useState({ x: 0, y: 0 })

  const WALL_HEIGHT = 60

  // ── 패닝 핸들러 (손 도구일 때만 활성화) ────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    if (selectedTool !== 'hand') return
    setIsDragging(true)
    setStartPos({ x: e.clientX - offset.x, y: e.clientY - offset.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || selectedTool !== 'hand') return
    setOffset({ x: e.clientX - startPos.x, y: e.clientY - startPos.y })
  }

  const handleMouseUp = () => setIsDragging(false)

  const cursorStyle = selectedTool === 'hand' ? (isDragging ? 'grabbing' : 'grab') : 'default'

  return (
    <div
      className="absolute inset-0 bg-[#F0F2F9] overflow-hidden flex items-center justify-center select-none"
      style={{ cursor: cursorStyle }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* 라이브러리 팝업 패널 */}
      {isLibraryOpen && (
        <div className="absolute left-8 top-[10%] w-[500px] h-[70%] bg-white/80 backdrop-blur-xl border border-white/40 rounded-[32px] shadow-2xl z-50 flex overflow-hidden animate-in fade-in slide-in-from-left-4 duration-300">
          <button
            onClick={onToggleLibrary}
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
                  onClick={() => setSelectedCategory(item.id)}
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
            <div className="flex flex-col items-center justify-center h-[60%] text-[#ADB5BD] opacity-50 italic">
              준비 중인 기능입니다...
            </div>
          </div>
        </div>
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
        <div
          className="relative w-full h-full preserve-3d"
          style={{
            transform: `perspective(2000px) rotateX(60deg) rotateZ(-35deg) scale(${scale * 0.85}) translate(${offset.x}px, ${offset.y}px)`,
            transition: isDragging ? 'none' : 'transform 0.7s ease-out',
          }}
        >
          <div className="absolute inset-0 bg-black/5 blur-3xl transform translate-z-[-10px]" />

          {/* 방(공간) 박스 렌더링 */}
          {rooms.map((room) => (
            <Room3D
              key={room.id}
              room={room}
              height={WALL_HEIGHT}
              isSelected={selectedId === room.bubbleId}
              onSelect={onSelect}
              selectedTool={selectedTool}
            />
          ))}

          {/* 협업 모드 핀 오버레이 */}
          {isCollaborationMode && (
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
}

/** CSS 3D Transform 기반 방 박스 렌더러 — 상단·하단·4면 벽체로 구성 */
function Room3D({ room, height, isSelected, onSelect, selectedTool = 'selection' }: Room3DProps) {
  const color = room.color || '#3B45B3'
  const lightColor = hexToRgba(color, 0.4)
  const darkColor = hexToRgba(color, 0.8)

  const isHand = selectedTool === 'hand'

  return (
    <div
      className={`absolute preserve-3d transition-all duration-500 group ${
        isHand ? 'cursor-inherit' : 'cursor-pointer'
      } ${isSelected && !isHand ? 'translate-z-6' : !isHand ? 'hover:translate-z-4' : ''}`}
      style={{ left: room.x, top: room.y, width: room.width, height: room.height, pointerEvents: 'auto' }}
      onClick={(e) => {
        if (isHand) return
        e.stopPropagation()
        onSelect?.(isSelected ? null : room.bubbleId)
      }}
    >
      {/* 바닥 */}
      <div
        className="absolute inset-0 shadow-inner"
        style={{ 
          backgroundColor: isSelected ? hexToRgba(color, 0.2) : hexToRgba(color, 0.1), 
          border: `1px solid ${isSelected ? color : hexToRgba(color, 0.2)}` 
        }}
      />

      {/* 천장 (라벨 표시) */}
      <div
        className="absolute inset-0 flex items-center justify-center overflow-hidden"
        style={{ 
          transform: `translateZ(${height}px)`, 
          backgroundColor: isSelected ? hexToRgba(color, 0.1) : hexToRgba(color, 0.05), 
          border: isSelected ? `3px solid #3B45B3` : `2px solid ${color}`,
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

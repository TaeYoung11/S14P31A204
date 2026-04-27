import { useMemo } from 'react'
import { Layer, Line, Stage, Arc, Group, Circle, Text, Rect } from 'react-konva'
import { LayoutDashboard, Sparkles } from 'lucide-react'
import type { KonvaEventObject } from 'konva/lib/Node'
import Spinner from '../../../shared/components/Spinner'
import type { ConnectionData, FloorRoom } from '../types'
import { findSharedWall } from '../utils/floorPlanLayout'
import { hexToRgba } from '../utils/bubbleCalc'

// ── 유틸 ─────────────────────────────────────────────────────────────────────

/** 흰색 계열 방은 연한 파란 계열로, 나머지는 원색 14% 투명도로 채우기 */
function getRoomFill(color: string): string {
  const normalized = color.trim().toUpperCase()
  if (normalized === '#FFFFFF' || normalized === '#FFF') return '#F0F4FF'
  return hexToRgba(color, 0.14)
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface TwoDCanvasProps {
  stageSize: { width: number; height: number }
  isCollaborationMode?: boolean
  selectedPinId?: string | null
  onPinClick?: (id: string) => void
  rooms?: FloorRoom[]
  connections?: ConnectionData[]
  /** 평면도 생성 완료 여부 */
  isGenerated?: boolean
  /** 평면도 생성 중(로딩) 여부 */
  isGenerating?: boolean
  /** "평면도 생성" 버튼 클릭 핸들러 */
  onGenerate?: () => void
  isGridVisible?: boolean
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  scale?: number
  selectedTool?: string
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
  onPinClick,
  rooms = [],
  connections = [],
  isGenerated = false,
  isGenerating = false,
  onGenerate,
  isGridVisible = false,
  selectedId,
  onSelect,
  scale = 1,
  selectedTool = 'selection',
}: TwoDCanvasProps) {
  // ── 그리드 라인 (minor: 50px, major: 250px 간격) ──────────────────────────
  const gridLines = useMemo(() => {
    if (!isGridVisible || stageSize.width === 0) return { minor: [] as number[][], major: [] as number[][] }
    const MINOR = 50
    const MAJOR = 250
    const minor: number[][] = []
    const major: number[][] = []
    for (let x = MINOR; x < stageSize.width; x += MINOR) {
      const pts = [x, 0, x, stageSize.height]
      if (x % MAJOR === 0) major.push(pts)
      else minor.push(pts)
    }
    for (let y = MINOR; y < stageSize.height; y += MINOR) {
      const pts = [0, y, stageSize.width, y]
      if (y % MAJOR === 0) major.push(pts)
      else minor.push(pts)
    }
    return { minor, major }
  }, [isGridVisible, stageSize.width, stageSize.height])

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

  // Konva 커서 처리
  const handleMouseEnter = (e: KonvaEventObject<MouseEvent>) => {
    const container = e.target.getStage()?.container()
    if (container) container.style.cursor = selectedTool === 'hand' ? 'grab' : 'pointer'
  }
  const handleMouseLeave = (e: KonvaEventObject<MouseEvent>) => {
    const container = e.target.getStage()?.container()
    if (container) container.style.cursor = 'default'
  }

  const cx = stageSize.width / 2
  const cy = stageSize.height / 2

  // ── 생성 전: 변환 안내 화면 ──────────────────────────────────────────────
  if (!isGenerated && !isGenerating) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-5 text-center px-10">
          <div className="w-20 h-20 rounded-3xl bg-[#F0F2FF] flex items-center justify-center shadow-sm">
            <LayoutDashboard size={36} className="text-[#3B45B3]" />
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-[15px] font-extrabold text-[#1C1C1E]">2D 평면도 자동 생성</h3>
            <p className="text-[12px] text-[#6B7A99] leading-relaxed max-w-[260px]">
              버블 다이어그램의 공간 크기와 연결 관계를 바탕으로<br />
              2D 평면도 초안을 자동으로 생성합니다.
            </p>
          </div>
          <button
            onClick={onGenerate}
            className="flex items-center gap-2 bg-[#3B45B3] hover:bg-[#2D3599] text-white text-[12px] font-extrabold px-6 py-3 rounded-2xl transition-all shadow-md hover:shadow-lg active:scale-95"
          >
            <Sparkles size={15} />
            평면도 생성 시작
          </button>
          <p className="text-[10px] text-[#ADB5BD]">
            버블 다이어그램 탭에서 공간을 추가하면 더 풍부한 평면도가 생성됩니다.
          </p>
        </div>
      </div>
    )
  }

  // ── 생성 중: 로딩 화면 ───────────────────────────────────────────────────
  if (isGenerating) {
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
          {/* 진행 애니메이션 바 */}
          <div className="w-48 h-1.5 bg-[#E2E6EF] rounded-full overflow-hidden">
            <div className="h-full bg-[#3B45B3] rounded-full animate-[progress_1.8s_ease-in-out_forwards]" />
          </div>
        </div>
      </div>
    )
  }

  // ── 생성 완료: Konva 평면도 렌더링 ───────────────────────────────────────
  return (
    <Stage
      width={stageSize.width}
      height={stageSize.height}
      className="absolute inset-0"
      scaleX={scale}
      scaleY={scale}
      x={(stageSize.width * (1 - scale)) / 2}
      y={(stageSize.height * (1 - scale)) / 2}
      draggable={selectedTool === 'hand'}
      onDragStart={(e) => {
        const container = e.target.getStage()?.container()
        if (container && selectedTool === 'hand') container.style.cursor = 'grabbing'
      }}
      onDragEnd={(e) => {
        const container = e.target.getStage()?.container()
        if (container && selectedTool === 'hand') container.style.cursor = 'grab'
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

        {/* 방(Room) 렌더링 */}
        {rooms.map((room) => {
          const isSelected = selectedId === room.id
          const fill = getRoomFill(room.color)
          const labelFontSize = Math.max(9, Math.min(13, room.width / 8))
          const areaFontSize = Math.max(8, Math.min(11, room.width / 10))

          return (
            <Group
              key={room.id}
              onClick={(e) => {
                e.cancelBubble = true
                onSelect?.(isSelected ? null : room.id)
              }}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              {/* 배경 채우기 */}
              <Rect x={room.x} y={room.y} width={room.width} height={room.height} fill={fill} />
              {/* 벽체 외곽선 */}
              <Rect
                x={room.x} y={room.y} width={room.width} height={room.height}
                stroke={isSelected ? '#3B45B3' : '#1C1C1E'}
                strokeWidth={isSelected ? 2.5 : 3}
                fill="transparent"
                shadowColor={isSelected ? '#3B45B3' : undefined}
                shadowBlur={isSelected ? 8 : 0}
                shadowOpacity={0.2}
              />
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
            </Group>
          )
        })}

        {/* 문(Door) 렌더링 — 공유 벽 위치에 호(Arc) 기호로 표현 */}
        {doorList.map((door) => {
          if (!door) return null
          if (door.direction === 'vertical' && door.wallX !== undefined && door.doorCenterY !== undefined) {
            const { wallX, doorCenterY, doorW } = door
            const doorTop = doorCenterY - doorW / 2
            return (
              <Group key={door.key}>
                <Line points={[wallX, doorTop, wallX, doorTop + doorW]} stroke="white" strokeWidth={5} />
                <Circle x={wallX} y={doorTop} radius={2} fill="#3B45B3" />
                <Arc x={wallX} y={doorTop} innerRadius={0} outerRadius={doorW} angle={90} rotation={0} stroke="#3B45B3" strokeWidth={1.5} fill="rgba(59,69,179,0.05)" />
              </Group>
            )
          }
          if (door.direction === 'horizontal' && door.wallY !== undefined && door.doorCenterX !== undefined) {
            const { wallY, doorCenterX, doorW } = door
            const doorLeft = doorCenterX - doorW / 2
            return (
              <Group key={door.key}>
                <Line points={[doorLeft, wallY, doorLeft + doorW, wallY]} stroke="white" strokeWidth={5} />
                <Circle x={doorLeft} y={wallY} radius={2} fill="#3B45B3" />
                <Arc x={doorLeft} y={wallY} innerRadius={0} outerRadius={doorW} angle={90} rotation={0} stroke="#3B45B3" strokeWidth={1.5} fill="rgba(59,69,179,0.05)" />
              </Group>
            )
          }
          return null
        })}

        {/* 협업 모드 오버레이: 치수선 + 핀 */}
        {isCollaborationMode && (
          <>
            {/* 치수선 */}
            <Group>
              <Line points={[cx - 160, cy - 230, cx + 160, cy - 230]} stroke="#ADB5BD" strokeWidth={1} />
              <Line points={[cx - 160, cy - 235, cx - 160, cy - 225]} stroke="#ADB5BD" strokeWidth={1} />
              <Line points={[cx + 160, cy - 235, cx + 160, cy - 225]} stroke="#ADB5BD" strokeWidth={1} />
              <Text text="12,400mm" x={cx - 28} y={cy - 242} fontSize={10} fill="#ADB5BD" fontStyle="bold" />
              <Line points={[cx - 180, cy - 210, cx - 180, cy + 210]} stroke="#ADB5BD" strokeWidth={1} />
              <Line points={[cx - 185, cy - 210, cx - 175, cy - 210]} stroke="#ADB5BD" strokeWidth={1} />
              <Line points={[cx - 185, cy + 210, cx - 175, cy + 210]} stroke="#ADB5BD" strokeWidth={1} />
              <Text text="16,200mm" x={cx - 195} y={cy + 25} fontSize={10} fill="#ADB5BD" fontStyle="bold" rotation={-90} />
            </Group>

            {/* 핀 1 */}
            <Group x={cx - 112} y={cy - 147} onClick={() => onPinClick?.('041')} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
              <Circle radius={12} fill="#1C1C1E" />
              <Text text="1" x={-3} y={-5} fill="white" fontSize={11} fontStyle="bold" />
            </Group>
            {/* 핀 2 */}
            <Group x={cx + 16} y={cy - 21} onClick={() => onPinClick?.('042')} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
              <Circle radius={14} fill={selectedPinId === '042' ? '#3B45B3' : '#1C1C1E'} />
              <Text text="2" x={-3.5} y={-5} fill="white" fontSize={11} fontStyle="bold" />
            </Group>
            {/* 핀 3 */}
            <Group x={cx + 112} y={cy + 126} onClick={() => onPinClick?.('040')} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
              <Circle radius={12} fill="#1C1C1E" />
              <Text text="3" x={-3} y={-5} fill="white" fontSize={11} fontStyle="bold" />
            </Group>

            {/* 핀 2 말풍선 */}
            {(selectedPinId === '042' || !selectedPinId) && (
              <Group x={cx + 16 - 45} y={cy - 21 - 45}>
                <Rect width={90} height={24} fill="white" stroke="#D9DEF0" cornerRadius={8} shadowBlur={4} shadowOpacity={0.1} />
                <Text text="창호 위치 변경 요청" x={8} y={7} fontSize={8} fill="#3B45B3" fontStyle="bold" />
                <Line points={[45, 24, 45, 38]} stroke="#3B45B3" strokeWidth={1.5} />
              </Group>
            )}
          </>
        )}
      </Layer>
    </Stage>
  )
}

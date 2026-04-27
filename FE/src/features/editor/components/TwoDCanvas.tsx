import { Layer, Line, Stage, Arc, Group, Circle, Text, Rect } from 'react-konva'

interface TwoDCanvasProps {
  stageSize: { width: number; height: number }
  isCollaborationMode?: boolean
  selectedPinId?: string | null
  onPinClick?: (id: string) => void
}

/** 2D 평면도 모드 전용 Konva 캔버스 */
export function TwoDCanvas({ stageSize, isCollaborationMode, selectedPinId, onPinClick }: TwoDCanvasProps) {
  // 샘플 데이터: 대지(육각형) 및 평면도 벽체 좌표
  // 화면 중앙에 위치하도록 계산
  const centerX = stageSize.width / 2
  const centerY = stageSize.height / 2

  // 육각형 대지 좌표 (가운데 중심)
  const siteRadius = 250
  const sitePoints = [
    centerX - siteRadius, centerY,
    centerX - siteRadius / 2, centerY - siteRadius * 0.866,
    centerX + siteRadius / 2, centerY - siteRadius * 0.866,
    centerX + siteRadius, centerY,
    centerX + siteRadius / 2, centerY + siteRadius * 0.866,
    centerX - siteRadius / 2, centerY + siteRadius * 0.866,
  ]

  // 내부 건축물 외벽 좌표
  const wallWidth = 320
  const wallHeight = 420
  const wallX = centerX - wallWidth / 2
  const wallY = centerY - wallHeight / 2

  const outerWall = [
    wallX, wallY,
    wallX + wallWidth, wallY,
    wallX + wallWidth, wallY + wallHeight,
    wallX, wallY + wallHeight,
    wallX, wallY
  ]

  // 내부 칸막이 벽
  const innerWalls = [
    [wallX + wallWidth * 0.5, wallY, wallX + wallWidth * 0.5, wallY + wallHeight * 0.3], // Top vertical
    [wallX, wallY + wallHeight * 0.3, wallX + wallWidth, wallY + wallHeight * 0.3], // Horizontal 1
    [wallX, wallY + wallHeight * 0.6, wallX + wallWidth * 0.5, wallY + wallHeight * 0.6], // Horizontal 2
    [wallX + wallWidth * 0.5, wallY + wallHeight * 0.3, wallX + wallWidth * 0.5, wallY + wallHeight], // Bottom vertical
  ]

  const handleMouseEnter = (e: any) => {
    const container = e.target.getStage().container()
    container.style.cursor = 'pointer'
  }

  const handleMouseLeave = (e: any) => {
    const container = e.target.getStage().container()
    container.style.cursor = 'default'
  }

  return (
    <Stage width={stageSize.width} height={stageSize.height} className="absolute inset-0">
      <Layer>
        {/* 대지 (Hexagon Site) */}
        <Line 
          points={sitePoints} 
          closed 
          stroke="#3B45B3" 
          strokeWidth={1} 
          dash={[8, 8]}
          fill="rgba(59, 69, 179, 0.08)"
        />

        <Group>
          {/* 외벽 (Outer Walls) */}
          <Line 
            points={outerWall} 
            closed 
            stroke="#1C1C1E" 
            strokeWidth={3} 
            lineJoin="miter"
          />
          
          {/* 내벽 (Inner Walls) */}
          {innerWalls.map((wall, i) => (
            <Line key={i} points={wall} stroke="#1C1C1E" strokeWidth={2} />
          ))}

          {/* 문 (Door - Semicircle on top left wall) */}
          <Arc
            x={wallX + wallWidth * 0.25}
            y={wallY}
            innerRadius={0}
            outerRadius={20}
            angle={180}
            rotation={180}
            stroke="#3B45B3"
            strokeWidth={2}
            fill="transparent"
          />
          {/* 문이 열리는 공간을 표시하는 외벽의 빈 공간 (선으로 덮어쓰기) */}
          <Line 
            points={[wallX + wallWidth * 0.25 - 20, wallY, wallX + wallWidth * 0.25 + 20, wallY]} 
            stroke="white" 
            strokeWidth={4} 
          />
        </Group>

        {isCollaborationMode && (
          <>
            {/* Dimension Lines (Only in Collaboration Mode or when active) */}
            <Group>
              {/* Top Dimension */}
              <Line points={[wallX, wallY - 20, wallX + wallWidth, wallY - 20]} stroke="#ADB5BD" strokeWidth={1} />
              <Line points={[wallX, wallY - 25, wallX, wallY - 15]} stroke="#ADB5BD" strokeWidth={1} />
              <Line points={[wallX + wallWidth, wallY - 25, wallX + wallWidth, wallY - 15]} stroke="#ADB5BD" strokeWidth={1} />
              <Text text="12,400mm" x={centerX - 25} y={wallY - 35} fontSize={10} fill="#ADB5BD" fontStyle="bold" />

              {/* Left Dimension */}
              <Line points={[wallX - 20, wallY, wallX - 20, wallY + wallHeight]} stroke="#ADB5BD" strokeWidth={1} />
              <Line points={[wallX - 25, wallY, wallX - 15, wallY]} stroke="#ADB5BD" strokeWidth={1} />
              <Line points={[wallX - 25, wallY + wallHeight, wallX - 15, wallY + wallHeight]} stroke="#ADB5BD" strokeWidth={1} />
              <Text text="16,200mm" x={wallX - 35} y={centerY + 25} fontSize={10} fill="#ADB5BD" fontStyle="bold" rotation={-90} />
            </Group>

            {/* Pins */}
            <Group 
              x={wallX + wallWidth * 0.15} 
              y={wallY + wallHeight * 0.15}
              onClick={() => onPinClick?.('041')}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              <Circle radius={12} fill="#1C1C1E" />
              <Text text="1" x={-3} y={-5} fill="white" fontSize={11} fontStyle="bold" />
            </Group>

            <Group 
              x={wallX + wallWidth * 0.55} 
              y={wallY + wallHeight * 0.45}
              onClick={() => onPinClick?.('042')}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              <Circle radius={14} fill={selectedPinId === '042' ? "#3B45B3" : "#1C1C1E"} />
              <Text text="2" x={-3.5} y={-5} fill="white" fontSize={11} fontStyle="bold" />
            </Group>

            <Group 
              x={wallX + wallWidth * 0.85} 
              y={wallY + wallHeight * 0.8}
              onClick={() => onPinClick?.('040')}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              <Circle radius={12} fill="#1C1C1E" />
              <Text text="3" x={-3} y={-5} fill="white" fontSize={11} fontStyle="bold" />
            </Group>

            {/* Popup Mockup for selected pin (e.g. 042) */}
            {(selectedPinId === '042' || !selectedPinId) && (
              <Group x={wallX + wallWidth * 0.55 - 45} y={wallY + wallHeight * 0.45 - 45}>
                <Rect 
                  width={90} 
                  height={24} 
                  fill="white" 
                  stroke="#D9DEF0" 
                  cornerRadius={8} 
                  shadowBlur={4} 
                  shadowOpacity={0.1}
                />
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


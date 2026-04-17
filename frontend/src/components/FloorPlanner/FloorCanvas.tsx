import * as React from 'react'
import { useEffect, useRef, useMemo } from 'react'
import * as d3 from 'd3'
import { ZoomIn, ZoomOut, Maximize, Bed, Utensils, Bath, Briefcase, Sofa, Navigation, Square } from 'lucide-react'
import { FloorProject, Room, CreativeSettings } from '../../hooks/useFloorSimulation.ts'

interface FloorCanvasProps {
  project: FloorProject
  currentFloor: number
  xRayFloors: number[]
  selectedRoomId: string | null
  creativeSettings: CreativeSettings
  onSelectRoom: (id: string | null) => void
  onDragRoom: (id: string, x: number, y: number) => void
}

const SCALE = 20 // 1m = 20px

const ROOM_COLORS: Record<string, string> = {
  living: '#4d88e6',
  bedroom: '#9966cc',
  kitchen: '#f59e0b',
  bathroom: '#33b3b3',
  office: '#3399cc',
  corridor: '#8c8c8c',
  other: '#737373',
}

const ROOM_ICONS: Record<string, any> = {
  living: Sofa,
  bedroom: Bed,
  kitchen: Utensils,
  bathroom: Bath,
  office: Briefcase,
  corridor: Navigation,
  other: Square,
}

export const FloorCanvas: React.FC<FloorCanvasProps> = ({
  project,
  currentFloor,
  xRayFloors,
  selectedRoomId,
  creativeSettings,
  onSelectRoom,
  onDragRoom,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, any> | null>(null)
  const simulationRef = useRef<d3.Simulation<any, any> | null>(null)
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const prevFloorRef = useRef<number>(currentFloor)
  const isTransitioningRef = useRef<boolean>(false)
  const nodesRef = useRef<any[]>([])
  const linksRef = useRef<any[]>([])

  const rooms = useMemo(() => project.rooms.filter(r => r.floor === currentFloor), [project.rooms, currentFloor])
  const xRayRooms = useMemo(() => project.rooms.filter(r => xRayFloors.includes(r.floor)), [project.rooms, xRayFloors])
  
  const adjacency = useMemo(() => project.adjacency.filter(a => 
    rooms.some(r => r.id === a.from_room_id) && rooms.some(r => r.id === a.to_room_id)
  ), [project.adjacency, rooms])

  // 1. 초기 SVG 및 시뮬레이션 설정 (마운트 시 1회)
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return

    const svg = d3.select(svgRef.current)
    const width = containerRef.current.clientWidth
    const height = containerRef.current.clientHeight
    
    svg.selectAll('*').remove() // 초기화
    svg.attr('viewBox', `-${width/2} -${height/2} ${width} ${height}`)

    // 줌 설정
    const zoom = d3.zoom<SVGSVGElement, any>()
      .scaleExtent([0.1, 5])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })

    svg.call(zoom)
    zoomRef.current = zoom

    // 배경 그리드 패턴 정의
    const defs = svg.append('defs')
    const pattern = defs.append('pattern')
      .attr('id', 'grid')
      .attr('width', SCALE)
      .attr('height', SCALE)
      .attr('patternUnits', 'userSpaceOnUse')
    
    pattern.append('path')
      .attr('d', `M ${SCALE} 0 L 0 0 0 ${SCALE}`)
      .attr('fill', 'none')
      .attr('stroke', 'white')
      .attr('stroke-opacity', 0.05)
      .attr('stroke-width', 0.5)

    const g = svg.append('g').attr('class', 'main-layer')
    gRef.current = g
    
    // Trace Layer (Background Image)
    g.append('image')
      .attr('class', 'trace-layer')
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .lower()

    // 그리드 배경 레이어
    g.append('rect')
      .attr('class', 'grid-layer')
      .attr('width', 20000)
      .attr('height', 20000)
      .attr('x', -10000)
      .attr('y', -10000)
      .attr('fill', 'url(#grid)')
      .lower()

    g.append('g').attr('class', 'xray-layer')
    g.append('g').attr('class', 'zones-layer')
    g.append('g').attr('class', 'links-layer')
    g.append('g').attr('class', 'nodes-layer')

    // 시뮬레이션 초기화 (creativeSettings.physics 초기값 반영)
    const simulation = d3.forceSimulation<any>([])
      .force('link', d3.forceLink<any, any>([]).id(d => d.id))
      .force('charge', d3.forceManyBody().strength(creativeSettings.physics.gravity))
      .force('center', d3.forceCenter(0, 0).strength(0.05))
      .force('collision', d3.forceCollide().radius((d: any) => {
        const r = creativeSettings.viewMode === 'organic' 
          ? Math.sqrt(d.width * d.height / Math.PI) * SCALE 
          : Math.max(d.width, d.height) * SCALE / 2
        return r + 15
      }).strength(creativeSettings.physics.collisionStrength))
      .velocityDecay(creativeSettings.physics.friction)

    simulationRef.current = simulation

    return () => {
      simulation.stop()
    }
  }, [])

  // 2. 데이터 동기화 및 렌더링 업데이트 (rooms/adjacency 변경 시)
  useEffect(() => {
    if (!svgRef.current || !simulationRef.current) return
    const simulation = simulationRef.current
    const svg = d3.select(svgRef.current)
    const g = svg.select('.main-layer')

    // Trace Layer 업데이트
    const traceLayer = g.select('.trace-layer')
    if (creativeSettings.traceImage) {
      traceLayer
        .attr('href', creativeSettings.traceImage)
        .attr('xlink:href', creativeSettings.traceImage)
        .attr('opacity', creativeSettings.traceOpacity)
        .attr('width', 5000)
        .attr('height', 5000)
        .attr('x', -2500)
        .attr('y', -2500)
        .style('display', 'block')
    } else {
      traceLayer
        .attr('href', '')
        .attr('xlink:href', '')
        .style('display', 'none')
    }

    // X-Ray 레이어 업데이트
    const xRayLayer = g.select('.xray-layer')
    xRayLayer.selectAll('*').remove()
    xRayRooms.forEach(r => {
      const ghost = xRayLayer.append('g')
        .attr('transform', `translate(${(r.x || 0) * SCALE}, ${(r.y || 0) * SCALE})`)
        .attr('opacity', 0.15)
      
      ghost.append('rect')
        .attr('width', r.width * SCALE)
        .attr('height', r.height * SCALE)
        .attr('x', -r.width * SCALE / 2)
        .attr('y', -r.height * SCALE / 2)
        .attr('fill', 'none')
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,4')
    })

    // 노드 데이터 준비 (기존 좌표 유지)
    const oldNodes = new Map(nodesRef.current.map(d => [d.id, d]))
    const newNodes = rooms.map(r => {
      const old = oldNodes.get(r.id)
      return {
        ...r,
        x: old ? old.x : (r.x || 0) * SCALE,
        y: old ? old.y : (r.y || 0) * SCALE,
        vx: old ? old.vx : 0,
        vy: old ? old.vy : 0,
        fx: r.locked ? (r.x || 0) * SCALE : null,
        fy: r.locked ? (r.y || 0) * SCALE : null,
      }
    })

    const newLinks = adjacency.map(a => ({
      source: a.from_room_id,
      target: a.to_room_id,
      strength: a.strength
    }))

    nodesRef.current = newNodes
    linksRef.current = newLinks

    // 조닝 응집력 (Zone Attraction) 강화를 위한 가상 링크 추가
    const zones = project.zones || []
    const zoneLinks: any[] = []
    const roomsByZone = d3.group(newNodes, d => d.zoneId)
    
    roomsByZone.forEach((members, zoneId) => {
      if (!zoneId || members.length < 2) return
      // 모든 멤버간에 약한 인력 링크 생성하여 뭉치게 함
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          zoneLinks.push({
            source: members[i].id,
            target: members[j].id,
            isZoneLink: true
          })
        }
      }
    })

    // 시뮬레이션 파라미터 업데이트
    simulation.velocityDecay(creativeSettings.physics.friction)
    const chargeForce = simulation.force<d3.ForceManyBody<any>>('charge')
    if (chargeForce) chargeForce.strength(creativeSettings.physics.gravity)

    const collideForce = simulation.force<d3.ForceCollide<any>>('collision')
    if (collideForce) {
      collideForce.radius((d: any) => {
        const r = creativeSettings.viewMode === 'organic' 
          ? Math.sqrt(d.width * d.height / Math.PI) * SCALE 
          : Math.max(d.width, d.height) * SCALE / 2
        return r + 15
      }).strength(creativeSettings.physics.collisionStrength)
    }

    simulation.nodes(newNodes)
    const linkForce = simulation.force<d3.ForceLink<any, any>>('link')
    if (linkForce) {
      linkForce.links([...newLinks, ...zoneLinks])
        .strength(d => d.isZoneLink ? 0.3 : Math.max(0.1, d.strength * 0.7))
        .distance(d => {
          if (d.isZoneLink) return 50 // 구역 내 방들은 가깝게 유지
          const s = d.source;
          const t = d.target;
          const avgRadius = creativeSettings.viewMode === 'organic'
            ? (Math.sqrt(s.width * s.height / Math.PI) + Math.sqrt(t.width * t.height / Math.PI)) / 2 * SCALE
            : ((Math.max(s.width, s.height) + Math.max(t.width, t.height)) / 2) * SCALE;
          return (avgRadius + 30) * creativeSettings.physics.linkDistanceMultiplier;
        })
    }
    
    simulation.alpha(0.3).restart()

    // DOM 업데이트
    const linksLayer = g.select('.links-layer')
    const nodesLayer = g.select('.nodes-layer')
    const zonesLayer = g.select('.zones-layer')

    // 조닝 버블(Hull) 데이터 준비
    const zoneBlobs = Array.from(roomsByZone.entries())
      .filter(([zid]) => zid != null)
      .map(([zid, members]) => {
        const zoneInfo = zones.find(z => z.id === zid)
        return {
          id: zid,
          name: zoneInfo?.name || 'Unnamed Zone',
          color: zoneInfo?.color || '#ffffff',
          members
        }
      })

    const zonePath = zonesLayer.selectAll<SVGPathElement, any>('path.zone-blob')
      .data(zoneBlobs, (d: any) => d.id)
      .join('path')
      .attr('class', 'zone-blob')
      .attr('fill', d => d.color)
      .attr('fill-opacity', 0.08)
      .attr('stroke', d => d.color)
      .attr('stroke-opacity', 0.3)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,5')
      .style('pointer-events', 'none')

    const zoneLabel = zonesLayer.selectAll<SVGTextElement, any>('text.zone-label')
      .data(zoneBlobs, (d: any) => d.id)
      .join('text')
      .attr('class', 'zone-label')
      .attr('fill', d => d.color)
      .attr('fill-opacity', 0.6)
      .attr('font-size', '10px')
      .attr('font-weight', '900')
      .attr('text-anchor', 'middle')
      .attr('dy', -20)
      .style('text-transform', 'uppercase')
      .style('letter-spacing', '0.1em')
      .style('pointer-events', 'none')
      .text(d => d.name)

    const link = linksLayer.selectAll<SVGLineElement, any>('line')
      .data(newLinks, (d: any) => `${d.source.id || d.source}-${d.target.id || d.target}`)
      .join('line')
      .attr('stroke', '#ffffff')
      .attr('stroke-opacity', d => 0.2 + d.strength * 0.4)
      .attr('stroke-width', d => d.strength * 4)

    const node = nodesLayer.selectAll<SVGGElement, any>('g.room-node')
      .data(newNodes, (d: any) => d.id)
      .join(
        enter => {
          const e = enter.append('g')
            .attr('class', 'room-node')
            .style('cursor', 'pointer')
          
          e.append('rect').attr('class', 'room-shape rect-shape').attr('rx', 4)
          e.append('circle').attr('class', 'room-shape circle-shape')
          e.append('text').attr('class', 'room-label')
          e.append('text').attr('class', 'area-label')
          return e
        }
      )
      .on('click', (event, d) => {
        event.stopPropagation()
        onSelectRoom(d.id)
      })
      .call(d3.drag<SVGGElement, any>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart()
          d.fx = d.x
          d.fy = d.y
        })
        .on('drag', (event, d) => {
          d.fx = event.x
          d.fy = event.y
          // Throttle or direct update
          onDragRoom(d.id, event.x / SCALE, event.y / SCALE)
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0)
          if (!d.locked) {
            d.fx = null
            d.fy = null
          }
        })
      )

    // 스타일 업데이트
    const isOrganic = creativeSettings.viewMode === 'organic'
    
    node.select('.rect-shape')
      .style('display', isOrganic ? 'none' : 'block')
      .attr('width', d => d.width * SCALE)
      .attr('height', d => d.height * SCALE)
      .attr('x', d => -d.width * SCALE / 2)
      .attr('y', d => -d.height * SCALE / 2)
      .attr('fill', d => ROOM_COLORS[d.type] || ROOM_COLORS.other)
      .attr('fill-opacity', 0.2)
      .attr('stroke', d => selectedRoomId === d.id ? '#fb923c' : ROOM_COLORS[d.type] || ROOM_COLORS.other)
      .attr('stroke-width', d => selectedRoomId === d.id ? 3 : 1.5)

    node.select('.circle-shape')
      .style('display', isOrganic ? 'block' : 'none')
      .attr('r', d => Math.sqrt(d.width * d.height / Math.PI) * SCALE)
      .attr('fill', d => ROOM_COLORS[d.type] || ROOM_COLORS.other)
      .attr('fill-opacity', 0.2)
      .attr('stroke', d => selectedRoomId === d.id ? '#fb923c' : ROOM_COLORS[d.type] || ROOM_COLORS.other)
      .attr('stroke-width', d => selectedRoomId === d.id ? 3 : 1.5)

    node.select('.room-label')
      .attr('text-anchor', 'middle')
      .attr('dy', '-2')
      .attr('fill', '#ffffff')
      .attr('font-size', '11px')
      .attr('font-weight', '900')
      .text(d => d.name)

    node.select('.area-label')
      .attr('text-anchor', 'middle')
      .attr('dy', '10')
      .attr('fill', '#ffffff')
      .attr('fill-opacity', 0.4)
      .attr('font-size', '8px')
      .attr('font-weight', 'bold')
      .text(d => `${(d.width * d.height).toFixed(1)} m²`)

    simulation.on('tick', () => {
      // Zone Bubbles (Hull) 업데이트
      const line = d3.line().curve(d3.curveBasisClosed)
      
      zonePath.attr('d', (d: any) => {
        // 노드들의 외곽 포인트들 계산 (패딩 적용)
        const points: [number, number][] = []
        d.members.forEach((m: any) => {
          const r = Math.max(m.width, m.height) * SCALE / 2 + 20
          points.push([m.x - r, m.y - r])
          points.push([m.x + r, m.y - r])
          points.push([m.x + r, m.y + r])
          points.push([m.x - r, m.y + r])
        })
        
        const hull = d3.polygonHull(points)
        return hull ? line(hull) : null
      })

      zoneLabel
        .attr('x', (d: any) => d3.mean(d.members, (m: any) => m.x) || 0)
        .attr('y', (d: any) => d3.min(d.members, (m: any) => m.y - (Math.max(m.width, m.height) * SCALE / 2)) || 0)

      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.id ? d.target.x : d.target.x) // Safety
        .attr('y2', (d: any) => d.target.id ? d.target.y : d.target.y)
      
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)

      node
        .attr('transform', (d: any) => `translate(${d.x},${d.y})`)
    })

    // SVG 바탕 클릭 시 선택 해제
    svg.on('click', (event) => {
      if (event.target === svgRef.current) {
        onSelectRoom(null)
      }
    })

    // 초기 맞춤 (데이터가 처음 들어왔을 때만)
    if (newNodes.length > 0 && oldNodes.size === 0) {
      setTimeout(() => handleFit(), 200)
    }

  }, [rooms, adjacency, xRayRooms, selectedRoomId, creativeSettings])

  // 수동 줌 컨트롤 핸들러
  const handleZoom = (delta: number) => {
    if (!svgRef.current || !zoomRef.current) return
    const svg = d3.select(svgRef.current)
    svg.transition().duration(200).call(zoomRef.current.scaleBy, delta)
  }

  const handleFit = () => {
    if (!svgRef.current || !zoomRef.current) return
    
    const nodes = rooms.map(r => ({
      x: (r.x || 0) * SCALE,
      y: (r.y || 0) * SCALE,
      width: r.width * SCALE,
      height: r.height * SCALE
    }))

    if (nodes.length === 0) return

    const width = containerRef.current?.clientWidth || 800
    const height = containerRef.current?.clientHeight || 600
    
    const xExtent = [
      d3.min(nodes, d => d.x - d.width/2) || 0,
      d3.max(nodes, d => d.x + d.width/2) || 0
    ]
    const yExtent = [
      d3.min(nodes, d => d.y - d.height/2) || 0,
      d3.max(nodes, d => d.y + d.height/2) || 0
    ]

    const padding = 100
    const contentWidth = (xExtent[1] - xExtent[0]) + padding
    const contentHeight = (yExtent[1] - yExtent[0]) + padding
    
    const k = Math.min(width / contentWidth, height / contentHeight, 1.5)
    const x = -(xExtent[0] + xExtent[1]) / 2 * k
    const y = -(yExtent[0] + yExtent[1]) / 2 * k

    d3.select(svgRef.current).transition().duration(500)
      .call(zoomRef.current.transform, d3.zoomIdentity.translate(x, y).scale(k))
  }

  return (
    <div ref={containerRef} className="w-full h-full relative group">
      <svg
        ref={svgRef}
        className="w-full h-full select-none outline-none"
        style={{ background: '#0f172a' }}
      />
      
      {/* Zoom Controls Overlay */}
      <div className="absolute bottom-6 right-6 flex flex-col gap-2 p-1 bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
          onClick={() => handleZoom(1.3)}
          className="p-3 hover:bg-white/10 rounded-xl text-white/60 hover:text-white transition-all shadow-lg"
          title="Zoom In"
        >
          <ZoomIn className="w-5 h-5" />
        </button>
        <button 
          onClick={handleFit}
          className="p-3 hover:bg-white/10 rounded-xl text-white/60 hover:text-white transition-all shadow-lg"
          title="Fit to View"
        >
          <Maximize className="w-5 h-5" />
        </button>
        <button 
          onClick={() => handleZoom(0.7)}
          className="p-3 hover:bg-white/10 rounded-xl text-white/60 hover:text-white transition-all shadow-lg"
          title="Zoom Out"
        >
          <ZoomOut className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}

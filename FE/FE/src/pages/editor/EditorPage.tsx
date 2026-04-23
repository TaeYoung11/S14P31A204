import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Stage,
  Layer,
  Rect,
  Text,
  Line,
  Group,
  Circle
} from 'react-konva'
import {
  MousePointer2,
  PlusCircle,
  TrendingUp,
  Trash2,
  MessagesSquare,
  Sparkles,
  Share2,
  Save,
  Undo2,
  Redo2,
  Search,
  Minus,
  Plus,
  Hand,
  ChevronDown,
  Brain,
  X
} from 'lucide-react'

// 편집 화면에서 사용되는 모드 타입
// URL: /projects/:projectId/editor?mode=bubble|2d|3d
export type EditorMode = 'bubble' | '2d' | '3d'

interface BubbleData {
  id: string
  x: number
  y: number
  width: number
  height: number
  label: string
  area: string
  index: string
}

export default function EditorPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const mode = (searchParams.get('mode') ?? 'bubble') as EditorMode

  const [bubbles, setBubbles] = useState<BubbleData[]>([
    { id: '1', x: 230, y: 250, width: 100, height: 100, label: '현관/로비', area: '12.5 m²', index: '01' },
    { id: '2', x: 340, y: 310, width: 130, height: 130, label: '거실', area: '45.0 m²', index: '02' },
    { id: '3', x: 310, y: 500, width: 110, height: 110, label: '주방/식당', area: '20.0 m²', index: '03' },
  ])
  const [selectedId, setSelectedId] = useState<string | null>('1')
  
  const containerRef = useRef<HTMLDivElement>(null)
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 })

  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    type: 'Living Room',
    area: ''
  })

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setStageSize({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight
        })
      }
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  const setMode = (newMode: EditorMode) => {
    setSearchParams({ mode: newMode })
  }

  const handleOpenAddModal = () => {
    setFormData({ name: '', type: 'Living Room', area: '' })
    setIsAddModalOpen(true)
  }

  const handleConfirmAddSpace = () => {
    const nextIndex = (bubbles.length + 1).toString().padStart(2, '0')
    const newBubble: BubbleData = {
      id: Date.now().toString(),
      x: 150 + Math.random() * 200,
      y: 150 + Math.random() * 200,
      width: 100 + (formData.name.length * 5),
      height: 100,
      label: formData.name || '새 공간',
      area: formData.area ? `${formData.area} m²` : '0.0 m²',
      index: nextIndex
    }
    setBubbles([...bubbles, newBubble])
    setIsAddModalOpen(false)
  }

  // 대지 다각형 좌표 (임의 설정)
  const sitePoints = [420, 310, 560, 310, 560, 550, 330, 720, 300, 480]

  return (
    <div className="flex flex-col h-screen w-screen bg-[#F0F2F9] text-[#1D1E20] overflow-hidden font-sans">
      {/* --- Add Space Modal --- */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-[400px] overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-8 pt-8 pb-6">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-[18px] font-black text-[#1C1C1E]">공간 추가</h2>
                <button onClick={() => setIsAddModalOpen(false)} className="text-[#ADB5BD] hover:text-[#1C1C1E] transition-colors">
                  <X size={20} />
                </button>
              </div>
              <p className="text-[11px] font-bold text-[#ADB5BD] mb-8">새로운 룸의 기본 속성과 면적 비율을 설정합니다.</p>

              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black text-[#1C1C1E] uppercase tracking-wider">방 이름</label>
                  <input 
                    type="text" 
                    placeholder="공간 이름을 입력하세요 (예: 거실 A)"
                    className="w-full bg-[#F8F9FD] border-none rounded-xl px-4 py-3.5 text-xs font-bold text-[#1C1C1E] placeholder:text-[#ADB5BD] focus:ring-2 focus:ring-[#3B45B3]/20 outline-none"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black text-[#1C1C1E] uppercase tracking-wider">방 종류</label>
                  <div className="relative">
                    <select 
                      className="w-full bg-[#F8F9FD] border-none rounded-xl px-4 py-3.5 text-xs font-bold text-[#1C1C1E] focus:ring-2 focus:ring-[#3B45B3]/20 outline-none appearance-none cursor-pointer"
                      value={formData.type}
                      onChange={e => setFormData({...formData, type: e.target.value})}
                    >
                      <option>Living Room</option>
                      <option>Bedroom</option>
                      <option>Kitchen</option>
                      <option>Bathroom</option>
                      <option>Entrance</option>
                    </select>
                    <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#3B45B3] pointer-events-none" />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black text-[#1C1C1E] uppercase tracking-wider">방 비율</label>
                  <input 
                    type="text" 
                    placeholder="비율을 입력하세요 (예: 45m^2)"
                    className="w-full bg-[#F8F9FD] border-none rounded-xl px-4 py-3.5 text-xs font-bold text-[#1C1C1E] placeholder:text-[#ADB5BD] focus:ring-2 focus:ring-[#3B45B3]/20 outline-none"
                    value={formData.area}
                    onChange={e => setFormData({...formData, area: e.target.value})}
                  />
                </div>
              </div>
            </div>

            <div className="px-8 pb-8 pt-2 flex items-center justify-end gap-6">
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="text-[13px] font-bold text-[#ADB5BD] hover:text-[#1C1C1E] transition-colors"
              >
                취소
              </button>
              <button 
                onClick={handleConfirmAddSpace}
                className="bg-[#3B45B3] text-white px-6 py-3 rounded-xl text-[13px] font-black shadow-lg shadow-[#3B45B3]/20 hover:bg-[#2D3691] transition-all"
              >
                공간 생성하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Header --- */}
      <header className="h-12 bg-white border-b border-[#E2E6EF] flex items-center justify-between px-6 shrink-0 z-50 shadow-sm">
        <div className="flex items-center gap-8">
          <div className="text-sm font-black tracking-tighter text-[#1C1C1E]">
            <span className="opacity-60">바탕:</span> BATANG
          </div>
          <nav className="flex items-center gap-6">
            <button className="text-xs font-bold text-[#3B45B3] border-b-2 border-[#3B45B3] h-12 flex items-center">워크스페이스</button>
            <button className="text-xs font-medium text-[#8E95A3] h-12 flex items-center hover:text-[#3B45B3] transition-colors">뷰어</button>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <button className="p-2 text-[#8E95A3] hover:bg-[#F0F2F9] rounded-lg transition-colors">
            <Share2 size={18} />
          </button>
          <button className="bg-[#3B45B3] text-white px-4 py-1.5 rounded-lg text-xs font-bold shadow-md hover:bg-[#2D3691] shadow-[#3B45B3]/20 transition-all flex items-center gap-2">
            <Save size={14} />
            Save
          </button>
        </div>
      </header>

      {/* --- Workspace Toolbar --- */}
      <div className="h-14 flex items-center justify-between px-6 shrink-0 z-40">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-[#1C1C1E]">판교 테크 센터</h1>
        </div>

        {/* Mode Toggle & History */}
        <div className="flex items-center gap-6">
          <div className="bg-[#E2E6EF] p-1 rounded-full flex items-center gap-1">
            {(['bubble', '2d', '3d'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${mode === m
                    ? 'bg-white text-[#3B45B3] shadow-sm'
                    : 'text-[#8E95A3] hover:text-[#505764]'
                  }`}
              >
                {m === 'bubble' ? 'Bubble' : m === '2d' ? '2D Plan' : '3D View'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 border-l border-[#DDE2ED] pl-6 text-[#8E95A3]">
            <button className="p-1.5 hover:bg-white hover:text-[#1C1C1E] rounded-md transition-all">
              <Undo2 size={18} />
            </button>
            <button className="p-1.5 hover:bg-white hover:text-[#1C1C1E] rounded-md transition-all">
              <Redo2 size={18} />
            </button>
          </div>
        </div>
        <div className="w-[100px]" /> {/* Spacer to balance title */}
      </div>

      <div className="flex flex-1 relative overflow-hidden px-6 pb-6 gap-6">
        {/* --- Left Sidebar --- */}
        <aside className="w-[72px] bg-white border border-[#E2E6EF] rounded-2xl flex flex-col items-center py-6 gap-4 shadow-sm shrink-0 self-start mt-0 h-full overflow-y-auto overflow-x-hidden">
          {/* Top Tools */}
          <div className="flex flex-col items-center gap-2 w-full">
            <button className="w-full flex flex-col items-center gap-1 py-2 group">
              <div className="p-2.5 text-[#3B45B3] bg-[#F0F2FF] rounded-xl transition-all shadow-sm group-hover:scale-105">
                <MousePointer2 size={24} fill="#3B45B3" fillOpacity={0.1} />
              </div>
              <span className="text-[10px] font-bold text-[#3B45B3]">선택</span>
            </button>

            <button 
              onClick={handleOpenAddModal}
              className="w-full flex flex-col items-center gap-1 py-1 group"
            >
              <div className="p-2 text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#1C1C1E] rounded-xl transition-all">
                <PlusCircle size={24} />
              </div>
              <span className="text-[10px] font-bold text-[#8E95A3] group-hover:text-[#1C1C1E]">공간 추가</span>
            </button>

            <button className="w-full flex flex-col items-center gap-1 py-1 group">
              <div className="p-2 text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#1C1C1E] rounded-xl transition-all">
                <TrendingUp size={24} />
              </div>
              <span className="text-[10px] font-bold text-[#8E95A3] group-hover:text-[#1C1C1E]">선 스타일</span>
            </button>

            <button className="w-full flex flex-col items-center gap-1 py-1 group">
              <div className="p-2 text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#E03131] rounded-xl transition-all">
                <Trash2 size={24} />
              </div>
              <span className="text-[10px] font-bold text-[#8E95A3] group-hover:text-[#E03131]">삭제</span>
            </button>
          </div>

          {/* Bottom Tools */}
          <div className="mt-auto flex flex-col items-center gap-4 w-full">
            <button className="w-full flex flex-col items-center gap-1 py-1 group">
              <div className="p-2 text-[#3B45B3] group-hover:bg-[#F0F2FF] rounded-xl transition-all">
                <MessagesSquare size={24} />
              </div>
              <span className="text-[10px] font-bold text-[#3B45B3]">협업</span>
            </button>

            <button className="w-full flex flex-col items-center gap-1 py-1 group">
              <div className="p-2 text-[#8E95A3] group-hover:bg-[#F0F2F9] group-hover:text-[#3B45B3] rounded-xl transition-all">
                <Brain size={24} />
              </div>
              <span className="text-[10px] font-bold text-[#8E95A3] group-hover:text-[#3B45B3]">AI</span>
            </button>
          </div>
        </aside>

        {/* --- Main Canvas --- */}
        <main 
          ref={containerRef}
          className="flex-1 bg-white border border-[#E2E6EF] rounded-3xl shadow-sm relative overflow-hidden"
        >
          {mode === 'bubble' ? (
            <Stage 
              width={stageSize.width} 
              height={stageSize.height}
              className="absolute inset-0"
            >
              <Layer>
                {/* --- Site (Polygon) --- */}
                <Line
                  points={sitePoints}
                  closed
                  fill="#3B45B311"
                  stroke="#3B45B333"
                  strokeWidth={1}
                />
                <Circle
                  x={stageSize.width * 0.42}
                  y={stageSize.height * 0.52}
                  radius={8}
                  fill="#3B45B322"
                />

                {/* --- Connections (Lines) --- */}
                <Line
                  points={[bubbles[0]?.x + 50, bubbles[0]?.y + 50, bubbles[1]?.x + 65, bubbles[1]?.y + 65]}
                  stroke="#3B45B3"
                  strokeWidth={2}
                />
                <Line
                  points={[bubbles[0]?.x + 50, bubbles[0]?.y + 50, bubbles[2]?.x + 55, bubbles[2]?.y + 55]}
                  stroke="#ADB5BD"
                  strokeWidth={1}
                  dash={[5, 5]}
                />
                <Line
                  points={[bubbles[1]?.x + 65, bubbles[1]?.y + 65, bubbles[2]?.x + 55, bubbles[2]?.y + 55]}
                  stroke="#3B45B3"
                  strokeWidth={1.5}
                />

                {/* --- Bubbles --- */}
                {bubbles.map((b) => (
                  <Group
                    key={b.id}
                    x={b.x}
                    y={b.y}
                    draggable
                    onDragMove={(e) => {
                      const newBubbles = bubbles.map(bubble => 
                        bubble.id === b.id ? { ...bubble, x: e.target.x(), y: e.target.y() } : bubble
                      )
                      setBubbles(newBubbles)
                    }}
                    onClick={() => setSelectedId(b.id)}
                  >
                    <Rect
                      width={b.width}
                      height={b.height}
                      fill="white"
                      cornerRadius={15}
                      stroke={selectedId === b.id ? "#3B45B3" : "#E2E6EF"}
                      strokeWidth={selectedId === b.id ? 2 : 1}
                      shadowColor="black"
                      shadowBlur={selectedId === b.id ? 10 : 2}
                      shadowOpacity={0.05}
                      shadowOffset={{ x: 0, y: 4 }}
                    />
                    
                    {selectedId === b.id && (
                      <>
                        <Circle x={0} y={0} radius={3.5} fill="#3B45B3" />
                        <Circle x={b.width} y={0} radius={3.5} fill="#3B45B3" />
                        <Circle x={0} y={b.height} radius={3.5} fill="#3B45B3" />
                        <Circle x={b.width} y={b.height} radius={3.5} fill="#3B45B3" />
                      </>
                    )}

                    <Text
                      text={b.index}
                      fontSize={11}
                      fontStyle="bold"
                      fill="#3B45B3"
                      x={b.width / 2 - 5}
                      y={b.height / 2 - 30}
                    />
                    <Text
                      text={b.label}
                      fontSize={14}
                      fontStyle="bold"
                      fill="#1C1C1E"
                      width={b.width}
                      align="center"
                      y={b.height / 2 - 10}
                    />
                    <Text
                      text={b.area}
                      fontSize={10}
                      fontStyle="bold"
                      fill="#ADB5BD"
                      width={b.width}
                      align="center"
                      y={b.height / 2 + 10}
                    />
                  </Group>
                ))}
              </Layer>
            </Stage>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[#ADB5BD] font-medium opacity-50 text-center px-10">
              {mode === '2d' && '2D 평면도 캔버스\n(준비 중...)'}
              {mode === '3d' && '3D 뷰어 캔버스\n(준비 중...)'}
            </div>
          )}

          {/* Bottom Zoom Controls */}
          <div className="absolute bottom-6 left-6 flex items-center gap-1 bg-white/80 backdrop-blur-md border border-[#E2E6EF] rounded-2xl p-1 shadow-lg z-10">
            <button className="p-2 text-[#8E95A3] hover:text-[#1C1C1E] transition-colors"><Search size={16} /></button>
            <div className="text-[11px] font-bold text-[#1C1C1E] min-w-[36px] text-center">100 %</div>
            <button className="p-2 text-[#8E95A3] hover:text-[#1C1C1E] transition-colors"><Plus size={16} /></button>
            <div className="w-px h-4 bg-[#E2E6EF] mx-1" />
            <button className="p-2 text-[#8E95A3] hover:text-[#1C1C1E] transition-colors"><Hand size={16} /></button>
          </div>
        </main>

        {/* --- Right Side Panels --- */}
        <div className="w-[300px] flex flex-col gap-6 shrink-0">
          {/* Attribute Manager */}
          <section className="bg-white border border-[#E2E6EF] rounded-2xl shadow-sm overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-[#F0F2F9] flex items-center justify-between">
              <h2 className="text-xs font-extrabold text-[#1C1C1E]">속성 관리자</h2>
              <Minus size={14} className="text-[#ADB5BD]" />
            </div>
            <div className="p-5 flex flex-col gap-5">
              <div className="flex flex-col gap-3">
                <h3 className="text-[10px] font-bold text-[#3B45B3]">치수 설정</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-[#ADB5BD] uppercase">Length (mm)</label>
                    <input type="text" defaultValue="4,000" className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-[#ADB5BD] uppercase">Width (mm)</label>
                    <input type="text" defaultValue="3,000" className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-[#ADB5BD] uppercase">Height (mm)</label>
                    <input type="text" defaultValue="2,400" className="bg-[#ADB5BD]/10 border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#ADB5BD] outline-none cursor-not-allowed" disabled />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-[#ADB5BD] uppercase">Thickness</label>
                    <input type="text" defaultValue="200" className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none" />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <h3 className="text-[10px] font-bold text-[#3B45B3]">재질</h3>
                <button className="w-full bg-[#F8F9FD] rounded-lg px-3 py-2.5 flex items-center justify-between group hover:bg-[#F0F2FA] transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-[#BEC4D1] rounded shadow-inner" />
                    <span className="text-xs font-bold text-[#1C1C1E]">콘크리트 (회색)</span>
                  </div>
                  <ChevronDown size={14} className="text-[#ADB5BD] group-hover:text-[#3B45B3]" />
                </button>
              </div>

              <div className="mt-2 pt-5 border-t border-[#F0F2F9] flex items-center justify-between">
                <span className="text-[10px] font-bold text-[#ADB5BD]">계산 면적</span>
                <span className="text-sm font-black text-[#3B45B3]">12.00 m²</span>
              </div>
            </div>
          </section>

          {/* AI Assistant */}
          <section className="bg-[#3B45B3] rounded-2xl shadow-lg shadow-[#3B45B3]/20 overflow-hidden flex flex-col mt-auto">
            <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2 text-white">
                <Sparkles size={14} fill="white" />
                <h2 className="text-[11px] font-extrabold uppercase tracking-wider">AI 어시스턴트</h2>
              </div>
              <Minus size={14} className="text-white/40" />
            </div>
            <div className="p-4">
              <div className="bg-white rounded-xl p-4 shadow-inner relative">
                <div className="text-[11px] leading-relaxed text-[#1C1C1E] font-medium">
                  거실 공간에 비해 창문 크기가 작습니다.
                  <br />
                  채광 효율을 위해 창문 너비를 1200mm에서 <span className="text-[#3B45B3] font-bold">1800mm</span>로 확장할까요?
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

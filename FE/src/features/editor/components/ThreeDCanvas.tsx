import { 
  Square, 
  DoorOpen, 
  Layout, 
  Home, 
  Box, 
  Layers, 
  ChevronDown, 
  ChevronRight, 
  Minus,
  Maximize2,
  Users
} from 'lucide-react'

interface ThreeDCanvasProps {
  isCollaborationMode?: boolean
  selectedPinId?: string | null
  onPinClick?: (id: string) => void
}

export function ThreeDCanvas({ isCollaborationMode, selectedPinId, onPinClick }: ThreeDCanvasProps) {
  return (
    <div className="absolute inset-0 bg-[#F0F2F9] overflow-hidden flex items-center justify-center">
      {/* Mockup 3D Background - Stylized placeholder */}
      <div className={`absolute inset-0 transition-all duration-700 ${isCollaborationMode ? 'bg-[#4B5563]' : 'bg-gradient-to-br from-[#E2E6EF] to-[#BEC4D1] opacity-40'}`} />
      
      {/* Center 3D Model Placeholder - Stylized Architectural Mockup */}
      <div className="relative w-full h-full flex items-center justify-center p-20">
        <div className={`relative w-[400px] h-[500px] preserve-3d transform -rotate-x-12 rotate-y-45 transition-all duration-700 ${isCollaborationMode ? 'scale-110' : 'hover:rotate-y-[60deg]'}`}>
          {/* Main Building Block */}
          <div className={`absolute inset-0 backdrop-blur-sm border transition-all duration-700 ${
            isCollaborationMode 
              ? 'bg-transparent border-[#3B45B3]/40 border-2' 
              : 'bg-white/40 border-white/60 shadow-2xl rounded-sm'
          }`}>
            {/* Grid Windows / Wireframe */}
            <div className={`absolute inset-0 grid grid-cols-6 grid-rows-10 gap-1 p-4 transition-opacity duration-700 ${isCollaborationMode ? 'opacity-60' : 'opacity-30'}`}>
              {Array.from({ length: 60 }).map((_, i) => (
                <div key={i} className={`rounded-sm border ${isCollaborationMode ? 'border-[#3B45B3]/30 bg-transparent' : 'bg-[#3B45B3]/20 border-transparent'}`} />
              ))}
            </div>
          </div>
          
          {/* Side Face */}
          <div className={`absolute top-0 right-0 w-[100px] h-full backdrop-blur-sm border-l origin-left transform rotate-y-90 translate-x-[100px] transition-all duration-700 ${
            isCollaborationMode ? 'bg-transparent border-[#3B45B3]/20' : 'bg-black/5 border-white/20'
          }`} />
          
          {/* Top Face */}
          <div className={`absolute top-0 left-0 w-full h-[100px] backdrop-blur-md border-b origin-top transform -rotate-x-90 -translate-y-[100px] transition-all duration-700 ${
            isCollaborationMode ? 'bg-transparent border-[#3B45B3]/20' : 'bg-white/60 border-white/40'
          }`} />

          {/* Secondary Block / Detail (Only in non-collab) */}
          {!isCollaborationMode && (
            <div className="absolute -bottom-4 -left-10 w-[450px] h-[60px] bg-[#1C1C1E]/5 backdrop-blur-sm border border-white/20 rounded-sm" />
          )}

          {/* Pins in Collaboration Mode */}
          {isCollaborationMode && (
            <>
              {/* Pin #042 */}
              <div 
                onClick={() => onPinClick?.('042')}
                className={`absolute top-[20%] left-[40%] -translate-x-1/2 -translate-y-1/2 z-20 cursor-pointer transition-all ${selectedPinId === '042' ? 'scale-110' : 'hover:scale-105'}`}
              >
                <div className="bg-[#5D4AD8] text-white px-3 py-1 rounded-lg text-[11px] font-black shadow-lg flex items-center gap-1.5 border border-white/20">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                  #042
                </div>
                <div className="w-px h-12 bg-gradient-to-b from-[#5D4AD8] to-transparent mx-auto" />
              </div>

              {/* Pin #041 */}
              <div 
                onClick={() => onPinClick?.('041')}
                className={`absolute top-[40%] left-[80%] -translate-x-1/2 -translate-y-1/2 z-20 cursor-pointer transition-all ${selectedPinId === '041' ? 'scale-110' : 'hover:scale-105'}`}
              >
                <div className="bg-white/90 text-[#6B7A99] px-2.5 py-1 rounded-lg text-[10px] font-bold shadow-md border border-[#E2E6EF]">
                  #041
                </div>
                <div className="w-px h-8 bg-gradient-to-b from-[#ADB5BD] to-transparent mx-auto" />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Default Floating Toolbars - Only visible in non-collaboration mode */}
      {!isCollaborationMode && (
        <>
          {/* Floating Toolbar 1: 지붕 (Top Left) */}
          <div className="absolute top-8 left-8 flex gap-3 p-4 bg-white/80 backdrop-blur-md rounded-2xl border border-white/40 shadow-xl z-10">
            <div className="flex flex-col items-center gap-2 group cursor-pointer">
              <div className="p-3 bg-[#3B45B3]/10 text-[#3B45B3] rounded-xl transition-all group-hover:bg-[#3B45B3]/20">
                <Home size={28} />
              </div>
              <span className="text-[11px] font-extrabold text-[#3B45B3]">지붕</span>
            </div>
            <div className="flex flex-col items-center gap-2 group cursor-pointer">
              <div className="p-3 bg-white text-[#ADB5BD] rounded-xl border border-[#E2E6EF] transition-all group-hover:border-[#3B45B3]/50">
                <div className="w-7 h-7 bg-[#BEC4D1] rounded-sm transform -skew-x-12" />
              </div>
              <span className="text-[11px] font-bold text-[#8E95A3]">평지붕</span>
            </div>
            <div className="flex flex-col items-center gap-2 group cursor-pointer">
              <div className="p-3 bg-white text-[#ADB5BD] rounded-xl border border-[#E2E6EF] transition-all group-hover:border-[#3B45B3]/50">
                 <div className="w-7 h-7 border-l-[14px] border-r-[14px] border-b-[20px] border-l-transparent border-r-transparent border-b-[#BEC4D1]" />
              </div>
              <span className="text-[11px] font-bold text-[#8E95A3]">박공지붕</span>
            </div>
          </div>

          {/* Floating Toolbar 2: 외벽 (Left Center) */}
          <div className="absolute top-[200px] left-8 w-[64px] bg-white/80 backdrop-blur-md rounded-2xl border border-white/40 shadow-xl p-2 flex flex-col items-center gap-4 z-10">
            <div className="w-full text-center pb-2 border-b border-[#F0F2F9] mb-1">
              <span className="text-[10px] font-black text-[#1C1C1E]">외벽</span>
            </div>
            <button className="flex flex-col items-center gap-1 group">
              <div className="p-2 text-[#ADB5BD] group-hover:text-[#3B45B3] transition-colors">
                <Square size={20} />
              </div>
              <span className="text-[9px] font-bold text-[#ADB5BD]">벽</span>
            </button>
            <button className="flex flex-col items-center gap-1 group">
              <div className="p-2 text-[#ADB5BD] group-hover:text-[#3B45B3] transition-colors">
                <DoorOpen size={20} />
              </div>
              <span className="text-[9px] font-bold text-[#ADB5BD]">문</span>
            </button>
            <button className="flex flex-col items-center gap-1 group">
              <div className="p-2 bg-[#F0F2FF] text-[#3B45B3] rounded-lg shadow-sm">
                <Layout size={20} />
              </div>
              <span className="text-[9px] font-black text-[#3B45B3]">창문</span>
            </button>
            <button className="flex flex-col items-center gap-1 group">
              <div className="p-2 text-[#ADB5BD] group-hover:text-[#3B45B3] transition-colors">
                <Home size={20} />
              </div>
              <span className="text-[9px] font-bold text-[#ADB5BD]">지붕</span>
            </button>
            <button className="flex flex-col items-center gap-1 group">
              <div className="p-2 text-[#ADB5BD] group-hover:text-[#3B45B3] transition-colors">
                <Layers size={20} />
              </div>
              <span className="text-[9px] font-bold text-[#ADB5BD]">바닥</span>
            </button>
            <button className="flex flex-col items-center gap-1 group">
              <div className="p-2 text-[#ADB5BD] group-hover:text-[#3B45B3] transition-colors">
                <TrendingUp size={20} />
              </div>
              <span className="text-[9px] font-bold text-[#ADB5BD]">계단</span>
            </button>
            <button className="flex flex-col items-center gap-1 group">
              <div className="p-2 text-[#ADB5BD] group-hover:text-[#3B45B3] transition-colors">
                <div className="w-4 h-5 border-2 border-[#ADB5BD] rounded-sm group-hover:border-[#3B45B3]" />
              </div>
              <span className="text-[9px] font-bold text-[#ADB5BD]">기둥</span>
            </button>
          </div>

          {/* Hierarchy Panel (Bottom Left) */}
          <div className="absolute bottom-8 left-8 w-[200px] bg-white border border-[#E2E6EF] rounded-2xl shadow-xl overflow-hidden z-10">
            <div className="px-4 py-3 flex items-center justify-between border-b border-[#F0F2F9]">
              <span className="text-[11px] font-extrabold text-[#1C1C1E]">계층 구조</span>
              <ChevronDown size={14} className="text-[#ADB5BD]" />
            </div>
            <div className="p-4 flex flex-col gap-2">
              {/* Living Room */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <ChevronDown size={12} className="text-[#1C1C1E]" />
                  <div className="w-1 h-3 bg-[#1C1C1E] rounded-sm mr-1" />
                  <span className="text-[11px] font-bold text-[#1C1C1E]">[Living Room]</span>
                </div>
                <div className="pl-6 flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <Minus size={12} className="text-[#ADB5BD]" />
                    <div className="w-0.5 h-3 bg-[#1C1C1E] rounded-sm mr-1" />
                    <span className="text-[11px] font-bold text-[#1C1C1E]">_01</span>
                  </div>
                  <div className="pl-5 flex items-center gap-1.5">
                    <div className="w-2 h-2 border border-[#ADB5BD] rounded-sm" />
                    <span className="text-[10px] font-medium text-[#6B7A99]">메인 현관문</span>
                  </div>
                </div>
              </div>
              {/* 01 */}
              <div className="flex items-center gap-1.5 mt-1">
                <ChevronRight size={12} className="text-[#ADB5BD]" />
                <div className="w-1 h-3 bg-[#ADB5BD] rounded-sm mr-1" />
                <span className="text-[11px] font-bold text-[#1C1C1E]">01</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function TrendingUp({ size, className }: { size: number; className?: string }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  )
}

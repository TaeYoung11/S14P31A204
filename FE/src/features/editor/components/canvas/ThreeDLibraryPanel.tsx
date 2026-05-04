import { Box, DoorOpen, Home, LayoutGrid, Layers, Square, X } from 'lucide-react'

const LIBRARY_CATEGORIES = [
  { id: '벽', icon: Square },
  { id: '문', icon: DoorOpen },
  { id: '창문', icon: LayoutGrid },
  { id: '지붕', icon: Home },
  { id: '바닥', icon: Layers },
  { id: '가구', icon: Box },
] as const

interface ThreeDLibraryPanelProps {
  selectedCategory: string
  onSelectCategory: (id: string) => void
  onClose: () => void
}

/**
 * 3D 캔버스 좌측 건축 요소 라이브러리 패널.
 * 카테고리 선택 UI만 담당하며, 실제 데이터 로딩 로직은 상위 훅/컴포넌트에서 관리한다.
 */
export default function ThreeDLibraryPanel({
  selectedCategory,
  onSelectCategory,
  onClose,
}: ThreeDLibraryPanelProps) {
  return (
    <div className="absolute left-8 top-[10%] w-[500px] h-[70%] bg-white/80 backdrop-blur-xl border border-white/40 rounded-[32px] shadow-2xl z-50 flex overflow-hidden animate-in fade-in slide-in-from-left-4 duration-300">
      <button
        onClick={onClose}
        className="absolute top-5 right-5 flex items-center gap-1.5 px-3 py-1.5 bg-[#F0F2F9] hover:bg-[#E2E6EF] text-[#6B7A99] hover:text-[#1C1C1E] rounded-xl transition-all z-10"
      >
        <X size={14} />
        <span className="text-[11px] font-bold">닫기</span>
      </button>

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

      <div className="flex-1 p-8 bg-gradient-to-br from-white/20 to-transparent">
        <h3 className="text-2xl font-black text-[#1C1C1E] mb-8">{selectedCategory} 라이브러리</h3>
        <div className="flex flex-col items-center justify-center h-[60%] text-[#ADB5BD] opacity-50 italic">
          준비 중인 기능입니다...
        </div>
      </div>
    </div>
  )
}

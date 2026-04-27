import { X, FileCode, Image as ImageIcon, Lock, Clock } from 'lucide-react'
import { useState } from 'react'

interface ExportSelectionModalProps {
  isOpen: boolean
  onClose: () => void
  onStartExport: (type: 'ifc' | 'png') => void
}

export function ExportSelectionModal({ isOpen, onClose, onStartExport }: ExportSelectionModalProps) {
  const [selectedType, setSelectedType] = useState<'ifc' | 'png'>('ifc')

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center">
      {/* 배경 오버레이 */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-[4px] transition-opacity" 
        onClick={onClose}
      />
      
      {/* 모달 콘텐츠 */}
      <div className="relative w-[540px] bg-white rounded-[32px] shadow-[0_30px_80px_rgba(0,0,0,0.25)] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* 헤더 */}
        <div className="px-10 pt-10 pb-8 flex items-start justify-between">
          <div className="flex flex-col">
            <h2 className="text-[28px] font-black text-[#1C1C1E] tracking-tight mb-2">프로젝트 내보내기</h2>
            <div className="w-12 h-1 bg-[#3B45B3] rounded-full" />
          </div>
          <div className="p-4 bg-[#F0F2FF] rounded-2xl text-[#3B45B3]">
            <FileCode size={28} />
          </div>
        </div>

        {/* 본문 */}
        <div className="px-10 pb-10">
          <p className="text-[14px] font-medium text-[#8E95A3] leading-relaxed mb-8 pr-10">
            현재 프로젝트의 모든 데이터와 3D 모델을 IFC 또는 이미지 형식으로 내보냅니다. 
            내보낸 파일은 프로젝트 보관 및 타 도구와의 호환을 위해 사용될 수 있습니다.
          </p>

          <div className="flex flex-col gap-4 mb-10">
            {/* IFC 내보내기 옵션 */}
            <div 
              onClick={() => setSelectedType('ifc')}
              className={`group relative flex items-center gap-5 p-6 rounded-[24px] border-2 transition-all cursor-pointer ${
                selectedType === 'ifc' 
                  ? 'bg-[#F0F2FF]/40 border-[#3B45B3] shadow-sm' 
                  : 'bg-white border-[#E2E6EF] hover:border-[#3B45B3]/30'
              }`}
            >
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                selectedType === 'ifc' ? 'border-[#3B45B3] bg-white' : 'border-[#E2E6EF]'
              }`}>
                {selectedType === 'ifc' && <div className="w-2.5 h-2.5 bg-[#3B45B3] rounded-full" />}
              </div>
              <div className="flex flex-col">
                <span className="text-[17px] font-black text-[#1C1C1E]">Industry Foundation Classes (.ifc)</span>
                <span className="text-[13px] font-medium text-[#8E95A3]">BIM 표준 데이터 호환을 위한 전문 포맷</span>
              </div>
            </div>

            {/* PNG 내보내기 옵션 */}
            <div 
              onClick={() => setSelectedType('png')}
              className={`group relative flex items-center gap-5 p-6 rounded-[24px] border-2 transition-all cursor-pointer ${
                selectedType === 'png' 
                  ? 'bg-[#F0F2FF]/40 border-[#3B45B3] shadow-sm' 
                  : 'bg-white border-[#E2E6EF] hover:border-[#3B45B3]/30'
              }`}
            >
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                selectedType === 'png' ? 'border-[#3B45B3] bg-white' : 'border-[#E2E6EF]'
              }`}>
                {selectedType === 'png' && <div className="w-2.5 h-2.5 bg-[#3B45B3] rounded-full" />}
              </div>
              <div className="flex flex-col">
                <span className="text-[17px] font-black text-[#1C1C1E]">High-Resolution Render (.png)</span>
                <span className="text-[13px] font-medium text-[#8E95A3]">고해상도 프레젠테이션용 이미지 파일</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-6">
            <button 
              onClick={onClose}
              className="text-[15px] font-black text-[#8E95A3] hover:text-[#1C1C1E] transition-colors"
            >
              취소
            </button>
            <button 
              onClick={() => onStartExport(selectedType)}
              className="px-10 py-4 bg-[#3B45B3] text-white text-[16px] font-black rounded-2xl shadow-xl shadow-[#3B45B3]/30 hover:bg-[#2D3691] hover:-translate-y-0.5 transition-all active:translate-y-0"
            >
              내보내기 시작
            </button>
          </div>
        </div>

        {/* 하단 정보 */}
        <div className="px-10 py-5 bg-[#F8F9FD] border-t border-[#F0F2F9] flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#ADB5BD]">
            <Lock size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">Secure Export Protocol V2.1</span>
          </div>
          <div className="flex items-center gap-2 text-[#3B45B3]">
            <Clock size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">Est. Time: &lt; 30s</span>
          </div>
        </div>
      </div>
    </div>
  )
}

import { Hand, ZoomIn, ZoomOut } from 'lucide-react'
import type { EditorMode } from '../../types'

interface ZoomControlBarProps {
  zoom: number
  mode: EditorMode
  selectedTool: string
  onZoomIn: () => void
  onZoomOut: () => void
  onSetZoom: (value: number) => void
  onSetTool: (tool: string) => void
}

/**
 * 캔버스 좌하단 고정 줌 컨트롤 바
 * - 줌 아웃 / 수치 입력 / 줌 인 / 손 도구 토글 버튼 포함
 * - 3D 모드에서는 회전 버튼과 현재 좌표를 추가로 표시
 */
export function ZoomControlBar({
  zoom,
  mode,
  selectedTool,
  onZoomIn,
  onZoomOut,
  onSetZoom,
  onSetTool,
}: ZoomControlBarProps) {
  return (
    <div className="absolute bottom-6 left-6 flex items-center bg-white border border-[#E2E6EF] rounded-2xl px-1.5 py-1.5 shadow-md z-10 transition-all">
      {/* 줌 아웃 버튼 */}
      <button
        onClick={onZoomOut}
        className="p-1.5 text-[#6B7A99] hover:text-[#1C1C1E] transition-colors rounded-xl hover:bg-[#F0F2F9]"
      >
        <ZoomOut size={20} />
      </button>

      {/* 줌 수치 입력 — 포커스 시 '%' 제거, blur 시 클램핑 후 적용 */}
      <input
        key={zoom}
        type="text"
        defaultValue={`${zoom}%`}
        onFocus={(e) => {
          e.currentTarget.value = String(zoom)
          e.currentTarget.select()
        }}
        onBlur={(e) => {
          const num = parseInt(e.currentTarget.value, 10)
          const clamped = isNaN(num) ? zoom : Math.min(Math.max(num, 10), 300)
          onSetZoom(clamped)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (!/[0-9]|Backspace|Delete|ArrowLeft|ArrowRight|Tab/.test(e.key)) e.preventDefault()
        }}
        className="text-[13px] font-semibold text-[#1C1C1E] w-[52px] text-center bg-transparent outline-none cursor-text"
      />

      {/* 줌 인 버튼 */}
      <button
        onClick={onZoomIn}
        className="p-1.5 text-[#6B7A99] hover:text-[#1C1C1E] transition-colors rounded-xl hover:bg-[#F0F2F9]"
      >
        <ZoomIn size={20} />
      </button>

      <div className="w-px h-5 bg-[#E2E6EF] mx-1.5" />

      {/* 손 도구 토글 버튼 */}
      <button
        onClick={() => onSetTool(selectedTool === 'hand' ? 'selection' : 'hand')}
        className={`p-1.5 transition-colors rounded-xl ${
          selectedTool === 'hand'
            ? 'text-[#3B45B3] bg-[#F0F2FF]'
            : 'text-[#6B7A99] hover:text-[#1C1C1E] hover:bg-[#F0F2F9]'
        }`}
      >
        <Hand size={20} />
      </button>

      {/* 3D 모드 전용: 회전 버튼 + 좌표 표시 */}
      {mode === '3d' && (
        <>
          <div className="w-px h-5 bg-[#E2E6EF] mx-2" />
          <button aria-label="3D 뷰 회전" className="p-1.5 text-[#3B45B3] bg-[#F0F2FF] rounded-xl shadow-sm">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M20.5 5.5C18.6 3.6 16 2.5 13 2.5V0.5L9.5 3.5L13 6.5V4.5C15.4 4.5 17.6 5.4 19.1 6.9L20.5 5.5Z" />
              <path d="M3.5 18.5C5.4 20.4 8 21.5 11 21.5V23.5L14.5 20.5L11 17.5V19.5C8.6 19.5 6.4 18.6 4.9 17.1L3.5 18.5Z" />
              <path d="M21.5 7.5C22.4 9 23 10.5 23 12H21C21 10.9 20.6 9.8 19.9 8.8L21.5 7.5Z" />
              <path d="M2.5 16.5C1.6 15 1 13.5 1 12H3C3 13.1 3.4 14.2 4.1 15.2L2.5 16.5Z" />
              <text x="12" y="15.5" textAnchor="middle" fontSize="8" fontWeight="900" fontFamily="Arial, sans-serif" fill="currentColor">3D</text>
            </svg>
          </button>
          <div className="w-px h-5 bg-[#E2E6EF] mx-2" />
          {/* TODO: 실제 3D 뷰포트 포인터 좌표로 교체 (현재 목업 고정값) */}
          <span className="text-[11px] font-bold text-[#6B7A99] px-2 tabular-nums">
            X Y Z: 142.4, 33.1, 0.0
          </span>
        </>
      )}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { BubbleInfo } from './BubbleAttributePanel'
import {
  FLOOR_DOOR_HINGE_OPTIONS,
  FLOOR_DOOR_SWING_OPTIONS,
  FLOOR_WALL_HEIGHT_MAX_MM,
  FLOOR_WALL_HEIGHT_MIN_MM,
  FLOOR_WALL_THICKNESS_MAX_MM,
  FLOOR_WALL_THICKNESS_MIN_MM,
  FLOOR_WALL_TYPE_OPTIONS,
  ROOM_TYPES,
} from '../../constants'
import type { FloorOpening, FloorWall } from '../../types'
import { MaterialSelector } from '../shared/MaterialSelector'

interface TwoDAttributePanelProps {
  selectedBubble: BubbleInfo | null
  selectedWall?: FloorWall | null
  selectedOpening?: FloorOpening | null
  onLabelChange: (id: string, label: string) => void
  onTypeChange: (id: string, type: string) => void
  onWidthChange: (id: string, width: number) => void
  onHeightChange: (id: string, height: number) => void
  onWidthCommit?: (id: string, width: number) => void
  onHeightCommit?: (id: string, height: number) => void
  onMaterialChange?: (id: string, material: string) => void
  /** 면적 직접 변경 핸들러 — 현재 UI에서 미사용, 추후 면적 입력 필드 추가 시 활용 */
  onRatioChange?: (id: string, ratio: number) => void
  onWallTypeChange?: (id: string, type: FloorWall['type']) => void
  onWallThicknessChange?: (id: string, thicknessMm: number) => void
  onWallHeightChange?: (id: string, heightMm: number) => void
  onOpeningSizeChange?: (id: string, widthMm: number, heightMm: number) => void
  onWindowSillHeightChange?: (id: string, sillHeightMm: number) => void
  onDoorSwingDirectionChange?: (id: string, swingDirection: NonNullable<FloorOpening['doorSwingDirection']>) => void
  onDoorHingeSideChange?: (id: string, hingeSide: NonNullable<FloorOpening['doorHingeSide']>) => void
}

/** 2D 평면도 모드 전용 속성 패널 — 버블 데이터와 연동 */
export function TwoDAttributePanel({
  selectedBubble,
  selectedWall = null,
  selectedOpening = null,
  onLabelChange,
  onTypeChange,
  onWidthChange,
  onHeightChange,
  onWidthCommit,
  onHeightCommit,
  onMaterialChange,
  onWallTypeChange,
  onWallThicknessChange,
  onWallHeightChange,
  onOpeningSizeChange,
  onWindowSillHeightChange,
  onDoorSwingDirectionChange,
  onDoorHingeSideChange,
}: TwoDAttributePanelProps) {
  const ROOM_DIMENSION_DEBOUNCE_MS = 220
  const [roomWidthDraft, setRoomWidthDraft] = useState('')
  const [roomHeightDraft, setRoomHeightDraft] = useState('')
  const [isWidthEditing, setIsWidthEditing] = useState(false)
  const [isHeightEditing, setIsHeightEditing] = useState(false)
  const widthDebounceRef = useRef<number | null>(null)
  const heightDebounceRef = useRef<number | null>(null)

  useEffect(() => {
    const syncTimer = window.setTimeout(() => {
      if (!selectedBubble) {
        setRoomWidthDraft('')
        setRoomHeightDraft('')
        return
      }
      if (!isWidthEditing) {
        setRoomWidthDraft(String(Math.round(selectedBubble.widthMm)))
      }
      if (!isHeightEditing) {
        setRoomHeightDraft(String(Math.round(selectedBubble.heightMm)))
      }
    }, 0)
    return () => window.clearTimeout(syncTimer)
  }, [selectedBubble, isWidthEditing, isHeightEditing])

  useEffect(() => {
    return () => {
      if (widthDebounceRef.current !== null) {
        window.clearTimeout(widthDebounceRef.current)
      }
      if (heightDebounceRef.current !== null) {
        window.clearTimeout(heightDebounceRef.current)
      }
    }
  }, [])

  // Grid Snap ON/OFF 또는 간격 변경으로 핸들러 참조가 바뀌면
  // 기존 디바운스 타이머가 이전 스냅 규칙으로 늦게 적용되지 않도록 정리한다.
  useEffect(() => {
    if (widthDebounceRef.current !== null) {
      window.clearTimeout(widthDebounceRef.current)
      widthDebounceRef.current = null
    }
    if (heightDebounceRef.current !== null) {
      window.clearTimeout(heightDebounceRef.current)
      heightDebounceRef.current = null
    }
  }, [onWidthChange, onHeightChange])

  const queueRoomWidthCommit = (value: string) => {
    if (!selectedBubble) return
    if (widthDebounceRef.current !== null) {
      window.clearTimeout(widthDebounceRef.current)
      widthDebounceRef.current = null
    }
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 100) return
    widthDebounceRef.current = window.setTimeout(() => {
      onWidthChange(selectedBubble.id, parsed)
      widthDebounceRef.current = null
    }, ROOM_DIMENSION_DEBOUNCE_MS)
  }

  const queueRoomHeightCommit = (value: string) => {
    if (!selectedBubble) return
    if (heightDebounceRef.current !== null) {
      window.clearTimeout(heightDebounceRef.current)
      heightDebounceRef.current = null
    }
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 100) return
    heightDebounceRef.current = window.setTimeout(() => {
      onHeightChange(selectedBubble.id, parsed)
      heightDebounceRef.current = null
    }, ROOM_DIMENSION_DEBOUNCE_MS)
  }

  const commitRoomWidth = () => {
    if (!selectedBubble) return
    if (widthDebounceRef.current !== null) {
      window.clearTimeout(widthDebounceRef.current)
      widthDebounceRef.current = null
    }
    const parsed = Number(roomWidthDraft)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setRoomWidthDraft(String(Math.round(selectedBubble.widthMm)))
      return
    }
    ;(onWidthCommit ?? onWidthChange)(selectedBubble.id, parsed)
    setIsWidthEditing(false)
  }

  const commitRoomHeight = () => {
    if (!selectedBubble) return
    if (heightDebounceRef.current !== null) {
      window.clearTimeout(heightDebounceRef.current)
      heightDebounceRef.current = null
    }
    const parsed = Number(roomHeightDraft)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setRoomHeightDraft(String(Math.round(selectedBubble.heightMm)))
      return
    }
    ;(onHeightCommit ?? onHeightChange)(selectedBubble.id, parsed)
    setIsHeightEditing(false)
  }

  if (selectedOpening) {
    return (
      <div className="p-5 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-[#ADB5BD] uppercase tracking-wider">선택 요소</span>
          <span className="text-xs font-black text-[#3B45B3]">{selectedOpening.type === 'door' ? '문' : '창문'}</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">폭 (MM)</span>
            <input
              type="number"
              min={300}
              max={4000}
              step={50}
              value={Math.round(selectedOpening.widthMm)}
              onChange={(e) => onOpeningSizeChange?.(selectedOpening.id, Number(e.target.value), selectedOpening.heightMm)}
              className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">높이 (MM)</span>
            <input
              type="number"
              min={300}
              max={4000}
              step={50}
              value={Math.round(selectedOpening.heightMm)}
              onChange={(e) => onOpeningSizeChange?.(selectedOpening.id, selectedOpening.widthMm, Number(e.target.value))}
              className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none"
            />
          </div>
        </div>

        {selectedOpening.type === 'window' && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">창턱 높이 (MM)</span>
            <input
              type="number"
              min={0}
              max={2500}
              step={50}
              value={Math.round(selectedOpening.sillHeightMm ?? 900)}
              onChange={(e) => onWindowSillHeightChange?.(selectedOpening.id, Number(e.target.value))}
              className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none"
            />
          </div>
        )}

        {selectedOpening.type === 'door' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">개폐 방식</span>
              <div className="relative group">
                <select
                  value={selectedOpening.doorSwingDirection ?? 'inward'}
                  onChange={(e) => onDoorSwingDirectionChange?.(
                    selectedOpening.id,
                    e.target.value as NonNullable<FloorOpening['doorSwingDirection']>,
                  )}
                  className="w-full bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] appearance-none focus:ring-1 focus:ring-[#3B45B3] outline-none cursor-pointer"
                >
                  {FLOOR_DOOR_SWING_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#ADB5BD] pointer-events-none group-hover:text-[#3B45B3] transition-colors"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">경첩 방향</span>
              <div className="relative group">
                <select
                  value={selectedOpening.doorHingeSide ?? 'left'}
                  onChange={(e) => onDoorHingeSideChange?.(
                    selectedOpening.id,
                    e.target.value as NonNullable<FloorOpening['doorHingeSide']>,
                  )}
                  className="w-full bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] appearance-none focus:ring-1 focus:ring-[#3B45B3] outline-none cursor-pointer"
                >
                  {FLOOR_DOOR_HINGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#ADB5BD] pointer-events-none group-hover:text-[#3B45B3] transition-colors"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (selectedWall) {
    return (
      <div className="p-5 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-[#ADB5BD] uppercase tracking-wider">선택 요소</span>
          <span className="text-xs font-black text-[#3B45B3]">벽체</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">벽 유형</span>
          <div className="relative group">
            <select
              value={selectedWall.type}
              onChange={(e) => onWallTypeChange?.(selectedWall.id, e.target.value as FloorWall['type'])}
              className="w-full bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] appearance-none focus:ring-1 focus:ring-[#3B45B3] outline-none cursor-pointer"
            >
              {FLOOR_WALL_TYPE_OPTIONS.map((typeOption) => (
                <option key={typeOption.value} value={typeOption.value}>{typeOption.label}</option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#ADB5BD] pointer-events-none group-hover:text-[#3B45B3] transition-colors"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">벽 두께 (MM)</span>
            <input
              type="number"
              min={FLOOR_WALL_THICKNESS_MIN_MM}
              max={FLOOR_WALL_THICKNESS_MAX_MM}
              step={10}
              value={Math.round(selectedWall.thickness)}
              onChange={(e) => onWallThicknessChange?.(selectedWall.id, Number(e.target.value))}
              className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">벽 높이 (MM)</span>
            <input
              type="number"
              min={FLOOR_WALL_HEIGHT_MIN_MM}
              max={FLOOR_WALL_HEIGHT_MAX_MM}
              step={100}
              value={Math.round(selectedWall.heightMm)}
              onChange={(e) => onWallHeightChange?.(selectedWall.id, Number(e.target.value))}
              className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none"
            />
          </div>
        </div>
      </div>
    )
  }

  if (!selectedBubble) {
    return (
      <div className="p-5 text-center text-[#ADB5BD] text-[11px] font-medium">
        공간, 벽, 문/창문을 선택하세요
      </div>
    )
  }

  return (
    <div className="p-5 flex flex-col gap-5">
      <div className="flex flex-col gap-4">
        {/* 방 이름 */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">공간 이름</span>
          <input
            type="text"
            value={selectedBubble.label}
            onChange={(e) => onLabelChange(selectedBubble.id, e.target.value)}
            className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none"
          />
        </div>

        {/* 방 종류 */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">공간 유형</span>
          <div className="relative group">
            <select
              value={selectedBubble.type}
              onChange={(e) => onTypeChange(selectedBubble.id, e.target.value)}
              className="w-full bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] appearance-none focus:ring-1 focus:ring-[#3B45B3] outline-none cursor-pointer"
            >
              {ROOM_TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#ADB5BD] pointer-events-none group-hover:text-[#3B45B3] transition-colors"
            />
          </div>
        </div>

        {/* 가로/세로 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">가로 (MM)</span>
            <input
              type="number"
              value={roomWidthDraft}
              onFocus={() => setIsWidthEditing(true)}
              onChange={(e) => {
                setRoomWidthDraft(e.target.value)
                queueRoomWidthCommit(e.target.value)
              }}
              onBlur={() => {
                commitRoomWidth()
                setIsWidthEditing(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur()
                }
              }}
              className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-bold text-[#ADB5BD] uppercase tracking-wider">세로 (MM)</span>
            <input
              type="number"
              value={roomHeightDraft}
              onFocus={() => setIsHeightEditing(true)}
              onChange={(e) => {
                setRoomHeightDraft(e.target.value)
                queueRoomHeightCommit(e.target.value)
              }}
              onBlur={() => {
                commitRoomHeight()
                setIsHeightEditing(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur()
                }
              }}
              className="bg-[#F8F9FD] border-none rounded-lg px-3 py-2.5 text-xs font-bold text-[#1C1C1E] focus:ring-1 focus:ring-[#3B45B3] outline-none"
            />
          </div>
        </div>

        <MaterialSelector
          value={selectedBubble.material}
          onChange={(material) => onMaterialChange?.(selectedBubble.id, material)}
        />
      </div>

      {/* 면적 요약 */}
      <div className="pt-4 border-t border-[#F0F2F9] flex items-center justify-between">
        <span className="text-[10px] font-bold text-[#ADB5BD]">계산 면적</span>
        <span className="text-sm font-black text-[#3B45B3]">{selectedBubble.ratio.toFixed(2)} m²</span>
      </div>
    </div>
  )
}

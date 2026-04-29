import { useEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import type { BubbleInfo } from './BubbleAttributePanel'
import type { FloorOpening, FloorWall } from '../../types'
import { TwoDOpeningAttributes } from './twoDAttribute/TwoDOpeningAttributes'
import { TwoDWallAttributes } from './twoDAttribute/TwoDWallAttributes'
import { TwoDRoomAttributes } from './twoDAttribute/TwoDRoomAttributes'

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

  const clearDebounceTimer = (timerRef: MutableRefObject<number | null>) => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const queueRoomDimensionCommit = (
    value: string,
    timerRef: MutableRefObject<number | null>,
    onChange: (id: string, valueMm: number) => void,
  ) => {
    if (!selectedBubble) return
    clearDebounceTimer(timerRef)
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 100) return
    timerRef.current = window.setTimeout(() => {
      onChange(selectedBubble.id, parsed)
      timerRef.current = null
    }, ROOM_DIMENSION_DEBOUNCE_MS)
  }

  const commitRoomDimension = (params: {
    draftValue: string
    fallbackValueMm: number
    timerRef: MutableRefObject<number | null>
    onCommit: (id: string, valueMm: number) => void
    setDraft: (next: string) => void
    setEditing: (next: boolean) => void
  }) => {
    if (!selectedBubble) return
    clearDebounceTimer(params.timerRef)
    const parsed = Number(params.draftValue)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      params.setDraft(String(Math.round(params.fallbackValueMm)))
      return
    }
    params.onCommit(selectedBubble.id, parsed)
    params.setEditing(false)
  }

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
      clearDebounceTimer(widthDebounceRef)
      clearDebounceTimer(heightDebounceRef)
    }
  }, []) // unmount 시 디바운스 정리

  // Grid Snap ON/OFF 또는 간격 변경으로 핸들러 참조가 바뀌면
  // 기존 디바운스 타이머가 이전 스냅 규칙으로 늦게 적용되지 않도록 정리한다.
  useEffect(() => {
    clearDebounceTimer(widthDebounceRef)
    clearDebounceTimer(heightDebounceRef)
  }, [onWidthChange, onHeightChange])

  const queueRoomWidthCommit = (value: string) => {
    queueRoomDimensionCommit(value, widthDebounceRef, onWidthChange)
  }

  const queueRoomHeightCommit = (value: string) => {
    queueRoomDimensionCommit(value, heightDebounceRef, onHeightChange)
  }

  const commitRoomWidth = () => {
    if (!selectedBubble) return
    commitRoomDimension({
      draftValue: roomWidthDraft,
      fallbackValueMm: selectedBubble.widthMm,
      timerRef: widthDebounceRef,
      onCommit: onWidthCommit ?? onWidthChange,
      setDraft: setRoomWidthDraft,
      setEditing: setIsWidthEditing,
    })
  }

  const commitRoomHeight = () => {
    if (!selectedBubble) return
    commitRoomDimension({
      draftValue: roomHeightDraft,
      fallbackValueMm: selectedBubble.heightMm,
      timerRef: heightDebounceRef,
      onCommit: onHeightCommit ?? onHeightChange,
      setDraft: setRoomHeightDraft,
      setEditing: setIsHeightEditing,
    })
  }

  if (selectedOpening) {
    return (
      <TwoDOpeningAttributes
        selectedOpening={selectedOpening}
        onOpeningSizeChange={onOpeningSizeChange}
        onWindowSillHeightChange={onWindowSillHeightChange}
        onDoorSwingDirectionChange={onDoorSwingDirectionChange}
        onDoorHingeSideChange={onDoorHingeSideChange}
      />
    )
  }

  if (selectedWall) {
    return (
      <TwoDWallAttributes
        selectedWall={selectedWall}
        onWallTypeChange={onWallTypeChange}
        onWallThicknessChange={onWallThicknessChange}
        onWallHeightChange={onWallHeightChange}
      />
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
    <TwoDRoomAttributes
      selectedBubble={selectedBubble}
      roomWidthDraft={roomWidthDraft}
      roomHeightDraft={roomHeightDraft}
      onLabelChange={onLabelChange}
      onTypeChange={onTypeChange}
      onMaterialChange={onMaterialChange}
      onRoomWidthDraftChange={(value) => {
        setRoomWidthDraft(value)
        queueRoomWidthCommit(value)
      }}
      onRoomHeightDraftChange={(value) => {
        setRoomHeightDraft(value)
        queueRoomHeightCommit(value)
      }}
      onRoomWidthFocus={() => setIsWidthEditing(true)}
      onRoomHeightFocus={() => setIsHeightEditing(true)}
      onRoomWidthBlur={() => {
        commitRoomWidth()
        setIsWidthEditing(false)
      }}
      onRoomHeightBlur={() => {
        commitRoomHeight()
        setIsHeightEditing(false)
      }}
    />
  )
}

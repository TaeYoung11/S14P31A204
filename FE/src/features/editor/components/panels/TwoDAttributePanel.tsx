import type { BubbleInfo } from './BubbleAttributePanel'
import type { FloorOpening, FloorWall } from '../../types'
import { FLOOR_PLAN_EDIT_AUTHORITY } from '../../constants'
import { TwoDOpeningAttributes } from './twoDAttribute/TwoDOpeningAttributes'
import { TwoDWallAttributes } from './twoDAttribute/TwoDWallAttributes'
import { TwoDRoomAttributes } from './twoDAttribute/TwoDRoomAttributes'
import { useTwoDAttributeDrafts } from './twoDAttribute/useTwoDAttributeDrafts'

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
  /** 면적 직접 변경 핸들러 — 현재 UI에서 미사용, 추후 면적 입력 필드 추가 시 활용 */
  onRatioChange?: (id: string, ratio: number) => void
  onWallTypeChange?: (id: string, type: FloorWall['type']) => void
  onWallThicknessChange?: (id: string, thicknessMm: number) => void
  onWallHeightChange?: (id: string, heightMm: number) => void
  onWallMaterialChange?: (id: string, material: string) => void
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
  onWallTypeChange,
  onWallThicknessChange,
  onWallHeightChange,
  onWallMaterialChange,
  onOpeningSizeChange,
  onWindowSillHeightChange,
  onDoorSwingDirectionChange,
  onDoorHingeSideChange,
}: TwoDAttributePanelProps) {
  const isWallFirstEditing = FLOOR_PLAN_EDIT_AUTHORITY === 'wall-first'
  const drafts = useTwoDAttributeDrafts({
    selectedBubble,
    selectedWall,
    selectedOpening,
    isWallFirstEditing,
    onWidthChange,
    onHeightChange,
    onWidthCommit,
    onHeightCommit,
    onWallThicknessChange,
    onWallHeightChange,
    onOpeningSizeChange,
    onWindowSillHeightChange,
  })

  if (selectedOpening) {
    return (
      <TwoDOpeningAttributes
        selectedOpening={selectedOpening}
        openingWidthDraft={drafts.openingWidthDraft}
        openingHeightDraft={drafts.openingHeightDraft}
        windowSillHeightDraft={drafts.windowSillHeightDraft}
        onOpeningWidthDraftChange={drafts.onOpeningWidthDraftChange}
        onOpeningHeightDraftChange={drafts.onOpeningHeightDraftChange}
        onWindowSillHeightDraftChange={drafts.onWindowSillHeightDraftChange}
        onOpeningWidthFocus={drafts.onOpeningWidthFocus}
        onOpeningHeightFocus={drafts.onOpeningHeightFocus}
        onWindowSillHeightFocus={drafts.onWindowSillHeightFocus}
        onOpeningWidthBlur={drafts.onOpeningWidthBlur}
        onOpeningHeightBlur={drafts.onOpeningHeightBlur}
        onWindowSillHeightBlur={drafts.onWindowSillHeightBlur}
        onDoorSwingDirectionChange={onDoorSwingDirectionChange}
        onDoorHingeSideChange={onDoorHingeSideChange}
      />
    )
  }

  if (selectedWall) {
    return (
      <TwoDWallAttributes
        selectedWall={selectedWall}
        wallThicknessDraft={drafts.wallThicknessDraft}
        wallHeightDraft={drafts.wallHeightDraft}
        onWallThicknessDraftChange={drafts.onWallThicknessDraftChange}
        onWallHeightDraftChange={drafts.onWallHeightDraftChange}
        onWallThicknessFocus={drafts.onWallThicknessFocus}
        onWallHeightFocus={drafts.onWallHeightFocus}
        onWallThicknessBlur={drafts.onWallThicknessBlur}
        onWallHeightBlur={drafts.onWallHeightBlur}
        onWallTypeChange={onWallTypeChange}
        onWallMaterialChange={onWallMaterialChange}
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
      roomWidthDraft={drafts.roomWidthDraft}
      roomHeightDraft={drafts.roomHeightDraft}
      onLabelChange={onLabelChange}
      onTypeChange={onTypeChange}
      onRoomWidthDraftChange={drafts.onRoomWidthDraftChange}
      onRoomHeightDraftChange={drafts.onRoomHeightDraftChange}
      onRoomWidthFocus={drafts.onRoomWidthFocus}
      onRoomHeightFocus={drafts.onRoomHeightFocus}
      onRoomWidthBlur={drafts.onRoomWidthBlur}
      onRoomHeightBlur={drafts.onRoomHeightBlur}
      isRoomGeometryLocked={isWallFirstEditing}
    />
  )
}

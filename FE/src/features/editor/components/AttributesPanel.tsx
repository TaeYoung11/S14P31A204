import type { MouseEvent as ReactMouseEvent } from 'react'
import type { EditorMode, PanelKey, PanelOffset, PanelResizeAxis } from '../types'
import { BubbleAttributePanel, type BubbleConnectionInfo, type BubbleInfo, type BubbleZoneInfo } from './BubbleAttributePanel'
import { TwoDAttributePanel } from './TwoDAttributePanel'
import { ThreeDAttributePanel } from './ThreeDAttributePanel'
import { PanelFrame } from './PanelFrame'

interface AttributesPanelProps {
  mode: EditorMode
  isOpen: boolean
  offset: PanelOffset
  width: number
  height: number
  selectedBubble: BubbleInfo | null
  connections: BubbleConnectionInfo[]
  zones: BubbleZoneInfo[]
  onLabelChange: (id: string, label: string) => void
  onTypeChange: (id: string, type: string) => void
  onWidthChange: (id: string, width: number) => void
  onHeightChange: (id: string, height: number) => void
  onRatioChange: (id: string, ratio: number) => void
  onColorChange: (id: string, color: string) => void
  onDragStart: (key: PanelKey, e: ReactMouseEvent<HTMLButtonElement>) => void
  onResizeStart: (key: PanelKey, axis: PanelResizeAxis, e: ReactMouseEvent<HTMLButtonElement>) => void
  onToggle: (key: PanelKey) => void
}

/** 모드(버블/2D/3D)에 따라 알맞은 속성 패널을 렌더링 */
export function AttributesPanel({
  mode,
  isOpen,
  offset,
  width,
  height,
  selectedBubble,
  connections,
  zones,
  onLabelChange,
  onTypeChange,
  onWidthChange,
  onHeightChange,
  onRatioChange,
  onColorChange,
  onDragStart,
  onResizeStart,
  onToggle,
}: AttributesPanelProps) {
  return (
    <PanelFrame
      panelKey="attributes"
      title="속성 관리자"
      isOpen={isOpen}
      offset={offset}
      width={width}
      height={height}
      onDragStart={onDragStart}
      onResizeStart={onResizeStart}
      onToggle={onToggle}
    >
      {mode === 'bubble' && (
        <BubbleAttributePanel
          selectedBubble={selectedBubble}
          onLabelChange={onLabelChange}
          onTypeChange={onTypeChange}
          onWidthChange={onWidthChange}
          onHeightChange={onHeightChange}
          onRatioChange={onRatioChange}
          onColorChange={onColorChange}
          connections={connections}
          zones={zones}
        />
      )}
      {mode === '2d' && <TwoDAttributePanel />}
      {mode === '3d' && <ThreeDAttributePanel />}
    </PanelFrame>
  )
}
